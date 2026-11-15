//
//  MissionViewModel.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 15.11.2026.
//

import Combine
import Foundation

/// Manages astronaut TODO missions with local JSON persistence and one-time ingestion of Houston directives.
@MainActor
final class MissionViewModel: ObservableObject {
    @Published private(set) var tasks: [MissionTask] = []

    private var dismissedHoustonKeys: Set<String> = []
    private var locallyMutatedWebTaskTimestamps: [String: Date] = [:]
    private let storageURL: URL?

    init(storageURL: URL? = MissionViewModel.defaultStorageURL()) {
        self.storageURL = storageURL
        loadOrSeedState()
    }

    // MARK: - Computed Progress

    var completedCount: Int {
        tasks.filter(\.isCompleted).count
    }

    var openCount: Int {
        tasks.filter { !$0.isCompleted }.count
    }

    var totalCount: Int {
        tasks.count
    }

    var houstonOpenCount: Int {
        tasks.filter { $0.source == .houston && !$0.isCompleted }.count
    }

    var completionRatio: Double {
        guard totalCount > 0 else { return 0 }
        return Double(completedCount) / Double(totalCount)
    }

    var completionPercent: Int {
        Int((completionRatio * 100).rounded())
    }

    // MARK: - TODO CRUD

    func addTask(
        title: String,
        detail: String = "",
        dueDate: Date? = nil,
        priority: MissionTaskPriority = .normal
    ) {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else { return }

        let trimmedDetail = detail.trimmingCharacters(in: .whitespacesAndNewlines)
        let task = MissionTask(
            title: trimmedTitle,
            detail: trimmedDetail.isEmpty ? "Kişisel Görev" : trimmedDetail,
            isCompleted: false,
            createdAt: Date(),
            dueDate: dueDate,
            completedAt: nil,
            source: .personal,
            priority: priority
        )
        tasks.insert(task, at: 0)
        sortTasks()
        saveState()
    }

    func updateTask(
        _ task: MissionTask,
        title: String,
        detail: String,
        dueDate: Date?,
        priority: MissionTaskPriority
    ) {
        guard let index = tasks.firstIndex(where: { $0.id == task.id }) else { return }
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else { return }

        let trimmedDetail = detail.trimmingCharacters(in: .whitespacesAndNewlines)
        tasks[index].title = trimmedTitle
        tasks[index].detail = trimmedDetail.isEmpty
            ? (tasks[index].source == .houston ? "Houston Talimatı" : "Kişisel Görev")
            : trimmedDetail
        tasks[index].dueDate = dueDate
        tasks[index].priority = priority
        sortTasks()
        saveState()
    }

    func toggleTask(_ task: MissionTask) {
        guard let index = tasks.firstIndex(where: { $0.id == task.id }) else { return }
        tasks[index].isCompleted.toggle()
        let isCompleted = tasks[index].isCompleted
        tasks[index].completedAt = isCompleted ? Date() : nil
        sortTasks()
        saveState()

        if let remoteId = Self.webTaskId(from: tasks[index].houstonKey) {
            locallyMutatedWebTaskTimestamps[remoteId] = Date()
            Task {
                try? await NetworkManager.shared.toggleRemoteTask(taskId: remoteId, completed: isCompleted)
            }
        }
    }

    func deleteTask(_ task: MissionTask) {
        recordDismissalIfHouston(task)
        tasks.removeAll { $0.id == task.id }
        saveState()

        if let remoteId = Self.webTaskId(from: task.houstonKey) {
            locallyMutatedWebTaskTimestamps[remoteId] = Date()
            Task {
                try? await NetworkManager.shared.deleteRemoteTask(taskId: remoteId)
            }
        }
    }

    func clearCompletedTasks() {
        let completed = tasks.filter(\.isCompleted)
        guard !completed.isEmpty else { return }
        var deletedRemoteIds: [String] = []
        for task in completed {
            recordDismissalIfHouston(task)
            if let remoteId = Self.webTaskId(from: task.houstonKey) {
                locallyMutatedWebTaskTimestamps[remoteId] = Date()
                deletedRemoteIds.append(remoteId)
            }
        }
        tasks.removeAll { $0.isCompleted }
        saveState()

        for remoteId in deletedRemoteIds {
            Task {
                try? await NetworkManager.shared.deleteRemoteTask(taskId: remoteId)
            }
        }
    }

