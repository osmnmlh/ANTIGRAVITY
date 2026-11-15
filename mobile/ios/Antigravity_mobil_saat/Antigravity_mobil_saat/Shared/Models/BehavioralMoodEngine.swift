//
//  BehavioralMoodEngine.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Foundation

/// Lightweight snapshot of a journal entry shared across targets without introducing iOS-only dependencies.
struct JournalNoteInput: Equatable, Sendable {
    let title: String
    let body: String
    let createdAt: Date
}

enum JournalSentimentTone: String, Equatable, Sendable {
    case veryNegative = "COK_OLUMSUZ"
    case negative = "OLUMSUZ"
    case neutral = "NOTR"
    case positive = "OLUMLU"
    case veryPositive = "COK_OLUMLU"

    var label: String {
        switch self {
        case .veryNegative: return "Çok Olumsuz"
        case .negative: return "Olumsuz"
        case .neutral: return "Nötr"
        case .positive: return "Olumlu"
        case .veryPositive: return "Çok Olumlu"
        }
    }

    var moodDelta: Double {
        switch self {
        case .veryNegative: return -1.8
        case .negative: return -1.0
        case .neutral: return 0.0
        case .positive: return 0.5
        case .veryPositive: return 0.8
        }
    }

    var status: HealthStatus {
        switch self {
        case .veryNegative: return .red
        case .negative: return .amber
        case .neutral, .positive, .veryPositive: return .green
        }
    }
}

struct JournalSentimentResult: Equatable, Sendable {
    let tone: JournalSentimentTone
    let delta: Double
    let summary: String
    let analyzedByAi: Bool
    let digest: String
}

struct MoodFactorContribution: Identifiable, Equatable, Sendable {
    let id: String
    let label: String
    let detailText: String
    let delta: Double
    let status: HealthStatus

    var formattedDelta: String {
        if abs(delta) < 0.05 { return "0.0" }
        return String(format: "%+.1f", delta)
    }
}

struct AlgorithmicMoodAssessment: Equatable, Sendable {
    let score: Int
    let rawScore: Double
    let status: HealthStatus
    let factors: [MoodFactorContribution]
    let journalAnalysis: JournalSentimentResult
    let symptoms: [String]
    let isFatigueIsolationRisk: Bool

    var summaryLine: String {
        let negativeDrivers = factors.filter { $0.delta <= -0.35 }.map(\.label)
        if isFatigueIsolationRisk {
            return "Yorgunluk & İzolasyon Riski: düşük uyku ve olumsuz ruh hâli sinyalleri birleşti."
        }
        if !negativeDrivers.isEmpty {
            return "Ruh hâlini aşağı çeken etkenler: \(negativeDrivers.joined(separator: ", "))."
        }
        if journalAnalysis.delta >= 0.4 {
            return "Olumlu günlük notları ve dengeli fizyolojik veriler morali destekliyor."
        }
        return "Uyku, tansiyon, radyasyon ve günlük verileri dengeli seyrediyor."
    }
}

/// Evaluates journal text with backend Gemini AI and falls back to deterministic Turkish NLP when offline.
enum JournalSentimentAnalyzer {
    private static let strongNegativeStems = [
        "umutsuz", "caresiz", "tuken", "dayanam", "berbat", "felaket", "kabus",
        "kriz", "panik", "depres", "bunal", "istemiyorum", "yapamiyorum", "intihar",
        "cok kotu", "hopeless", "despair", "terrible", "panic", "miserable"
    ]

    private static let moderateNegativeStems = [
        "kotu", "uzgun", "mutsuz", "yalniz", "stres", "kaygi", "endise", "yorgun",
        "uykusuz", "uyuyamad", "agri", "bulant", "huzursuz", "sinirli", "gergin",
        "bitkin", "sikinti", "korku", "agir", "kirgin", "ozledim", "zorlan",
        "bad", "sad", "lonely", "tired", "anxious", "stressed", "exhausted", "pain"
    ]

    private static let strongPositiveStems = [
        "harika", "mukemmel", "muhtesem", "mutlu", "muazzam", "olaganustu",
        "enerjik", "dinc", "keyifli", "huzurlu", "sevin", "gurur",
        "great", "wonderful", "happy", "amazing", "energized"
    ]

    private static let moderatePositiveStems = [
        "iyi", "guzel", "umutlu", "umut", "rahat", "sakin", "yuksek", "olumlu",
        "verimli", "basar", "motive", "netti", "saglikli", "uyumlu", "rahatlama",
        "dinlen", "keyif", "good", "calm", "positive", "rested", "proud"
    ]

