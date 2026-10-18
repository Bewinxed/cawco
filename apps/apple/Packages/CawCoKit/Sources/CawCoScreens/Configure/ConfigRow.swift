import CawCoCore
import CawCoDesign
import UIKit

/// What a row's last action came to (SectionRow.svelte `RowNote`): running, done, or why it failed.
struct RowNote: Equatable {
    enum Tone { case busy, done, fail }
    let text: String
    let tone: Tone
}

/// One row of a section list (SectionRow.svelte): its 26pt tile, its name
/// (in the code face for a name that is code) over its meta line, then its
/// controls: where it has landed, its switch, its own control, its ⋯. The
/// whole row opens the thing when it has an editor; the controls sit above
/// that so each stays its own target. What the row's last action came to,
/// and anything it opens in place, attach underneath. Under 640pt the
/// controls drop under the words, 36pt in.
///
/// A row is one view for its list's life, changed in place by `show`, so a
/// switch mid-flip or an open ⋯ menu keeps its window through a refresh.
final class ConfigRow: UIStackView {
    /// The editor. Without one the row is not a link.
    var opens: (() -> Void)? { didSet { opener.isEnabled = opens != nil; opener.accessibilityTraits = opens == nil ? .staticText : .button } }
    /// Present only for a row that can be switched off.
    var onToggle: ((Bool) -> Void)?

    private let row = UIView()
    private let opener = UIControl()
    private let tile = TileView(radius: Radius.radiusSm)
    private let tileGlyph = GlyphView(.dataLayers, size: 16, tint: Palette.inkMuted)
    private var tileMark: UIView?
    private let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let badgeSlot = UIStackView()
    private let meta = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let text = UIStackView()
    private let controls = UIStackView()
    private let rolloutSlot = UIStackView()
    private let toggle = UISwitch()
    private let trailingSlot = UIStackView()
    private var menu: UIButton?
    /// What the ⋯ lists, as the last refresh left the row: made into its menu as it opens.
    private var menuItems: [UIMenuElement] = []
    private let below = UIStackView()
    private let noteRow = UIStackView()
    private let noteMark = UIStackView()
    private let noteText = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private let belowSlot = UIStackView()
    private var narrow: Bool?
    private var wideConstraints: [NSLayoutConstraint] = []
    private var narrowConstraints: [NSLayoutConstraint] = []
    private var height: NSLayoutConstraint!

