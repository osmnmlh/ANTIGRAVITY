//
//  AstronautBodyMapView.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import SwiftUI

enum BodyMapCallout: String, CaseIterable, Identifiable {
    case mood
    case radiationDose
    case bloodPressure
    case bloodGlucose
    case sleepHours
    case bodyTemp
    case spo2
    case heartRate

    var id: String { rawValue }

    var isLeftSide: Bool {
        switch self {
        case .mood, .radiationDose, .bloodPressure, .bloodGlucose:
            return true
        case .sleepHours, .bodyTemp, .spo2, .heartRate:
            return false
        }
    }

    var rowIndex: Int {
        switch self {
        case .mood, .sleepHours: return 0
        case .radiationDose, .bodyTemp: return 1
        case .bloodPressure, .spo2: return 2
        case .bloodGlucose, .heartRate: return 3
        }
    }

    /// Normalized position inside the 2D astronaut figure frame (mirrors ThreeBodyMap.tsx anatomical points).
    var anchorPoint: CGPoint {
        switch self {
        case .mood: return CGPoint(x: 0.43, y: 0.14)
        case .sleepHours: return CGPoint(x: 0.56, y: 0.08)
        case .bodyTemp: return CGPoint(x: 0.58, y: 0.23)
        case .radiationDose: return CGPoint(x: 0.36, y: 0.33)
        case .spo2: return CGPoint(x: 0.59, y: 0.36)
        case .heartRate: return CGPoint(x: 0.56, y: 0.44)
        case .bloodPressure: return CGPoint(x: 0.16, y: 0.50)
        case .bloodGlucose: return CGPoint(x: 0.43, y: 0.53)
        }
    }

    var shortTitle: String {
        switch self {
        case .mood: return "Ruh hâli"
        case .radiationDose: return "Radyasyon"
        case .bloodPressure: return "Tansiyon"
        case .bloodGlucose: return "Glukoz"
        case .sleepHours: return "Uyku"
        case .bodyTemp: return "Sıcaklık"
        case .spo2: return "SpO₂"
        case .heartRate: return "Nabız"
        }
    }

    var systemTitle: String {
        switch self {
        case .heartRate, .bloodPressure: return "KARDİYOVASKÜLER"
        case .spo2: return "SOLUNUM"
        case .bodyTemp: return "TERMAL"
        case .bloodGlucose: return "METABOLİK"
        case .sleepHours, .mood: return "NÖRODAVRANIŞSAL"
        case .radiationDose: return "RADYASYON"
        }
    }

    var fullTitle: String {
        switch self {
        case .mood: return "Ruh hâli"
        case .radiationDose: return "Radyasyon dozu"
        case .bloodPressure: return "Tansiyon (SYS/DIA)"
        case .bloodGlucose: return "Açlık kan şekeri"
        case .sleepHours: return "Son 24s uyku"
        case .bodyTemp: return "Vücut sıcaklığı"
        case .spo2: return "Kan oksijeni"
        case .heartRate: return "Nabız"
        }
    }
}

struct AstronautBodyMapView: View {
    let values: [HealthIndicatorType: Double]
    let statuses: [HealthIndicatorType: HealthStatus]
    /// The backend's AI recommendation. When it carries a text for the tapped indicator, that text is shown; otherwise the Turkish rule table.
    var aiGuidance: AiGuidance? = nil
    @State private var selected: BodyMapCallout = .heartRate
    @State private var inspectedCallout: BodyMapCallout?

    private let leftCallouts: [BodyMapCallout] = [.mood, .radiationDose, .bloodPressure, .bloodGlucose]
    private let rightCallouts: [BodyMapCallout] = [.sleepHours, .bodyTemp, .spo2, .heartRate]