    private static let negators: Set<String> = [
        "degil", "degilim", "yok", "hic", "olmadim", "olmamis", "not", "never", "no"
    ]

    static func digest(for notes: [JournalNoteInput]) -> String {
        let topNotes = Array(notes.sorted { $0.createdAt > $1.createdAt }.prefix(3))
        if topNotes.isEmpty { return "empty" }
        return topNotes
            .map { "\($0.createdAt.timeIntervalSince1970):\($0.title):\($0.body)" }
            .joined(separator: "|")
    }

    static func buildPromptMessage(for notes: [JournalNoteInput]) -> String? {
        let recent = Array(notes.sorted { $0.createdAt > $1.createdAt }.prefix(3))
        guard !recent.isEmpty else { return nil }

        let combined = recent.enumerated().map { index, note in
            let prefix = index == 0 ? "En yeni" : "Onceki"
            return "[\(prefix)] \(note.title): \(note.body)"
        }.joined(separator: " | ")

        // Keep well below backend chat MAX_CHARS (500).
        let clippedExcerpt = String(combined.prefix(310))
        return "Gunluk yazisi duygu analizi yap. Ilk kelimen yalnizca COK_OLUMSUZ, OLUMSUZ, NOTR, OLUMLU veya COK_OLUMLU olsun; ardindan Turkce tek cumle yaz. Notlar: \(clippedExcerpt)"
    }

    static func parseGeminiReply(_ rawReply: String, digest: String) -> JournalSentimentResult? {
        let trimmed = rawReply.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        let upperLine = normalizeAsciiTurkish(trimmed.components(separatedBy: .newlines).first ?? trimmed).uppercased()
        let tone: JournalSentimentTone
        let matchedMarkers: [String]

        if upperLine.contains("COK_OLUMSUZ") || upperLine.contains("COK OLUMSUZ") {
            tone = .veryNegative
            matchedMarkers = ["COK_OLUMSUZ", "COK OLUMSUZ", "ÇOK OLUMSUZ"]
        } else if upperLine.contains("COK_OLUMLU") || upperLine.contains("COK OLUMLU") {
            tone = .veryPositive
            matchedMarkers = ["COK_OLUMLU", "COK OLUMLU", "ÇOK OLUMLU"]
        } else if upperLine.contains("OLUMSUZ") {
            tone = .negative
            matchedMarkers = ["OLUMSUZ"]
        } else if upperLine.contains("OLUMLU") {
            tone = .positive
            matchedMarkers = ["OLUMLU"]
        } else if upperLine.contains("NOTR") {
            tone = .neutral
            matchedMarkers = ["NOTR", "NÖTR"]
        } else {
            return nil
        }

        var cleanedSummary = trimmed
        for marker in matchedMarkers {
            if let range = cleanedSummary.range(of: marker, options: [.caseInsensitive, .diacriticInsensitive]) {
                cleanedSummary.removeSubrange(range)
                break
            }
        }
        cleanedSummary = cleanedSummary.trimmingCharacters(in: CharacterSet(charactersIn: " .:-–—\n\t"))
        if cleanedSummary.isEmpty {
            cleanedSummary = "AI günlük değerlendirmesi: \(tone.label)."
        }

        return JournalSentimentResult(
            tone: tone,
            delta: tone.moodDelta,
            summary: cleanedSummary,
            analyzedByAi: true,
            digest: digest
        )
    }

    static func evaluateLocally(_ notes: [JournalNoteInput]) -> JournalSentimentResult {
        let currentDigest = digest(for: notes)
        let recent = Array(notes.sorted { $0.createdAt > $1.createdAt }.prefix(3))
        guard !recent.isEmpty else {
            return JournalSentimentResult(
                tone: .neutral,
                delta: 0.0,
                summary: "Henüz günlük yazısı bulunmuyor.",
                analyzedByAi: false,
                digest: currentDigest
            )
        }

        let weights: [Double] = [1.0, 0.45, 0.25]
        var weightedScore = 0.0

        for (index, note) in recent.enumerated() {
            let weight = index < weights.count ? weights[index] : 0.2
            let textScore = scoreText("\(note.title) \(note.body)")
            weightedScore += textScore * weight
        }

        let tone: JournalSentimentTone
        let summary: String
        switch weightedScore {
        case ...(-1.35):
            tone = .veryNegative
            summary = "Son günlük notlarında yoğun stres veya olumsuz ifadeler tespit edildi."
        case ..<(-0.30):
            tone = .negative
            summary = "Günlük notlarında zorlanma veya yorgunluk ifadeleri öne çıkıyor."
        case ..<0.30:
            tone = .neutral
            summary = "Günlük notları nötr ve dengeli bir ton taşıyor."
        case ..<1.15:
            tone = .positive
            summary = "Günlük notlarında olumlu ve uyumlu bir ruh hâli gözleniyor."
        default:
            tone = .veryPositive
            summary = "Günlük notlarında yüksek motivasyon ve güçlü olumlu ifadeler yer alıyor."
        }

        return JournalSentimentResult(
            tone: tone,
            delta: tone.moodDelta,
            summary: summary,
            analyzedByAi: false,
            digest: currentDigest
        )
    }

