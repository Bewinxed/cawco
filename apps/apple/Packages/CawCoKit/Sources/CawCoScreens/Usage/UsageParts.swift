import CawCoCore
import CawCoDesign
import UIKit

// What the Usage page's three cards share (lib/cawco/usage/*.svelte `.card`,
// `.title`, `.note`, `.failed`).

/// A card of the page (`.card`): the raised surface at `--radius-lg` with the
/// tile's shadow, its parts `space-4` apart, padded `space-5` (`space-4` on a
/// phone).
class UsageCard: TileView {
    let column = UIStackView()
    private var edges: [NSLayoutConstraint] = []

    /// Under 640pt of window: the web's phone layout.
    var narrow = false {
        didSet {
            guard narrow != oldValue else { return }
            pad()
            layoutChanged()
        }
    }

    init(title: String) {
        super.init(radius: Radius.radiusLg)
        column.axis = .vertical
        column.spacing = Space.space4
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        edges = [
            column.topAnchor.constraint(equalTo: topAnchor),
            column.leadingAnchor.constraint(equalTo: leadingAnchor),
            trailingAnchor.constraint(equalTo: column.trailingAnchor),
            bottomAnchor.constraint(equalTo: column.bottomAnchor),
        ]
        NSLayoutConstraint.activate(edges)
        pad()
        accessibilityLabel = title
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("UsageCard is built in code")
    }

    private func pad() {
        for edge in edges { edge.constant = narrow ? Space.space4 : Space.space5 }
    }

    /// The card's width class changed: its parts lay out again.
    func layoutChanged() {}

    /// `.title`: the card's name, in muted label type.
    static func title(_ text: String) -> KitLabel {
        let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
        label.wrap = .balance
        label.text = text
        label.accessibilityTraits = .header
        return label
    }

    /// `.note`: a line of muted meta type.
    static func note(_ text: String) -> KitLabel {
        let label = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        label.wrap = .pretty
        label.text = text
        return label
    }

    /// `.failed`, `.page-error`: what could not be read, and Retry beside it.
    static func failed(_ text: String, retrying: Bool, retry: @escaping () -> Void) -> UIView {
        let note = note(text)
        note.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let button = KitButton.make(retrying ? "Retrying…" : "Retry", glyph: .refresh, variant: .outline, height: .sm, action: retry)
        button.isEnabled = !retrying
        button.configuration?.showsActivityIndicator = retrying
        let row = UIStackView(arrangedSubviews: [note, button, UIView()])
        row.spacing = Space.space3
        row.alignment = .center
        row.accessibilityTraits = .staticText
        return row
    }
}

extension UIColor {
    /// This colour drawn over `ground`, as one opaque colour: what a gap in a
    /// bar shows when its row carries a wash.
    func over(_ ground: UIColor) -> UIColor {
        UIColor { traits in
            var (tr, tg, tb, ta): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
            var (br, bg, bb, ba): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
            self.resolvedColor(with: traits).getRed(&tr, green: &tg, blue: &tb, alpha: &ta)
            ground.resolvedColor(with: traits).getRed(&br, green: &bg, blue: &bb, alpha: &ba)
            return UIColor(red: tr * ta + br * (1 - ta), green: tg * ta + bg * (1 - ta), blue: tb * ta + bb * (1 - ta), alpha: 1)
        }
    }
}
