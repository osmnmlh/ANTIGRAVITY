//
//  MissionListView.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import SwiftUI

private enum MissionFilter: String, CaseIterable, Identifiable {
    case all = "Tümü"
    case pending = "Açık"
    case completed = "Tamamlanan"
    case houston = "Houston"

    var id: String { rawValue }
}

/// Persistent astronaut TODO mission list supporting personal tasks and Houston-issued directives.
struct MissionListView: View {
    @ObservedObject var viewModel: MissionViewModel

    @State private var selectedFilter: MissionFilter = .all
    @State private var isShowingComposer = false
    @State private var selectedTask: MissionTask?
    @State private var editingTask: MissionTask?

    private static let turkishDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "tr_TR")
        formatter.dateFormat = "d MMM yyyy • HH:mm"
        return formatter
    }()

    private var filteredTasks: [MissionTask] {
        switch selectedFilter {
        case .all:
            return viewModel.tasks
        case .pending:
            return viewModel.tasks.filter { !$0.isCompleted }
        case .completed:
            return viewModel.tasks.filter(\.isCompleted)
        case .houston:
            return viewModel.tasks.filter { $0.source == .houston }
        }
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                NeonButton(
                    title: "Yeni Görev Ekle",
                    systemImage: "plus.circle.fill",
                    tintColor: ColorTheme.accent
                ) {
                    isShowingComposer = true
                }

                progressSummaryCard

                filterBar

                if filteredTasks.isEmpty {
                    emptyStateCard
                } else {
                    VStack(spacing: 12) {
                        ForEach(filteredTasks) { task in
                            missionCard(task)
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 24)
        }
        .navigationTitle("Görevler")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if viewModel.completedCount > 0 {
                    Menu {
                        Button(role: .destructive) {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                viewModel.clearCompletedTasks()
                            }
                        } label: {
                            Label("Tamamlananları Temizle", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .font(.headline)
                            .foregroundStyle(ColorTheme.textMuted)
                    }
                    .accessibilityLabel("Görev Seçenekleri")
                }

                Button {
                    isShowingComposer = true
                } label: {
                    Image(systemName: "plus")
                        .font(.headline)
                        .foregroundStyle(ColorTheme.accent)
                }
                .accessibilityLabel("Yeni Görev Ekle")
            }
        }
        .sheet(isPresented: $isShowingComposer) {
            MissionEditorSheet(mode: .create) { title, detail, dueDate, priority in
                withAnimation(.easeInOut(duration: 0.2)) {
                    viewModel.addTask(title: title, detail: detail, dueDate: dueDate, priority: priority)
                }
            }
        }
        .sheet(item: $selectedTask) { task in
            let current = viewModel.tasks.first(where: { $0.id == task.id }) ?? task
            MissionDetailSheet(
                task: current,
                dateText: Self.turkishDateFormatter.string(from: current.dueDate ?? current.createdAt),
                onToggle: {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        viewModel.toggleTask(current)
                    }
                },
                onEdit: {
                    selectedTask = nil
                    editingTask = current
                },
                onDelete: {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        viewModel.deleteTask(current)
                    }
                    selectedTask = nil
                }
            )
        }
        .sheet(item: $editingTask) { task in
            MissionEditorSheet(mode: .edit(task)) { title, detail, dueDate, priority in
                withAnimation(.easeInOut(duration: 0.2)) {
                    viewModel.updateTask(task, title: title, detail: detail, dueDate: dueDate, priority: priority)
                }
            }
        }
    }

    // MARK: - Subviews

    private var progressSummaryCard: some View {
        let percent = viewModel.completionPercent
        let barColor = percent == 100 && viewModel.totalCount > 0 ? ColorTheme.statusGreen : ColorTheme.accent

        return GlassCardView(cornerRadius: 20, padding: 16) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    Text("%\(percent) Tamamlandı")
                        .font(.title3.weight(.bold).monospacedDigit())
                        .foregroundStyle(ColorTheme.textPrimary)

                    Spacer()

                    Text("\(viewModel.completedCount)/\(viewModel.totalCount)")
                        .font(.subheadline.weight(.semibold).monospacedDigit())
                        .foregroundStyle(ColorTheme.textMuted)
                }

                ProgressView(value: viewModel.completionRatio)
                    .tint(barColor)
                    .animation(.easeInOut(duration: 0.25), value: viewModel.completionRatio)

                if viewModel.houstonOpenCount > 0 {
                    Label(
                        "\(viewModel.houstonOpenCount) Houston talimatı bekliyor",
                        systemImage: "antenna.radiowaves.left.and.right"
                    )
                    .font(.caption.weight(.medium))
                    .foregroundStyle(ColorTheme.accent)
                }
            }
        }
    }

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(MissionFilter.allCases) { filter in
                    let isSelected = selectedFilter == filter
                    Button {
                        withAnimation(.easeInOut(duration: 0.18)) {
                            selectedFilter = filter
                        }
                    } label: {
                        Text(filterLabel(filter))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(isSelected ? ColorTheme.textPrimary : ColorTheme.textMuted)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background {
                                Capsule(style: .continuous)
                                    .fill(isSelected ? ColorTheme.accent.opacity(0.22) : ColorTheme.spaceSurface.opacity(0.8))
                                    .overlay {
                                        Capsule(style: .continuous)
                                            .strokeBorder(
                                                isSelected ? ColorTheme.accent.opacity(0.7) : ColorTheme.spaceBorder,
                                                lineWidth: 1
                                            )
                                    }
                            }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func filterLabel(_ filter: MissionFilter) -> String {
        switch filter {
        case .all:
            return "Tümü (\(viewModel.totalCount))"
        case .pending:
            return "Açık (\(viewModel.openCount))"
        case .completed:
            return "Tamamlanan (\(viewModel.completedCount))"
        case .houston:
            let count = viewModel.tasks.filter { $0.source == .houston }.count
            return "Houston (\(count))"
        }
    }

    private var emptyStateCard: some View {
        GlassCardView(cornerRadius: 20, padding: 20) {
            VStack(spacing: 10) {
                Image(systemName: selectedFilter == .completed ? "checkmark.seal" : "checklist")
                    .font(.largeTitle)
                    .foregroundStyle(ColorTheme.textMuted)
                Text(emptyTitle)
                    .font(.headline)
                    .foregroundStyle(ColorTheme.textPrimary)
                Text(emptySubtitle)
                    .font(.caption)
                    .foregroundStyle(ColorTheme.textMuted)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
        }
    }

    private var emptyTitle: String {
        switch selectedFilter {
        case .all: return "Henüz görev yok"
        case .pending: return "Bekleyen görev kalmadı"
        case .completed: return "Tamamlanan görev yok"
        case .houston: return "Aktif Houston görevi yok"
        }
    }

    private var emptySubtitle: String {
        switch selectedFilter {
        case .all:
            return "Yeni bir görev ekleyebilir veya Houston'dan gelen protokol talimatlarını buradan takip edebilirsin."
        case .pending:
            return "Tüm açık görevler tamamlandı ya da listeden temizlendi."
        case .completed:
            return "Bir görevi tamamladığında burada listelenir."
        case .houston:
            return "Houston üzerinden yeni bir sağlık protokolü veya uyarı adımı geldiğinde burada otomatik görünür."
        }
    }

    private func missionCard(_ task: MissionTask) -> some View {
        let sourceColor: Color = {
            if task.isCompleted { return ColorTheme.statusGreen }
            if task.priority == .high { return ColorTheme.statusRed }
            return ColorTheme.accent
        }()
        let dateText = Self.turkishDateFormatter.string(from: task.dueDate ?? task.createdAt)

        return GlassCardView(cornerRadius: 20, padding: 16) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .center, spacing: 8) {
                    Label(
                        task.source == .houston ? "Houston" : dateText,
                        systemImage: task.source == .houston ? task.source.systemImage : "calendar"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(sourceColor)

                    if task.priority == .high && !task.isCompleted {
                        Text("Öncelikli")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(ColorTheme.statusRed)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 2)
                            .background(ColorTheme.statusRed.opacity(0.14), in: Capsule())
                    }

                    if task.source == .houston, task.dueDate != nil {
                        Text("• \(dateText)")
                            .font(.caption2)
                            .foregroundStyle(ColorTheme.textMuted)
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(ColorTheme.textMuted)
                }

                HStack(alignment: .top, spacing: 12) {
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            viewModel.toggleTask(task)
                        }
                    } label: {
                        Image(systemName: task.isCompleted ? "checkmark.circle.fill" : "circle")
                            .font(.title3)
                            .foregroundStyle(task.isCompleted ? ColorTheme.statusGreen : sourceColor)
                            .padding(.top, 1)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(task.isCompleted ? "Görevi Açık Yap" : "Görevi Tamamla")

                    Button {
                        selectedTask = task
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(task.title)
                                .font(.headline)
                                .strikethrough(task.isCompleted, pattern: .solid, color: ColorTheme.textMuted)
                                .foregroundStyle(task.isCompleted ? ColorTheme.textMuted : ColorTheme.textPrimary)
                                .multilineTextAlignment(.leading)

                            if !task.detail.isEmpty {
                                Text(task.detail)
                                    .font(.subheadline)
                                    .foregroundStyle(ColorTheme.textMuted)
                                    .lineLimit(2)
                                    .multilineTextAlignment(.leading)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)

                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            viewModel.deleteTask(task)
                        }
                    } label: {
                        Image(systemName: "trash")
                            .font(.subheadline)
                            .foregroundStyle(ColorTheme.textMuted)
                            .padding(6)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Görevi Sil")
                }
            }
        }
        .contextMenu {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    viewModel.toggleTask(task)
                }
            } label: {
                Label(
                    task.isCompleted ? "Yeniden Aç" : "Tamamlandı İşaretle",
                    systemImage: task.isCompleted ? "arrow.uturn.backward.circle" : "checkmark.circle"
                )
            }

            Button {
                editingTask = task
            } label: {
                Label("Düzenle", systemImage: "pencil")
            }

            Button(role: .destructive) {
                withAnimation(.easeInOut(duration: 0.2)) {
                    viewModel.deleteTask(task)
                }
            } label: {
                Label("Sil", systemImage: "trash")
            }
        }
    }
}

