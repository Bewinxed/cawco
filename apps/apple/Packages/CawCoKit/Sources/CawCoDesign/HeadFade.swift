import UIKit

/// A transcript's head going out of focus under the tab strip (HeadFade.svelte):
/// rows scrolled up past the transcript's top edge blur progressively toward
/// it, up to `Size.cHeadFadeBlur` at the edge over `Size.cHeadFade`, so they
/// never meet the tab's rim edge-on. A blur, not a colour: nothing is painted
/// over the rows but the material's own trace at a fraction of its strength.
///
/// A progressive blur is a stack of uniform ones, each masked to its slice
/// of the band, the radius doubling layer by layer toward the edge (the web's
/// four `backdrop-filter` layers). UIKit has no public blur radius: each
/// layer is a `UIVisualEffectView` whose effect is held part-way by a paused
/// `UIViewPropertyAnimator` on a linear curve, the public way to a partial
/// blur.
///
/// Scrolled to the very top there is nothing under it and it is clear; it
/// comes in over the first `Size.cHeadFade` of scroll, read off the offset past
/// the adjusted inset as `EdgeFade` reads it. The fade-in is the masks' alpha,
/// never the views': a visual effect view, or any view over one, below full
/// alpha draws its effect wrong. Under Reduce Transparency the system draws a
/// blur as an opaque fill, so the band does not show at all.
@MainActor
public final class HeadFade: UIView {
    /// Its height, for the host pinning it to the transcript's top edge.
    public static let height = Size.cHeadFade

    /// The slices, bounded at inOutCubic(j / 5), j = 0…5, read from the band's
    /// sharp end up to the edge: 0, 3.2, 25.6, 74.4, 96.8, 100% (the stops of
    /// jh3y's easing gradients). Layer k fades in over [q(k), q(k+1)], holds to
    /// q(k+2) and fades out by q(k+3); the strongest holds to the edge.
    /// HeadFade.svelte carries the same slices.
    static let recipe: [(radius: Double, stops: [(at: Double, alpha: Double)])] = [
        (Size.cHeadFadeBlur / 8, [(0, 0), (0.032, 1), (0.256, 1), (0.744, 0)]),
        (Size.cHeadFadeBlur / 4, [(0.032, 0), (0.256, 1), (0.744, 1), (0.968, 0)]),
        (Size.cHeadFadeBlur / 2, [(0.256, 0), (0.744, 1), (0.968, 1), (1, 0)]),
        (Size.cHeadFadeBlur, [(0.744, 0), (0.968, 1), (1, 1)]),
    ]

    private weak var scroll: UIScrollView?
    private let slices: [Slice]
    private var watching: [NSKeyValueObservation] = []

    public init(_ scroll: UIScrollView) {
        self.scroll = scroll
        slices = Self.recipe.map { Slice(radius: $0.radius, stops: $0.stops) }
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        isUserInteractionEnabled = false
        // Weakest first: each stronger layer blurs what the ones under it drew.
        for slice in slices {
            slice.frame = bounds
            slice.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            addSubview(slice)
        }
        // The offset and the box each move what sits under the edge.
        watching = [
            scroll.observe(\.contentOffset) { [weak self] _, _ in MainActor.assumeIsolated { self?.follow() } },
            scroll.observe(\.bounds) { [weak self] _, _ in MainActor.assumeIsolated { self?.follow() } },
        ]
        NotificationCenter.default.addObserver(self, selector: #selector(transparencyChanged),
                                               name: UIAccessibility.reduceTransparencyStatusDidChangeNotification, object: nil)
        isHidden = UIAccessibility.isReduceTransparencyEnabled
        follow()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("HeadFade is built in code") }

    private func follow() {
        guard let scroll else { return }
        let under = scroll.contentOffset.y + scroll.adjustedContentInset.top
        let shown = min(1, max(0, under / Size.cHeadFade))
        for slice in slices {
            slice.shown = shown
        }
    }

    @objc private func transparencyChanged() {
        isHidden = UIAccessibility.isReduceTransparencyEnabled
    }

    /// One slice: a blur held at `radius`, masked to its stops.
    private final class Slice: UIVisualEffectView {
        /// The material whose blur each slice holds part-way: the kit's
        /// thinnest (ComposerView's), so the little of its tint that comes
        /// with the fraction is the least. UIKit publishes no radius for it;
        /// measured, it is about 30pt (stackoverflow.com/questions/63428367:
        /// "The ultra thin material blur option seems to use a blur radius of
        /// around 30"), so the fraction that gives `radius` is
        /// `radius / fullRadius`. The Mac capture (artifacts/head-fade/
        /// mac-capture.sh) sets it beside the web's 4px edge.
        private static let material = UIBlurEffect.Style.systemUltraThinMaterial
        private static let fullRadius = 30.0

        private let fraction: Double
        private let stops: [(at: Double, alpha: Double)]
        private let gradient = CAGradientLayer()
        private let sliceMask = UIView()
        private var hold: UIViewPropertyAnimator?

        /// How far the band has come in, 0…1: the mask's alpha.
        var shown = 0.0 {
            didSet {
                if shown != oldValue { paintMask() }
            }
        }

        init(radius: Double, stops: [(at: Double, alpha: Double)]) {
            fraction = radius / Self.fullRadius
            self.stops = stops
            super.init(effect: nil)
            isUserInteractionEnabled = false
            // The stops run from the band's sharp end (its foot) up to the edge.
            gradient.startPoint = CGPoint(x: 0.5, y: 1)
            gradient.endPoint = CGPoint(x: 0.5, y: 0)
            gradient.locations = stops.map { NSNumber(value: $0.at) }
            sliceMask.layer.addSublayer(gradient)
            mask = sliceMask
            paintMask()
            registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (slice: Slice, _: UITraitCollection) in
                slice.rehold()
            }
            NotificationCenter.default.addObserver(self, selector: #selector(sceneReturned(_:)),
                                                   name: UIScene.willEnterForegroundNotification, object: nil)
        }

        @available(*, unavailable)
        required init?(coder _: NSCoder) { fatalError("HeadFade is built in code") }

        override func layoutSubviews() {
            super.layoutSubviews()
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            sliceMask.frame = bounds
            gradient.frame = bounds
            CATransaction.commit()
        }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            rehold()
        }

        /// The partial blur, held afresh, and only while in a window: a paused
        /// animator must be stopped before it is released, so leaving the
        /// window lets it go. One path for every moment the held blur could go
        /// stale: entering a window, the appearance changing (the material is
        /// held as the current appearance draws it) and the scene coming back
        /// from the background (a held effect has been seen reset there,
        /// stackoverflow.com/questions/25529500).
        private func rehold() {
            if let hold {
                hold.stopAnimation(true)
                self.hold = nil
                effect = nil
            }
            guard window != nil else { return }
            let hold = UIViewPropertyAnimator(duration: 1, curve: .linear) { [unowned self] in
                self.effect = UIBlurEffect(style: Self.material)
            }
            hold.pausesOnCompletion = true
            // Started and paused before the fraction is set: a fraction set on
            // an inactive animator can leave the view undrawn
            // (stackoverflow.com/questions/41189776, rdar://30856746).
            hold.startAnimation()
            hold.pauseAnimation()
            hold.fractionComplete = fraction
            self.hold = hold
        }

        @objc private func sceneReturned(_ note: Notification) {
            guard let scene = note.object as? UIScene, scene === window?.windowScene else { return }
            rehold()
        }

        private func paintMask() {
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            gradient.colors = stops.map { UIColor.black.withAlphaComponent($0.alpha * shown).cgColor }
            CATransaction.commit()
        }
    }
}
