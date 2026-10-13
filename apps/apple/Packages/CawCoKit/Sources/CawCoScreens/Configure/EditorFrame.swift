import CawCoCore
import CawCoDesign
import UIKit

extension HubConnection {
    /// Why a write cannot happen right now, or nil when it can (config/hub.svelte.ts
    /// `hubDown`): every Save and Delete is disabled on it and carries it as its hint.
    var writesBlocked: String? { socket == .connected ? nil : "Can't save while the hub is unreachable" }
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
/// Delete moves from the commit row to the navigation bar's ⋯ menu.
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
    private(set) var deleting = false
    /// The save or delete that just ended failed: its button shows no check.
    private(set) var failed = false

    private let scroll = UIScrollView()
    private let card = UIView()
    private let footer = UIStackView()
    private var saveButton: UIButton!
    private var cancelButton: UIButton!
    private var deleteButton: UIButton?
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

    /// Saves the fields; true when the hub took them.
    func save() async -> Bool { true }
    /// Deletes the row; true when the hub took it.
    func delete() async -> Bool { true }
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
        parts.axis = .vertical
        parts.spacing = Space.space5
        let body = UIStackView(arrangedSubviews: [head, parts])
        body.axis = .vertical
        body.spacing = Space.space6
        body.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(body)

        buildFooter()
        footer.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(footer)

        let safe = view.safeAreaLayoutGuide
        let wide = card.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -Space.space5 * 2)
        wide.priority = .defaultHigh
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: safe.topAnchor),
            scroll.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: footer.topAnchor),
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
            footer.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: 21),
            footer.trailingAnchor.constraint(lessThanOrEqualTo: safe.trailingAnchor, constant: -21),
            footer.widthAnchor.constraint(lessThanOrEqualToConstant: 980),
            footer.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor, constant: -12),
            footer.bottomAnchor.constraint(lessThanOrEqualTo: safe.bottomAnchor, constant: -12),
        ])
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
        cancelButton = KitButton.make("Cancel", variant: .outline) { [weak self] in self?.cancel() }
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
        KitButton.setTitle(saved ? "Saved" : saveLabel, of: saveButton, variant: .action, height: .standard)
        saveButton.configuration?.showsActivityIndicator = saving
        saveButton.isEnabled = down == nil && !deleting && canSave && !saving
        saveButton.accessibilityHint = down
        cancelButton.isEnabled = !saving
        deleteButton?.isHidden = compact
        deleteButton?.isEnabled = down == nil && !saving && !deleting
        deleteButton?.configuration?.showsActivityIndicator = deleting
        if compact, let deleteLabel {
            let item = UIBarButtonItem(image: Glyph.more.image.resized(to: 18), menu: UIMenu(children: [
                UIAction(title: deleteLabel, image: Glyph.trash.image.resized(to: 16),
                         attributes: down != nil || deleting || saving ? [.destructive, .disabled] : .destructive) { [weak self] _ in self?.runDelete() },
            ]))
            item.accessibilityLabel = "More"
            navigationItem.rightBarButtonItem = item
        } else {
            navigationItem.rightBarButtonItem = nil
        }
    }

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

    private func runDelete() {
        guard !deleting else { return }
        deleting = true
        failed = false
        drawFooter()
        Task { @MainActor [weak self] in
            guard let self else { return }
            let ok = await delete()
            deleting = false
            failed = !ok
            drawFooter()
        }
    }
}

/// One superseded version as a history lists it (PreviousVersions.svelte `ListedVersion`).
struct ListedVersion {
    let id: Int
    let name: String
    let hash: String
    let createdAt: Date
    /// `fleet` for the hub's own row; `machine:<machineId>` for a copy an overwrite took off it.
    let source: String
}

/// What a fleet row used to be, newest first, each a tap from being the
/// current one again (PreviousVersions.svelte); the latest five until asked for all.
final class PreviousVersionsView: UIStackView {
    private static let latest = 5
    private let list = UIStackView()
    private var all = false
    private var versions: [ListedVersion] = []
    private var failedWords: String?
    private var restoring: Int?
    private var restoreFailed: Int?
    private let sourceLabel: (String) -> String
    var onRestore: ((ListedVersion) -> Void)?

    init(sourceLabel: @escaping (String) -> String) {
        self.sourceLabel = sourceLabel
        super.init(frame: .zero)
        axis = .vertical
        spacing = 8
        let note = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        note.text = "Every save keeps what it replaced. Restoring writes an old version back as this one."
        list.axis = .vertical
        list.spacing = 8
        addArrangedSubview(note)
        addArrangedSubview(list)
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("PreviousVersionsView is built in code")
    }

    func set(_ versions: [ListedVersion], failed: String? = nil, restoring: Int? = nil, restoreFailed: Int? = nil) {
        self.versions = versions
        failedWords = failed
        self.restoring = restoring
        self.restoreFailed = restoreFailed
        draw()
    }

    private func draw() {
        list.arrangedSubviews.forEach { $0.removeFromSuperview() }
        if let failedWords {
            let caution = KitLabel(TypeScale.typeMeta, ink: Palette.statusAttnInk, lines: 0)
            caution.text = failedWords
            list.addArrangedSubview(caution)
            return
        }
        guard !versions.isEmpty else {
            let none = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
            none.text = "Nothing has been saved over yet."
            list.addArrangedSubview(none)
            return
        }
        let rows = UIStackView()
        rows.axis = .vertical
        rows.spacing = 2
        for version in all ? versions : Array(versions.prefix(Self.latest)) {
            rows.addArrangedSubview(row(version))
        }
        list.addArrangedSubview(rows)
        if versions.count > Self.latest {
            let more = KitButton.make(all ? "Show the latest 5" : "Show all \(versions.count)", variant: .ghost, height: .sm) { [weak self] in
                guard let self else { return }
                all.toggle()
                draw()
            }
            list.addArrangedSubview(UIStackView(arrangedSubviews: [more, UIView()]))
        }
    }

    private func row(_ version: ListedVersion) -> UIView {
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
        name.text = version.name
        let meta = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        meta.text = "\(version.createdAt.formatted(date: .abbreviated, time: .shortened)) · from \(sourceLabel(version.source)) · \(version.hash.prefix(7))"
        let words = UIStackView(arrangedSubviews: [name, meta])
        words.axis = .vertical
        words.spacing = 2
        let restore = KitButton.make("Restore", variant: .outline, height: .sm) { [weak self] in self?.onRestore?(version) }
        restore.configuration?.showsActivityIndicator = restoring == version.id
        restore.isEnabled = restoring == nil || restoring == version.id
        let row = UIStackView(arrangedSubviews: [words, restore])
        row.spacing = 8
        row.alignment = .center
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins = .init(top: 8, leading: 10, bottom: 8, trailing: 10)
        row.backgroundColor = Palette.surfaceRecess
        row.layer.cornerRadius = Radius.radiusSm
        return row
    }
}
