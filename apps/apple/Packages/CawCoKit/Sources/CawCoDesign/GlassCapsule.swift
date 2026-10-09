import UIKit

/// A floating control's glass (DESIGN.md, Materials; Apple HIG, Materials:
/// Liquid Glass "forms a distinct functional layer for controls and
/// navigation" over the content, which scrolls beneath it). From iOS 26 it is
/// the system's Liquid Glass, regular, interactive; before it, the house's
/// panel material, as the composer wears it: an ultra-thin blur under the
/// raised surface at 72%, with a hairline. Under Reduce Transparency or
/// Increase Contrast it is the solid raised surface with an edge that holds
/// 3:1 (`borderContrast`; HIG: respect those settings), and it follows them
/// live. A capsule
/// whatever its size; what stands on it is the caller's, added to `content`.
public final class GlassCapsule: UIView {
    /// Where the capsule's controls go: over the glass, never inside its effect.
    public let content = UIView()
    private let glass: UIVisualEffectView
    private let tint = UIView()
    /// The edge of a glass tucked into the screen's edge (`squaredTrailing`):
    /// open on the trailing side, which meets the screen and draws nothing.
    private let tuckedEdge = CAShapeLayer()
    private let usesSystemGlass: Bool

    public init() {
        if #available(iOS 26.0, macCatalyst 26.0, *) {
            let effect = UIGlassEffect()
            effect.isInteractive = true
            glass = UIVisualEffectView(effect: effect)
            usesSystemGlass = true
        } else {
            glass = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterial))
            usesSystemGlass = false
        }
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerCurve = .continuous
        for part in [glass, tint, content] {
            part.translatesAutoresizingMaskIntoConstraints = false
            addSubview(part)
            NSLayoutConstraint.activate([
                part.leadingAnchor.constraint(equalTo: leadingAnchor),
                part.trailingAnchor.constraint(equalTo: trailingAnchor),
                part.topAnchor.constraint(equalTo: topAnchor),
                part.bottomAnchor.constraint(equalTo: bottomAnchor),
            ])
        }
        glass.isUserInteractionEnabled = false
        tint.isUserInteractionEnabled = false
        glass.clipsToBounds = true
        tint.clipsToBounds = true
        layer.borderWidth = 1
        tuckedEdge.fillColor = nil
        tuckedEdge.lineWidth = 1
        tuckedEdge.isHidden = true
        layer.addSublayer(tuckedEdge)
        boxShadow = Shadow.shadowTile
        for name in [UIAccessibility.reduceTransparencyStatusDidChangeNotification, UIAccessibility.darkerSystemColorsStatusDidChangeNotification] {
            NotificationCenter.default.addObserver(self, selector: #selector(settingsChanged), name: name, object: nil)
        }
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (capsule: GlassCapsule, _: UITraitCollection) in capsule.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("GlassCapsule is built in code")
    }

    /// The settings that call for a solid surface.
    private var solid: Bool {
        UIAccessibility.isReduceTransparencyEnabled || UIAccessibility.isDarkerSystemColorsEnabled
    }

    @objc private func settingsChanged() {
        paint()
    }

    private func paint() {
        let traits = traitCollection
        glass.isHidden = solid
        // The system glass is its own surface; the house blur takes the panel tint over it.
        tint.backgroundColor = solid ? Palette.surfaceRaised : (usesSystemGlass ? .clear : Palette.materialPanel)
        // Solid, its edge holds 3:1 against the bar and the surface it encloses.
        let edge = (solid ? Palette.borderContrast : Palette.borderHairline).resolvedColor(with: traits).cgColor
        layer.borderColor = edge
        tuckedEdge.strokeColor = edge
    }

    /// Round at the leading corners only, square at the trailing two, and no
    /// edge on the trailing side: Caw's own glass on the phone bar, tucked
    /// into the screen's edge (Shell.svelte, the phone's one row).
    public var squaredTrailing = false {
        didSet {
            guard squaredTrailing != oldValue else { return }
            layer.borderWidth = squaredTrailing ? 0 : 1
            tuckedEdge.isHidden = !squaredTrailing
            setNeedsLayout()
        }
    }

    override public func layoutSubviews() {
        super.layoutSubviews()
        let radius = min(bounds.width, bounds.height) / 2
        let corners: CACornerMask = squaredTrailing
            ? [.layerMinXMinYCorner, .layerMinXMaxYCorner]
            : [.layerMinXMinYCorner, .layerMaxXMinYCorner, .layerMinXMaxYCorner, .layerMaxXMaxYCorner]
        for part in [layer, tint.layer] {
            part.cornerRadius = radius
            part.maskedCorners = corners
        }
        // The system glass draws its own shape: it is told its corners.
        if #available(iOS 26.0, macCatalyst 26.0, *) {
            let round = UICornerRadius.fixed(radius)
            let trailing = squaredTrailing ? UICornerRadius.fixed(0) : round
            glass.cornerConfiguration = .corners(topLeftRadius: round, topRightRadius: trailing, bottomLeftRadius: round, bottomRightRadius: trailing)
        } else {
            glass.layer.cornerRadius = radius
            glass.layer.maskedCorners = corners
        }
        if squaredTrailing {
            // From the top of the trailing side, round the leading half
            // circle, to the bottom of the trailing side, half a point in.
            let inset = bounds.insetBy(dx: 0.5, dy: 0.5)
            let r = inset.height / 2
            let edge = UIBezierPath()
            edge.move(to: CGPoint(x: bounds.maxX, y: inset.minY))
            edge.addLine(to: CGPoint(x: inset.minX + r, y: inset.minY))
            edge.addArc(withCenter: CGPoint(x: inset.minX + r, y: inset.midY), radius: r, startAngle: 3 * .pi / 2, endAngle: .pi / 2, clockwise: false)
            edge.addLine(to: CGPoint(x: bounds.maxX, y: inset.maxY))
            tuckedEdge.frame = bounds
            tuckedEdge.path = edge.cgPath
        }
    }
}
