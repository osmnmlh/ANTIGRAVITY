import Foundation

// MARK: - Health Status & Threshold Engine (Single Source for iOS & watchOS)

enum HealthStatus: String, Codable, Comparable, Sendable {
    case green
    case amber
    case red
    case missing

    var label: String {
        switch self {
        case .green: return "Nominal"
        case .amber: return "Caution"
        case .red: return "Alert"
        case .missing: return "Missing"
        }
    }

    var systemIconName: String {
        switch self {
        case .green: return "checkmark.circle.fill"
        case .amber: return "exclamationmark.triangle.fill"
        case .red: return "xmark.octagon.fill"
        case .missing: return "questionmark.circle"
        }
    }

    private var severityRank: Int {
        switch self {
        case .green: return 0
        case .missing: return 1
        case .amber: return 2
        case .red: return 3
        }
    }

    static func < (lhs: HealthStatus, rhs: HealthStatus) -> Bool {
        lhs.severityRank < rhs.severityRank
    }
}

struct IndicatorGuidance: Sendable {
    let whatItIs: String
    let whyInSpace: String
    let doNow: [String]
    let escalateWhen: String
}

enum TrendDirection: String, Codable, Sendable {
    case rising
    case falling
    case stable
}

struct TrendAssessment: Sendable {
    let type: HealthIndicatorType
    let pointStatus: HealthStatus
    let trendStatus: HealthStatus
    let effectiveStatus: HealthStatus
    let direction: TrendDirection
    let reason: String?
}

enum HealthThresholds {
    static let demoDisclaimer = "Demo software, not a medical device."
    static let defaultRadiationBudgetMsv: Double = 200.0 // demo mission budget; same as web DEMO_MISSION_DOSE_BUDGET_MSV

    private struct DriftRule {
        let upperMinDelta: Double?
        let upperNearLimit: Double?
        let lowerMinDelta: Double?
        let lowerNearLimit: Double?
    }

    // Mirrored identically in web/src/domain/thresholds.ts.
    private static let driftRules: [HealthIndicatorType: DriftRule] = [
        .heartRate: DriftRule(upperMinDelta: 8, upperNearLimit: 80, lowerMinDelta: 8, lowerNearLimit: 60),
        .bloodPressureSys: DriftRule(upperMinDelta: 8, upperNearLimit: 118, lowerMinDelta: 8, lowerNearLimit: 100),
        .bloodPressureDia: DriftRule(upperMinDelta: 5, upperNearLimit: 74, lowerMinDelta: 5, lowerNearLimit: 66),
        .spo2: DriftRule(upperMinDelta: nil, upperNearLimit: nil, lowerMinDelta: 2, lowerNearLimit: 97),
        .bodyTemp: DriftRule(upperMinDelta: 0.4, upperNearLimit: 37.1, lowerMinDelta: 0.4, lowerNearLimit: 36.4),
        .bloodGlucose: DriftRule(upperMinDelta: 12, upperNearLimit: 110, lowerMinDelta: 12, lowerNearLimit: 85),
        .sleepHours: DriftRule(upperMinDelta: nil, upperNearLimit: nil, lowerMinDelta: 0.8, lowerNearLimit: 7.5),
    ]

    static func status(
        for type: HealthIndicatorType,
        value: Double?,
        radiationBudgetMsv: Double = defaultRadiationBudgetMsv
    ) -> HealthStatus {
        guard let value else { return .missing }

        // Ranges are continuous (upper bound exclusive) so decimals like 129.5 never fall into a gap.

        switch type {
        case .heartRate:
            if (50...100).contains(value) { return .green }
            if (40...120).contains(value) { return .amber }
            return .red

        case .bloodPressureSys:
            if (90..<130).contains(value) { return .green }
            if (130..<140).contains(value) { return .amber }
            return .red

        case .bloodPressureDia:
            if (60..<80).contains(value) { return .green }
            if (80..<90).contains(value) { return .amber }
            return .red

        case .spo2:
            if value >= 95 { return .green }
            if value >= 90 { return .amber }
            return .red

        case .bodyTemp:
            if (36.1..<37.6).contains(value) { return .green }
            if (35.0..<38.5).contains(value) { return .amber }
            return .red

        case .bloodGlucose:
            if (70..<126).contains(value) { return .green }
            if (54...180).contains(value) { return .amber }
            return .red

        case .sleepHours:
            if value >= 7.0 { return .green }
            if value >= 5.0 { return .amber }
            return .red

        case .mood:
            if value >= 4.0 { return .green }
            if value >= 3.0 { return .amber }
            return .red

        case .radiationDose:
            let budget = max(radiationBudgetMsv, 1.0)
            let ratio = value / budget
            if ratio < 0.50 { return .green }
            if ratio <= 0.80 { return .amber }
            return .red
        }
    }

