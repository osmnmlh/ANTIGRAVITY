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

    var body: some View {
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
            case .logbook:
                NavigationStack {
                    tabBackground {
                        LogbookView(dashboardViewModel: dashboardViewModel)
                    }
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            GlassBottomNavBar(selectedTab: $selectedTab)
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
