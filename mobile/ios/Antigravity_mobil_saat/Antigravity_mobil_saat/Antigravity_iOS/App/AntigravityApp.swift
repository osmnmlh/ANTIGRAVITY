//
//  AntigravityApp.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import SwiftUI

@main
struct AntigravityApp: App {
    var body: some Scene {
        WindowGroup {
            MainTabContainerView()
                .preferredColorScheme(.dark)
        }
    }
}

struct MainTabContainerView: View {
    @State private var selectedTab: AppTab = .dashboard
    @StateObject private var dashboardViewModel = DashboardViewModel()
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
                                DashboardView(viewModel: dashboardViewModel) { tab in
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
                                MissionListView(dashboardViewModel: dashboardViewModel)
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
            dashboardViewModel.updateJournalEntries(journalViewModel.entries, syncToBackend: false)
            dashboardViewModel.startAiAlertStream()
            dashboardViewModel.startRelayStream()
            await dashboardViewModel.syncFromBackend()
        }
        .onChange(of: journalViewModel.entries) { _, updatedEntries in
            dashboardViewModel.updateJournalEntries(updatedEntries, syncToBackend: true)
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
