//
//  JournalEntry.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Foundation

/// Personal free-text astronaut journal note stored locally on the iPhone.
struct JournalEntry: Identifiable, Codable, Equatable, Sendable {
    let id: UUID
    var title: String
    var body: String
    var createdAt: Date

    init(
        id: UUID = UUID(),
        title: String,
        body: String,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.title = title
        self.body = body
        self.createdAt = createdAt
    }
}
