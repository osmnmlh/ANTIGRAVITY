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

    private let hourlyActivityBars: [Double] = [
        0.25, 0.40, 0.30, 0.72, 0.90, 0.55,
        0.48, 0.85, 0.95, 0.62, 0.78, 0.88
    ]

    // Iconic Apple Watch Activity ring colors (Move / Exercise / Stand).
    private let moveStartColor = Color(red: 0.980, green: 0.067, blue: 0.310)     // #FA114F
    private let moveEndColor = Color(red: 1.000, green: 0.259, blue: 0.451)       // #FF4273
    private let exerciseStartColor = Color(red: 0.573, green: 0.910, blue: 0.165) // #92E82A
    private let exerciseEndColor = Color(red: 0.188, green: 0.820, blue: 0.345)   // #30D158
    private let standStartColor = Color(red: 0.000, green: 0.961, blue: 0.918)    // #00F5EA
    private let standEndColor = Color(red: 0.220, green: 0.741, blue: 0.973)      // #38BDF8

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                activityRingsCard
                vitalsRingsCard
                stepsCard
                syncSamplesCard

                Text(HealthThresholds.demoDisclaimer + " (Demo yazılımıdır, tıbbi cihaz değildir.)")
                    .font(.caption2)
                    .foregroundStyle(ColorTheme.textMuted)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .multilineTextAlignment(.center)
                    .padding(.top, 4)
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 24)
        }
        .navigationTitle("Vital Veriler")
        .navigationBarTitleDisplayMode(.large)
    }

    // MARK: - Subviews

    private var activityRingsCard: some View {
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

        return GlassCardView(cornerRadius: 20, padding: 16) {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("Aktivite")
                        .font(.headline)
                        .foregroundStyle(ColorTheme.textPrimary)

                    Spacer()

                    Text("Aktivite Halkaları")
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(ColorTheme.textMuted)
                }

                ActivityRingsChartView(rings: rings)

                Divider()
                    .overlay(ColorTheme.spaceBorder)

                HStack(spacing: 5) {
                    ForEach(Array(hourlyActivityBars.enumerated()), id: \.offset) { index, ratio in
                        GeometryReader { geo in
                            ZStack(alignment: .bottom) {
                                Capsule()
                                    .fill(Color.white.opacity(0.08))
                                Capsule()
                                    .fill(
                                        index % 3 == 0 ? moveStartColor :
                                            (index % 3 == 1 ? exerciseEndColor : standEndColor)
                                    )
                                    .frame(height: max(6, geo.size.height * ratio))
                            }
                        }
                        .frame(height: 36)
                    }
                }
            }
        }
    }

    private var vitalsRingsCard: some View {
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

        return GlassCardView(cornerRadius: 20, padding: 16) {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("Ölçümler")
                        .font(.headline)
                        .foregroundStyle(ColorTheme.textPrimary)

                    Spacer()

                    Text(dashboardViewModel.overallStatus.turkishLabel)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(dashboardViewModel.overallStatus.themeColor)
                }

                ActivityRingsChartView(rings: rings)
            }
        }
    }

    private var stepsCard: some View {
        let stepGoal = 10_000.0
        let stepRatio = min(Double(dashboardViewModel.stepCount) / stepGoal, 1.0)

        return GlassCardView(cornerRadius: 20, padding: 16) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "figure.walk")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(exerciseEndColor)

                    Text("Adım (\(dashboardViewModel.distanceKmText))")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(ColorTheme.textMuted)
                        .lineLimit(1)

                    Spacer()

                    Text("\(dashboardViewModel.stepCount)/10000")
                        .font(.subheadline.weight(.semibold).monospacedDigit())
                        .foregroundStyle(exerciseEndColor)
                }

                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule(style: .continuous)
                            .fill(exerciseEndColor.opacity(0.18))

                        Capsule(style: .continuous)
                            .fill(exerciseEndColor)
                            .frame(width: max(10, geo.size.width * stepRatio))
                    }
                }
                .frame(height: 10)
                .animation(.easeInOut(duration: 0.25), value: stepRatio)
            }
        }
    }

    private var syncSamplesCard: some View {
        VStack(spacing: 8) {
            NeonButton(
                title: dashboardViewModel.isSyncingBackend ? "Gönderiliyor..." : "Ölçümleri Sunucuya Gönder",
                systemImage: "icloud.and.arrow.up",
                tintColor: ColorTheme.accent
            ) {
                Task {
                    await dashboardViewModel.sendCurrentVitalsToBackend()
                }
            }
            .disabled(dashboardViewModel.isSyncingBackend)

            if let message = dashboardViewModel.lastSampleSyncMessage {
                Text(message)
                    .font(.caption2)
                    .foregroundStyle(ColorTheme.textMuted)
            }
        }
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
