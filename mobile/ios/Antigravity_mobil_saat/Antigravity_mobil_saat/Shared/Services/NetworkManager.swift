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

/// A mission task assigned from the web (Ana üs) via `POST /api/tasks`; `assigneeId` is the astronaut's crewId.
struct RemoteMissionTask: Codable, Sendable, Equatable {
    let id: String
    let title: String
    let details: String?
    let assigneeId: String
    let dueAt: String?
    let priority: String?
    let completed: Bool
}

struct RelayTaskPayload: Codable, Sendable {
    let action: String
    let task: RemoteMissionTask
}

struct RelayHelloPayload: Codable, Sendable {
    let astronauts: [AstronautHealthPacket]
    /// Absent on relays that predate mission tasks.
    let tasks: [RemoteMissionTask]?
}

enum RelayStreamEvent: Sendable {
    /// `tasks` is empty when the relay predates mission tasks.
    case hello([AstronautHealthPacket], tasks: [RemoteMissionTask])
    case packet(AstronautHealthPacket)
    case taskChanged(action: String, task: RemoteMissionTask)
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

    private init(session: URLSession = .shared) {
        self.session = session
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
                        var request = URLRequest(url: url)
                        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                        request.timeoutInterval = 90

                        let (bytes, response) = try await session.bytes(for: request)
                        try validate(response: response)

                        var currentEvent = ""
                        var currentData = ""

                        for try await line in bytes.lines {
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

                    try? await Task.sleep(nanoseconds: 5_000_000_000)
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
                        var request = URLRequest(url: url)
                        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                        request.timeoutInterval = 90

                        let (bytes, response) = try await session.bytes(for: request)
                        try validate(response: response)

                        var currentEvent = ""
                        var currentData = ""

                        for try await line in bytes.lines {
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

                    try? await Task.sleep(nanoseconds: 5_000_000_000)
                }

                continuation.finish()
            }

            continuation.onTermination = { _ in
                task.cancel()
            }
        }
    }

    /// Tells the relay a mission task was (un)completed on this phone: `POST /api/tasks/:id/complete`.
    func setTaskCompleted(id: String, completed: Bool) async {
        await postTaskAction(id: id, action: "complete", body: ["completed": completed])
    }

    /// Removes a mission task on the relay: `POST /api/tasks/:id/delete`.
    func deleteTask(id: String) async {
        await postTaskAction(id: id, action: "delete", body: [String: Bool]())
    }

    private func postTaskAction(id: String, action: String, body: [String: Bool]) async {
        guard let encoded = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let url = URL(string: "\(Constants.apiBaseURL)/api/tasks/\(encoded)/\(action)") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode(body)
        // Local state already changed; a failed sync is retried implicitly by the next hello on reconnect.
        _ = try? await session.data(for: request)
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
            return .hello(payload.astronauts, tasks: payload.tasks ?? [])
        case "packet":
            guard let packet = try? HealthJSONCodec.decoder.decode(AstronautHealthPacket.self, from: jsonData) else {
                return nil
            }
            return .packet(packet)
        case "task":
            guard let payload = try? HealthJSONCodec.decoder.decode(RelayTaskPayload.self, from: jsonData) else {
                return nil
            }
            return .taskChanged(action: payload.action, task: payload.task)
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
