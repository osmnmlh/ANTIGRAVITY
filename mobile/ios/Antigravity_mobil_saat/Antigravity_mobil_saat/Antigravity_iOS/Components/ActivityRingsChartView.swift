//
//  ActivityRingsChartView.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import SwiftUI

/// Single ring data descriptor rendered inside an Apple Watch-style concentric ring chart.
struct ActivityRingItem: Identifiable {
    let id: String
    let title: String
    let valueText: String
    let statusText: String?
    let icon: String
    let progress: Double
    let startColor: Color
    let endColor: Color
    let accentColor: Color

    init(
        id: String,
        title: String,
        valueText: String,
        statusText: String? = nil,
        icon: String,
        progress: Double,
        startColor: Color,
        endColor: Color? = nil
    ) {
        self.id = id
        self.title = title
        self.valueText = valueText
        self.statusText = statusText
        self.icon = icon
        self.progress = progress
        self.startColor = startColor
        self.endColor = endColor ?? startColor
        self.accentColor = endColor ?? startColor
    }
}

/// Apple Watch-inspired concentric activity rings chart paired with a compact metric legend.
struct ActivityRingsChartView: View {
    let rings: [ActivityRingItem]
    var ringSize: CGFloat = 136
    var ringThickness: CGFloat = 14
    var ringSpacing: CGFloat = 3.5

    @State private var selectedRingId: String?

    var body: some View {
        HStack(alignment: .center, spacing: 16) {
            ringsCanvas
                .frame(width: ringSize, height: ringSize)

            VStack(alignment: .leading, spacing: 10) {
                ForEach(rings) { ring in
                    legendRow(for: ring)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // MARK: - Concentric Rings

    private var ringsCanvas: some View {
        ZStack {
            ForEach(Array(rings.enumerated()), id: \.element.id) { index, ring in
                let radius = strokeRadius(for: index)
                if radius > ringThickness * 0.5 {
                    ringLayer(ring: ring, strokeRadius: radius)
                }
            }
        }
        .animation(.spring(response: 0.55, dampingFraction: 0.85), value: rings.map(\.progress))
    }

    @ViewBuilder
    private func ringLayer(ring: ActivityRingItem, strokeRadius: CGFloat) -> some View {
        let diameter = strokeRadius * 2
        let isDimmed = selectedRingId != nil && selectedRingId != ring.id
        let clampedProgress = max(ring.progress, 0.015)
        let firstLap = min(clampedProgress, 1.0)
        let secondLap = max(0, min(ring.progress - 1.0, 1.0))

        let angularGradient = AngularGradient(
            gradient: Gradient(colors: [ring.startColor, ring.endColor]),
            center: .center,
            startAngle: .degrees(0),
            endAngle: .degrees(360)
        )

        ZStack {
            // Subtle dark track mimicking Apple Watch's translucent ring background.
            Circle()
                .stroke(ring.accentColor.opacity(0.18), lineWidth: ringThickness)
                .frame(width: diameter, height: diameter)

            // Primary sweep from 12 o'clock clockwise.
            Circle()
                .trim(from: 0, to: firstLap)
                .stroke(
                    angularGradient,
                    style: StrokeStyle(lineWidth: ringThickness, lineCap: .round)
                )
                .frame(width: diameter, height: diameter)
                .rotationEffect(.degrees(-90))

            // Second lap with a subtle leading-tip shadow when progress exceeds 100%.
            if secondLap > 0 {
                Circle()
                    .trim(from: 0, to: secondLap)
                    .stroke(
                        angularGradient,
                        style: StrokeStyle(lineWidth: ringThickness, lineCap: .round)
                    )
                    .frame(width: diameter, height: diameter)
                    .rotationEffect(.degrees(-90))
                    .shadow(color: Color.black.opacity(0.45), radius: 2.5, x: 0, y: 1)
            }

            // Start-cap glyph anchored at 12 o'clock inside the ring stroke.
            Image(systemName: ring.icon)
                .font(.system(size: max(7, ringThickness * 0.54), weight: .bold))
                .foregroundStyle(Color.black.opacity(0.78))
                .position(x: ringSize / 2, y: (ringSize / 2) - strokeRadius)
        }
        .frame(width: ringSize, height: ringSize)
        .opacity(isDimmed ? 0.35 : 1.0)
        .contentShape(Circle().inset(by: -4))
        .onTapGesture {
            toggleSelection(for: ring.id)
        }
    }

    // MARK: - Legend

    private func legendRow(for ring: ActivityRingItem) -> some View {
        let isSelected = selectedRingId == ring.id
        let isDimmed = selectedRingId != nil && !isSelected
        let percent = Int((max(0, ring.progress) * 100).rounded())

        return Button {
            toggleSelection(for: ring.id)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 5) {
                    Image(systemName: ring.icon)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(ring.accentColor)

                    Text(ring.title.uppercased(with: Locale(identifier: "tr_TR")))
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(ColorTheme.textMuted)
                        .lineLimit(1)

                    if let statusText = ring.statusText {
                        Text("• \(statusText)")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(ring.accentColor)
                            .lineLimit(1)
                    } else if isSelected {
                        Text("• %\(percent)")
                            .font(.system(size: 10, weight: .bold).monospacedDigit())
                            .foregroundStyle(ring.accentColor)
                    }
                }

                Text(ring.valueText)
                    .font(.system(size: 15, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundStyle(ring.accentColor)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 3)
            .padding(.horizontal, 6)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(isSelected ? ring.accentColor.opacity(0.12) : Color.clear)
            )
            .opacity(isDimmed ? 0.45 : 1.0)
        }
        .buttonStyle(.plain)
    }

    private func strokeRadius(for index: Int) -> CGFloat {
        let outerRadius = (ringSize - ringThickness) / 2
        return outerRadius - CGFloat(index) * (ringThickness + ringSpacing)
    }

    private func toggleSelection(for id: String) {
        withAnimation(.easeInOut(duration: 0.2)) {
            selectedRingId = (selectedRingId == id) ? nil : id
        }
    }
}

#Preview {
    ZStack {
        ColorTheme.spaceBackdropGradient.ignoresSafeArea()
        GlassCardView {
            ActivityRingsChartView(
                rings: [
                    ActivityRingItem(
                        id: "move",
                        title: "Hareket",
                        valueText: "485/600 kcal",
                        icon: "flame.fill",
                        progress: 485.0 / 600.0,
                        startColor: Color(red: 0.98, green: 0.07, blue: 0.31),
                        endColor: Color(red: 1.0, green: 0.28, blue: 0.48)
                    ),
                    ActivityRingItem(
                        id: "exercise",
                        title: "Egzersiz",
                        valueText: "45/60 dk",
                        icon: "figure.run",
                        progress: 45.0 / 60.0,
                        startColor: Color(red: 0.57, green: 0.91, blue: 0.16),
                        endColor: Color(red: 0.19, green: 0.82, blue: 0.35)
                    ),
                    ActivityRingItem(
                        id: "stand",
                        title: "Duruş",
                        valueText: "10/12 sa",
                        icon: "arrow.up",
                        progress: 10.0 / 12.0,
                        startColor: Color(red: 0.0, green: 0.96, blue: 0.92),
                        endColor: ColorTheme.accent
                    )
                ]
            )
        }
        .padding()
    }
    .preferredColorScheme(.dark)
}
