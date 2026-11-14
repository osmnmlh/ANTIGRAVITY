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

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                activityBarsCard
                vitalsBarsCard
                stepsCard

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

    private var activityBarsCard: some View {
        let moveColor = ColorTheme.statusRed
        let exerciseColor = ColorTheme.statusGreen
        let standColor = ColorTheme.accent

        return GlassCardView(cornerRadius: 20, padding: 16) {
            VStack(alignment: .leading, spacing: 14) {
                Text("Aktivite")
                    .font(.headline)
                    .foregroundStyle(ColorTheme.textPrimary)

                WatchHorizontalBarRow(
                    title: "Hareket",
                    valueText: "\(Int(dashboardViewModel.activeCalories.rounded()))/\(Int(moveGoal)) kcal",
                    progress: min(dashboardViewModel.activeCalories / moveGoal, 1.0),
                    barColor: moveColor,
                    icon: "flame.fill"
                )

                WatchHorizontalBarRow(
                    title: "Egzersiz",
                    valueText: "\(dashboardViewModel.exerciseMinutes)/\(Int(exerciseGoal)) dk",
                    progress: min(Double(dashboardViewModel.exerciseMinutes) / exerciseGoal, 1.0),
                    barColor: exerciseColor,
                    icon: "figure.run"
                )

                WatchHorizontalBarRow(
                    title: "Duruş",
                    valueText: "\(dashboardViewModel.standHours)/\(Int(standGoal)) sa",
                    progress: min(Double(dashboardViewModel.standHours) / standGoal, 1.0),
                    barColor: standColor,
                    icon: "arrow.up.circle.fill"
                )

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
                                        index % 3 == 0 ? moveColor :
                                            (index % 3 == 1 ? exerciseColor : standColor)
                                    )
                                    .frame(height: max(6, geo.size.height * ratio))
                            }
                        }
                        .frame(height: 40)
                    }
                }
            }
        }
    }

    private var vitalsBarsCard: some View {
        let hrProgress = normalizedProgress(value: dashboardViewModel.heartRateValue, min: 40, max: 140)
        let spo2Progress = normalizedProgress(value: dashboardViewModel.spo2Value, min: 85, max: 100)
        let tempProgress = normalizedProgress(value: dashboardViewModel.bodyTempValue, min: 35.0, max: 39.0)

        return GlassCardView(cornerRadius: 20, padding: 16) {
            VStack(alignment: .leading, spacing: 14) {
                Text("Ölçümler")
                    .font(.headline)
                    .foregroundStyle(ColorTheme.textPrimary)

                WatchHorizontalBarRow(
                    title: "Nabız • \(dashboardViewModel.heartRateStatus.turkishLabel)",
                    valueText: "\(dashboardViewModel.heartRateText) bpm",
                    progress: hrProgress,
                    barColor: dashboardViewModel.heartRateStatus.themeColor,
                    icon: "heart.fill"
                )

                WatchHorizontalBarRow(
                    title: "SpO2 • \(dashboardViewModel.spo2Status.turkishLabel)",
                    valueText: dashboardViewModel.spo2Text,
                    progress: spo2Progress,
                    barColor: dashboardViewModel.spo2Status.themeColor,
                    icon: "lungs.fill"
                )

                WatchHorizontalBarRow(
                    title: "Vücut Isısı • \(dashboardViewModel.bodyTempStatus.turkishLabel)",
                    valueText: dashboardViewModel.bodyTempText,
                    progress: tempProgress,
                    barColor: dashboardViewModel.bodyTempStatus.themeColor,
                    icon: "thermometer.medium"
                )
            }
        }
    }

    private var stepsCard: some View {
        let stepGoal = 10_000.0
        let stepRatio = min(Double(dashboardViewModel.stepCount) / stepGoal, 1.0)

        return GlassCardView(cornerRadius: 20, padding: 16) {
            WatchHorizontalBarRow(
                title: "Adım (\(dashboardViewModel.distanceKmText))",
                valueText: "\(dashboardViewModel.stepCount)/10000",
                progress: stepRatio,
                barColor: ColorTheme.statusGreen,
                icon: "figure.walk"
            )
        }
    }

    private func normalizedProgress(value: Double, min: Double, max: Double) -> Double {
        guard max > min else { return 0 }
        return Swift.min(Swift.max((value - min) / (max - min), 0.08), 1.0)
    }
}

private struct WatchHorizontalBarRow: View {
    let title: String
    let valueText: String
    let progress: Double
    let barColor: Color
    let icon: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(barColor)

                Text(title)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(ColorTheme.textMuted)
                    .lineLimit(1)

                Spacer()

                Text(valueText)
                    .font(.subheadline.weight(.semibold).monospacedDigit())
                    .foregroundStyle(barColor)
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule(style: .continuous)
                        .fill(barColor.opacity(0.18))

                    Capsule(style: .continuous)
                        .fill(barColor)
                        .frame(width: max(10, geo.size.width * progress))
                }
            }
            .frame(height: 10)
            .animation(.easeInOut(duration: 0.25), value: progress)
        }
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
