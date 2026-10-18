import UIKit

/// The one empty state (ui/empty, app.css `.kit-empty`): a 20pt duotone mark
/// in muted ink, a title in the title role, one plain line saying why, held
/// to a readable measure, and at most one next action. It claims there is
/// nothing to show, so it is put up only once the data is known to be empty.
public final class KitEmptyState: UIStackView {
    public convenience init(icon: Glyph, title: String, line: String, action: UIView? = nil) {
        self.init(mark: GlyphView(icon, size: 20, tint: Palette.inkMuted), after: Space.space2 + Space.space1,
                  title: title, line: line, action: action)
    }

    /// The same state with a mark of its own in the glyph's place (the
    /// empty state's `mark` snippet: Caw standing at 80 over an empty
    /// tab), `after` it: the room before the title.
    public init(mark: UIView, after: Double, title: String, line: String, action: UIView? = nil, stretchAction: Bool = false) {
        super.init(frame: .zero)
        axis = .vertical
        alignment = .leading
        spacing = Space.space2
        isLayoutMarginsRelativeArrangement = true
        directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space6, leading: 0, bottom: Space.space6, trailing: 0)
        let heading = KitLabel(TypeScale.typeTitle, ink: Palette.inkStrong, lines: 0)
        heading.text = title
        heading.wrap = .balance
        heading.accessibilityTraits = .header
        let why = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
        why.text = line
        why.wrap = .pretty
        // `60ch`: sixty of the body face's zeros.
        let zero = ("0" as NSString).size(withAttributes: [.font: TypeScale.typeBody.font]).width
        why.widthAnchor.constraint(lessThanOrEqualToConstant: zero * 60).isActive = true
        addArrangedSubview(mark)
        setCustomSpacing(after, after: mark)
        addArrangedSubview(heading)
        addArrangedSubview(why)
        if let action {
            setCustomSpacing(Space.space2 * 2, after: why)
            addArrangedSubview(action)
            // `.kit-empty-action { align-self: stretch }` where starters fill the column.
            if stretchAction { action.widthAnchor.constraint(equalTo: widthAnchor).isActive = true }
        }
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("KitEmptyState is built in code")
    }
}
