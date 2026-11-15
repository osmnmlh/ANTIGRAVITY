//
//  AntigravityWatchApp.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import SwiftUI
import WatchKit

final class WatchAppDelegate: NSObject, WKApplicationDelegate {
    func applicationDidFinishLaunching() {
        NotificationController.shared.requestAuthorization()
        AlertCoordinator.shared.start()
    }
}

@main
struct AntigravityWatchApp: App {
    @WKApplicationDelegateAdaptor(WatchAppDelegate.self) private var appDelegate
    @ObservedObject private var coordinator = AlertCoordinator.shared

    var body: some Scene {
        WindowGroup {
            WatchDashboardView(coordinator: coordinator)
                .onAppear {
                    coordinator.start()
                }
        }
    }
}
