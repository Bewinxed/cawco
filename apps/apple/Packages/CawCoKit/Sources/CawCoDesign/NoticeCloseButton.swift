import UIKit

/// A notice's ✕ (DESIGN.md, Caw's panel; the dashboard's NoticeRow `.x`): a
/// 24pt ghost round a 12pt close glyph in muted ink, always shown. Under a
/// pointer it takes `surface-hover` and `ink-strong`; a press dips it to
/// `pressScale`. It stands in its row's first line's trailing cell, its box
/// hung past the trailing edge by `inkInset` so its stroke ends on that edge,
/// and its 44pt touch area (`Size.cBtnHLg`) moves back inboard by the same
/// amount, so it never reaches past the row's own `space3`.
public final class NoticeCloseButton: UIButton {
    /// Its box's side.
    public static let side = 24.0
    /// How far inside its box the glyph's ink stops: the box's padding round
    /// the 12pt glyph plus the glyph's side bearing (Close: its stroke ends at
    /// 18.75 of 24). NoticeRow.svelte `--x-ink`.
    public static let inkInset = (side - Size.iconSm) / 2 + Size.iconSm * 5.25 / 24
    /// The 44pt target round it.
    public static let hitSide = Size.cBtnHLg

    private var hovering = false

    public init(label: String, action: @escaping @MainActor () -> Void) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        var config = UIButton.Configuration.plain()
        config.image = Glyph.close.image.resized(to: Size.iconSm)
        config.contentInsets = .zero
        config.background.backgroundColor = .clear
        config.background.cornerRadius = Radius.radiusXs
        configuration = config
        configurationUpdateHandler = { button in
            guard let button = button as? NoticeCloseButton else { return }
            button.paint()
            let scale = button.isHighlighted && !UIAccessibility.isReduceMotionEnabled ? Motion.pressScale : 1
            Motion.easeOut.animator(Motion.durToggle) {
                button.transform = CGAffineTransform(scaleX: scale, y: scale)
            }.startAnimation()
        }
        houseStyle()
        pointerStyleProvider = { button, _, _ in
            UIPointerStyle(effect: .highlight(UITargetedPreview(view: button)), shape: .roundedRect(button.bounds, radius: Radius.radiusXs))
        }
        addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
        accessibilityLabel = label
        accessibilityIdentifier = "notice-dismiss"
        addAction(UIAction { _ in action() }, for: .touchUpInside)
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: Self.side),
            heightAnchor.constraint(equalToConstant: Self.side),
        ])
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("NoticeCloseButton is built in code")
    }

    @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
        hovering = hover.state == .began || hover.state == .changed
        Motion.easeOut.animator(Motion.durControl) { self.paint() }.startAnimation()
    }

    private func paint() {
        configuration?.background.backgroundColor = hovering ? Palette.surfaceHover : .clear
        tintColor = hovering ? Palette.inkStrong : Palette.inkMuted
    }

    /// The 44pt target, centred where the box stood before it hung: moved
    /// back inboard by `inkInset` (NoticeRow.svelte, `.x::after` under a coarse pointer).
    public var hitBox: CGRect {
        let grow = (Self.hitSide - Self.side) / 2
        let inboard = effectiveUserInterfaceLayoutDirection == .rightToLeft ? Self.inkInset : -Self.inkInset
        return bounds.insetBy(dx: -grow, dy: -grow).offsetBy(dx: inboard, dy: 0)
    }

    override public func point(inside point: CGPoint, with _: UIEvent?) -> Bool {
        hitBox.contains(point)
    }
}