    var body: some View {
        GlassCardView(cornerRadius: 22, padding: 14) {
            VStack(spacing: 12) {
                GeometryReader { geo in
                    let totalW = geo.size.width
                    let totalH = geo.size.height
                    let calloutW = min(104, max(86, totalW * 0.30))
                    let calloutH: CGFloat = 46
                    let figureW = min(108, max(80, totalW - calloutW * 2 - 28))
                    let figureH = totalH - 12
                    let figureOrigin = CGPoint(
                        x: (totalW - figureW) / 2,
                        y: (totalH - figureH) / 2
                    )

                    ZStack {
                        // Leader arrows + body anchor dots
                        leaderLinesLayer(
                            totalW: totalW,
                            totalH: totalH,
                            calloutW: calloutW,
                            calloutH: calloutH,
                            figureOrigin: figureOrigin,
                            figureSize: CGSize(width: figureW, height: figureH)
                        )

                        // Center 2D Astronaut illustration
                        Astronaut2DFigure()
                            .frame(width: figureW, height: figureH)
                            .position(x: totalW / 2, y: totalH / 2)

                        // Interactive hotspot dots on the astronaut
                        ForEach(BodyMapCallout.allCases) { callout in
                            let pos = bodyPoint(
                                for: callout,
                                origin: figureOrigin,
                                size: CGSize(width: figureW, height: figureH)
                            )
                            let status = status(for: callout)
                            let isSelected = (selected == callout)

                            Button {
                                withAnimation(.easeInOut(duration: 0.2)) {
                                    selected = callout
                                }
                                inspectedCallout = callout
                            } label: {
                                Circle()
                                    .fill(status.themeColor)
                                    .frame(width: isSelected ? 10 : 7, height: isSelected ? 10 : 7)
                                    .overlay {
                                        Circle()
                                            .stroke(Color.white.opacity(isSelected ? 0.9 : 0.45), lineWidth: 1.5)
                                    }
                            }
                            .buttonStyle(.plain)
                            .position(pos)
                            .accessibilityLabel(callout.fullTitle)
                        }

                        // Left callout chips
                        ForEach(leftCallouts) { callout in
                            let cy = rowCenterY(row: callout.rowIndex, totalHeight: totalH, calloutH: calloutH)
                            calloutChip(callout, alignTrailing: false)
                                .frame(width: calloutW, height: calloutH)
                                .position(x: calloutW / 2, y: cy)
                        }

                        // Right callout chips
                        ForEach(rightCallouts) { callout in
                            let cy = rowCenterY(row: callout.rowIndex, totalHeight: totalH, calloutH: calloutH)
                            calloutChip(callout, alignTrailing: true)
                                .frame(width: calloutW, height: calloutH)
                                .position(x: totalW - calloutW / 2, y: cy)
                        }
                    }
                }
                .frame(height: 256)

                selectedFooter
            }
        }
        .sheet(item: $inspectedCallout) { callout in
            IndicatorGuidanceSheet(
                callout: callout,
                valueText: formattedValue(for: callout),
                status: status(for: callout),
                guidance: indicatorGuidance(for: callout),
                sourceNote: guidanceSourceNote(for: callout)
            )
        }
    }

    // MARK: - Subviews

