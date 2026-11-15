//
//  NetworkManager.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Foundation

enum NetworkError: LocalizedError {
    case invalidURL
    case badResponse(statusCode: Int)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Geçersiz sunucu adresi."
        case .badResponse(let statusCode):
            return "Sunucu beklenmeyen bir yanıt döndürdü (HTTP \(statusCode))."
        }
    }
}

struct BackendHealthResponse: Codable, Sendable {
    let ok: Bool
    let gemini: Bool
    let model: String?
    let clients: Int?
    let ai: Bool?
}

struct AiChatResponse: Codable, Sendable {
    let reply: String
    let source: String?
    let model: String?
    let escalation: String?
}

/// SSE payload emitted by `POST /api/tasks`, `POST /api/tasks/:id/complete`, and `POST /api/tasks/:id/delete`.
struct RelayTaskPayload: Codable, Sendable {
    let action: String
    let task: RemoteWebTask
}

struct RelayHelloPayload: Codable, Sendable {
    let astronauts: [AstronautHealthPacket]
    /// Absent on relays that predate mission tasks.
    let tasks: [RemoteWebTask]?
}

enum RelayStreamEvent: Sendable {
    /// `tasks` is nil when the relay predates mission tasks.
    case hello([AstronautHealthPacket], [RemoteWebTask]?)
    case packet(AstronautHealthPacket)
    case taskChanged(action: String, task: RemoteWebTask)
    case tasks([RemoteWebTask])
}

private struct TaskToggleBody: Encodable {
    let completed: Bool
}

enum AiStreamEvent: Sendable {
    case hello(alerts: [AiAlert])
    case alert(AiAlert)
    case alertUpdate(AiAlert)
}

private struct SamplesPostResponse: Codable {
    let packets: [AstronautHealthPacket]
}

private struct GuidanceRequestBody: Encodable {
    let crewId: String
}

private struct AlertDeviceBody: Encodable {
    let deviceId: String
}

/// Handles REST and SSE communication between the iPhone companion app and the Render backend.
final class NetworkManager {
    static let shared = NetworkManager()

    private let session: URLSession

    private init(session: URLSession? = nil) {
        if let session {
            self.session = session
        } else {
            let config = URLSessionConfiguration.default
            config.urlCache = nil
            config.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            config.httpAdditionalHeaders = ["Cache-Control": "no-cache"]
            self.session = URLSession(configuration: config)
        }
    }

    /// Checks whether the Render relay backend is awake and ready.
    func checkHealth() async throws -> BackendHealthResponse {
        guard let url = Constants.healthURL else { throw NetworkError.invalidURL }
        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        let (data, response) = try await session.data(for: request)
        try validate(response: response)
        return try HealthJSONCodec.decoder.decode(BackendHealthResponse.self, from: data)
    }

    /// Fetches the latest astronaut health packet (including `aiGuidance`) via `GET /api/packets/:crewId`.
    func fetchPacket(crewId: String = Constants.defaultCrewId) async throws -> AstronautHealthPacket {
        guard let url = Constants.packetURL(crewId: crewId) else { throw NetworkError.invalidURL }
        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        let (data, response) = try await session.data(for: request)
        try validate(response: response)
        return try HealthJSONCodec.decoder.decode(AstronautHealthPacket.self, from: data)
    }

