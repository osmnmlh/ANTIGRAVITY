//
//  AntigravityWatchApp.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import SwiftUI

@main
struct AntigravityWatchApp: App {
    @StateObject private var coordinator = AlertCoordinator()

    var body: some Scene {
        WindowGroup {
            WatchDashboardView(coordinator: coordinator)
                .onAppear {
                    coordinator.start()
                }
                .onDisappear {
                    coordinator.stop()
                }
        }
    }
}
