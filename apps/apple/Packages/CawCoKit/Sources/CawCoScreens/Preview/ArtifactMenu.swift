import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// An artifact's kind, as the panel draws it (ArtifactMenu.svelte `GLYPHS`).
extension ArtifactKind {
    var glyph: Glyph {
        switch self {
        case .canvas: .toolWrite
        case .preview: .window
        case .component: .artifactSheet
        default: .toolRead
        }
    }
}

/// The artifact panel's title control (preview/ArtifactMenu.svelte, DESIGN.md
/// Artifact panel): the shown artifact's kind and name in the label role,
/// and the unfold mark, as the head's first control. It opens the menu.
final class ArtifactTitleButton: UIButton {
    private let glyphView = GlyphView(.toolRead, size: Size.iconMd, tint: Palette.inkStrong)
    private let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let unfold = GlyphView(.chevronDown, size: Size.iconMd, tint: Palette.inkMuted)

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        name.lineBreakMode = .byTruncatingTail
        name.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let line = UIStackView(arrangedSubviews: [glyphView, name, unfold])
        line.spacing = Space.space2
        line.alignment = .center
        line.isUserInteractionEnabled = false
        line.translatesAutoresizingMaskIntoConstraints = false
        addSubview(line)
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous
        // The head's control recipe (SideSurface `--btn-gap` and the sm button's insets).
        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: Size.cBtnHSm),
            line.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space2),
            line.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space2),
            line.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        accessibilityTraits = .button
        accessibilityHint = "Lists the session's artifacts"
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("ArtifactTitleButton is built in code") }

    /// Its width with the whole name standing: the name's own, its glyph and
    /// unfold, the two gaps between and the insets either side.
    var wholeWidth: Double {
        name.intrinsicContentSize.width + Size.iconMd * 2 + Space.space2 * 4
    }

    func show(kind: ArtifactKind, name text: String) {
        glyphView.glyph = kind.glyph
        name.text = text
        accessibilityLabel = text
    }

    override var isHighlighted: Bool {
        didSet { backgroundColor = isHighlighted ? Palette.surfaceHover : .clear }
    }
}

/// The title control's menu (ArtifactMenu.svelte): the session's artifacts,
/// newest first, each promoted one tagged with its short commit; choosing
/// one shows it. Each row's Remove (its trailing glyph, always under a
/// finger) removes it where it stands: a light action, no confirm. A row
/// leaves once the hub says it is gone, the rows under it closing up, and
/// also when the panel's frame stops listing it (removed in another view, or
/// by the agent); a new id in the frame reads the list again.
final class ArtifactMenuController: KitPopoverController {
    private let hub: HubConnection
    private let instanceId: String
    private var shown: (id: String, kind: ArtifactKind, name: String)
    /// The session's artifacts by id, as the panel's frame lists them.
    private var held: [String]?
    /// The list as the hub last answered it; nil until it has, when the one shown stands alone.
    private var listed: [ArtifactSummary]?
    /// Rows whose removal the hub has not answered yet.
    private var removing: Set<String> = []
    private let rows = UIStackView()
    private let scroll = UIScrollView()
    private var drawn: [String: ArtifactMenuRow] = [:]
    /// The menu's width (ArtifactMenu.svelte `w-64`).
    static let width = 256.0

    init(hub: HubConnection, instanceId: String, shown: (id: String, kind: ArtifactKind, name: String), held: [String]?) {
        self.hub = hub
        self.instanceId = instanceId
        self.shown = shown
        self.held = held
        super.init()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("ArtifactMenuController is built in code") }