    static func overallStatus(
        from measurements: [String: MeasurementSnapshot],
        samples: [HealthSample]? = nil,
        crewId: String? = nil,
        radiationBudgetMsv: Double = defaultRadiationBudgetMsv
    ) -> HealthStatus {
        let crewSamples = samples?.filter { sample in
            crewId == nil || sample.crewId == crewId
        }
        let statuses = HealthIndicatorType.allCases.map { type in
            let pointStatus = status(
                for: type,
                value: measurements[type.rawValue]?.value,
                radiationBudgetMsv: radiationBudgetMsv
            )
            let trend = crewSamples.map { trendStatus(for: type, samples: $0) } ?? .green
            return max(pointStatus, trend)
        }
        return statuses.max() ?? .missing
    }

    static func trendStatus(
        for type: HealthIndicatorType,
        samples: [HealthSample]
    ) -> HealthStatus {
        evaluateTrend(for: type, samples: samples).status
    }

    static func effectiveStatus(
        for type: HealthIndicatorType,
        samples: [HealthSample],
        radiationBudgetMsv: Double = defaultRadiationBudgetMsv
    ) -> HealthStatus {
        let sorted = sortedSamples(for: type, samples: samples)
        let pointStatus = status(
            for: type,
            value: sorted.last?.value,
            radiationBudgetMsv: radiationBudgetMsv
        )
        if pointStatus == .missing { return .missing }
        return max(pointStatus, trendStatus(for: type, samples: sorted))
    }

    static func assessTrend(
        for type: HealthIndicatorType,
        samples: [HealthSample],
        radiationBudgetMsv: Double = defaultRadiationBudgetMsv
    ) -> TrendAssessment {
        let sorted = sortedSamples(for: type, samples: samples)
        let pointStatus = status(
            for: type,
            value: sorted.last?.value,
            radiationBudgetMsv: radiationBudgetMsv
        )
        let trend = evaluateTrend(for: type, samples: sorted)
        let effective = pointStatus == .missing ? .missing : max(pointStatus, trend.status)
        return TrendAssessment(
            type: type,
            pointStatus: pointStatus,
            trendStatus: trend.status,
            effectiveStatus: effective,
            direction: trend.direction,
            reason: trend.reason
        )
    }

    private static func sortedSamples(
        for type: HealthIndicatorType,
        samples: [HealthSample]
    ) -> [HealthSample] {
        samples
            .filter { $0.type == type }
            .sorted { $0.timestamp < $1.timestamp }
    }

