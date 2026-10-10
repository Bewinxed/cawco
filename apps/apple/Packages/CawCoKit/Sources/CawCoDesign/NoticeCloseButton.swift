import UIKit

/// A notice's ✕ (DESIGN.md, Update notice; the dashboard's NoticeRow `.x`):
/// a 20pt pill chip on the raised surface in the control edge with the tile
/// shadow, a 12pt close glyph in muted ink. It is the one way a notice
/// leaves, so touch always sees it, and its hit target is the HIG's 44pt
/// around the chip (`Size.cBtnHLg`).
public final class NoticeCloseButton: UIButton {
    public init(label: String, action: @escaping @MainActor () -> Void) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        var config = UIButton.Configuration.plain()
        config.image = Glyph.close.image.resized(to: Size.iconSm)
        config.contentInsets = .zero
        configuration = config
        tintColor = Palette.inkMuted
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Size.cBadgeH / 2
        layer.borderWidth = 1
        boxShadow = Shadow.shadowTile
        accessibilityLabel = label
        accessibilityIdentifier = "notice-dismiss"
        addAction(UIAction { _ in action() }, for: .touchUpInside)
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: Size.cBadgeH),
            heightAnchor.constraint(equalToConstant: Size.cBadgeH),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (button: NoticeCloseButton, _: UITraitCollection) in button.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("NoticeCloseButton is built in code")
    }

    private func paint() {
        layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
    }

    /// The 44pt target the chip stands in the middle of.
    public static let hitSide = Size.cBtnHLg

    override public func point(inside point: CGPoint, with _: UIEvent?) -> Bool {
        let grow = (Self.hitSide - bounds.width) / 2
        return bounds.insetBy(dx: -grow, dy: -grow).contains(point)
    }
}
