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

    static func guidance(for type: HealthIndicatorType, status: HealthStatus) -> IndicatorGuidance {
        switch type {
        case .heartRate:
            return IndicatorGuidance(
                whatItIs: "Heart rate measures how many times your heart beats per minute at rest.",
                whyInSpace: "Altered gravity causes fluid shifts and cardiovascular deconditioning, which can raise resting pulse.",
                doNow: status == .green
                    ? ["Keep up your daily countermeasures and hydration routine."]
                    : ["Stop strenuous activity and sit or tether quietly for 5 minutes.", "Drink 250 mL of water and repeat the Apple Watch reading in 15 minutes."],
                escalateWhen: "Contact the crew medical officer and flight surgeon if resting heart rate stays above 120 bpm, below 40 bpm, or comes with dizziness or chest discomfort."
            )
        case .bloodPressureSys, .bloodPressureDia:
            return IndicatorGuidance(
                whatItIs: "Blood pressure measures the force of blood pushing against artery walls.",
                whyInSpace: "Microgravity shifts fluids toward the head and chest, altering vascular tone over long missions.",
                doNow: status == .green
                    ? ["Maintain regular aerobic and resistive exercise protocols."]
                    : ["Rest quietly for 5 minutes with the cuff at heart level and re-measure.", "Check hydration and avoid caffeine before retesting."],
                escalateWhen: "Contact the flight surgeon if systolic pressure is 140 mmHg or higher, below 90 mmHg, or diastolic reaches 90 mmHg or higher."
            )
        case .spo2:
            return IndicatorGuidance(
                whatItIs: "Blood oxygen saturation (SpO2) shows how much oxygen your red blood cells carry.",
                whyInSpace: "In a hostile closed cabin, a drop in SpO2 can warn of air-quality/CO2 issues or respiratory illness.",
                doNow: status == .green
                    ? ["Cabin oxygen delivery and lung uptake look healthy."]
                    : ["Stop exertion immediately, sit upright, and check cabin CO2/O2 readouts.", "Warm your wrist/finger and repeat the measurement in 5 minutes."],
                escalateWhen: "Alert the crew medical officer and contact the flight surgeon immediately if SpO2 remains below 90%."
            )
        case .bodyTemp:
            return IndicatorGuidance(
                whatItIs: "Body temperature reflects your core thermal balance and immune response.",
                whyInSpace: "Closed habitats make infections spread more easily and thermal regulation differs without natural air convection.",
                doNow: status == .green
                    ? ["Continue normal cabin thermal and hydration habits."]
                    : ["Rest, hydrate, and re-measure oral/skin temperature in 30 minutes.", "Verify spacecraft cabin temperature and cooling loop status."],
                escalateWhen: "Contact the flight surgeon if temperature reaches 38.5 °C or higher, drops below 35.0 °C, or persists with chills."
            )
        case .bloodGlucose:
            return IndicatorGuidance(
                whatItIs: "Blood glucose measures the concentration of sugar in your blood for cellular energy.",
                whyInSpace: "Nutrition shifts, spaceflight stress, and altered metabolism in closed habitats affect glucose control.",
                doNow: status == .green
                    ? ["Stick to scheduled mission meals and hydration."]
                    : ["If below 70 mg/dL, take 15 g of fast-acting carbohydrates and retest in 15 minutes. If elevated, hydrate and retest fasting."],
                escalateWhen: "Contact the flight surgeon immediately if glucose drops below 54 mg/dL or rises above 180 mg/dL."
            )
        case .sleepHours:
            return IndicatorGuidance(
                whatItIs: "Sleep hours track total restorative sleep over the past 24 hours.",
                whyInSpace: "Isolation, confinement, noise, and shifting light cycles disrupt circadian rhythms.",
                doNow: status == .green
                    ? ["Keep a consistent sleep window and cabin light schedule."]
                    : ["Dim blue-light screens 60 minutes before sleep and adjust sleep-station ventilation.", "Schedule a brief recovery rest period if mission timeline permits."],
                escalateWhen: "Consult the crew medical officer and flight surgeon if sleep stays under 5 hours across multiple nights or impairs alertness."
            )
        case .mood:
            return IndicatorGuidance(
                whatItIs: "Mood check-in captures your subjective stress, focus, and emotional resilience (1–5).",
                whyInSpace: "Long-duration isolation, confinement, and distance from Earth increase behavioral health strain.",
                doNow: status == .green
                    ? ["Continue crew check-ins and scheduled family/ground audio messages."]
                    : ["Take a 15-minute break, connect with a crewmate, or run a guided breathing exercise.", "Log any persistent symptoms on your Apple Watch check-in."],
                escalateWhen: "Reach out to the crew medical officer and flight behavioral health team if mood is 1–2 or remains at 3 for two or more consecutive days."
            )
        case .radiationDose:
            return IndicatorGuidance(
                whatItIs: "Cumulative radiation dose tracks total ionizing radiation absorbed during the mission.",
                whyInSpace: "Space radiation raises long-term cancer, immune, and central nervous system risks outside Earth's magnetosphere.",
                doNow: status == .green
                    ? ["Standard spacecraft shielding is keeping exposure within plan."]
                    : ["Check solar particle event alerts and move to higher-shielding habitat quarters if advised."],
                escalateWhen: "Alert mission control and the flight surgeon whenever cumulative exposure exceeds 80% of the mission budget or after any solar event."
            )
        }
    }
}