    private static var utcCalendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(secondsFromGMT: 0)!
        return cal
    }

    private static func latestPerUtcDay(_ sorted: [HealthSample]) -> [(dayStart: Date, value: Double)] {
        let cal = utcCalendar
        var byDay: [Date: Double] = [:]
        for sample in sorted {
            let dayStart = cal.startOfDay(for: sample.timestamp)
            byDay[dayStart] = sample.value
        }
        return byDay
            .sorted { $0.key < $1.key }
            .map { (dayStart: $0.key, value: $0.value) }
    }

    private static func utcDayDiff(_ dayA: Date, _ dayB: Date) -> Int {
        Int((dayB.timeIntervalSince(dayA) / 86_400.0).rounded())
    }

    private static func computeDirection(_ sorted: [HealthSample]) -> TrendDirection {
        guard sorted.count >= 2 else { return .stable }
        let prev = sorted[sorted.count - 2].value
        let curr = sorted[sorted.count - 1].value
        if curr > prev { return .rising }
        if curr < prev { return .falling }
        return .stable
    }

    private static func evaluateTrend(
        for type: HealthIndicatorType,
        samples: [HealthSample]
    ) -> (status: HealthStatus, direction: TrendDirection, reason: String?) {
        let sorted = sortedSamples(for: type, samples: samples)
        guard !sorted.isEmpty else {
            return (.green, .stable, nil)
        }
        let direction = computeDirection(sorted)

        if type == .mood {
            let daily = latestPerUtcDay(sorted)
            if daily.count >= 2 {
                let prev = daily[daily.count - 2]
                let curr = daily[daily.count - 1]
                if utcDayDiff(prev.dayStart, curr.dayStart) == 1 && prev.value <= 3 && curr.value <= 3 {
                    return (.red, direction, "Mood has remained 3 or lower for 2 consecutive days.")
                }
            }
            return (.green, direction, nil)
        }

        if type == .radiationDose {
            let daily = latestPerUtcDay(sorted)
            if daily.count >= 3 {
                let d0 = daily[daily.count - 3]
                let d1 = daily[daily.count - 2]
                let d2 = daily[daily.count - 1]
                let gap1 = Double(max(utcDayDiff(d0.dayStart, d1.dayStart), 1))
                let gap2 = Double(max(utcDayDiff(d1.dayStart, d2.dayStart), 1))
                let rate1 = (d1.value - d0.value) / gap1
                let rate2 = (d2.value - d1.value) / gap2
                if rate2 >= 3.0 || (rate1 > 0 && rate2 >= rate1 * 2.0 && rate2 >= 2.0) {
                    return (.amber, .rising, "Daily radiation dose rate spiked above normal mission baseline.")
                }
            }
            return (.green, direction, nil)
        }

        if let rule = driftRules[type], sorted.count >= 3 {
            let last3 = sorted.suffix(3).map(\.value)
            let (v0, v1, v2) = (last3[0], last3[1], last3[2])
            if let upperMinDelta = rule.upperMinDelta,
               let upperNearLimit = rule.upperNearLimit,
               v0 < v1 && v1 < v2 && (v2 - v0) >= upperMinDelta && v2 >= upperNearLimit {
                return (.amber, .rising, "3 consecutive readings rising toward the upper safety limit.")
            }
            if let lowerMinDelta = rule.lowerMinDelta,
               let lowerNearLimit = rule.lowerNearLimit,
               v0 > v1 && v1 > v2 && (v0 - v2) >= lowerMinDelta && v2 <= lowerNearLimit {
                return (.amber, .falling, "3 consecutive readings drifting toward the lower safety limit.")
            }
        }

        return (.green, direction, nil)
    }

    /// Offline fallback of the guidance sheet. While the backend is reachable the sheet shows the AI recommendation
    /// (`AiGuidance.indicators`, Gemini or the backend's Turkish rules) instead; this table is only used without it.
    static func guidance(for type: HealthIndicatorType, status: HealthStatus) -> IndicatorGuidance {
        switch type {
        case .heartRate:
            return IndicatorGuidance(
                whatItIs: "Nabız, kalbinin dinlenirken dakikada kaç kez attığını gösterir.",
                whyInSpace: "Değişen yerçekimi sıvıların vücutta kaymasına ve kalp-damar sisteminin zayıflamasına yol açar; bu da dinlenik nabzı yükseltebilir.",
                doNow: status == .green
                    ? ["Günlük egzersiz ve sıvı alımı düzenini sürdür."]
                    : ["Yorucu aktiviteyi bırak, 5 dakika sakin otur veya kendini sabitle.", "250 mL su iç ve Apple Watch ölçümünü 15 dakika sonra tekrarla."],
                escalateWhen: "Dinlenik nabız 120'nin üzerinde ya da 40'ın altında kalıyorsa veya baş dönmesi ya da göğüste rahatsızlık varsa mürettebat sağlık sorumlusuna ve uçuş cerrahına haber ver."
            )
        case .bloodPressureSys, .bloodPressureDia:
            return IndicatorGuidance(
                whatItIs: "Kan basıncı, kanın damar duvarlarına uyguladığı kuvveti gösterir.",
                whyInSpace: "Mikro yerçekimi sıvıları baş ve göğüs bölgesine kaydırır; uzun görevlerde damar tonusunu değiştirir.",
                doNow: status == .green
                    ? ["Düzenli aerobik ve direnç egzersizi programını sürdür."]
                    : ["Manşet kalp hizasındayken 5 dakika sakin dinlen ve yeniden ölç.", "Sıvı alımını kontrol et ve tekrar ölçmeden önce kafein alma."],
                escalateWhen: "Büyük tansiyon 140 mmHg ve üzerinde ya da 90 mmHg'nin altındaysa veya küçük tansiyon 90 mmHg ve üzerine çıkarsa uçuş cerrahına haber ver."
            )
        case .spo2:
            return IndicatorGuidance(
                whatItIs: "Kandaki oksijen doygunluğu (SpO2), alyuvarlarının ne kadar oksijen taşıdığını gösterir.",
                whyInSpace: "Kapalı ve zorlu bir kabinde SpO2 düşüşü, hava kalitesi veya CO2 sorununa ya da solunum hastalığına işaret edebilir.",
                doNow: status == .green
                    ? ["Kabin oksijeni ve akciğerlerin oksijen alımı normal görünüyor."]
                    : ["Eforu hemen bırak, dik otur ve kabin CO2/O2 göstergelerini kontrol et.", "Bileğini veya parmağını ısıt ve ölçümü 5 dakika sonra tekrarla."],
                escalateWhen: "SpO2 %90'ın altında kalırsa mürettebat sağlık sorumlusunu uyar ve uçuş cerrahına hemen haber ver."
            )
        case .bodyTemp:
            return IndicatorGuidance(
                whatItIs: "Vücut ısısı, çekirdek ısı dengeni ve bağışıklık yanıtını yansıtır.",
                whyInSpace: "Kapalı yaşam alanlarında enfeksiyonlar daha kolay yayılır; doğal hava dolaşımı olmadığı için ısı düzenlemesi de farklıdır.",
                doNow: status == .green
                    ? ["Normal kabin ısısı ve sıvı alışkanlıklarını sürdür."]
                    : ["Dinlen, sıvı al ve vücut ısını 30 dakika sonra tekrar ölç.", "Kabin sıcaklığını ve soğutma devresinin durumunu kontrol et."],
                escalateWhen: "Isı 38,5 °C ve üzerine çıkarsa, 35,0 °C'nin altına düşerse veya titremeyle birlikte sürerse uçuş cerrahına haber ver."
            )
        case .bloodGlucose:
            return IndicatorGuidance(
                whatItIs: "Kan şekeri, hücrelerin enerji için kullandığı kandaki şeker miktarını gösterir.",
                whyInSpace: "Beslenme değişiklikleri, uçuş stresi ve kapalı ortamda değişen metabolizma kan şekeri kontrolünü etkiler.",
                doNow: status == .green
                    ? ["Planlanan görev öğünlerine ve sıvı alımına uy."]
                    : ["70 mg/dL'nin altındaysa 15 g hızlı etkili karbonhidrat al ve 15 dakika sonra tekrar ölç. Yüksekse sıvı al ve açken yeniden ölç."],
                escalateWhen: "Kan şekeri 54 mg/dL'nin altına düşer ya da 180 mg/dL'yi aşarsa uçuş cerrahına hemen haber ver."
            )
        case .sleepHours:
            return IndicatorGuidance(
                whatItIs: "Uyku süresi, son 24 saatte aldığın toplam dinlendirici uykuyu gösterir.",
                whyInSpace: "İzolasyon, kapalı alan, gürültü ve değişen ışık döngüleri gece-gündüz ritmini bozar.",
                doNow: status == .green
                    ? ["Uyku saatini ve kabin ışık düzenini sabit tut."]
                    : ["Uyumadan 60 dakika önce mavi ışıklı ekranları kıs ve uyku istasyonunun havalandırmasını ayarla.", "Görev takvimi uygunsa kısa bir toparlanma molası planla."],
                escalateWhen: "Uyku birkaç gece üst üste 5 saatin altında kalırsa veya dikkatini etkilerse mürettebat sağlık sorumlusu ve uçuş cerrahıyla görüş."
            )
        case .mood:
            return IndicatorGuidance(
                whatItIs: "Ruh hali kontrolü; stres, odak ve duygusal dayanıklılığına dair kendi değerlendirmeni (1–5) kaydeder.",
                whyInSpace: "Uzun süreli izolasyon, kapalı alan ve Dünya'dan uzaklık davranışsal sağlığı zorlar.",
                doNow: status == .green
                    ? ["Mürettebatla görüşmeleri ve planlı aile veya yer istasyonu ses mesajlarını sürdür."]
                    : ["15 dakika mola ver, bir mürettebat arkadaşınla konuş veya yönlendirmeli bir nefes egzersizi yap.", "Süren belirtileri Apple Watch kontrolüne kaydet."],
                escalateWhen: "Ruh halin 1–2 ise ya da iki veya daha fazla gün üst üste 3'te kalıyorsa mürettebat sağlık sorumlusuna ve davranışsal sağlık ekibine ulaş."
            )
        case .radiationDose:
            return IndicatorGuidance(
                whatItIs: "Kümülatif radyasyon dozu, görev boyunca aldığın toplam iyonlaştırıcı radyasyonu gösterir.",
                whyInSpace: "Dünya'nın manyetosferi dışında uzay radyasyonu uzun vadeli kanser, bağışıklık ve merkezi sinir sistemi risklerini artırır.",
                doNow: status == .green
                    ? ["Standart uzay aracı korumasıyla maruziyet planın içinde kalıyor."]
                    : ["Güneş parçacık olayı uyarılarını kontrol et; önerilirse daha iyi korunan yaşam bölümüne geç."],
                escalateWhen: "Kümülatif maruziyet görev bütçesinin %80'ini aşarsa veya herhangi bir güneş olayından sonra görev kontrolünü ve uçuş cerrahını bilgilendir."
            )
        }
    }
}
