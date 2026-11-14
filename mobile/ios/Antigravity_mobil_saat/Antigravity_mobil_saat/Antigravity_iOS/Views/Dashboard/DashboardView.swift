//
//  DashboardView.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import SwiftUI

struct DashboardView: View {
    @ObservedObject var viewModel: DashboardViewModel
    var onSelectTab: (AppTab) -> Void = { _ in }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 14) {
                PlanetHeroHeader(
                    greeting: "Hoşgeldiniz Kaptan,",
                    statusTitle: viewModel.heroStatusTitle,
                    status: viewModel.overallStatus
                )

                AstronautBodyMapView(
                    values: viewModel.indicatorValues,
                    statuses: viewModel.indicatorStatuses
                )

                HStack(alignment: .top, spacing: 12) {
                    heartRateCard
                    missionsCard
                }
                .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 24)
        }
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Subviews

    private var heartRateCard: some View {
        Button {
            onSelectTab(.vitals)
        } label: {
            GlassCardView(cornerRadius: 20, padding: 16) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Image(systemName: "heart.fill")
                            .font(.headline)
                            .foregroundStyle(viewModel.heartRateStatus.themeColor)
                        Spacer()
                        Text(viewModel.heartRateStatus.turkishLabel)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(viewModel.heartRateStatus.themeColor)
                    }

                    Spacer(minLength: 4)

                    Text("Nabız")
                        .font(.caption)
                        .foregroundStyle(ColorTheme.textMuted)

                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(viewModel.heartRateText)
                            .font(.system(size: 30, weight: .bold, design: .rounded))
                            .foregroundStyle(ColorTheme.textPrimary)
                            .monospacedDigit()
                        Text("bpm")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(ColorTheme.textMuted)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }
        .buttonStyle(.plain)
    }

    private var missionsCard: some View {
        Button {
            onSelectTab(.missions)
        } label: {
            GlassCardView(cornerRadius: 20, padding: 16) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Image(systemName: "checklist")
                            .font(.headline)
                            .foregroundStyle(ColorTheme.accent)
                        Spacer()
                        Text("\(viewModel.completedMissionsCount)/\(viewModel.totalMissionsCount)")
                            .font(.caption2.weight(.semibold).monospacedDigit())
                            .foregroundStyle(ColorTheme.textMuted)
                    }

                    Spacer(minLength: 4)

                    Text("Görevler")
                        .font(.caption)
                        .foregroundStyle(ColorTheme.textMuted)

                    Text("%\(viewModel.missionCompletionPercent) Tamamlandı")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(ColorTheme.textPrimary)
                        .minimumScaleFactor(0.85)
                        .lineLimit(1)

                    ProgressView(value: viewModel.missionCompletionRatio)
                        .tint(viewModel.missionCompletionPercent == 100 ? ColorTheme.statusGreen : ColorTheme.accent)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    NavigationStack {
        ZStack {
            ColorTheme.spaceBackdropGradient.ignoresSafeArea()
            DashboardView(viewModel: DashboardViewModel())
        }
    }
    .preferredColorScheme(.dark)
}
