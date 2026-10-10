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
    /// One shape with a card hanging from it (`HangCard`): see `joined`.
    private let join = GlassJoin()
    /// How far the glass's leading foot flares out into a hanging card's top
    /// edge while joined (Shell.svelte `--flare`): the card's own corner radius.
    public var flare = Radius.radiusLg {
        didSet { setNeedsLayout() }
    }
    /// How far below its foot a hanging card stands (Caw's glass on the
    /// phone, its foot clear of the row's floor the panel hangs from): while
    /// joined, the join runs straight on down that far at the glass's width,
    /// in the card's surface, and flares out at the end. Zero where the card
    /// stands on the foot itself.
    public var neck = 0.0 {
        didSet { setNeedsLayout() }
    }

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
        insertSubview(join, belowSubview: content)
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
        // Joined, the hanging card's edge is the glass's: its own gives way.
        layer.borderColor = joined ? UIColor.clear.cgColor : edge
        tuckedEdge.strokeColor = edge
        tuckedEdge.opacity = joined ? 0 : 1
        join.paint(traits)
    }

    /// A card hangs from the glass (`HangCard`; Shell.svelte `.join`): the
    /// glass is one shape with it. Its top corners keep the glass's round, its
    /// trailing flank runs straight down into the card's side, its leading
    /// foot flares out by `flare` into the card's top edge, and its foot is no
    /// edge at all. It takes the card's material, `surfaceRaised` with the
    /// `borderControl` edge over its top, down its flanks and up the flare,
    /// fading in over `durPop` as the card grows and out over `durExit` as it
    /// folds, on `easeOut`; the glass's own edge gives way on the same clock.
    public private(set) var joined = false

    public func setJoined(_ on: Bool) {
        guard on != joined else { return }
        joined = on
        let duration = on ? Motion.durPop : Motion.durExit
        let fromBorder = layer.presentation()?.borderColor ?? layer.borderColor
        let fromEdge = tuckedEdge.presentation()?.opacity ?? tuckedEdge.opacity
        paint()
        let fades: [(target: CALayer, key: String, from: Any?)] = [(layer, "borderColor", fromBorder), (tuckedEdge, "opacity", fromEdge)]
        for (target, key, from) in fades {
            let fade = CABasicAnimation(keyPath: key)
            fade.fromValue = from
            fade.duration = duration
            fade.timingFunction = Motion.easeOut.function
            target.add(fade, forKey: key)
        }
        Motion.easeOut.animator(duration) { self.join.alpha = on ? 1 : 0 }.startAnimation()
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
        // One flare wider than the glass on its leading side, down past its
        // foot by the neck, and a point further into the card's top edge
        // (Shell.svelte `.join`).
        join.frame = CGRect(x: -flare, y: 0, width: bounds.width + flare, height: bounds.height + neck + 1)
        join.shape(flare: flare, top: radius, squaredTrailing: squaredTrailing)
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

/// The glass's foot while a card hangs from it (Shell.svelte `.join`): an
/// outline in the card's edge ink, and the card's surface a point inside it,
/// so the edge runs up the flare, both flanks and over the top, and nothing
/// crosses the foot. Its box is one flare wider than the glass on the
/// leading side and a point taller, reaching into the card's top edge.
private final class GlassJoin: UIView {
    private let outline = CAShapeLayer()
    private let surface = CAShapeLayer()

    init() {
        super.init(frame: .zero)
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        alpha = 0
        for part in [outline, surface] {
            part.actions = ["path": NSNull(), "bounds": NSNull(), "position": NSNull()]
            layer.addSublayer(part)
        }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("GlassJoin is built in code")
    }

    func paint(_ traits: UITraitCollection) {
        outline.fillColor = Palette.borderControl.resolvedColor(with: traits).cgColor
        surface.fillColor = Palette.surfaceRaised.resolvedColor(with: traits).cgColor
    }

    /// `flare`: the leading foot's flare; `top`: the glass's top corners'
    /// radius; `squaredTrailing`: a glass tucked into the screen's edge, its
    /// trailing side square and open.
    func shape(flare f: Double, top r: Double, squaredTrailing: Bool) {
        let w = bounds.width
        let full = bounds.height
        let h = full - 1
        // Room for the flare and the round corners: one on a squared glass
        // (the phone's tab, exactly the flare and one corner wide), two on a pill.
        guard w >= f + (squaredTrailing ? r : 2 * r), h >= max(f, r) else { return }
        outline.frame = bounds
        surface.frame = bounds
        // The outline: up the flare's concave curve, round the glass's
        // leading top corner, along its top, down its trailing side, and back
        // along the point under its foot.
        let edge = UIBezierPath()
        edge.move(to: CGPoint(x: 0, y: h))
        edge.addArc(withCenter: CGPoint(x: 0, y: h - f), radius: f, startAngle: .pi / 2, endAngle: 0, clockwise: false)
        edge.addLine(to: CGPoint(x: f, y: r))
        edge.addArc(withCenter: CGPoint(x: f + r, y: r), radius: r, startAngle: .pi, endAngle: 3 * .pi / 2, clockwise: true)
        if squaredTrailing {
            edge.addLine(to: CGPoint(x: w, y: 0))
        } else {
            edge.addLine(to: CGPoint(x: w - r, y: 0))
            edge.addArc(withCenter: CGPoint(x: w - r, y: r), radius: r, startAngle: 3 * .pi / 2, endAngle: 0, clockwise: true)
        }
        edge.addLine(to: CGPoint(x: w, y: full))
        edge.addLine(to: CGPoint(x: 0, y: full))
        edge.close()
        outline.path = edge.cgPath
        // The surface a point inside it on the flare, the top and a drawn
        // trailing side; a squared side meets the screen's edge with none.
        let fill = UIBezierPath()
        fill.move(to: CGPoint(x: 0, y: full))
        fill.addArc(withCenter: CGPoint(x: 0, y: h - f), radius: f + 1, startAngle: .pi / 2, endAngle: 0, clockwise: false)
        fill.addLine(to: CGPoint(x: f + 1, y: r))
        fill.addArc(withCenter: CGPoint(x: f + r, y: r), radius: r - 1, startAngle: .pi, endAngle: 3 * .pi / 2, clockwise: true)
        if squaredTrailing {
            fill.addLine(to: CGPoint(x: w, y: 1))
            fill.addLine(to: CGPoint(x: w, y: full))
        } else {
            fill.addLine(to: CGPoint(x: w - r, y: 1))
            fill.addArc(withCenter: CGPoint(x: w - r, y: r), radius: r - 1, startAngle: 3 * .pi / 2, endAngle: 0, clockwise: true)
            fill.addLine(to: CGPoint(x: w - 1, y: full))
        }
        fill.close()
        surface.path = fill.cgPath
    }
}
