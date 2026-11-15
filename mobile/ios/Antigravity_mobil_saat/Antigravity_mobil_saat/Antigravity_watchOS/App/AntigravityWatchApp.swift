//
//  AntigravityWatchApp.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import SwiftUI
import WatchConnectivity
import WatchKit

final class WatchAppDelegate: NSObject, WKApplicationDelegate {
    private var pendingConnectivityTasks: [WKWatchConnectivityRefreshBackgroundTask] = []
    private var completionTimer: Timer?

    func applicationDidFinishLaunching() {
        Task { @MainActor in
            NotificationController.shared.requestAuthorization()
            AlertCoordinator.shared.start()
        }
    }

    /// Handles watchOS background wakeups (such as iPhone `transferUserInfo` or `updateApplicationContext`
    /// while the Watch screen is asleep or the Watch app is closed) so alerts/tasks trigger notifications before suspension.
    func handle(_ backgroundTasks: Set<WKRefreshBackgroundTask>) {
        Task { @MainActor in
            NotificationController.shared.requestAuthorization()
            AlertCoordinator.shared.start()
        }

        for task in backgroundTasks {
            if let wcTask = task as? WKWatchConnectivityRefreshBackgroundTask {
                pendingConnectivityTasks.append(wcTask)
                scheduleConnectivityTaskCompletionCheck(attemptsRemaining: 16)
            } else {
                task.setTaskCompletedWithSnapshot(false)
            }
        }
    }

    private func scheduleConnectivityTaskCompletionCheck(attemptsRemaining: Int) {
        completionTimer?.invalidate()
        completionTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: false) { [weak self] _ in
            guard let self else { return }
            let stillPending = WCSession.isSupported() && WCSession.default.hasContentPending
            if stillPending && attemptsRemaining > 0 {
                self.scheduleConnectivityTaskCompletionCheck(attemptsRemaining: attemptsRemaining - 1)
                return
            }
            let tasks = self.pendingConnectivityTasks
            self.pendingConnectivityTasks.removeAll()
            for task in tasks {
                task.setTaskCompletedWithSnapshot(false)
            }
        }
    }
}

@main
struct AntigravityWatchApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @WKApplicationDelegateAdaptor(WatchAppDelegate.self) private var appDelegate
    @ObservedObject private var coordinator = AlertCoordinator.shared

    var body: some Scene {
        WindowGroup {
            WatchDashboardView(coordinator: coordinator)
                .onAppear {
                    coordinator.start()
                    coordinator.handleSceneActiveChange(isActive: scenePhase == .active)
                }
                .onChange(of: scenePhase) { _, newPhase in
                    coordinator.handleSceneActiveChange(isActive: newPhase == .active)
                }
        }
    }
}