    override func viewDidLoad() {
        super.viewDidLoad()
        rows.axis = .vertical
        scroll.alwaysBounceVertical = false
        scroll.hold(rows, insets: UIEdgeInsets(top: 6, left: 6, bottom: 6, right: 6))
        rows.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -12).isActive = true
        card.hold(scroll)
        view.accessibilityViewIsModal = true
        draw()
        read()
    }

    /// The panel's frame moved: what it lists now, and what it shows.
    func follow(held next: [String]?, shown now: (id: String, kind: ArtifactKind, name: String)) {
        held = next
        shown = now
        // An id the frame lists that the list read has not: the list is read again.
        if let listed, let next, next.contains(where: { id in !listed.contains { $0.id == id } }) { read() }
        draw()
    }

    private func read() {
        Task { [weak self] in
            guard let self else { return }
            do {
                listed = try await hub.listArtifacts(in: instanceId)
                draw()
                #if DEBUG
                logRows()
                #endif
            } catch {
                Toast.error(error.localizedDescription, in: presentingViewController?.view)
            }
        }
    }

    /// The rows as they stand: the list as read, less any the frame no longer names.
    private var rowsNow: [(id: String, kind: ArtifactKind, name: String, createdAt: String?, promoted: String?)] {
        guard let listed else { return [(shown.id, shown.kind, shown.name, nil, nil)] }
        return listed.filter { row in held?.contains(row.id) ?? true }
            .map { ($0.id, $0.kind, $0.name, $0.createdAt, $0.promoted.map { String($0.commit.prefix(7)) }) }
    }

    private func draw() {
        guard isViewLoaded else { return }
        let now = rowsNow
        let ids = now.map(\.id)
        // A row that left closes up, the rows under it sliding into its room.
        for (id, row) in drawn where !ids.contains(id) {
            drawn[id] = nil
            let focused = row.accessibilityElementIsFocused()
            if UIAccessibility.isReduceMotionEnabled {
                row.removeFromSuperview()
            } else {
                Motion.easeOut.animator(Motion.durControl) {
                    row.isHidden = true
                    row.alpha = 0
                    self.rows.layoutIfNeeded()
                }.startAnimation()
                Task { @MainActor in
                    try? await Task.sleep(for: .seconds(Motion.durControl))
                    row.removeFromSuperview()
                }
            }
            if focused { UIAccessibility.post(notification: .layoutChanged, argument: drawn.values.first) }
        }
        let wall = Date.now.timeIntervalSince1970 * 1000
        for (index, item) in now.enumerated() {
            let row = drawn[item.id] ?? {
                let made = ArtifactMenuRow()
                made.onChoose = { [weak self] in self?.choose(item.id) }
                made.onRemove = { [weak self] in self?.remove(item.id) }
                drawn[item.id] = made
                rows.insertArrangedSubview(made, at: min(index, rows.arrangedSubviews.count))
                return made
            }()
            let age = item.createdAt.flatMap { try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse($0) }
                .map { RailAge.short($0.timeIntervalSince1970 * 1000, now: wall) }
            row.show(kind: item.kind, name: item.name, promoted: item.promoted, age: age,
                     current: item.id == shown.id, busy: removing.contains(item.id))
        }
        view.layoutIfNeeded()
        let fits = rows.systemLayoutSizeFitting(CGSize(width: Self.width - 12, height: 0),
                                                withHorizontalFittingPriority: .required,
                                                verticalFittingPriority: .fittingSizeLevel).height + 12
        let room = (presentingViewController?.view.bounds.height ?? 600) * 0.6
        preferredContentSize = CGSize(width: Self.width, height: min(fits, room))
    }

    private func choose(_ id: String) {
        guard id != shown.id else {
            dismiss(animated: true)
            return
        }
        hub.openArtifact(id, in: instanceId)
        dismiss(animated: true)
    }

    private func remove(_ id: String) {
        guard !removing.contains(id) else { return }
        let name = rowsNow.first { $0.id == id }?.name ?? ""
        removing.insert(id)
        draw()
        Task { [weak self] in
            guard let self else { return }
            do {
                try await hub.removeArtifact(id, in: instanceId)
                removing.remove(id)
                listed = listed?.filter { $0.id != id }
            } catch {
                removing.remove(id)
                Toast.error(Words.Artifacts.notRemoved(name: name, why: error.localizedDescription), in: presentingViewController?.view)
            }
            draw()
            #if DEBUG
            logRows()
            #endif
        }
    }

    #if DEBUG

    /// The rows as drawn, top to bottom: each name with its promoted tag's words.
    private func logRows() {
        let drawnNames = rowsNow.map { "\($0.name)\($0.promoted.map { "[\(Words.Artifacts.promoted(commit: $0))]" } ?? "")" }
    }
    #endif
}

