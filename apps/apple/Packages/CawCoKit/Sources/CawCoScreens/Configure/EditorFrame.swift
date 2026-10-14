import CawCoCore
import CawCoDesign
import UIKit

extension HubConnection {
    /// Why a write cannot happen right now, or nil when it can (config/hub.svelte.ts
    /// `hubDown`): every Save and Delete is disabled on it and carries it as its hint.
    var writesBlocked: String? { socket == .connected ? nil : Words.Configure.hubDown }
}

/// The one editor template (EditorFrame.svelte, EditorFooter.svelte): a page
/// pushed over its section's list (HIG Sheets: "For complex or prolonged user
/// flows, consider alternatives to sheets"), a scrolling raised card on the
/// recess, and the commit row under it, outside the scroll, standing on the
/// keyboard when one is up. The header holds the section's tile and the
/// name as a title input; the editor's parts below it are `space5` apart.
///
/// Save shows its work where it was pressed: it spins while the save runs,
/// and says "Saved" for `durHold` once it ends well. On a compact width
/// Delete moves from the commit row to the header's ⋯ menu, beside the
/// name, as the web's does under 640px (the shell draws no system bar on
/// the Mac, so a bar item would not be seen there).
class ConfigEditorController: ObservedViewController {
    let section: ConfigSection
    let context: ShellContext
    var hub: HubConnection { context.hub }

    /// The header's lead: the title input and whatever stands under it.
    let lead = UIStackView()
    /// The editor's parts, top to bottom.
    let parts = UIStackView()
    /// What the header's tile holds in place of the section's glyph (a provider's mark).
    var tile: UIView?

    let saveLabel: String
    let deleteLabel: String?
    var canSave = true { didSet { drawFooter() } }
    private(set) var saving = false
    /// The delete Delete asked about is running: Save waits.
    private var deleting: Bool { question.running }
    /// The save that just ended failed: its button shows no check.
    private(set) var failed = false

    private let scroll = UIScrollView()
    private let card = UIView()
    private let footer = UIStackView()
    /// The commit row and, over it, the question Delete asked.
    private let commit = UIStackView()
    private let question = AskHere()
    private var saveButton: UIButton!
    private var cancelButton: UIButton!
    private var deleteButton: UIButton?
    /// The header's ⋯, Delete's place on a compact width.
    private let headMenu = KitGhostButton(.more, label: Words.Configure.more)
    private var saved = false

    init(section: ConfigSection, context: ShellContext, title: String, saveLabel: String, deleteLabel: String? = nil) {
        self.section = section
        self.context = context
        self.saveLabel = saveLabel
        self.deleteLabel = deleteLabel
        super.init(nibName: nil, bundle: nil)
        navigationItem.title = title
        navigationItem.largeTitleDisplayMode = .never
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ConfigEditorController is built in code")
    }

    // MARK: What an editor does

    /// What Delete asks over the commit row before it runs (EditorFooter.svelte's
    /// `EditorQuestion`, asked in AskHere): what it reaches, and its confirm.
    struct Question {
        let title: String
        let body: String
        let confirm: String
        let pending: String
    }

    /// Saves the fields; true when the hub took them.
    func save() async -> Bool { true }
    /// The question Delete asks, read when it is pressed; nil while there is
    /// nothing to delete yet.
    func deleteQuestion() -> Question? { nil }
    /// Deletes the row; a refusal is thrown in the hub's words, and stays
    /// under the question where it was asked.
    func delete() async throws {}
    /// Cancel: the fields are dropped and the list comes back.
    func cancel() { navigationController?.popViewController(animated: true) }

    // MARK: Frame

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.alwaysBounceVertical = true
        scroll.keyboardDismissMode = .interactive
        view.addSubview(scroll)
        card.backgroundColor = Palette.surfaceRaised
        card.layer.cornerRadius = Radius.radiusLg
        card.layer.cornerCurve = .continuous
        card.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(card)

