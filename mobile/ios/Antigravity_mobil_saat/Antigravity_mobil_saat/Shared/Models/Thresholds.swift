import Foundation

// MARK: - Health Status & Threshold Engine (Single Source for iOS & watchOS)

enum HealthStatus: String, Codable, Comparable, Sendable {
    case green
    case amber
    case red
    case missing

    var label: String {
        switch self {
        case .green: return "Normal"
        case .amber: return "Dikkat"
        case .red: return "Acil Uyarı"
        case .missing: return "Veri Yok"
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
    static let demoDisclaimer = "Demo yazılımıdır, tıbbi cihaz değildir."
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
                    return (.red, direction, "Ruh hâli art arda 2 gün 3 veya daha düşük seviyede kaldı.")
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
                    return (.amber, .rising, "Günlük radyasyon dozu hızı normal görev tabanının üzerine çıktı.")
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
                return (.amber, .rising, "Art arda 3 ölçüm üst güvenlik sınırına doğru yükseliyor.")
            }
            if let lowerMinDelta = rule.lowerMinDelta,
               let lowerNearLimit = rule.lowerNearLimit,
               v0 > v1 && v1 > v2 && (v0 - v2) >= lowerMinDelta && v2 <= lowerNearLimit {
                return (.amber, .falling, "Art arda 3 ölçüm alt güvenlik sınırına doğru düşüyor.")
            }
        }