    // MARK: - Houston Sync (Alerts + AI Guidance Actions + Web Command Tasks)

    /// Ingests directives from Houston (live backend alerts, packet guidance, and Web command-center tasks) without resurrecting completed or deleted items.
    func ingestHoustonDirectives(
        guidance: AiGuidance?,
        alerts: [AiAlert],
        webTasks: [RemoteWebTask] = [],
        hasSyncedWebTasks: Bool = false
    ) {
        var changed = false

        for alert in alerts where alert.state == "active" {
            let steps = alert.advice?.doNow
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty } ?? []
            let effectiveSteps = steps.isEmpty ? [alert.title.trimmingCharacters(in: .whitespacesAndNewlines)] : steps
            let createdStamp = Int(alert.createdAt.timeIntervalSince1970)
            let reasonSuffix = alert.advice?.why.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let detailText = reasonSuffix.isEmpty ? alert.title : "\(alert.title) • \(reasonSuffix)"
            let priority: MissionTaskPriority = (alert.severity == .red) ? .high : .normal

            for (slotIndex, step) in effectiveSteps.enumerated() {
                let norm = Self.normalizedDirectiveText(step)
                guard !norm.isEmpty else { continue }

                let slotKey = "alert:\(alert.id):\(createdStamp):slot:\(slotIndex)"
                let textKey = Self.textSuppressionKey(forNormalized: norm)

                if dismissedHoustonKeys.contains(slotKey) || dismissedHoustonKeys.contains(textKey) {
                    continue
                }
                if tasks.contains(where: { $0.houstonKey == slotKey || Self.matchesActiveHoustonText($0, normalized: norm) }) {
                    continue
                }

                tasks.insert(
                    MissionTask(
                        title: step,
                        detail: detailText,
                        isCompleted: false,
                        createdAt: alert.createdAt,
                        dueDate: nil,
                        completedAt: nil,
                        source: .houston,
                        priority: priority,
                        houstonKey: slotKey,
                        originalHoustonTitle: step
                    ),
                    at: 0
                )
                changed = true
            }
        }

        if let guidance {
            let priority: MissionTaskPriority = (guidance.overallStatus == .red) ? .high : .normal
            let detailText: String = {
                if guidance.overallStatus == .green {
                    return "Houston • Günlük Sağlık Protokolü"
                }
                let summary = guidance.summary.trimmingCharacters(in: .whitespacesAndNewlines)
                return summary.isEmpty ? "Houston • Durum Protokolü" : "Houston • \(summary)"
            }()

            for rawAction in guidance.actions {
                let action = rawAction.trimmingCharacters(in: .whitespacesAndNewlines)
                let norm = Self.normalizedDirectiveText(action)
                guard !norm.isEmpty else { continue }

                let guidanceKey = "guidance:\(norm)"
                let textKey = Self.textSuppressionKey(forNormalized: norm)

                if dismissedHoustonKeys.contains(guidanceKey) || dismissedHoustonKeys.contains(textKey) {
                    continue
                }
                if tasks.contains(where: { $0.houstonKey == guidanceKey || Self.matchesActiveHoustonText($0, normalized: norm) }) {
                    continue
                }

                tasks.insert(
                    MissionTask(
                        title: action,
                        detail: detailText,
                        isCompleted: false,
                        createdAt: guidance.generatedAt,
                        dueDate: nil,
                        completedAt: nil,
                        source: .houston,
                        priority: priority,
                        houstonKey: guidanceKey,
                        originalHoustonTitle: action
                    ),
                    at: 0
                )
                changed = true
            }
        }