        // The section's tile, the one its row carries in the list: 26pt, raised, centred on the title's line.
        let mark = TileView(radius: Radius.radiusSm)
        let inner = tile ?? GlyphView(section.glyph, size: 16, tint: section.hue)
        inner.translatesAutoresizingMaskIntoConstraints = false
        mark.addSubview(inner)
        NSLayoutConstraint.activate([
            mark.widthAnchor.constraint(equalToConstant: 26),
            mark.heightAnchor.constraint(equalToConstant: 26),
            inner.centerXAnchor.constraint(equalTo: mark.centerXAnchor),
            inner.centerYAnchor.constraint(equalTo: mark.centerYAnchor),
        ])
        let markSlot = UIStackView(arrangedSubviews: [mark])
        markSlot.isLayoutMarginsRelativeArrangement = true
        markSlot.directionalLayoutMargins = .init(top: 2, leading: 0, bottom: 0, trailing: 0)
        lead.axis = .vertical
        lead.spacing = 8
        let head = UIStackView(arrangedSubviews: [markSlot, lead])
        head.spacing = 8
        head.alignment = .top
        // `.narrow-menu`: under 640px Delete leaves the commit row for the header's ⋯.
        if deleteLabel != nil {
            headMenu.showsMenuAsPrimaryAction = true
            headMenu.accessibilityIdentifier = "editor.more"
            headMenu.setContentHuggingPriority(.required, for: .horizontal)
            head.addArrangedSubview(headMenu)
        }
        parts.axis = .vertical
        parts.spacing = Space.space5
        let body = UIStackView(arrangedSubviews: [head, parts])
        body.axis = .vertical
        body.spacing = Space.space6
        body.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(body)

        buildFooter()
        question.accessibilityIdentifier = "editor.question"
        // Its confirm pending, then gone or refused: the commit row follows it.
        question.onResize = { [weak self] in self?.drawFooter() }
        commit.axis = .vertical
        commit.spacing = Space.space3
        commit.addArrangedSubview(question)
        commit.addArrangedSubview(footer)
        commit.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(commit)