    private static func scoreText(_ text: String) -> Double {
        let normalized = normalizeAsciiTurkish(text).lowercased()
        let rawWords = normalized
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }

        var score = 0.0
        for (i, word) in rawWords.enumerated() {
            let prev = i > 0 ? rawWords[i - 1] : nil
            let next = i + 1 < rawWords.count ? rawWords[i + 1] : nil
            let hasNegation = (prev.map { negators.contains($0) } ?? false) || (next.map { negators.contains($0) } ?? false)

            if strongNegativeStems.contains(where: { word.contains($0) }) {
                score += hasNegation ? 0.35 : -1.4
            } else if moderateNegativeStems.contains(where: { word.contains($0) }) {
                score += hasNegation ? 0.25 : -0.85
            } else if strongPositiveStems.contains(where: { word.contains($0) }) {
                score += hasNegation ? -0.95 : 0.90
            } else if moderatePositiveStems.contains(where: { word.contains($0) }) {
                score += hasNegation ? -0.80 : 0.55
            }
        }
        return score
    }

    private static func normalizeAsciiTurkish(_ input: String) -> String {
        let map: [Character: String] = [
            "ç": "c", "Ç": "C",
            "ğ": "g", "Ğ": "G",
            "ı": "i", "İ": "I", "I": "I",
            "ö": "o", "Ö": "O",
            "ş": "s", "Ş": "S",
            "ü": "u", "Ü": "U"
        ]
        var output = ""
        output.reserveCapacity(input.count)
        for char in input {
            output.append(map[char] ?? String(char))
        }
        return output
    }
}

