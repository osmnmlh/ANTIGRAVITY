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
        tasks[index].completedAt = tasks[index].isCompleted ? Date() : nil
        sortTasks()
        saveState()
    }

    func deleteTask(_ task: MissionTask) {
        recordDismissalIfHouston(task)
        tasks.removeAll { $0.id == task.id }
        saveState()
    }

    func clearCompletedTasks() {
        let completed = tasks.filter(\.isCompleted)
        guard !completed.isEmpty else { return }
        for task in completed {
            recordDismissalIfHouston(task)
        }
        tasks.removeAll { $0.isCompleted }
        saveState()
    }

    // MARK: - Houston Sync (Alerts + AI Guidance Actions)

    /// Ingests directives from Houston (live backend alerts and packet guidance) without resurrecting completed or deleted items.
    func ingestHoustonDirectives(guidance: AiGuidance?, alerts: [AiAlert]) {
        var addedAny = false

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
                addedAny = true
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
                addedAny = true
            }
        }

        if addedAny {
            sortTasks()
            saveState()
        }
    }

    // MARK: - Persistence & Helpers

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