        let safe = view.safeAreaLayoutGuide
        let wide = card.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -Space.space5 * 2)
        wide.priority = .defaultHigh
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: safe.topAnchor),
            scroll.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: commit.topAnchor),
            card.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: Space.space2),
            scroll.contentLayoutGuide.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: Space.space5),
            card.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: Space.space5),
            scroll.contentLayoutGuide.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
            card.widthAnchor.constraint(lessThanOrEqualToConstant: 980),
            card.widthAnchor.constraint(lessThanOrEqualTo: scroll.frameLayoutGuide.widthAnchor, constant: -Space.space5 * 2),
            wide,
            card.heightAnchor.constraint(greaterThanOrEqualTo: scroll.frameLayoutGuide.heightAnchor, constant: -Space.space2 - Space.space5),
            body.topAnchor.constraint(equalTo: card.topAnchor, constant: Space.space6),
            body.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: Space.space7),
            body.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -Space.space7),
            body.bottomAnchor.constraint(lessThanOrEqualTo: card.bottomAnchor, constant: -Space.space6),
            // The commit row: `10px 21px 12px` on the recess, over the keyboard when one is up.
            commit.topAnchor.constraint(greaterThanOrEqualTo: safe.topAnchor),
            commit.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: 21),
            commit.trailingAnchor.constraint(lessThanOrEqualTo: safe.trailingAnchor, constant: -21),
            commit.widthAnchor.constraint(lessThanOrEqualToConstant: 980),
            commit.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor, constant: -12),
            commit.bottomAnchor.constraint(lessThanOrEqualTo: safe.bottomAnchor, constant: -12),
        ])
        let span = commit.widthAnchor.constraint(equalTo: safe.widthAnchor, constant: -42)
        span.priority = .defaultHigh
        span.isActive = true
        registerForTraitChanges([UITraitHorizontalSizeClass.self]) { (editor: ConfigEditorController, _: UITraitCollection) in
            editor.drawFooter()
        }
        drawFooter()
    }

    private func buildFooter() {
        footer.spacing = 8
        footer.alignment = .center
        if let deleteLabel {
            let delete = KitButton.make(deleteLabel, glyph: .trash, glyphTint: Palette.inkMuted, variant: .ghost) { [weak self] in self?.runDelete() }
            deleteButton = delete
            footer.addArrangedSubview(delete)
        }
        let spacer = UIView()
        spacer.setContentHuggingPriority(.defaultLow, for: .horizontal)
        footer.addArrangedSubview(spacer)
        cancelButton = KitButton.make(Words.Configure.cancel, variant: .outline) { [weak self] in self?.cancel() }
        saveButton = KitButton.make(saveLabel, variant: .action) { [weak self] in self?.runSave() }
        saveButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 96).isActive = true
        footer.addArrangedSubview(cancelButton)
        footer.addArrangedSubview(saveButton)
    }

    /// The commit row's state, and the compact ⋯ menu Delete moves into.
    func drawFooter() {
        guard isViewLoaded else { return }
        let down = hub.writesBlocked
        let compact = traitCollection.horizontalSizeClass == .compact
        KitButton.setTitle(saved ? Words.Configure.saved : saveLabel, of: saveButton, variant: .action, height: .standard)
        saveButton.configuration?.showsActivityIndicator = saving
        saveButton.isEnabled = down == nil && !deleting && canSave && !saving
        saveButton.accessibilityHint = down
        cancelButton.isEnabled = !saving
        deleteButton?.isHidden = compact
        deleteButton?.isEnabled = down == nil && !saving && !deleting
        headMenu.isHidden = !compact || deleteLabel == nil
        if let deleteLabel {
            headMenu.menu = UIMenu(children: [
                UIAction(title: deleteLabel, image: Glyph.trash.image.resized(to: 16),
                         attributes: down != nil || deleting || saving ? [.destructive, .disabled] : .destructive) { [weak self] _ in self?.runDelete() },
            ])
        }
    }

    #if DEBUG
    /// The probe's presses, through what the buttons run.
    func probeRunSave() { runSave() }
    func probeRunDelete() { runDelete() }
    func probeConfirm() { question.probeConfirm() }
    /// The commit row as it draws now, and the question over it.
    var probeFooter: String {
        let save = saveButton.configuration?.attributedTitle.map { String($0.characters) } ?? ""
        let asked = question.asked == nil ? "" : " question: \(question.probeState) \(question.probeWords)"
        return "[\(save)\(saveButton.isEnabled ? "" : " (disabled)")]" + asked
    }

    /// Where Delete stands as drawn: the header's ⋯ menu and its items, or the commit row's button.
    var probeDelete: String {
        if !headMenu.isHidden, headMenu.window != nil {
            let items = headMenu.menu?.children.compactMap { ($0 as? UIAction)?.title } ?? []
            return "header menu: " + items.joined(separator: ", ")
        }
        if let deleteButton, !deleteButton.isHidden, deleteButton.window != nil {
            return "commit row: [\(deleteButton.configuration?.attributedTitle.map { String($0.characters) } ?? "")]"
        }
        return "none"
    }
    #endif

    private func runSave() {
        guard !saving else { return }
        saving = true
        failed = false
        saved = false
        drawFooter()
        Task { @MainActor [weak self] in
            guard let self else { return }
            let ok = await save()
            saving = false
            failed = !ok
            saved = ok
            drawFooter()
            guard ok else { return }
            try? await Task.sleep(for: .seconds(Motion.durHold))
            saved = false
            drawFooter()
        }
    }

    /// Delete asks first, over the commit row where it was pressed (AskHere,
    /// the Open Page Rule): what it reaches, Cancel, and the destructive
    /// confirm, pending until the hub answers; a refusal stays under it in
    /// the hub's words, the confirm the way to try again.
    private func runDelete() {
        guard !deleting, let ask = deleteQuestion() else { return }
        question.ask(AskHere.Request(title: ask.title, body: [ask.body], confirmLabel: ask.confirm, pendingLabel: ask.pending,
                                     destructive: true) { [weak self] in try await self?.delete() })
        drawFooter()
    }
}
