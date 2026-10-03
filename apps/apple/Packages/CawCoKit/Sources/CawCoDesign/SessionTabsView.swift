import UIKit

/// The session's folder tab on its shelf (workspace/PaneTabs.svelte, a
/// phone's strip): a 40pt row on `surface-shelf`, 14pt in, and the open
/// session as a chosen folder tab at most 200pt wide, 32pt tall, its sheet
/// in the transcript's own surface so it opens into it. The tab leads with
/// the session's status glyph and its title in the label role, then the
/// details chevron (22×24, a 12pt glyph) and the close (20×20, 16pt), set
/// apart for a finger (24pt before the close, 8pt after it).
@MainActor
public final class SessionTabsView: UIView {
    public static let height = 40.0
    static let item = Space.space8
    static let px = 10.0
    static let maxTab = 200.0

    public let status = SessionStatusView(.idle, compact: true)
    private let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let tab = UIView()
    private let sheet = CAShapeLayer()
    public let details = UIButton(type: .custom)
    public let close = UIButton(type: .custom)
    public var onDetails: () -> Void = {}
    public var onClose: () -> Void = {}

    override public init(frame: CGRect) {
        super.init(frame: frame)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceShelf
        tab.translatesAutoresizingMaskIntoConstraints = false
        tab.layer.addSublayer(sheet)
        addSubview(tab)

        title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        title.isAccessibilityElement = false
        Self.dress(details, glyph: .chevronDown, side: 12, size: CGSize(width: 22, height: 24))
        details.accessibilityLabel = "Session details"
        details.addAction(UIAction { [weak self] _ in self?.onDetails() }, for: .primaryActionTriggered)
        Self.dress(close, glyph: .close, side: Size.iconMd, size: CGSize(width: 20, height: 20))
        close.addAction(UIAction { [weak self] _ in self?.onClose() }, for: .primaryActionTriggered)

        // The hit: 10pt in, the glyph 6pt off the label (`--gap` + 4).
        let hit = UIStackView(arrangedSubviews: [status, title])
        hit.spacing = 6
        hit.alignment = .center
        let row = UIStackView(arrangedSubviews: [hit, details, close])
        row.alignment = .center
        row.setCustomSpacing(24, after: details)
        row.translatesAutoresizingMaskIntoConstraints = false
        tab.addSubview(row)
        // The track keeps the sheet's flare inside it (`padding-inline: var(--flare)`).
        let flare = FolderTabs.flare
        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: Self.height),
            tab.leadingAnchor.constraint(equalTo: safeAreaLayoutGuide.leadingAnchor, constant: Space.space4 + flare),
            tab.trailingAnchor.constraint(lessThanOrEqualTo: safeAreaLayoutGuide.trailingAnchor, constant: -(Space.space4 + flare)),
            tab.bottomAnchor.constraint(equalTo: bottomAnchor),
            tab.heightAnchor.constraint(equalToConstant: Self.item),
            tab.widthAnchor.constraint(lessThanOrEqualToConstant: Self.maxTab),
            row.leadingAnchor.constraint(equalTo: tab.leadingAnchor, constant: Self.px),
            // The box's end padding (`--px` − 6), and the close's own 8pt.
            row.trailingAnchor.constraint(equalTo: tab.trailingAnchor, constant: -(Self.px - 6) - 8),
            row.centerYAnchor.constraint(equalTo: tab.centerYAnchor),
        ])
        isAccessibilityElement = false
        accessibilityElements = [hit, details, close]
        hit.isAccessibilityElement = true
        hit.accessibilityTraits = [.button, .selected]
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: SessionTabsView, _: UITraitCollection) in
            view.paint()
        }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("SessionTabsView is built in code")
    }

    public func configure(title text: String, status face: SessionStatusView.Face) {
        title.text = text
        status.configure(face)
        close.accessibilityLabel = "Close \(text)"
        (title.superview as? UIStackView)?.accessibilityLabel = "\(text), \(face.label)"
    }

    private static func dress(_ button: UIButton, glyph: Glyph, side: Double, size: CGSize) {
        var config = UIButton.Configuration.plain()
        config.image = glyph.image.resized(to: side)
        config.imageColorTransformer = UIConfigurationColorTransformer { _ in Palette.inkMuted }
        config.contentInsets = .zero
        config.background.cornerRadius = Radius.radiusXs
        button.configuration = config
        button.houseStyle()
        button.translatesAutoresizingMaskIntoConstraints = false
        button.widthAnchor.constraint(equalToConstant: size.width).isActive = true
        button.heightAnchor.constraint(equalToConstant: size.height).isActive = true
        // A finger's 44pt reaches past the small box, into the gaps either side.
        button.pressScaling()
    }

    private func paint() {
        sheet.fillColor = Palette.surfaceRecess.resolvedColor(with: traitCollection).cgColor
    }

    override public func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        let flare = FolderTabs.flare
        sheet.frame = tab.bounds.insetBy(dx: -flare, dy: 0)
        sheet.path = FolderTabs.Cell.sheetPath(in: sheet.bounds, radius: Radius.radiusSm, flare: flare)
        CATransaction.commit()
    }

    /// The touch areas reach 44pt tall past the 40pt shelf.
    override public func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        bounds.insetBy(dx: 0, dy: -4).contains(point)
    }
}

extension UIButton {
    /// The tab controls' press: `pressScale` over `durControl`, none with
    /// Reduce Motion (PaneTabs.svelte `.tclose:active`).
    public func pressScaling() {
        configurationUpdateHandler = { button in
            let pressed = button.isHighlighted && !UIAccessibility.isReduceMotionEnabled
            let to = pressed ? Motion.pressScale : 1
            Motion.easeOut.animator(Motion.durControl) {
                button.transform = CGAffineTransform(scaleX: to, y: to)
            }.startAnimation()
        }
    }
}
