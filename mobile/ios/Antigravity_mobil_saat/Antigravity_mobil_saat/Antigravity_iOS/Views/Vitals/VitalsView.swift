//
//  VitalsView.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import SwiftUI

struct VitalsView: View {
    @ObservedObject var dashboardViewModel: DashboardViewModel

    private let moveGoal: Double = 600
    private let exerciseGoal: Double = 60
    private let standGoal: Double = 12

    // Iconic Apple Watch Activity ring colors (Move / Exercise / Stand).
    private let moveStartColor = Color(red: 0.980, green: 0.067, blue: 0.310)     // #FA114F
    private let moveEndColor = Color(red: 1.000, green: 0.259, blue: 0.451)       // #FF4273
    private let exerciseStartColor = Color(red: 0.573, green: 0.910, blue: 0.165) // #92E82A
    private let exerciseEndColor = Color(red: 0.188, green: 0.820, blue: 0.345)   // #30D158
    private let standStartColor = Color(red: 0.000, green: 0.961, blue: 0.918)    // #00F5EA
    private let standEndColor = Color(red: 0.220, green: 0.741, blue: 0.973)      // #38BDF8

    var body: some View {
        GeometryReader { proxy in
            let verticalPadding: CGFloat = 16
            let cardSpacing: CGFloat = 12
            let availableHeight = max(proxy.size.height - verticalPadding - cardSpacing * 2, 460)
            let perCardHeight = availableHeight / 3.0
            let dynamicRingSize = Swift.min(Swift.max(perCardHeight - 78, 114), 126)
            let dynamicThickness = dynamicRingSize * 0.105
            let minContentHeight = Swift.min(Swift.max(perCardHeight - 52, 134), 156)

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: cardSpacing) {
                    activityRingsCard(ringSize: dynamicRingSize, ringThickness: dynamicThickness, minContentHeight: minContentHeight)
                    vitalsRingsCard(ringSize: dynamicRingSize, ringThickness: dynamicThickness, minContentHeight: minContentHeight)
                    missionMetricsRingsCard(ringSize: dynamicRingSize, ringThickness: dynamicThickness, minContentHeight: minContentHeight)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }
        }
        .navigationTitle("Vital Veriler")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Subviews