    /// Forwards canonical `HealthSample` records to the backend via `POST /api/samples`.
    @discardableResult
    func sendSamples(_ samples: [HealthSample]) async throws -> [AstronautHealthPacket] {
        guard !samples.isEmpty else { return [] }
        guard let url = Constants.samplesURL else { throw NetworkError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try HealthJSONCodec.encoder.encode(samples)

        let (data, response) = try await session.data(for: request)
        try validate(response: response)
        let decoded = try HealthJSONCodec.decoder.decode(SamplesPostResponse.self, from: data)
        return decoded.packets
    }

    /// Requests refreshed Gemini/fallback guidance via `POST /api/ai/guidance`.
    func requestAiGuidance(crewId: String = Constants.defaultCrewId) async throws -> AiGuidance {
        guard let url = Constants.aiGuidanceURL else { throw NetworkError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 25
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(GuidanceRequestBody(crewId: crewId))

        let (data, response) = try await session.data(for: request)
        try validate(response: response)
        return try HealthJSONCodec.decoder.decode(AiGuidance.self, from: data)
    }

    /// Confirms alert delivery via `POST /api/ai/alerts/:id/delivered`.
    @discardableResult
    func markAlertDelivered(alertId: String, deviceId: String = Constants.deviceId) async throws -> AiAlert {
        guard let url = Constants.alertDeliveredURL(alertId: alertId) else { throw NetworkError.invalidURL }
        return try await postAlertDeviceAction(url: url, deviceId: deviceId)
    }

    /// Acknowledges an active alert via `POST /api/ai/alerts/:id/ack`.
    @discardableResult
    func acknowledgeAlert(alertId: String, deviceId: String = Constants.deviceId) async throws -> AiAlert {
        guard let url = Constants.alertAckURL(alertId: alertId) else { throw NetworkError.invalidURL }
        return try await postAlertDeviceAction(url: url, deviceId: deviceId)
    }

    /// Opens an SSE connection to `GET /api/ai/stream` and emits decoded `AiStreamEvent`s while active.
    func streamAiEvents(
        deviceId: String = Constants.deviceId,
        crewId: String = Constants.defaultCrewId
    ) -> AsyncStream<AiStreamEvent> {
        AsyncStream { continuation in
            let task = Task {
                guard let url = Constants.aiStreamURL(deviceId: deviceId, crewId: crewId) else {
                    continuation.finish()
                    return
                }

                while !Task.isCancelled {
                    do {
                        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 45)
                        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")

                        let (bytes, response) = try await session.bytes(for: request)
                        try validate(response: response)

                        var currentEvent = ""
                        var currentData = ""

                        for try await line in Self.sseLines(from: bytes) {
                            if Task.isCancelled { break }
                            if line.isEmpty {
                                if !currentData.isEmpty, let parsed = Self.parseSSEEvent(name: currentEvent, data: currentData) {
                                    continuation.yield(parsed)
                                }
                                currentEvent = ""
                                currentData = ""
                            } else if line.hasPrefix("event:") {
                                currentEvent = line.dropFirst(6).trimmingCharacters(in: .whitespaces)
                            } else if line.hasPrefix("data:") {
                                let piece = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                                currentData = currentData.isEmpty ? piece : "\(currentData)\n\(piece)"
                            }
                        }
                    } catch {
                        if Task.isCancelled { break }
                    }

                    try? await Task.sleep(nanoseconds: 1_500_000_000)
                }

                continuation.finish()
            }

            continuation.onTermination = { _ in
                task.cancel()
            }
        }
    }

    /// Fetches canonical historical `HealthSample` records for one astronaut from `GET /api/samples`.
    func fetchSamples(crewId: String) async throws -> [HealthSample] {
        guard let url = Constants.samplesURL(crewId: crewId) else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 20

        let (data, response) = try await session.data(for: request)
        try validate(response: response)
        return try HealthJSONCodec.decoder.decode([HealthSample].self, from: data)
    }

    /// Asks backend Gemini chat endpoint (`POST /api/ai/chat`) to classify recent journal entries.
    func analyzeJournalSentiment(crewId: String, excerpt: String) async throws -> AiChatResponse {
        struct ChatRequestBody: Encodable {
            let scope: String
            let crewId: String
            let message: String
        }

        guard let url = Constants.aiChatURL else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 25
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(
            ChatRequestBody(scope: "crew", crewId: crewId, message: excerpt)
        )

        let (data, response) = try await session.data(for: request)
        try validate(response: response)
        return try JSONDecoder().decode(AiChatResponse.self, from: data)
    }

    /// Subscribes to live astronaut telemetry packets over Server-Sent Events (`GET /api/stream`).
    func streamRelayEvents() -> AsyncStream<RelayStreamEvent> {
        AsyncStream { continuation in
            let task = Task {
                guard let url = Constants.relayStreamURL else {
                    continuation.finish()
                    return
                }

                while !Task.isCancelled {
                    do {
                        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 45)
                        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")

                        let (bytes, response) = try await session.bytes(for: request)
                        try validate(response: response)

                        var currentEvent = ""
                        var currentData = ""

                        for try await line in Self.sseLines(from: bytes) {
                            if Task.isCancelled { break }
                            if line.isEmpty {
                                if !currentData.isEmpty,
                                   let parsed = Self.parseRelaySSEEvent(name: currentEvent, data: currentData) {
                                    continuation.yield(parsed)
                                }
                                currentEvent = ""
                                currentData = ""
                            } else if line.hasPrefix("event:") {
                                currentEvent = line.dropFirst(6).trimmingCharacters(in: .whitespaces)
                            } else if line.hasPrefix("data:") {
                                let piece = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                                currentData = currentData.isEmpty ? piece : "\(currentData)\n\(piece)"
                            }
                        }
                    } catch {
                        if Task.isCancelled { break }
                    }

                    try? await Task.sleep(nanoseconds: 1_500_000_000)
                }

                continuation.finish()
            }

            continuation.onTermination = { _ in
                task.cancel()
            }
        }
    }