private struct MissionEditorSheet: View {
    enum Mode {
        case create
        case edit(MissionTask)

        var navigationTitle: String {
            switch self {
            case .create: return "Yeni Görev"
            case .edit: return "Görevi Düzenle"
            }
        }
    }

    let mode: Mode
    let onSave: (String, String, Date?, MissionTaskPriority) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var detail: String
    @State private var hasDueDate: Bool
    @State private var dueDate: Date
    @State private var priority: MissionTaskPriority

    init(mode: Mode, onSave: @escaping (String, String, Date?, MissionTaskPriority) -> Void) {
        self.mode = mode
        self.onSave = onSave
        switch mode {
        case .create:
            _title = State(initialValue: "")
            _detail = State(initialValue: "")
            _hasDueDate = State(initialValue: false)
            _dueDate = State(initialValue: Date())
            _priority = State(initialValue: .normal)
        case .edit(let task):
            _title = State(initialValue: task.title)
            _detail = State(initialValue: task.detail)
            _hasDueDate = State(initialValue: task.dueDate != nil)
            _dueDate = State(initialValue: task.dueDate ?? task.createdAt)
            _priority = State(initialValue: task.priority)
        }
    }

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Görev Başlığı") {
                    TextField("Örn: Kabin CO2 filtresini kontrol et", text: $title)
                }

                Section("Öncelik & Zaman") {
                    Picker("Öncelik", selection: $priority) {
                        ForEach(MissionTaskPriority.allCases, id: \.self) { level in
                            Text(level.label).tag(level)
                        }
                    }

                    Toggle("Hedef Tarih / Saat", isOn: $hasDueDate)

                    if hasDueDate {
                        DatePicker(
                            "Hedef Zaman",
                            selection: $dueDate,
                            displayedComponents: [.date, .hourAndMinute]
                        )
                        .environment(\.locale, Locale(identifier: "tr_TR"))
                    }
                }

                Section("Görev Notu / Protokol") {
                    TextEditor(text: $detail)
                        .frame(minHeight: 140)
                }
            }
            .scrollContentBackground(.hidden)
            .background(ColorTheme.spaceBackdropGradient.ignoresSafeArea())
            .navigationTitle(mode.navigationTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("İptal") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Kaydet") {
                        onSave(title, detail, hasDueDate ? dueDate : nil, priority)
                        dismiss()
                    }
                    .disabled(!canSave)
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}

