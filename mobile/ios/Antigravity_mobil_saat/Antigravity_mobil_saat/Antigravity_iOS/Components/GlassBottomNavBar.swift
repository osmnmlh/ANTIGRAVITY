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
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(AppTab.allCases) { tab in
                    let isSelected = (selectedTab == tab)

                    Button {
                        withAnimation(.spring(response: 0.28, dampingFraction: 0.82)) {
                            selectedTab = tab
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: tab.systemImage)
                                .font(.system(size: 15, weight: .semibold))
                            Text(tab.title)
                                .font(.subheadline.weight(isSelected ? .semibold : .medium))
                                .lineLimit(1)
                        }
                        .foregroundStyle(isSelected ? ColorTheme.textPrimary : ColorTheme.textMuted)
                        .padding(.horizontal, 15)
                        .padding(.vertical, 10)
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
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
        }
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
