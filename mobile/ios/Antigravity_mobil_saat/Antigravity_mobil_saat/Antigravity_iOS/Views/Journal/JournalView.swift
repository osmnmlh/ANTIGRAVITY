//
//  JournalView.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import SwiftUI

/// Free-text astronaut journal screen for creating, reading, editing, and deleting personal mission notes.
struct JournalView: View {
    @ObservedObject var viewModel: JournalViewModel

    @State private var isShowingComposer = false
    @State private var selectedEntry: JournalEntry?
    @State private var editingEntry: JournalEntry?

    private static let turkishDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "tr_TR")
        formatter.dateFormat = "d MMM yyyy • HH:mm"
        return formatter
    }()

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                NeonButton(
                    title: "Yeni Günlük Notu Ekle",
                    systemImage: "square.and.pencil",
                    tintColor: ColorTheme.accent
                ) {
                    isShowingComposer = true
                }

                if viewModel.entries.isEmpty {
                    emptyStateCard
                } else {
                    ForEach(viewModel.entries) { entry in
                        journalCard(entry)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 24)
        }
        .navigationTitle("Günlük")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    isShowingComposer = true
                } label: {
                    Image(systemName: "plus")
                        .font(.headline)
                        .foregroundStyle(ColorTheme.accent)
                }
                .accessibilityLabel("Yeni Günlük Notu")
            }
        }
        .sheet(isPresented: $isShowingComposer) {
            JournalEditorSheet(mode: .create) { title, body, date in
                viewModel.addEntry(title: title, body: body, date: date)
            }
        }
        .sheet(item: $selectedEntry) { entry in
            JournalDetailSheet(
                entry: entry,
                dateText: Self.turkishDateFormatter.string(from: entry.createdAt),
                onEdit: {
                    selectedEntry = nil
                    editingEntry = entry
                },
                onDelete: {
                    viewModel.deleteEntry(entry)
                    selectedEntry = nil
                }
            )
        }
        .sheet(item: $editingEntry) { entry in
            JournalEditorSheet(mode: .edit(entry)) { title, body, date in
                viewModel.updateEntry(entry, title: title, body: body, date: date)
            }
        }
    }

    private var emptyStateCard: some View {
        GlassCardView(cornerRadius: 20, padding: 20) {
            VStack(spacing: 10) {
                Image(systemName: "book.closed")
                    .font(.largeTitle)
                    .foregroundStyle(ColorTheme.textMuted)
                Text("Henüz günlük notu yok")
                    .font(.headline)
                    .foregroundStyle(ColorTheme.textPrimary)
                Text("Görev gözlemlerini ve kişisel notlarını kaydetmek için yeni bir günlük girişi ekleyebilirsin.")
                    .font(.caption)
                    .foregroundStyle(ColorTheme.textMuted)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
        }
    }

    private func journalCard(_ entry: JournalEntry) -> some View {
        Button {
            selectedEntry = entry
        } label: {
            GlassCardView(cornerRadius: 20, padding: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .center, spacing: 8) {
                        Label(
                            Self.turkishDateFormatter.string(from: entry.createdAt),
                            systemImage: "calendar"
                        )
                        .font(.caption.weight(.medium))
                        .foregroundStyle(ColorTheme.accent)

                        Spacer()

                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(ColorTheme.textMuted)
                    }

                    Text(entry.title)
                        .font(.headline)
                        .foregroundStyle(ColorTheme.textPrimary)
                        .multilineTextAlignment(.leading)

                    if !entry.body.isEmpty {
                        Text(entry.body)
                            .font(.subheadline)
                            .foregroundStyle(ColorTheme.textMuted)
                            .lineLimit(3)
                            .multilineTextAlignment(.leading)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button {
                editingEntry = entry
            } label: {
                Label("Düzenle", systemImage: "pencil")
            }

            Button(role: .destructive) {
                viewModel.deleteEntry(entry)
            } label: {
                Label("Sil", systemImage: "trash")
            }
        }
    }
}

private struct JournalEditorSheet: View {
    enum Mode {
        case create
        case edit(JournalEntry)

        var navigationTitle: String {
            switch self {
            case .create: return "Yeni Günlük"
            case .edit: return "Günlüğü Düzenle"
            }
        }
    }

    let mode: Mode
    let onSave: (String, String, Date) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var noteBody: String
    @State private var date: Date

    init(mode: Mode, onSave: @escaping (String, String, Date) -> Void) {
        self.mode = mode
        self.onSave = onSave
        switch mode {
        case .create:
            _title = State(initialValue: "")
            _noteBody = State(initialValue: "")
            _date = State(initialValue: Date())
        case .edit(let entry):
            _title = State(initialValue: entry.title)
            _noteBody = State(initialValue: entry.body)
            _date = State(initialValue: entry.createdAt)
        }
    }

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !noteBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Tarih") {
                    DatePicker("Kayıt Tarihi", selection: $date, displayedComponents: [.date, .hourAndMinute])
                        .environment(\.locale, Locale(identifier: "tr_TR"))
                }

                Section("Başlık") {
                    TextField("Örn: Görev Günü 121 — Gözlem", text: $title)
                }

                Section("Günlük Notu") {
                    TextEditor(text: $noteBody)
                        .frame(minHeight: 160)
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
                        onSave(title, noteBody, date)
                        dismiss()
                    }
                    .disabled(!canSave)
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}

private struct JournalDetailSheet: View {
    let entry: JournalEntry
    let dateText: String
    let onEdit: () -> Void
    let onDelete: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Label(dateText, systemImage: "calendar")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(ColorTheme.accent)

                    Text(entry.title)
                        .font(.title2.weight(.bold))
                        .foregroundStyle(ColorTheme.textPrimary)

                    Divider()
                        .overlay(ColorTheme.spaceBorder)

                    Text(entry.body.isEmpty ? "Not içeriği yok." : entry.body)
                        .font(.body)
                        .foregroundStyle(ColorTheme.textPrimary.opacity(0.92))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(20)
            }
            .background(ColorTheme.spaceBackdropGradient.ignoresSafeArea())
            .navigationTitle("Günlük Detayı")
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
            JournalView(viewModel: JournalViewModel(storageURL: nil))
        }
    }
    .preferredColorScheme(.dark)
}