private struct MissionDetailSheet: View {
    let task: MissionTask
    let dateText: String
    let onToggle: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 8) {
                        Label(task.source.badgeLabel, systemImage: task.source.systemImage)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(task.source == .houston ? ColorTheme.accent : ColorTheme.textMuted)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(Color.white.opacity(0.08), in: Capsule())

                        Text(task.isCompleted ? "Tamamlandı" : "Bekliyor")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(task.isCompleted ? ColorTheme.statusGreen : ColorTheme.accent)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(
                                (task.isCompleted ? ColorTheme.statusGreen : ColorTheme.accent).opacity(0.14),
                                in: Capsule()
                            )

                        if task.priority == .high {
                            Text("Öncelikli")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(ColorTheme.statusRed)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(ColorTheme.statusRed.opacity(0.14), in: Capsule())
                        }
                    }

                    Label(dateText, systemImage: "calendar")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(ColorTheme.textMuted)

                    Text(task.title)
                        .font(.title2.weight(.bold))
                        .strikethrough(task.isCompleted, pattern: .solid, color: ColorTheme.textMuted)
                        .foregroundStyle(ColorTheme.textPrimary)

                    Divider()
                        .overlay(ColorTheme.spaceBorder)

                    Text(task.detail.isEmpty ? "Ek protokol açıklaması yok." : task.detail)
                        .font(.body)
                        .foregroundStyle(ColorTheme.textPrimary.opacity(0.92))
                        .frame(maxWidth: .infinity, alignment: .leading)

                    NeonButton(
                        title: task.isCompleted ? "Görevi Yeniden Aç" : "Görevi Tamamla",
                        systemImage: task.isCompleted ? "arrow.uturn.backward.circle" : "checkmark.circle.fill",
                        tintColor: task.isCompleted ? ColorTheme.accent : ColorTheme.statusGreen
                    ) {
                        onToggle()
                    }
                    .padding(.top, 8)
                }
                .padding(20)
            }
            .background(ColorTheme.spaceBackdropGradient.ignoresSafeArea())
            .navigationTitle("Görev Detayı")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Kapat") { dismiss() }
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button(action: onEdit) {
                        Image(systemName: "pencil")
                    }
                    Button(role: .destructive, action: onDelete) {
                        Image(systemName: "trash")
                    }
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}

#Preview {
    NavigationStack {
        ZStack {
            ColorTheme.spaceBackdropGradient.ignoresSafeArea()
            MissionListView(viewModel: MissionViewModel(storageURL: nil))
        }
    }
    .preferredColorScheme(.dark)
}
