//
//  AntigravityApp.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import SwiftUI

@main
struct AntigravityApp: App {
    init() {
        PhoneAlertCoordinator.shared.configureAndRequestAuthorization()
    }

    var body: some Scene {
        WindowGroup {
            MainTabContainerView()
                .preferredColorScheme(.dark)
        }
    }
}

struct MainTabContainerView: View {
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject private var alertCoordinator = PhoneAlertCoordinator.shared
    @State private var selectedTab: AppTab = .dashboard
    @State private var hasCompletedInitialSync = false
    @StateObject private var dashboardViewModel = DashboardViewModel()
    @StateObject private var missionViewModel = MissionViewModel()
    @StateObject private var journalViewModel = JournalViewModel()

    var body: some View {
        ZStack {
            ColorTheme.spaceBackdropGradient
                .ignoresSafeArea()

            VStack(spacing: 0) {
                Group {
                    switch selectedTab {
                    case .dashboard:
                        NavigationStack {
                            tabBackground {
                                DashboardView(
                                    viewModel: dashboardViewModel,
                                    missionViewModel: missionViewModel
                                ) { tab in
                                    withAnimation(.easeInOut(duration: 0.2)) {
                                        selectedTab = tab
                                    }
                                }
                            }
                        }
                    case .vitals:
                        NavigationStack {
                            tabBackground {
                                VitalsView(dashboardViewModel: dashboardViewModel)
                            }
                        }
                    case .missions:
                        NavigationStack {
                            tabBackground {
                                MissionListView(viewModel: missionViewModel) {
                                    await dashboardViewModel.refreshTasksOnly()
                                }
                            }
                        }
                    case .journal:
                        NavigationStack {
                            tabBackground {
                                JournalView(viewModel: journalViewModel)
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipped()

                GlassBottomNavBar(selectedTab: $selectedTab)
            }
        }
        .task {
            dashboardViewModel.onMissionSyncNeeded = {
                syncMissionsAndAlerts()
            }
            dashboardViewModel.updateJournalEntries(journalViewModel.entries, syncToBackend: false)
            dashboardViewModel.startAiAlertStream()
            dashboardViewModel.startRelayStream()
            dashboardViewModel.startTaskPolling()
            await dashboardViewModel.syncFromBackend()
            syncMissionsAndAlerts()
            hasCompletedInitialSync = true
        }
        .onChange(of: scenePhase) { _, newPhase in
            guard newPhase == .active, hasCompletedInitialSync else { return }
            Task {
                await dashboardViewModel.handleAppDidBecomeActive()
            }
        }
        .onChange(of: alertCoordinator.requestedTab) { _, targetTab in
            guard let targetTab else { return }
            withAnimation(.easeInOut(duration: 0.2)) {
                selectedTab = targetTab
            }
            alertCoordinator.requestedTab = nil
        }
        .onChange(of: selectedTab) { _, newTab in
            if newTab == .missions {
                Task {
                    await dashboardViewModel.refreshTasksOnly()
                }
            }
        }
        .onChange(of: journalViewModel.entries) { _, updatedEntries in
            dashboardViewModel.updateJournalEntries(updatedEntries, syncToBackend: true)
        }
        .onChange(of: dashboardViewModel.houstonSyncRevision) { _, _ in
            syncMissionsAndAlerts()
        }
        .onChange(of: missionViewModel.tasks) { _, _ in
            acknowledgeAlertsCompletedByMissions()
        }
    }

    private func syncMissionsAndAlerts() {
        missionViewModel.ingestHoustonDirectives(
            guidance: dashboardViewModel.aiGuidance,
            alerts: dashboardViewModel.activeAlerts,
            webTasks: dashboardViewModel.webAssignedTasks,
            hasSyncedWebTasks: dashboardViewModel.hasSyncedWebTasks
        )
        acknowledgeAlertsCompletedByMissions()
    }

    private func acknowledgeAlertsCompletedByMissions() {
        let completedAlerts = missionViewModel.alertsCompletedByMissions(from: dashboardViewModel.activeAlerts)
        for alert in completedAlerts {
            Task {
                await dashboardViewModel.acknowledgeAlert(alert)
            }
        }
    }

    private func tabBackground<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        ZStack {
            ColorTheme.spaceBackdropGradient
                .ignoresSafeArea()
            content()
        }
        .toolbarBackground(.hidden, for: .navigationBar)
    }
}

#Preview {
    MainTabContainerView()
        .preferredColorScheme(.dark)
}
