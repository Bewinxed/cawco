import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// What to ask Caw (CawStarters.svelte; The Empty Starts Work Rule): the
/// project's starters, each a sentence the person would say to him with
/// the glyph for its kind of work, in the hub's order. Each is the kit's
/// option chip (`.kit-chip` in a `.kit-chips` row, wrapping whole chips); a
/// press hands its sentence to `onPick`, which puts it in his field with
/// the caret after it: nothing is sent.
final class CawStartersView: UIView {
    init(_ starters: [Components.Schemas.ProjectStarter], onPick: @escaping (String) -> Void) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        let chips = starters.map { starter in
            let chip = StarterChip(glyph: Self.glyph(starter.glyph), text: starter.text)
            chip.addAction(UIAction { _ in onPick(starter.text) }, for: .primaryActionTriggered)
            return chip as UIView
        }
        // Under a finger the rows stand 16pt apart, so each chip's touch area meets its neighbour's.
        let rows = WrapLayout(chips, gap: Space.space2, rowGap: Space.space2 * 2)
        rows.translatesAutoresizingMaskIntoConstraints = false
        addSubview(rows)
        NSLayoutConstraint.activate([
            rows.topAnchor.constraint(equalTo: topAnchor),
            rows.bottomAnchor.constraint(equalTo: bottomAnchor),
            rows.leadingAnchor.constraint(equalTo: leadingAnchor),
            rows.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
        accessibilityLabel = "Things to ask Caw"
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("CawStartersView is built in code")
    }

    /// Each kind of work a starter names (StarterCards.svelte `GLYPHS`).
    static func glyph(_ kind: Components.Schemas.StarterGlyph) -> Glyph {
        switch kind {
        case .brief: .document
        case .bug: .bug
        case .calendar: .calendar
        case .draft: .pen
        case .explore: .dataLayers
        case .grill: .ask
        case .ideas: .stars
        case .mail: Glyph.send
        case .palette: .palette
        case .people: .user
        case .refresh: .refresh
        case .reply: .chat
        case .rocket: .rocket
        case .routine: .clock
        case .screen: .window
        case .search: .search
        case .site: .globe
        case .stages: .columns
        case .system: .rulerPen
        case .tasks: .toolTodo
        case .triage: .sort
        case .voice: .mic
        case .unrecognized: .sparkles
        }
    }
}

/// `.kit-chip`: at least 30pt, `space-1` by `space-3` in, the control edge,
/// `radius-sm`, raised, its words strong at label size, its 16pt glyph in
/// their ink `space-2` before them; a press tints it.
private final class StarterChip: UIControl {
    private let words = KitLabel(TypeScale.typeLabel.with(weight: TypeScale.weightStrong), ink: Palette.inkStrong, lines: 0)

    init(glyph: Glyph, text: String) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        words.text = text
        let row = UIStackView(arrangedSubviews: [GlyphView(glyph, size: Size.iconMd, tint: Palette.inkStrong), words])
        row.spacing = Space.space2
        row.alignment = .center
        row.isUserInteractionEnabled = false
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            row.topAnchor.constraint(equalTo: topAnchor, constant: Space.space1 + 1),
            row.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space1 - 1),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space3 + 1),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space3 - 1),
            heightAnchor.constraint(greaterThanOrEqualToConstant: 30),
        ])
        isAccessibilityElement = true
        accessibilityLabel = text
        accessibilityTraits = .button
        addInteraction(UIPointerInteraction(delegate: nil))
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (chip: StarterChip, _: UITraitCollection) in chip.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("StarterChip is built in code")
    }

    override var isHighlighted: Bool {
        didSet { paint() }
    }

    // Its 44pt touch reaches 7pt past its 30pt face, top and bottom.
    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        bounds.insetBy(dx: 0, dy: min(0, (bounds.height - Size.cBtnHLg) / 2)).contains(point)
    }

    private func paint() {
        layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
        backgroundColor = isHighlighted ? Palette.surfaceHover : Palette.surfaceRaised
    }
}

/// Caw standing at 80 over an empty tab (the empty state's `mark`): his
/// seat, which opens his panel and whose face its holder keeps current;
/// his starters under the words.
@MainActor
enum CawEmpty {
    static func state(seat: ProjectCawSeat, title: String, line: String,
                      starters: [Components.Schemas.ProjectStarter],
                      openCaw: @escaping (UIView, String?) -> Void) -> KitEmptyState {
        seat.removeFromSuperview()
        // One press, one panel: the seat is handed to each new state, its old action replaced.
        let opens = UIAction.Identifier("caw-empty.open")
        seat.removeAction(identifiedBy: opens, for: .touchUpInside)
        seat.addAction(UIAction(identifier: opens) { [weak seat] _ in if let seat { openCaw(seat, nil) } }, for: .touchUpInside)
        let chips = starters.isEmpty ? nil : CawStartersView(starters) { [weak seat] text in if let seat { openCaw(seat, text) } }
        // `.caw-80 { margin-block-end: space-3 }` past the column's own gap.
        let state = KitEmptyState(mark: seat, after: Space.space2 + Space.space3, title: title, line: line,
                                  action: chips, stretchAction: true)
        // `.caw-empty { max-inline-size: 36rem }`.
        let measure = state.widthAnchor.constraint(lessThanOrEqualToConstant: 576)
        measure.isActive = true
        return state
    }
}