    init() {
        super.init(frame: .zero)
        axis = .vertical
        spacing = 4
        layer.cornerRadius = Radius.radiusSm

        // The whole row opens its editor; the press tints it as the web's `.row:has(.link:active)`.
        opener.translatesAutoresizingMaskIntoConstraints = false
        opener.layer.cornerRadius = Radius.radiusSm
        opener.isEnabled = false
        opener.isAccessibilityElement = true
        opener.addAction(UIAction { [weak self] _ in self?.opens?() }, for: .touchUpInside)
        opener.addAction(UIAction { [weak self] _ in self?.opener.backgroundColor = Palette.surfaceFill }, for: .touchDown)
        opener.addAction(UIAction { [weak self] _ in self?.opener.backgroundColor = .clear }, for: [.touchUpInside, .touchUpOutside, .touchCancel])
        row.addSubview(opener)

        tile.translatesAutoresizingMaskIntoConstraints = false
        tile.layer.cornerRadius = Radius.radiusSm
        tileGlyph.translatesAutoresizingMaskIntoConstraints = false
        tile.addSubview(tileGlyph)
        tile.isUserInteractionEnabled = false

        name.lineBreakMode = .byTruncatingTail
        name.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        badgeSlot.spacing = 8
        badgeSlot.alignment = .center
        badgeSlot.setContentHuggingPriority(.required, for: .horizontal)
        let nameLine = UIStackView(arrangedSubviews: [name, badgeSlot])
        nameLine.spacing = 8
        nameLine.alignment = .center
        meta.lineBreakMode = .byTruncatingTail
        meta.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        text.axis = .vertical
        text.spacing = 1
        text.addArrangedSubview(nameLine)
        text.addArrangedSubview(meta)
        text.isUserInteractionEnabled = false
        text.translatesAutoresizingMaskIntoConstraints = false

        // A switch, as the web's (switch.svelte): the Mac idiom draws one as a checkbox unless asked.
        toggle.onTintColor = Palette.inkStrong
        toggle.preferredStyle = .sliding
        toggle.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            onToggle?(toggle.isOn)
        }, for: .valueChanged)
        rolloutSlot.alignment = .center
        trailingSlot.spacing = 8
        trailingSlot.alignment = .center
        controls.alignment = .center
        controls.translatesAutoresizingMaskIntoConstraints = false
        // A 30pt ⋯ and a switch: under a finger the gap opens to 14pt, so each touch area reaches 44pt.
        controls.spacing = traitCollection.userInterfaceIdiom == .mac ? 8 : 14
        for part in [rolloutSlot, toggle, trailingSlot] as [UIView] { controls.addArrangedSubview(part) }
        controls.setContentHuggingPriority(.required, for: .horizontal)
        controls.setContentCompressionResistancePriority(.required, for: .horizontal)

        for part in [tile, text, controls] as [UIView] { row.addSubview(part) }
        height = row.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)
        NSLayoutConstraint.activate([
            opener.topAnchor.constraint(equalTo: row.topAnchor),
            opener.bottomAnchor.constraint(equalTo: row.bottomAnchor),
            opener.leadingAnchor.constraint(equalTo: row.leadingAnchor),
            opener.trailingAnchor.constraint(equalTo: row.trailingAnchor),
            tile.widthAnchor.constraint(equalToConstant: 26),
            tile.heightAnchor.constraint(equalToConstant: 26),
            tileGlyph.centerXAnchor.constraint(equalTo: tile.centerXAnchor),
            tileGlyph.centerYAnchor.constraint(equalTo: tile.centerYAnchor),
            // `padding: 6px 8px`, `gap: 10px`.
            tile.leadingAnchor.constraint(equalTo: row.leadingAnchor, constant: 8),
            text.leadingAnchor.constraint(equalTo: tile.trailingAnchor, constant: 10),
            text.topAnchor.constraint(greaterThanOrEqualTo: row.topAnchor, constant: 6),
            height,
        ])
        // Beside the words, the controls at the row's end, all on one centre line.
        wideConstraints = [
            tile.centerYAnchor.constraint(equalTo: row.centerYAnchor),
            text.centerYAnchor.constraint(equalTo: row.centerYAnchor),
            text.bottomAnchor.constraint(lessThanOrEqualTo: row.bottomAnchor, constant: -6),
            controls.leadingAnchor.constraint(greaterThanOrEqualTo: text.trailingAnchor, constant: 10),
            controls.trailingAnchor.constraint(equalTo: row.trailingAnchor, constant: -8),
            controls.centerYAnchor.constraint(equalTo: row.centerYAnchor),
            text.trailingAnchor.constraint(lessThanOrEqualTo: row.trailingAnchor, constant: -8),
        ]
        // Under 640pt the row wraps: the controls under the words, 36pt in.
        narrowConstraints = [
            tile.centerYAnchor.constraint(equalTo: text.centerYAnchor),
            text.topAnchor.constraint(equalTo: row.topAnchor, constant: 6),
            text.trailingAnchor.constraint(equalTo: row.trailingAnchor, constant: -8),
            controls.topAnchor.constraint(equalTo: text.bottomAnchor, constant: 10),
            controls.leadingAnchor.constraint(equalTo: row.leadingAnchor, constant: 8 + 36),
            controls.trailingAnchor.constraint(lessThanOrEqualTo: row.trailingAnchor, constant: -8),
            controls.bottomAnchor.constraint(equalTo: row.bottomAnchor, constant: -6),
        ]

        // What the last action came to: its mark (a spinner, the warning, the check) and its words.
        noteMark.setContentHuggingPriority(.required, for: .horizontal)
        noteText.wrap = .pretty
        noteRow.spacing = 6
        noteRow.alignment = .firstBaseline
        noteRow.addArrangedSubview(noteMark)
        noteRow.addArrangedSubview(noteText)
        noteRow.isHidden = true
        belowSlot.axis = .vertical
        belowSlot.spacing = 6
        below.axis = .vertical
        below.spacing = 6
        below.isLayoutMarginsRelativeArrangement = true
        below.addArrangedSubview(noteRow)
        below.addArrangedSubview(belowSlot)
        below.isHidden = true
        addArrangedSubview(row)
        addArrangedSubview(below)
        arrange()
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("ConfigRow is built in code")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        arrange()
    }

    /// The row's shape for the window: wrapped under 640pt.
    private func arrange() {
        let now = (window?.bounds.width ?? UIScreen.main.bounds.width) < 640
        guard now != narrow else { return }
        narrow = now
        NSLayoutConstraint.deactivate(now ? wideConstraints : narrowConstraints)
        NSLayoutConstraint.activate(now ? narrowConstraints : wideConstraints)
        // `padding: 0 8px 6px 44px`; wrapped, 8 in.
        below.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: now ? 8 : 44, bottom: 6, trailing: 8)
    }

    /// The row as it stands now.
    /// - `glyph`/`hue`: the tile's icon and ink; `mark` replaces it (a harness's logo, a provider's mark).
    /// - `meta`: the second line; nil for a one-line row.
    /// - `enabled`: the switch's side, nil for a row with none.
    func show(name words: String, meta line: String?, glyph: Glyph? = nil, hue: UIColor? = nil, mark: UIView? = nil, mono: Bool = false,
              enabled: Bool? = nil, toggling: Bool = false, actions: [RowAction] = [], lead: [UIMenuElement] = [], note: RowNote? = nil) {
        name.text = words
        name.font = mono ? TypeScale.typeCode.font.withSize(TypeScale.typeLabel.font.pointSize) : TypeScale.typeLabel.font
        meta.text = line
        meta.isHidden = line == nil
        // `.row.two`: a row with a meta line stands 56pt.
        height.constant = line == nil ? 44 : 56
        if mark !== tileMark {
            tileMark?.removeFromSuperview()
            tileMark = mark
            if let mark {
                mark.translatesAutoresizingMaskIntoConstraints = false
                tile.addSubview(mark)
                NSLayoutConstraint.activate([mark.centerXAnchor.constraint(equalTo: tile.centerXAnchor), mark.centerYAnchor.constraint(equalTo: tile.centerYAnchor)])
            }
        }
        tileGlyph.isHidden = mark != nil || glyph == nil
        tileGlyph.glyph = glyph
        tileGlyph.tintColor = hue ?? Palette.inkMuted
        // `.off .text { opacity: .55 }`.
        let off = enabled == false
        if text.alpha != (off ? 0.55 : 1) {
            Motion.easeOut.animator(window == nil ? 0 : Motion.durPanel) { self.text.alpha = off ? 0.55 : 1 }.startAnimation()
        }
        toggle.isHidden = enabled == nil || onToggle == nil
        if let enabled, toggle.isOn != enabled { toggle.setOn(enabled, animated: window != nil) }
        toggle.isEnabled = !toggling
        toggle.accessibilityLabel = "\(enabled == true ? "Turn off" : "Turn on") \(words)"
        // The ⋯ keeps its place; its menu is the actions as they stand, `lead` (a submenu of its own) first.
        if actions.isEmpty, lead.isEmpty {
            menu?.removeFromSuperview()
            menu = nil
        } else {
            menuItems = lead + rowMenuItems(actions)
            if menu == nil {
                let made = KitGhostButton(.more, label: Words.Configure.moreFor(label: words))
                made.showsMenuAsPrimaryAction = true
                made.menuOnOpen { [weak self] in self?.menuItems ?? [] }
                controls.addArrangedSubview(made)
                menu = made
            }
            menu?.accessibilityLabel = Words.Configure.moreFor(label: words)
        }
        opener.accessibilityLabel = [words, line].compactMap(\.self).joined(separator: ", ")
        showNote(note)
        drawBelow()
    }

    /// The badge after the name.
    func setBadge(_ view: UIView?) { swap(badgeSlot, to: view.map { [$0] } ?? []) }
    /// Where the row has landed (its RolloutChip).
    func setRollout(_ view: UIView?) { swap(rolloutSlot, to: view.map { [$0] } ?? []) }
    /// The row's own controls, before its ⋯.
    func setTrailing(_ views: [UIView]) { swap(trailingSlot, to: views) }
    /// What the row opens in place and its faults, under it.
    func setBelow(_ views: [UIView]) {
        swap(belowSlot, to: views)
        drawBelow()
    }

    private func swap(_ stack: UIStackView, to views: [UIView]) {
        guard stack.arrangedSubviews != views else { return }
        stack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        views.forEach(stack.addArrangedSubview)
        stack.isHidden = views.isEmpty
    }

    private var shownNote: RowNote?

    private func showNote(_ note: RowNote?) {
        guard note != shownNote else { return }
        shownNote = note
        noteRow.isHidden = note == nil
        guard let note else { return }
        noteText.text = note.text
        noteText.ink = note.tone == .fail ? Palette.statusFailInk : Palette.inkMuted
        noteRow.accessibilityTraits = note.tone == .fail ? .staticText : .updatesFrequently
        let mark: UIView = switch note.tone {
        case .busy: KitSpinner(side: 12)
        case .fail: GlyphView(.warning, size: 12, tint: Palette.statusFailInk)
        case .done: GlyphView(.check, size: 12, tint: Palette.inkMuted)
        }
        noteMark.arrangedSubviews.forEach { $0.removeFromSuperview() }
        noteMark.addArrangedSubview(mark)
        if note.tone == .fail { UIAccessibility.post(notification: .announcement, argument: note.text) }
    }

    private func drawBelow() {
        below.isHidden = noteRow.isHidden && belowSlot.arrangedSubviews.isEmpty
    }

    /// A row just added or changed by this screen: it comes up from faint (`row-flash`).
    func flash() {
        guard !UIAccessibility.isReduceMotionEnabled else { return }
        alpha = 0.35
        Motion.easeOut.animator(Motion.durFade * 3) { self.alpha = 1 }.startAnimation()
    }
}

extension UIView {
    /// `max-width: 72ch`: the house measure, in the type's own `0`.
    func holdMeasure(_ role: TypeRole) {
        let zero = ("0" as NSString).size(withAttributes: [.font: role.font]).width
        widthAnchor.constraint(lessThanOrEqualToConstant: zero * 72).isActive = true
    }
}

/// A list's rows by key, each kept for as long as its key is listed: a
/// refresh changes the rows in place, adds a new one, and lets one that left go.
@MainActor
final class KeyedRows {
    private(set) var rows: [String: ConfigRow] = [:]

    /// The row for `key`, made the first time it is asked for.
    func row(_ key: String) -> ConfigRow {
        if let kept = rows[key] { return kept }
        let made = ConfigRow()
        rows[key] = made
        return made
    }

    /// The rows for these keys, in order, each made if it is new; the rest let go.
    func keep(_ keys: [String]) -> [ConfigRow] {
        let listed = Set(keys)
        rows = rows.filter { listed.contains($0.key) }
        return keys.map(row)
    }
}