    private func leaderLinesLayer(
        totalW: CGFloat,
        totalH: CGFloat,
        calloutW: CGFloat,
        calloutH: CGFloat,
        figureOrigin: CGPoint,
        figureSize: CGSize
    ) -> some View {
        Canvas { context, _ in
            for callout in BodyMapCallout.allCases {
                let start = bodyPoint(for: callout, origin: figureOrigin, size: figureSize)
                let cy = rowCenterY(row: callout.rowIndex, totalHeight: totalH, calloutH: calloutH)
                let endX = callout.isLeftSide ? calloutW + 3 : (totalW - calloutW - 3)
                let end = CGPoint(x: endX, y: cy)

                let isSelected = (selected == callout)
                let color = status(for: callout).themeColor.opacity(isSelected ? 0.95 : 0.55)
                let lineWidth: CGFloat = isSelected ? 1.8 : 1.1

                let dx = end.x - start.x
                let c1 = CGPoint(x: start.x + dx * 0.42, y: start.y)
                let c2 = CGPoint(x: end.x - dx * 0.35, y: end.y)

                var path = Path()
                path.move(to: start)
                path.addCurve(to: end, control1: c1, control2: c2)

                context.stroke(path, with: .color(color), lineWidth: lineWidth)

                // Arrowhead pointing outward toward the callout chip
                let dir: CGFloat = callout.isLeftSide ? -1 : 1
                var arrow = Path()
                arrow.move(to: CGPoint(x: end.x - dir * 5, y: end.y - 3.5))
                arrow.addLine(to: end)
                arrow.addLine(to: CGPoint(x: end.x - dir * 5, y: end.y + 3.5))

                context.stroke(
                    arrow,
                    with: .color(color),
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round)
                )
            }
        }
        .allowsHitTesting(false)
    }

    private func calloutChip(_ callout: BodyMapCallout, alignTrailing: Bool) -> some View {
        let itemStatus = status(for: callout)
        let isSelected = (selected == callout)

        return Button {
            withAnimation(.easeInOut(duration: 0.2)) {
                selected = callout
            }
            inspectedCallout = callout
        } label: {
            VStack(alignment: alignTrailing ? .trailing : .leading, spacing: 2) {
                HStack(spacing: 4) {
                    if !alignTrailing {
                        Circle()
                            .fill(itemStatus.themeColor)
                            .frame(width: 6, height: 6)
                    }

                    Text(callout.shortTitle)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(ColorTheme.textMuted)
                        .lineLimit(1)

                    if alignTrailing {
                        Circle()
                            .fill(itemStatus.themeColor)
                            .frame(width: 6, height: 6)
                    }
                }

                Text(formattedValue(for: callout))
                    .font(.caption.weight(.bold).monospacedDigit())
                    .foregroundStyle(ColorTheme.textPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: alignTrailing ? .trailing : .leading)
            .padding(.horizontal, 8)
            .background {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color.white.opacity(isSelected ? 0.11 : 0.05))
                    .overlay {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .strokeBorder(
                                isSelected ? itemStatus.themeColor.opacity(0.75) : ColorTheme.spaceBorder,
                                lineWidth: isSelected ? 1.2 : 0.8
                            )
                    }
            }
        }
        .buttonStyle(.plain)
    }

    private var selectedFooter: some View {
        let itemStatus = status(for: selected)
        return Button {
            inspectedCallout = selected
        } label: {
            HStack(spacing: 8) {
                Circle()
                    .fill(itemStatus.themeColor)
                    .frame(width: 7, height: 7)

                Text("\(selected.systemTitle) · \(selected.fullTitle):")
                    .font(.caption2)
                    .foregroundStyle(ColorTheme.textMuted)
                    .lineLimit(1)

                Text(formattedValue(for: selected))
                    .font(.caption2.weight(.bold).monospacedDigit())
                    .foregroundStyle(ColorTheme.textPrimary)

                Spacer(minLength: 4)

                Text(itemStatus.turkishLabel)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(itemStatus.themeColor)

                Image(systemName: "info.circle")
                    .font(.caption2)
                    .foregroundStyle(ColorTheme.accent)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    /// AI text of the backend for this indicator, else the app's own Turkish rule table.
    private func aiIndicator(for callout: BodyMapCallout) -> AiIndicatorGuidance? {
        aiGuidance?.indicators?[primaryIndicator(for: callout).rawValue]
    }

    private func indicatorGuidance(for callout: BodyMapCallout) -> IndicatorGuidance {
        if let ai = aiIndicator(for: callout) {
            return IndicatorGuidance(
                whatItIs: ai.whatItIs,
                whyInSpace: ai.whyInSpace,
                doNow: ai.doNow,
                escalateWhen: ai.escalateWhen
            )
        }
        return HealthThresholds.guidance(for: primaryIndicator(for: callout), status: status(for: callout))
    }

    private func guidanceSourceNote(for callout: BodyMapCallout) -> String {
        guard aiIndicator(for: callout) != nil, let source = aiGuidance?.source else {
            return "Kural tabanlı öneri (AI önerisi şu an alınamadı)"
        }
        return source == .gemini ? "AI önerisi · Gemini" : "AI önerisi · kural tabanlı"
    }

    private func primaryIndicator(for callout: BodyMapCallout) -> HealthIndicatorType {
        switch callout {
        case .mood: return .mood
        case .radiationDose: return .radiationDose
        case .bloodPressure: return .bloodPressureSys
        case .bloodGlucose: return .bloodGlucose
        case .sleepHours: return .sleepHours
        case .bodyTemp: return .bodyTemp
        case .spo2: return .spo2
        case .heartRate: return .heartRate
        }
    }

    // MARK: - Helpers

    private func rowCenterY(row: Int, totalHeight: CGFloat, calloutH: CGFloat) -> CGFloat {
        let topPad = calloutH / 2 + 4
        let bottomPad = totalHeight - calloutH / 2 - 4
        let step = (bottomPad - topPad) / 3.0
        return topPad + CGFloat(row) * step
    }

    private func bodyPoint(for callout: BodyMapCallout, origin: CGPoint, size: CGSize) -> CGPoint {
        CGPoint(
            x: origin.x + callout.anchorPoint.x * size.width,
            y: origin.y + callout.anchorPoint.y * size.height
        )
    }

    private func status(for callout: BodyMapCallout) -> HealthStatus {
        switch callout {
        case .mood: return statuses[.mood] ?? .missing
        case .radiationDose: return statuses[.radiationDose] ?? .missing
        case .bloodPressure:
            let sys = statuses[.bloodPressureSys] ?? .missing
            let dia = statuses[.bloodPressureDia] ?? .missing
            return max(sys, dia)
        case .bloodGlucose: return statuses[.bloodGlucose] ?? .missing
        case .sleepHours: return statuses[.sleepHours] ?? .missing
        case .bodyTemp: return statuses[.bodyTemp] ?? .missing
        case .spo2: return statuses[.spo2] ?? .missing
        case .heartRate: return statuses[.heartRate] ?? .missing
        }
    }

    private func formattedValue(for callout: BodyMapCallout) -> String {
        switch callout {
        case .heartRate:
            guard let v = values[.heartRate] else { return "—" }
            return "\(Int(v.rounded())) bpm"
        case .bloodPressure:
            guard let s = values[.bloodPressureSys], let d = values[.bloodPressureDia] else { return "—" }
            return "\(Int(s.rounded()))/\(Int(d.rounded()))"
        case .spo2:
            guard let v = values[.spo2] else { return "—" }
            return "\(Int(v.rounded()))%"
        case .bodyTemp:
            guard let v = values[.bodyTemp] else { return "—" }
            return String(format: "%.1f°C", v)
        case .bloodGlucose:
            guard let v = values[.bloodGlucose] else { return "—" }
            return "\(Int(v.rounded())) mg/dL"
        case .sleepHours:
            guard let v = values[.sleepHours] else { return "—" }
            return String(format: "%.1f sa", v)
        case .mood:
            guard let v = values[.mood] else { return "—" }
            return "\(Int(v.rounded()))/5"
        case .radiationDose:
            guard let v = values[.radiationDose] else { return "—" }
            return String(format: "%.1f mSv", v)
        }
    }
}

/// Clean 2D vector astronaut suit drawn directly in SwiftUI (no 3D or external textures needed).
private struct Astronaut2DFigure: View {
    var body: some View {
        Canvas { context, size in
            let w = size.width
            let h = size.height

            let suitFill = Color.white.opacity(0.14)
            let suitStroke = Color.white.opacity(0.36)
            let jointFill = Color.white.opacity(0.22)

            // Helmet outer shell
            let helmetRect = CGRect(x: w * 0.27, y: h * 0.03, width: w * 0.46, height: w * 0.46)
            context.fill(Path(ellipseIn: helmetRect), with: .color(suitFill))
            context.stroke(Path(ellipseIn: helmetRect), with: .color(suitStroke), lineWidth: 1.4)

            // Helmet visor
            let visorRect = CGRect(x: w * 0.34, y: h * 0.08, width: w * 0.32, height: w * 0.26)
            let visorPath = Path(roundedRect: visorRect, cornerRadius: w * 0.12)
            context.fill(visorPath, with: .color(Color(red: 0.11, green: 0.18, blue: 0.27)))
            context.stroke(visorPath, with: .color(ColorTheme.accent.opacity(0.45)), lineWidth: 1)

            // Neck ring
            let collarRect = CGRect(x: w * 0.36, y: h * 0.225, width: w * 0.28, height: h * 0.04)
            let collarPath = Path(roundedRect: collarRect, cornerRadius: 4)
            context.fill(collarPath, with: .color(jointFill))
            context.stroke(collarPath, with: .color(suitStroke), lineWidth: 1)

            // Left & right arms
            var leftArm = Path()
            leftArm.move(to: CGPoint(x: w * 0.26, y: h * 0.29))
            leftArm.addLine(to: CGPoint(x: w * 0.10, y: h * 0.54))
            leftArm.addLine(to: CGPoint(x: w * 0.19, y: h * 0.57))
            leftArm.addLine(to: CGPoint(x: w * 0.31, y: h * 0.38))
            leftArm.closeSubpath()
            context.fill(leftArm, with: .color(suitFill))
            context.stroke(leftArm, with: .color(suitStroke), lineWidth: 1.2)

            var rightArm = Path()
            rightArm.move(to: CGPoint(x: w * 0.74, y: h * 0.29))
            rightArm.addLine(to: CGPoint(x: w * 0.90, y: h * 0.54))
            rightArm.addLine(to: CGPoint(x: w * 0.81, y: h * 0.57))
            rightArm.addLine(to: CGPoint(x: w * 0.69, y: h * 0.38))
            rightArm.closeSubpath()
            context.fill(rightArm, with: .color(suitFill))
            context.stroke(rightArm, with: .color(suitStroke), lineWidth: 1.2)

            // Torso suit
            let torsoRect = CGRect(x: w * 0.27, y: h * 0.265, width: w * 0.46, height: h * 0.34)
            let torsoPath = Path(roundedRect: torsoRect, cornerRadius: w * 0.12)
            context.fill(torsoPath, with: .color(suitFill))
            context.stroke(torsoPath, with: .color(suitStroke), lineWidth: 1.4)

            // Chest life-support module
            let chestRect = CGRect(x: w * 0.36, y: h * 0.33, width: w * 0.28, height: h * 0.14)
            let chestPath = Path(roundedRect: chestRect, cornerRadius: 6)
            context.fill(chestPath, with: .color(Color.white.opacity(0.08)))
            context.stroke(chestPath, with: .color(Color.white.opacity(0.28)), lineWidth: 1)

            // Waist belt
            let beltRect = CGRect(x: w * 0.29, y: h * 0.56, width: w * 0.42, height: h * 0.04)
            let beltPath = Path(roundedRect: beltRect, cornerRadius: 4)
            context.fill(beltPath, with: .color(jointFill))
            context.stroke(beltPath, with: .color(suitStroke), lineWidth: 1)

            // Left & right legs + boots
            let leftLegRect = CGRect(x: w * 0.30, y: h * 0.60, width: w * 0.16, height: h * 0.34)
            let rightLegRect = CGRect(x: w * 0.54, y: h * 0.60, width: w * 0.16, height: h * 0.34)
            for legRect in [leftLegRect, rightLegRect] {
                let legPath = Path(roundedRect: legRect, cornerRadius: w * 0.06)
                context.fill(legPath, with: .color(suitFill))
                context.stroke(legPath, with: .color(suitStroke), lineWidth: 1.2)
            }
        }
    }
}

/// Indicator guidance detail sheet showing What / Why / Do now / Escalate from `HealthThresholds`.
private struct IndicatorGuidanceSheet: View {
    let callout: BodyMapCallout
    let valueText: String
    let status: HealthStatus
    let guidance: IndicatorGuidance
    let sourceNote: String

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    GlassCardView(cornerRadius: 18, padding: 16) {
                        HStack(spacing: 12) {
                            Image(systemName: status.systemIconName)
                                .font(.title2)
                                .foregroundStyle(status.themeColor)

                            VStack(alignment: .leading, spacing: 3) {
                                Text(callout.fullTitle)
                                    .font(.headline)
                                    .foregroundStyle(ColorTheme.textPrimary)
                                Text("\(valueText) • \(status.turkishLabel)")
                                    .font(.subheadline.weight(.semibold).monospacedDigit())
                                    .foregroundStyle(status.themeColor)
                            }

                            Spacer()
                        }
                    }

                    guidanceSection(title: "Nedir?", icon: "info.circle.fill", text: guidance.whatItIs)
                    guidanceSection(title: "Uzayda Neden Önemli?", icon: "sparkles", text: guidance.whyInSpace)

                    GlassCardView(cornerRadius: 18, padding: 16) {
                        VStack(alignment: .leading, spacing: 8) {
                            Label("Şimdi Ne Yapmalı?", systemImage: "checkmark.shield.fill")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(ColorTheme.accent)

                            ForEach(guidance.doNow, id: \.self) { step in
                                HStack(alignment: .top, spacing: 8) {
                                    Text("•")
                                        .foregroundStyle(ColorTheme.accent)
                                    Text(step)
                                        .font(.subheadline)
                                        .foregroundStyle(ColorTheme.textPrimary)
                                }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    guidanceSection(
                        title: "Ne Zaman Uçuş Cerrahına Başvurmalı?",
                        icon: "phone.badge.waveform.fill",
                        text: guidance.escalateWhen,
                        tint: status == .red ? ColorTheme.statusRed : ColorTheme.statusAmber
                    )

                    Text(sourceNote)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(ColorTheme.accent)
                        .frame(maxWidth: .infinity, alignment: .center)
                }
                .padding(16)
            }
            .background(ColorTheme.spaceBackdropGradient.ignoresSafeArea())
            .navigationTitle(callout.systemTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Kapat") { dismiss() }
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private func guidanceSection(
        title: String,
        icon: String,
        text: String,
        tint: Color = ColorTheme.accent
    ) -> some View {
        GlassCardView(cornerRadius: 18, padding: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Label(title, systemImage: icon)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(tint)
                Text(text)
                    .font(.subheadline)
                    .foregroundStyle(ColorTheme.textPrimary.opacity(0.92))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

#Preview {
    ZStack {
        ColorTheme.spaceBackdropGradient.ignoresSafeArea()
        AstronautBodyMapView(
            values: [
                .heartRate: 72,
                .bloodPressureSys: 116,
                .bloodPressureDia: 74,
                .spo2: 98,
                .bodyTemp: 36.6,
                .bloodGlucose: 92,
                .sleepHours: 7.8,
                .mood: 5,
                .radiationDose: 19.4
            ],
            statuses: [
                .heartRate: .green,
                .bloodPressureSys: .green,
                .bloodPressureDia: .green,
                .spo2: .green,
                .bodyTemp: .green,
                .bloodGlucose: .green,
                .sleepHours: .green,
                .mood: .green,
                .radiationDose: .green
            ]
        )
        .padding()
    }
    .preferredColorScheme(.dark)
}