/// One row of the menu (the kit's menu item, `--c-artifact-row-h` tall): the
/// kind's glyph, the name in the label role, the promoted tag and the age in
/// the meta size, muted and in tabular figures, then Remove. The name keeps
/// its own width; in a row too narrow for everything the promoted tag gives
/// up its room first.
private final class ArtifactMenuRow: UIControl {
    var onChoose: () -> Void = {}
    var onRemove: () -> Void = {}
    private let glyph = GlyphView(.toolRead, size: Size.iconMd, tint: Palette.inkMuted)
    private let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
    private let promoted = KitLabel(TypeScale.typeLabel.with(points: TypeScale.textMeta), ink: Palette.inkMuted)
    private let age = KitLabel(TypeScale.typeLabel.with(points: TypeScale.textMeta), ink: Palette.inkMuted)
    private var removeButton: UIButton!

    init() {
        super.init(frame: .zero)
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        promoted.tabular = true
        age.tabular = true
        name.lineBreakMode = .byTruncatingTail
        promoted.lineBreakMode = .byTruncatingTail
        name.setContentCompressionResistancePriority(.defaultHigh, for: .horizontal)
        promoted.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        age.setContentCompressionResistancePriority(.required, for: .horizontal)
        age.setContentHuggingPriority(.required, for: .horizontal)
        removeButton = KitButton.make("", glyph: .trash, variant: .ghost, height: .xs) { [weak self] in self?.onRemove() }
        removeButton.tintColor = Palette.inkMuted
        let spacer = UIView()
        spacer.setContentHuggingPriority(.defaultLow, for: .horizontal)
        let line = UIStackView(arrangedSubviews: [glyph, name, promoted, spacer, age, removeButton])
        line.spacing = 10
        line.alignment = .center
        line.setCustomSpacing(Space.space1, after: age)
        line.translatesAutoresizingMaskIntoConstraints = false
        addSubview(line)
        NSLayoutConstraint.activate([
            heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cArtifactRowH),
            line.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10),
            // Remove's padding reaches back a step into the row's (`margin-inline-end: -space-1`).
            line.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10 + Space.space1),
            line.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        addAction(UIAction { [weak self] _ in self?.onChoose() }, for: .touchUpInside)
        isAccessibilityElement = true
        accessibilityTraits = .button
        addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("ArtifactMenuRow is built in code") }

    func show(kind: ArtifactKind, name text: String, promoted commit: String?, age said: String?, current: Bool, busy: Bool) {
        glyph.glyph = kind.glyph
        name.text = text
        // The one shown is the strong ink, as `aria-current` draws it.
        name.ink = current ? Palette.inkStrong : Palette.inkMuted
        glyph.tintColor = current ? Palette.inkStrong : Palette.inkMuted
        promoted.text = commit.map { Words.Artifacts.promoted(commit: $0) }
        promoted.isHidden = commit == nil
        age.text = said
        age.isHidden = said == nil
        alpha = busy ? 0.5 : 1
        removeButton.isEnabled = !busy
        removeButton.accessibilityLabel = Words.Artifacts.removeNamed(name: text)
        removeButton.toolTip = Words.Artifacts.remove
        accessibilityLabel = [text, commit.map { Words.Artifacts.promoted(commit: $0) }, said].compactMap(\.self).joined(separator: ", ")
        accessibilityTraits = current ? [.button, .selected] : .button
        // VoiceOver's own way to Remove, beside the row's choose.
        accessibilityCustomActions = [UIAccessibilityCustomAction(name: Words.Artifacts.removeNamed(name: text)) { [weak self] _ in
            self?.onRemove()
            return true
        }]
    }

    override var isHighlighted: Bool {
        didSet { backgroundColor = isHighlighted ? Palette.surfaceHover : .clear }
    }

    /// The row the pointer is over, as `data-highlighted` draws it.
    @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
        let over = hover.state == .began || hover.state == .changed
        backgroundColor = over ? Palette.surfaceHover : .clear
    }

    /// Delete or Backspace on the highlighted row removes it (ArtifactMenu.svelte `aria-keyshortcuts`).
    override var keyCommands: [UIKeyCommand]? {
        [UIKeyCommand(input: "\u{8}", modifierFlags: [], action: #selector(removeByKey)),
         UIKeyCommand(input: UIKeyCommand.inputDelete, modifierFlags: [], action: #selector(removeByKey))]
    }

    @objc private func removeByKey() { onRemove() }
}
