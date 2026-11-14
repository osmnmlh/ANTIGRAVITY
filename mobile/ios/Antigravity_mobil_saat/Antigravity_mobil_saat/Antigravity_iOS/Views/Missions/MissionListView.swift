//
//  MissionListView.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import SwiftUI

struct MissionListView: View {
    @ObservedObject var dashboardViewModel: DashboardViewModel
    @State private var newTaskTitle: String = ""

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                progressSummaryCard
                addMissionCard

                VStack(spacing: 10) {
                    ForEach(dashboardViewModel.missionTasks) { task in
                        missionRow(task)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 24)
        }
        .navigationTitle("Görevler")
        .navigationBarTitleDisplayMode(.large)
    }

    // MARK: - Subviews

    private var progressSummaryCard: some View {
        let percent = dashboardViewModel.missionCompletionPercent
        let barColor = percent == 100 ? ColorTheme.statusGreen : ColorTheme.accent

        return GlassCardView(cornerRadius: 20, padding: 16) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    Text("%\(percent) Tamamlandı")
                        .font(.title3.weight(.bold).monospacedDigit())
                        .foregroundStyle(ColorTheme.textPrimary)

                    Spacer()

                    Text("\(dashboardViewModel.completedMissionsCount)/\(dashboardViewModel.totalMissionsCount)")
                        .font(.subheadline.weight(.semibold).monospacedDigit())
                        .foregroundStyle(ColorTheme.textMuted)
                }

                ProgressView(value: dashboardViewModel.missionCompletionRatio)
                    .tint(barColor)
                    .animation(.easeInOut(duration: 0.25), value: dashboardViewModel.missionCompletionRatio)
            }
        }
    }

    private var addMissionCard: some View {
        GlassCardView(cornerRadius: 16, padding: 12) {
            HStack(spacing: 10) {
                TextField("Yeni görev ekle...", text: $newTaskTitle)
                    .font(.subheadline)
                    .foregroundStyle(ColorTheme.textPrimary)
                    .submitLabel(.done)
                    .onSubmit(submitNewTask)

                Button(action: submitNewTask) {
                    Image(systemName: "plus.circle.fill")
                        .font(.title3)
                        .foregroundStyle(
                            newTaskTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                ? ColorTheme.textMuted
                                : ColorTheme.accent
                        )
                }
                .buttonStyle(.plain)
                .disabled(newTaskTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("Görev Ekle")
            }
        }
    }

    private func missionRow(_ task: MissionTask) -> some View {
        GlassCardView(cornerRadius: 16, padding: 14) {
            HStack(spacing: 12) {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        dashboardViewModel.toggleMission(task)
                    }
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: task.isCompleted ? "checkmark.circle.fill" : "circle")
                            .font(.title3)
                            .foregroundStyle(task.isCompleted ? ColorTheme.statusGreen : ColorTheme.textMuted)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(task.title)
                                .font(.subheadline.weight(.medium))
                                .strikethrough(task.isCompleted, pattern: .solid, color: ColorTheme.textMuted)
                                .foregroundStyle(task.isCompleted ? ColorTheme.textMuted : ColorTheme.textPrimary)
                                .multilineTextAlignment(.leading)

                            Text(task.detail)
                                .font(.caption2)
                                .foregroundStyle(ColorTheme.textMuted)
                        }

                        Spacer(minLength: 4)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        dashboardViewModel.deleteMission(task)
                    }
                } label: {
                    Image(systemName: "trash")
                        .font(.caption)
                        .foregroundStyle(ColorTheme.textMuted)
                        .padding(6)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Görevi Sil")
            }
        }
    }

    private func submitNewTask() {
        let trimmed = newTaskTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        withAnimation(.easeInOut(duration: 0.2)) {
            dashboardViewModel.addMission(title: trimmed)
        }
        newTaskTitle = ""
    }
}

#Preview {
    NavigationStack {
        ZStack {
            ColorTheme.spaceBackdropGradient.ignoresSafeArea()
            MissionListView(dashboardViewModel: DashboardViewModel())
        }
    }
    .preferredColorScheme(.dark)
}
