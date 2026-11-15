//
//  GlassBottomNavBar.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import SwiftUI

enum AppTab: String, CaseIterable, Identifiable {
    case dashboard
    case vitals
    case missions
    case journal

    var id: String { rawValue }

    var title: String {
        switch self {
        case .dashboard: return "Komuta"
        case .vitals: return "Vital"
        case .missions: return "Görevler"
        case .journal: return "Günlük"
        }
    }

    var systemImage: String {
        switch self {
        case .dashboard: return "gauge.with.dots.needle.67percent"
        case .vitals: return "waveform.path.ecg"
        case .missions: return "checklist"
        case .journal: return "book.closed.fill"
        }
    }
}

struct GlassBottomNavBar: View {
    @Binding var selectedTab: AppTab
    @Namespace private var navAnimation

    var body: some View {
        HStack(spacing: 4) {
            ForEach(AppTab.allCases) { tab in
                let isSelected = (selectedTab == tab)

                Button {
                    withAnimation(.spring(response: 0.28, dampingFraction: 0.82)) {
                        selectedTab = tab
                    }
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: tab.systemImage)
                            .font(.system(size: 18, weight: .semibold))
                        Text(tab.title)
                            .font(.caption2.weight(isSelected ? .semibold : .medium))
                            .lineLimit(1)
                            .minimumScaleFactor(0.85)
                    }
                    .foregroundStyle(isSelected ? ColorTheme.textPrimary : ColorTheme.textMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .padding(.horizontal, 4)
                    .contentShape(Capsule(style: .continuous))
                    .background {
                        if isSelected {
                            Capsule(style: .continuous)
                                .fill(Color.white.opacity(0.14))
                                .matchedGeometryEffect(id: "ACTIVE_NAV_PILL", in: navAnimation)
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tab.title)
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 5)
        .background {
            Capsule(style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay {
                    Capsule(style: .continuous)
                        .fill(Color.white.opacity(0.04))
                }
                .overlay {
                    Capsule(style: .continuous)
                        .strokeBorder(ColorTheme.spaceBorder, lineWidth: 1)
                }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 6)
    }
}

private struct GlassBottomNavBarPreview: View {
    @State private var selected: AppTab = .dashboard

    var body: some View {
        ZStack(alignment: .bottom) {
            ColorTheme.spaceBackdropGradient.ignoresSafeArea()
            GlassBottomNavBar(selectedTab: $selected)
        }
        .preferredColorScheme(.dark)
    }
}

#Preview {
    GlassBottomNavBarPreview()
}