        let now = Date()
        for remote in webTasks {
            let trimmedTitle = remote.title.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmedTitle.isEmpty else { continue }

            let key = "web:\(remote.id)"
            if dismissedHoustonKeys.contains(key) {
                continue
            }

            let priority: MissionTaskPriority = (remote.priority == "high") ? .high : .normal
            let trimmedDetails = remote.details.trimmingCharacters(in: .whitespacesAndNewlines)
            let detailText = trimmedDetails.isEmpty ? "Komuta Merkezi • Web Görevi" : trimmedDetails
            let dueDate = HealthJSONCodec.parseFlexibleDate(remote.dueAt)
            let createdAt = HealthJSONCodec.parseFlexibleDate(remote.createdAt) ?? now

            if let existingIndex = tasks.firstIndex(where: { $0.houstonKey == key }) {
                let recentlyMutatedLocally = locallyMutatedWebTaskTimestamps[remote.id]
                    .map { now.timeIntervalSince($0) < 4.0 } ?? false
                if !recentlyMutatedLocally && tasks[existingIndex].isCompleted != remote.completed {
                    tasks[existingIndex].isCompleted = remote.completed
                    tasks[existingIndex].completedAt = remote.completed ? now : nil
                    changed = true
                }
                if tasks[existingIndex].title != trimmedTitle ||
                    tasks[existingIndex].detail != detailText ||
                    tasks[existingIndex].dueDate != dueDate ||
                    tasks[existingIndex].priority != priority {
                    tasks[existingIndex].title = trimmedTitle
                    tasks[existingIndex].detail = detailText
                    tasks[existingIndex].dueDate = dueDate
                    tasks[existingIndex].priority = priority
                    changed = true
                }
            } else {
                tasks.insert(
                    MissionTask(
                        title: trimmedTitle,
                        detail: detailText,
                        isCompleted: remote.completed,
                        createdAt: createdAt,
                        dueDate: dueDate,
                        completedAt: remote.completed ? createdAt : nil,
                        source: .houston,
                        priority: priority,
                        houstonKey: key,
                        originalHoustonTitle: trimmedTitle
                    ),
                    at: 0
                )
                changed = true
            }
        }

        if hasSyncedWebTasks {
            let activeWebIds = Set(webTasks.map(\.id))
            let beforeCount = tasks.count
            tasks.removeAll { task in
                guard let remoteId = Self.webTaskId(from: task.houstonKey) else { return false }
                if activeWebIds.contains(remoteId) { return false }
                let recentlyMutatedLocally = locallyMutatedWebTaskTimestamps[remoteId]
                    .map { now.timeIntervalSince($0) < 4.0 } ?? false
                return !recentlyMutatedLocally
            }
            if tasks.count != beforeCount {
                changed = true
            }
        }

