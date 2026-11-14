//
//  JournalViewModel.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Combine
import Foundation

/// Manages the astronaut's free-text journal entries with local JSON persistence in Documents.
@MainActor
final class JournalViewModel: ObservableObject {
    @Published private(set) var entries: [JournalEntry] = []

    private let storageURL: URL?

    init(storageURL: URL? = JournalViewModel.defaultStorageURL()) {
        self.storageURL = storageURL
        loadOrSeedEntries()
    }

    func addEntry(title: String, body: String, date: Date = Date()) {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty || !trimmedBody.isEmpty else { return }

        let entry = JournalEntry(
            title: trimmedTitle.isEmpty ? "Başlıksız Not" : trimmedTitle,
            body: trimmedBody,
            createdAt: date
        )
        entries.insert(entry, at: 0)
        entries.sort { $0.createdAt > $1.createdAt }
        saveEntries()
    }

    func updateEntry(_ entry: JournalEntry, title: String, body: String, date: Date) {
        guard let index = entries.firstIndex(where: { $0.id == entry.id }) else { return }
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty || !trimmedBody.isEmpty else { return }

        entries[index].title = trimmedTitle.isEmpty ? "Başlıksız Not" : trimmedTitle
        entries[index].body = trimmedBody
        entries[index].createdAt = date
        entries.sort { $0.createdAt > $1.createdAt }
        saveEntries()
    }

    func deleteEntry(_ entry: JournalEntry) {
        entries.removeAll { $0.id == entry.id }
        saveEntries()
    }

    private func loadOrSeedEntries() {
        if let url = storageURL,
           let data = try? Data(contentsOf: url),
           let decoded = try? HealthJSONCodec.decoder.decode([JournalEntry].self, from: data) {
            entries = decoded.sorted { $0.createdAt > $1.createdAt }
            return
        }

        entries = Self.seedEntries().sorted { $0.createdAt > $1.createdAt }
        saveEntries()
    }

    private func saveEntries() {
        guard let url = storageURL,
              let data = try? HealthJSONCodec.encoder.encode(entries) else {
            return
        }
        try? data.write(to: url, options: [.atomic])
    }

    nonisolated private static func defaultStorageURL() -> URL? {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
            .first?
            .appendingPathComponent("journal_entries.json")
    }

    private static func seedEntries() -> [JournalEntry] {
        let now = Date()
        return [
            JournalEntry(
                title: "Görev Günü 120 — Yörünge Gözlemi",
                body: "Kabin içi rutin bakım tamamlandı. Pencereden gözlenen ufuk hattı son derece netti; ekip morali yüksek.",
                createdAt: now.addingTimeInterval(-3600 * 4)
            ),
            JournalEntry(
                title: "Direnç Egzersizi Sonrası Not",
                body: "Öğleden sonra ARED seansını tamamladım. Mikro yerçekiminde omuz esnetme hareketleri belirgin rahatlama sağlıyor.",
                createdAt: now.addingTimeInterval(-3600 * 28)
            ),
            JournalEntry(
                title: "Ares-IV Ekip Brifingi",
                body: "İletişim gecikmesi 20 dakika seviyesinde. Yarınki hidroponik modül kontrolü için görev paylaşımı yapıldı.",
                createdAt: now.addingTimeInterval(-3600 * 52)
            )
        ]
    }
}