/// Computes the astronaut's algorithmic 1–5 mood score from sleep, blood pressure, radiation, vitals, symptoms, and AI journal sentiment.
enum BehavioralMoodEngine {
    static func assess(
        sleepHours: Double?,
        bloodPressureSys: Double?,
        bloodPressureDia: Double?,
        radiationDose: Double?,
        radiationBudgetMsv: Double,
        heartRate: Double?,
        spo2: Double?,
        exerciseMinutes: Int?,
        symptoms: [String],
        journal: JournalSentimentResult
    ) -> AlgorithmicMoodAssessment {
        var factors: [MoodFactorContribution] = []

        // 1. Sleep duration factor
        let sleepStatus = HealthThresholds.status(for: .sleepHours, value: sleepHours)
        let sleepDelta: Double
        let sleepDetail: String
        if let sleepHours {
            switch sleepHours {
            case 8.0...:
                sleepDelta = 0.4
            case 7.0..<8.0:
                sleepDelta = 0.1
            case 6.0..<7.0:
                sleepDelta = -0.4
            case 5.0..<6.0:
                sleepDelta = -0.9
            default:
                sleepDelta = -1.5
            }
            sleepDetail = String(format: "%.1f sa", sleepHours)
        } else {
            sleepDelta = 0.0
            sleepDetail = "Veri yok"
        }
        factors.append(
            MoodFactorContribution(
                id: "sleep",
                label: "Uyku Süresi",
                detailText: sleepDetail,
                delta: sleepDelta,
                status: sleepStatus
            )
        )

        // 2. Blood pressure factor
        let sysStatus = HealthThresholds.status(for: .bloodPressureSys, value: bloodPressureSys)
        let diaStatus = HealthThresholds.status(for: .bloodPressureDia, value: bloodPressureDia)
        let bpStatus: HealthStatus = (sysStatus == .missing && diaStatus == .missing) ? .missing : max(sysStatus, diaStatus)
        let bpDelta: Double
        switch bpStatus {
        case .green, .missing:
            bpDelta = 0.0
        case .amber:
            bpDelta = -0.4
        case .red:
            bpDelta = -0.9
        }
        let bpDetail: String
        if let sys = bloodPressureSys, let dia = bloodPressureDia {
            bpDetail = "\(Int(sys.rounded()))/\(Int(dia.rounded())) mmHg"
        } else {
            bpDetail = "Veri yok"
        }
        factors.append(
            MoodFactorContribution(
                id: "bloodPressure",
                label: "Tansiyon",
                detailText: bpDetail,
                delta: bpDelta,
                status: bpStatus
            )
        )

        // 3. Cumulative radiation factor
        let radStatus = HealthThresholds.status(
            for: .radiationDose,
            value: radiationDose,
            radiationBudgetMsv: radiationBudgetMsv
        )
        let radDelta: Double
        let radDetail: String
        if let radiationDose {
            let ratio = radiationDose / max(radiationBudgetMsv, 1.0)
            if ratio < 0.35 {
                radDelta = 0.1
            } else if ratio < 0.50 {
                radDelta = 0.0
            } else if ratio <= 0.80 {
                radDelta = -0.5
            } else {
                radDelta = -1.1
            }
            let percent = Int((ratio * 100).rounded())
            radDetail = String(format: "%.1f mSv (%%%d)", radiationDose, percent)
        } else {
            radDelta = 0.0
            radDetail = "Veri yok"
        }
        factors.append(
            MoodFactorContribution(
                id: "radiation",
                label: "Radyasyon",
                detailText: radDetail,
                delta: radDelta,
                status: radStatus
            )
        )

        // 4. Journal sentiment factor (Gemini AI or offline NLP)
        let sourcePrefix = journal.analyzedByAi ? "Gemini AI" : "Metin Analizi"
        factors.append(
            MoodFactorContribution(
                id: "journal",
                label: "Günlük (\(sourcePrefix))",
                detailText: journal.tone.label,
                delta: journal.delta,
                status: journal.tone.status
            )
        )

        // 5. Supporting physiological vitals & Watch symptom reports
        let hrStatus = HealthThresholds.status(for: .heartRate, value: heartRate)
        let spo2Status = HealthThresholds.status(for: .spo2, value: spo2)
        var bioDelta = 0.0
        switch hrStatus {
        case .amber: bioDelta -= 0.3
        case .red: bioDelta -= 0.6
        default: break
        }
        switch spo2Status {
        case .amber: bioDelta -= 0.4
        case .red: bioDelta -= 0.9
        default: break
        }
        if let exerciseMinutes {
            if exerciseMinutes >= 30 {
                bioDelta += 0.2
            } else if exerciseMinutes < 15 {
                bioDelta -= 0.2
            }
        }
        bioDelta -= Double(min(symptoms.count, 3)) * 0.35

        let worstBio = max(hrStatus, spo2Status)
        let bioStatus: HealthStatus = !symptoms.isEmpty || bioDelta <= -0.35
            ? max(worstBio == .missing ? .green : worstBio, bioDelta <= -0.9 ? .red : .amber)
            : (worstBio == .missing ? .green : worstBio)
        var bioParts: [String] = []
        if let heartRate { bioParts.append("\(Int(heartRate.rounded())) bpm") }
        if let spo2 { bioParts.append("SpO2 %\(Int(spo2.rounded()))") }
        if let exerciseMinutes { bioParts.append("\(exerciseMinutes) dk egzersiz") }
        if !symptoms.isEmpty { bioParts.append("\(symptoms.count) belirti") }

        factors.append(
            MoodFactorContribution(
                id: "vitalsSymptoms",
                label: "Vitaller & Belirtiler",
                detailText: bioParts.isEmpty ? "Normal" : bioParts.joined(separator: " • "),
                delta: (bioDelta * 10).rounded() / 10,
                status: bioStatus
            )
        )

        let totalDelta = factors.reduce(0.0) { $0 + $1.delta }
        let rawScore = min(max(4.0 + totalDelta, 1.0), 5.0)
        let computedScore = min(max(Int(rawScore.rounded()), 1), 5)
        let status = HealthThresholds.status(for: .mood, value: Double(computedScore))
        let isFatigueIsolation = (sleepHours ?? 8.0) < 6.0 && computedScore <= 3

        return AlgorithmicMoodAssessment(
            score: computedScore,
            rawScore: rawScore,
            status: status,
            factors: factors,
            journalAnalysis: journal,
            symptoms: symptoms,
            isFatigueIsolationRisk: isFatigueIsolation
        )
    }
}