    /// Reads SSE lines from `URLSession.AsyncBytes` while preserving blank `\n` lines that separate SSE frames.
    /// (`AsyncBytes.lines` drops empty lines, which prevents SSE event boundaries from flushing.)
    private static func sseLines(from bytes: URLSession.AsyncBytes) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            let readerTask = Task {
                var buffer: [UInt8] = []
                do {
                    for try await byte in bytes {
                        if Task.isCancelled { break }
                        if byte == 0x0A { // '\n'
                            if buffer.last == 0x0D { // strip optional '\r'
                                buffer.removeLast()
                            }
                            let line = String(decoding: buffer, as: UTF8.self)
                            buffer.removeAll(keepingCapacity: true)
                            continuation.yield(line)
                        } else {
                            buffer.append(byte)
                        }
                    }
                    if !buffer.isEmpty {
                        if buffer.last == 0x0D {
                            buffer.removeLast()
                        }
                        continuation.yield(String(decoding: buffer, as: UTF8.self))
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }

            continuation.onTermination = { _ in
                readerTask.cancel()
            }
        }
    }

    /// Fetches mission tasks assigned from the Web command view (`GET /api/tasks?crewId=...`).
    func fetchTasks(crewId: String = Constants.defaultCrewId) async throws -> [RemoteWebTask] {
        guard let url = Constants.tasksURL(crewId: crewId) else {
            throw NetworkError.invalidURL
        }

        let request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 15)
        let (data, response) = try await session.data(for: request)
        try validate(response: response)
        return try JSONDecoder().decode([RemoteWebTask].self, from: data)
    }

    /// Mirrors mission task completion state back to the backend (`POST /api/tasks/:id/complete`).
    func toggleRemoteTask(taskId: String, completed: Bool) async throws {
        guard let url = Constants.taskToggleURL(taskId: taskId) else {
            throw NetworkError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(TaskToggleBody(completed: completed))

        let (_, response) = try await session.data(for: request)
        try validate(response: response)
    }

    /// Mirrors mission task deletion back to the backend (`POST /api/tasks/:id/delete`).
    func deleteRemoteTask(taskId: String) async throws {
        guard let url = Constants.taskDeleteURL(taskId: taskId) else {
            throw NetworkError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = Data("{}".utf8)

        let (_, response) = try await session.data(for: request)
        try validate(response: response)
    }

    private func postAlertDeviceAction(url: URL, deviceId: String) async throws -> AiAlert {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(AlertDeviceBody(deviceId: deviceId))

        let (data, response) = try await session.data(for: request)
        try validate(response: response)
        return try HealthJSONCodec.decoder.decode(AiAlert.self, from: data)
    }

    private static func parseRelaySSEEvent(name: String, data: String) -> RelayStreamEvent? {
        guard let jsonData = data.data(using: .utf8) else { return nil }
        switch name {
        case "hello":
            guard let payload = try? HealthJSONCodec.decoder.decode(RelayHelloPayload.self, from: jsonData) else {
                return nil
            }
            return .hello(payload.astronauts, payload.tasks)
        case "packet":
            guard let packet = try? HealthJSONCodec.decoder.decode(AstronautHealthPacket.self, from: jsonData) else {
                return nil
            }
            return .packet(packet)
        case "task":
            guard let payload = try? JSONDecoder().decode(RelayTaskPayload.self, from: jsonData) else {
                return nil
            }
            return .taskChanged(action: payload.action, task: payload.task)
        case "tasks":
            guard let tasks = try? JSONDecoder().decode([RemoteWebTask].self, from: jsonData) else {
                return nil
            }
            return .tasks(tasks)
        default:
            return nil
        }
    }

    private static func parseSSEEvent(name: String, data: String) -> AiStreamEvent? {
        guard let jsonData = data.data(using: .utf8) else { return nil }
        switch name {
        case "hello":
            guard let payload = try? HealthJSONCodec.decoder.decode(AiHelloPayload.self, from: jsonData) else { return nil }
            return .hello(alerts: payload.alerts)
        case "alert":
            guard let alert = try? HealthJSONCodec.decoder.decode(AiAlert.self, from: jsonData) else { return nil }
            return .alert(alert)
        case "alert-update":
            guard let alert = try? HealthJSONCodec.decoder.decode(AiAlert.self, from: jsonData) else { return nil }
            return .alertUpdate(alert)
        default:
            return nil
        }
    }

    private func validate(response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else {
            throw NetworkError.badResponse(statusCode: -1)
        }
        guard (200...299).contains(http.statusCode) else {
            throw NetworkError.badResponse(statusCode: http.statusCode)
        }
    }
}