        return (.green, direction, nil)
    }

    static func guidance(for type: HealthIndicatorType, status: HealthStatus) -> IndicatorGuidance {
        switch type {
        case .heartRate:
            return IndicatorGuidance(
                whatItIs: "Nabız, dinlenme hâlinde kalbinizin dakikada kaç kez attığını ölçer.",
                whyInSpace: "Mikro-yerçekimi vücut sıvılarının yer değiştirmesine ve kardiyovasküler kondisyon kaybına yol açarak dinlenme nabzını yükseltebilir.",
                doNow: status == .green
                    ? ["Günlük egzersiz önlemlerine ve sıvı tüketim rutinine devam edin."]
                    : ["Yorucu aktiviteyi durdurun ve 5 dakika sakin şekilde dinlenin veya sabitlenin.", "250 mL su için ve 15 dakika sonra Apple Watch ölçümünü tekrarlayın."],
                escalateWhen: "Dinlenme nabzı 120 bpm üzerinde veya 40 bpm altında kalırsa ya da baş dönmesi ve göğüs rahatsızlığı eşlik ederse ekip sağlık sorumlusu ve uçuş cerrahıyla iletişime geçin."
            )
        case .bloodPressureSys, .bloodPressureDia:
            return IndicatorGuidance(
                whatItIs: "Tansiyon, kanın atardamar duvarlarına uyguladığı basıncı ölçer.",
                whyInSpace: "Mikro-yerçekimi sıvıları baş ve göğüs bölgesine doğru kaydırarak uzun görevlerde damar tonusunu değiştirir.",
                doNow: status == .green
                    ? ["Düzenli aerobik ve direnç egzersizi protokollerini sürdürün."]
                    : ["Manşon kalp hizasında olacak şekilde 5 dakika sessizce dinlenip yeniden ölçün.", "Sıvı durumunu kontrol edin ve tekrar testten önce kafeinden kaçının."],
                escalateWhen: "Büyük tansiyon 140 mmHg ve üzerine çıkar, 90 mmHg altına düşer veya küçük tansiyon 90 mmHg ve üzerine ulaşırsa uçuş cerrahıyla iletişime geçin."
            )
        case .spo2:
            return IndicatorGuidance(
                whatItIs: "Kan oksijen satürasyonu (SpO2), kırmızı kan hücrelerinizin taşıdığı oksijen oranını gösterir.",
                whyInSpace: "Kapalı bir uzay kabininde SpO2 düşüşü hava kalitesi veya CO2 sorunlarına ya da solunum rahatsızlığına işaret edebilir.",
                doNow: status == .green
                    ? ["Kabin oksijen iletimi ve akciğer alımı sağlıklı görünüyor."]
                    : ["Eforu hemen durdurun, dik oturun ve kabin CO2/O2 değerlerini kontrol edin.", "Bileğinizi/parmağınızı ısıtın ve 5 dakika içinde ölçümü tekrarlayın."],
                escalateWhen: "SpO2 değeri %90'ın altında kalmaya devam ederse ekip sağlık sorumlusunu uyarın ve derhâl uçuş cerrahıyla iletişime geçin."
            )
        case .bodyTemp:
            return IndicatorGuidance(
                whatItIs: "Vücut ısısı, çekirdek ısıl dengenizi ve bağışıklık yanıtınızı yansıtır.",
                whyInSpace: "Kapalı yaşam alanlarında enfeksiyonlar daha kolay yayılır ve doğal hava konveksiyonu olmadığı için ısı düzenlemesi farklılaşır.",
                doNow: status == .green
                    ? ["Normal kabin termal ve sıvı tüketimi alışkanlıklarını sürdürün."]
                    : ["Dinlenin, sıvı alın ve 30 dakika sonra ağız/cilt sıcaklığını yeniden ölçün.", "Uzay aracı kabin sıcaklığını ve soğutma döngüsü durumunu doğrulayın."],
                escalateWhen: "Vücut ısısı 38,5 °C ve üzerine çıkarsa, 35,0 °C altına düşerse veya üşüme/titreme ile devam ederse uçuş cerrahıyla iletişime geçin."
            )
        case .bloodGlucose:
            return IndicatorGuidance(
                whatItIs: "Kan şekeri, hücresel enerji için kanınızdaki glukoz yoğunluğunu ölçer.",
                whyInSpace: "Beslenme değişiklikleri, uzay uçuşu stresi ve kapalı ortamdaki metabolizma farklılıkları glukoz dengesini etkiler.",
                doNow: status == .green
                    ? ["Planlanan görev öğünlerine ve sıvı düzenine bağlı kalın."]
                    : ["70 mg/dL altındaysa 15 g hızlı etkili karbonhidrat alın ve 15 dakika sonra yeniden ölçün. Yüksekse su için ve açlık ölçümünü tekrarlayın."],
                escalateWhen: "Kan şekeri 54 mg/dL altına düşerse veya 180 mg/dL üzerine çıkarsa derhâl uçuş cerrahıyla iletişime geçin."
            )
        case .sleepHours:
            return IndicatorGuidance(
                whatItIs: "Uyku süresi, son 24 saatteki toplam yenileyici uyku miktarını takip eder.",
                whyInSpace: "İzolasyon, kapalı alan, gürültü ve değişen ışık döngüleri sirkadiyen ritmi bozar.",
                doNow: status == .green
                    ? ["Tutarlı bir uyku penceresi ve kabin ışık programını koruyun."]
                    : ["Uykudan 60 dakika önce mavi ışık yayan ekranları kısın ve uyku bölmesi havalandırmasını ayarlayın.", "Görev takvimi elveriyorsa kısa bir toparlanma dinlenmesi planlayın."],
                escalateWhen: "Uyku birden fazla gece üst üste 5 saatin altında kalırsa veya dikkati olumsuz etkilerse ekip sağlık sorumlusu ve uçuş cerrahına danışın."
            )
        case .mood:
            return IndicatorGuidance(
                whatItIs: "Ruh hâli kontrolü, öznel stres, odaklanma ve duygusal dayanıklılığınızı (1–5) kaydeder.",
                whyInSpace: "Uzun süreli izolasyon, kapalı ortam ve Dünya'dan uzaklık davranışsal sağlık yükünü artırır.",
                doNow: status == .green
                    ? ["Ekip kontrollerine ve planlı aile/yer sesli mesajlarına devam edin."]
                    : ["15 dakikalık bir mola verin, bir ekip arkadaşınızla konuşun veya rehberli nefes egzersizi yapın.", "Süregelen belirtileri Apple Watch hızlı kontrolünden kaydedin."],
                escalateWhen: "Ruh hâli 1–2 seviyesindeyse veya art arda iki ya da daha fazla gün 3'te kalırsa ekip sağlık sorumlusu ve uçuş davranışsal sağlık ekibine ulaşın."
            )
        case .radiationDose:
            return IndicatorGuidance(
                whatItIs: "Kümülatif radyasyon dozu, görev boyunca emilen toplam iyonlaştırıcı radyasyonu takip eder.",
                whyInSpace: "Dünya manyetosferinin dışındaki uzay radyasyonu uzun vadede kanser, bağışıklık ve merkezi sinir sistemi risklerini artırır.",
                doNow: status == .green
                    ? ["Standart uzay aracı kalkanlaması maruziyeti plan dâhilinde tutuyor."]
                    : ["Güneş parçacığı olayı uyarılarını kontrol edin ve öneriliyorsa daha yüksek kalkanlı yaşam bölmelerine geçin."],
                escalateWhen: "Kümülatif maruziyet görev bütçesinin %80'ini aştığında veya herhangi bir güneş olayı sonrasında görev kontrolü ve uçuş cerrahını uyarın."
            )
        }
    }
}
