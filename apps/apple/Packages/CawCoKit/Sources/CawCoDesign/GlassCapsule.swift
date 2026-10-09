import UIKit

/// A floating control's glass (DESIGN.md, Materials; Apple HIG, Materials:
/// Liquid Glass "forms a distinct functional layer for controls and
/// navigation" over the content, which scrolls beneath it). From iOS 26 it is
/// the system's Liquid Glass, regular, interactive; before it, the house's
/// panel material, as the composer wears it: an ultra-thin blur under the
/// raised surface at 72%, with a hairline. Under Reduce Transparency or
/// Increase Contrast it is the solid raised surface with the control's
/// border (HIG: respect those settings), and it follows them live. A capsule
/// whatever its size; what stands on it is the caller's, added to `content`.
public final class GlassCapsule: UIView {
    /// Where the capsule's controls go: over the glass, never inside its effect.
    public let content = UIView()
    private let glass: UIVisualEffectView
    private let tint = UIView()
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
        let edge = solid ? Palette.borderControl : Palette.borderHairline
        layer.borderColor = edge.resolvedColor(with: traits).cgColor
    }

    /// Round at the leading corners only, square at the trailing two: Caw's
    /// own glass on the phone bar (Shell.svelte, the phone's one row).
    public var squaredTrailing = false {
        didSet { if squaredTrailing != oldValue { setNeedsLayout() } }
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
    }
}
