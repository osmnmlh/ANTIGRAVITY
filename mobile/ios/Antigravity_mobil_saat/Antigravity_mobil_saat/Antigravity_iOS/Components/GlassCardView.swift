//
//  GlassCardView.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import SwiftUI

struct GlassCardView<Content: View>: View {
    var cornerRadius: CGFloat = 20
    var padding: CGFloat = 16
    @ViewBuilder let content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .background {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay {
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .fill(Color.white.opacity(0.04))
                    }
                    .overlay {
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .strokeBorder(ColorTheme.spaceBorder, lineWidth: 1)
                    }
            }
    }
}

#Preview {
    ZStack {
        ColorTheme.spaceBackdropGradient.ignoresSafeArea()
        GlassCardView {
            VStack(alignment: .leading, spacing: 6) {
                Text("Örnek Cam Kart")
                    .font(.headline)
                    .foregroundStyle(ColorTheme.textPrimary)
                Text("Sistemler Normal")
                    .font(.subheadline)
                    .foregroundStyle(ColorTheme.statusGreen)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding()
    }
    .preferredColorScheme(.dark)
}