        if changed {
            sortTasks()
            saveState()
        }
    }

    /// Returns any currently active backend alerts whose Houston mission tasks have all been completed or dismissed.
    func alertsCompletedByMissions(from activeAlerts: [AiAlert]) -> [AiAlert] {
        activeAlerts.filter { alert in
            guard alert.state == "active" else { return false }
            let createdStamp = Int(alert.createdAt.timeIntervalSince1970)
            let prefix = "alert:\(alert.id):\(createdStamp):"

            let alertTasks = tasks.filter { $0.houstonKey?.hasPrefix(prefix) == true }
            let hadDismissedPrefix = dismissedHoustonKeys.contains { $0.hasPrefix(prefix) }

            let steps = (alert.advice?.doNow ?? [])
                .map { Self.normalizedDirectiveText($0) }
                .filter { !$0.isEmpty }
            let fallbackNorm = Self.normalizedDirectiveText(alert.title)
            let expectedSteps = steps.isEmpty ? (fallbackNorm.isEmpty ? [] : [fallbackNorm]) : steps

            let hasOpenMatchingStep = expectedSteps.contains { norm in
                tasks.contains { !$0.isCompleted && Self.matchesActiveHoustonText($0, normalized: norm) }
            }

            if !alertTasks.isEmpty {
                return alertTasks.allSatisfy(\.isCompleted) && !hasOpenMatchingStep
            }

            if hadDismissedPrefix {
                return !hasOpenMatchingStep
            }

            guard !expectedSteps.isEmpty else { return false }
            return expectedSteps.allSatisfy { norm in
                tasks.contains { $0.source == .houston && $0.isCompleted && Self.matchesActiveHoustonText($0, normalized: norm) }
            }
        }
    }

    // MARK: - Persistence & Helpers

    private static func webTaskId(from houstonKey: String?) -> String? {
        guard let houstonKey, houstonKey.hasPrefix("web:") else { return nil }
        let id = String(houstonKey.dropFirst(4))
        return id.isEmpty ? nil : id
    }

    private func recordDismissalIfHouston(_ task: MissionTask) {
        if let houstonKey = task.houstonKey, !houstonKey.isEmpty {
            dismissedHoustonKeys.insert(houstonKey)
        }
        guard task.source == .houston else { return }

        let titleNorm = Self.normalizedDirectiveText(task.title)
        if !titleNorm.isEmpty {
            dismissedHoustonKeys.insert(Self.textSuppressionKey(forNormalized: titleNorm))
            if task.houstonKey?.hasPrefix("guidance:") == true || task.houstonKey == nil {
                dismissedHoustonKeys.insert("guidance:\(titleNorm)")
            }
        }

        if let original = task.originalHoustonTitle {
            let origNorm = Self.normalizedDirectiveText(original)
            if !origNorm.isEmpty {
                dismissedHoustonKeys.insert(Self.textSuppressionKey(forNormalized: origNorm))
                dismissedHoustonKeys.insert("guidance:\(origNorm)")
            }
        }
    }

    private static func matchesActiveHoustonText(_ task: MissionTask, normalized: String) -> Bool {
        guard task.source == .houston else { return false }
        if normalizedDirectiveText(task.title) == normalized {
            return true
        }
        if let original = task.originalHoustonTitle,
           normalizedDirectiveText(original) == normalized {
            return true
        }
        return false
    }

    private static func textSuppressionKey(forNormalized normalized: String) -> String {
        "text:\(normalized)"
    }

    private static func normalizedDirectiveText(_ raw: String) -> String {
        raw
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased(with: Locale(identifier: "tr_TR"))
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
    }

    private func sortTasks() {
        tasks.sort { lhs, rhs in
            if lhs.isCompleted != rhs.isCompleted {
                return !lhs.isCompleted
            }
            if !lhs.isCompleted {
                if lhs.priority != rhs.priority {
                    return lhs.priority == .high
                }
                if lhs.source != rhs.source {
                    return lhs.source == .houston
                }
                return lhs.createdAt > rhs.createdAt
            }
            let leftDone = lhs.completedAt ?? lhs.createdAt
            let rightDone = rhs.completedAt ?? rhs.createdAt
            return leftDone > rightDone
        }
    }

    private func loadOrSeedState() {
        if let url = storageURL,
           let data = try? Data(contentsOf: url),
           let decoded = try? HealthJSONCodec.decoder.decode(PersistedMissionState.self, from: data) {
            tasks = decoded.tasks
            dismissedHoustonKeys = decoded.dismissedHoustonKeys
            sortTasks()
            return
        }

        tasks = Self.seedTasks()
        dismissedHoustonKeys = []
        sortTasks()
        saveState()
    }

    private func saveState() {
        guard let url = storageURL else { return }
        let state = PersistedMissionState(tasks: tasks, dismissedHoustonKeys: dismissedHoustonKeys)
        guard let data = try? HealthJSONCodec.encoder.encode(state) else { return }
        try? data.write(to: url, options: [.atomic])
    }

    nonisolated private static func defaultStorageURL() -> URL? {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
            .first?
            .appendingPathComponent("mission_tasks.json")
    }

    private static func seedTasks() -> [MissionTask] {
        let now = Date()
        return [
            MissionTask(
                title: "Sabah Apple Watch SpO2 & Nabız Ölçümü",
                detail: "Vital Kontrol • 08:00",
                isCompleted: true,
                createdAt: now.addingTimeInterval(-3600 * 6),
                completedAt: now.addingTimeInterval(-3600 * 5),
                source: .personal
            ),
            MissionTask(
                title: "Kabin CO2 ve Radyasyon Dozu Kontrolü",
                detail: "Çevresel Güvenlik • 10:30",
                isCompleted: true,
                createdAt: now.addingTimeInterval(-3600 * 4),
                completedAt: now.addingTimeInterval(-3600 * 3),
                source: .personal
            ),
            MissionTask(
                title: "Günlük Direnç / Kardiyo Egzersizi (30 dk)",
                detail: "Mikro-yerçekimi Önlemi • 13:00",
                isCompleted: true,
                createdAt: now.addingTimeInterval(-3600 * 2),
                completedAt: now.addingTimeInterval(-3600 * 1),
                source: .personal
            ),
            MissionTask(
                title: "Akşam Uyku & Ruh Hali Kaydı",
                detail: "Davranışsal Sağlık • 21:00",
                isCompleted: false,
                createdAt: now.addingTimeInterval(-1800),
                source: .personal
            )
        ]
    }
}
