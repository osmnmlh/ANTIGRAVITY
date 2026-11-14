//
//  NeonButton.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import SwiftUI

struct NeonButton: View {
    let title: String
    var systemImage: String? = nil
    var tintColor: Color = ColorTheme.accent
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.subheadline.weight(.semibold))
                }
                Text(title)
                    .font(.subheadline.weight(.semibold))
            }
            .foregroundStyle(ColorTheme.textPrimary)
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
            .background {
                Capsule(style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay {
                        Capsule(style: .continuous)
                            .fill(tintColor.opacity(0.16))
                    }
                    .overlay {
                        Capsule(style: .continuous)
                            .strokeBorder(ColorTheme.spaceBorder, lineWidth: 1)
                    }
            }
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    ZStack {
        ColorTheme.spaceBackdropGradient.ignoresSafeArea()
        NeonButton(
            title: "Yenile",
            systemImage: "arrow.clockwise"
        ) {}
        .padding()
    }
    .preferredColorScheme(.dark)
}