    private func ringCard(
        title: String,
        trailingText: String,
        trailingColor: Color,
        rings: [ActivityRingItem],
        ringSize: CGFloat,
        ringThickness: CGFloat,
        minContentHeight: CGFloat
    ) -> some View {
        GlassCardView(cornerRadius: 20, padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(title)
                        .font(.headline)
                        .foregroundStyle(ColorTheme.textPrimary)

                    Spacer()

                    Text(trailingText)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(trailingColor)
                }

                ActivityRingsChartView(
                    rings: rings,
                    ringSize: ringSize,
                    ringThickness: ringThickness,
                    ringSpacing: 3.2
                )
            }
            .frame(maxWidth: .infinity, minHeight: minContentHeight, alignment: .leading)
        }
    }

    private func activityRingsCard(ringSize: CGFloat, ringThickness: CGFloat, minContentHeight: CGFloat) -> some View {
        let moveProgress = max(0, dashboardViewModel.activeCalories / moveGoal)
        let exerciseProgress = max(0, Double(dashboardViewModel.exerciseMinutes) / exerciseGoal)
        let standProgress = max(0, Double(dashboardViewModel.standHours) / standGoal)

        let rings: [ActivityRingItem] = [
            ActivityRingItem(
                id: "move",
                title: "Hareket",
                valueText: "\(Int(dashboardViewModel.activeCalories.rounded()))/\(Int(moveGoal)) kcal",
                icon: "flame.fill",
                progress: moveProgress,
                startColor: moveStartColor,
                endColor: moveEndColor
            ),
            ActivityRingItem(
                id: "exercise",
                title: "Egzersiz",
                valueText: "\(dashboardViewModel.exerciseMinutes)/\(Int(exerciseGoal)) dk",
                icon: "figure.run",
                progress: exerciseProgress,
                startColor: exerciseStartColor,
                endColor: exerciseEndColor
            ),
            ActivityRingItem(
                id: "stand",
                title: "Duruş",
                valueText: "\(dashboardViewModel.standHours)/\(Int(standGoal)) sa",
                icon: "arrow.up",
                progress: standProgress,
                startColor: standStartColor,
                endColor: standEndColor
            )
        ]

        return ringCard(
            title: "Aktivite",
            trailingText: "Aktivite Halkaları",
            trailingColor: ColorTheme.textMuted,
            rings: rings,
            ringSize: ringSize,
            ringThickness: ringThickness,
            minContentHeight: minContentHeight
        )
    }

    private func vitalsRingsCard(ringSize: CGFloat, ringThickness: CGFloat, minContentHeight: CGFloat) -> some View {
        let hrProgress = normalizedProgress(value: dashboardViewModel.heartRateValue, min: 40, max: 140)
        let spo2Progress = normalizedProgress(value: dashboardViewModel.spo2Value, min: 85, max: 100)
        let tempProgress = normalizedProgress(value: dashboardViewModel.bodyTempValue, min: 35.0, max: 39.0)

        let hrColor = dashboardViewModel.heartRateStatus.themeColor
        let spo2Color = dashboardViewModel.spo2Status.themeColor
        let tempColor = dashboardViewModel.bodyTempStatus.themeColor

        let rings: [ActivityRingItem] = [
            ActivityRingItem(
                id: "heartRate",
                title: "Nabız",
                valueText: "\(dashboardViewModel.heartRateText) bpm",
                statusText: dashboardViewModel.heartRateStatus.turkishLabel,
                icon: "heart.fill",
                progress: hrProgress,
                startColor: hrColor.opacity(0.75),
                endColor: hrColor
            ),
            ActivityRingItem(
                id: "spo2",
                title: "SpO2",
                valueText: dashboardViewModel.spo2Text,
                statusText: dashboardViewModel.spo2Status.turkishLabel,
                icon: "lungs.fill",
                progress: spo2Progress,
                startColor: spo2Color.opacity(0.75),
                endColor: spo2Color
            ),
            ActivityRingItem(
                id: "bodyTemp",
                title: "Vücut Isısı",
                valueText: dashboardViewModel.bodyTempText,
                statusText: dashboardViewModel.bodyTempStatus.turkishLabel,
                icon: "thermometer.medium",
                progress: tempProgress,
                startColor: tempColor.opacity(0.75),
                endColor: tempColor
            )
        ]

        return ringCard(
            title: "Ölçümler",
            trailingText: dashboardViewModel.overallStatus.turkishLabel,
            trailingColor: dashboardViewModel.overallStatus.themeColor,
            rings: rings,
            ringSize: ringSize,
            ringThickness: ringThickness,
            minContentHeight: minContentHeight
        )
    }

    private func missionMetricsRingsCard(ringSize: CGFloat, ringThickness: CGFloat, minContentHeight: CGFloat) -> some View {
        let sleepValue = dashboardViewModel.indicatorValues[.sleepHours]
        let sleepProgress = sleepValue.map { normalizedProgress(value: $0, min: 0, max: 9.0) } ?? 0.02
        let sleepStatus = dashboardViewModel.indicatorStatuses[.sleepHours] ?? .missing
        let sleepColor = sleepStatus.themeColor
        let sleepText = sleepValue.map { String(format: "%.1f sa", $0) } ?? "--"

        let bpValue = dashboardViewModel.indicatorValues[.bloodPressureSys]
        let bpProgress = bpValue.map { normalizedProgress(value: $0, min: 70, max: 160) } ?? 0.02
        let bpStatus = dashboardViewModel.bloodPressureStatus
        let bpColor = bpStatus.themeColor
        let bpText = dashboardViewModel.bloodPressureText == "--/--"
            ? "--/--"
            : "\(dashboardViewModel.bloodPressureText) mmHg"

        let radValue = dashboardViewModel.indicatorValues[.radiationDose]
        let radProgress = radValue.map {
            Swift.min(Swift.max($0 / max(dashboardViewModel.radiationBudgetMsv, 1.0), 0.10), 1.2)
        } ?? 0.02
        let radStatus = dashboardViewModel.indicatorStatuses[.radiationDose] ?? .missing
        let radColor = radStatus.themeColor
        let radText = radValue.map { String(format: "%.1f mSv", $0) } ?? "--"

        let sectionWorst = max(sleepStatus, max(bpStatus, radStatus))

        let rings: [ActivityRingItem] = [
            ActivityRingItem(
                id: "sleepHours",
                title: "Uyku",
                valueText: sleepText,
                statusText: sleepStatus.turkishLabel,
                icon: "bed.double.fill",
                progress: sleepProgress,
                startColor: sleepColor.opacity(0.75),
                endColor: sleepColor
            ),
            ActivityRingItem(
                id: "bloodPressure",
                title: "Tansiyon",
                valueText: bpText,
                statusText: bpStatus.turkishLabel,
                icon: "drop.fill",
                progress: bpProgress,
                startColor: bpColor.opacity(0.75),
                endColor: bpColor
            ),
            ActivityRingItem(
                id: "radiationDose",
                title: "Radyasyon",
                valueText: radText,
                statusText: radStatus.turkishLabel,
                icon: "sun.max.fill",
                progress: radProgress,
                startColor: radColor.opacity(0.75),
                endColor: radColor
            )
        ]

        return ringCard(
            title: "Uyku, Tansiyon & Radyasyon",
            trailingText: sectionWorst == .missing ? "Bekleniyor" : sectionWorst.turkishLabel,
            trailingColor: sectionWorst.themeColor,
            rings: rings,
            ringSize: ringSize,
            ringThickness: ringThickness,
            minContentHeight: minContentHeight
        )
    }

    private func normalizedProgress(value: Double, min: Double, max: Double) -> Double {
        guard max > min else { return 0 }
        return Swift.min(Swift.max((value - min) / (max - min), 0.08), 1.0)
    }
}

#Preview {
    NavigationStack {
        ZStack {
            ColorTheme.spaceBackdropGradient.ignoresSafeArea()
            VitalsView(dashboardViewModel: DashboardViewModel())
        }
    }
    .preferredColorScheme(.dark)
}
