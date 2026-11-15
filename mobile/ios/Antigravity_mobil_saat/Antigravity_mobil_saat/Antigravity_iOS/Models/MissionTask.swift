//
//  MissionTask.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 15.11.2026.
//

import Foundation

enum MissionTaskSource: String, Codable, Equatable, Sendable {
    case personal
    case houston

    var badgeLabel: String {
        switch self {
        case .personal: return "Kişisel Görev"
        case .houston: return "Houston"
        }
    }

    var systemImage: String {
        switch self {
        case .personal: return "person.crop.circle"
        case .houston: return "antenna.radiowaves.left.and.right"
        }
    }
}

enum MissionTaskPriority: String, Codable, CaseIterable, Equatable, Sendable {
    case normal
    case high

    var label: String {
        switch self {
        case .normal: return "Normal"
        case .high: return "Öncelikli"
        }
    }
}

/// Persistent astronaut TODO item stored locally on the iPhone (supporting personal and Houston-issued directives).
struct MissionTask: Identifiable, Codable, Equatable, Sendable {
    let id: UUID
    var title: String
    var detail: String
    var isCompleted: Bool
    var createdAt: Date
    var dueDate: Date?
    var completedAt: Date?
    var source: MissionTaskSource
    var priority: MissionTaskPriority
    /// Unique dedup key for Houston-originated tasks so completed or deleted items never reappear on sync.
    var houstonKey: String?
    /// Preserves the original Houston directive text so even an edited Houston task stays suppressed if deleted.
    var originalHoustonTitle: String?

    init(
        id: UUID = UUID(),
        title: String,
        detail: String = "",
        isCompleted: Bool = false,
        createdAt: Date = Date(),
        dueDate: Date? = nil,
        completedAt: Date? = nil,
        source: MissionTaskSource = .personal,
        priority: MissionTaskPriority = .normal,
        houstonKey: String? = nil,
        originalHoustonTitle: String? = nil
    ) {
        self.id = id
        self.title = title
        self.detail = detail
        self.isCompleted = isCompleted
        self.createdAt = createdAt
        self.dueDate = dueDate
        self.completedAt = completedAt ?? (isCompleted ? createdAt : nil)
        self.source = source
        self.priority = priority
        self.houstonKey = houstonKey
        self.originalHoustonTitle = originalHoustonTitle
    }
}

struct PersistedMissionState: Codable, Equatable, Sendable {
    var tasks: [MissionTask]
    var dismissedHoustonKeys: Set<String>
}
