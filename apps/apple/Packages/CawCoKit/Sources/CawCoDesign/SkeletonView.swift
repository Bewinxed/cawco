import UIKit

/// The kit's one loading placeholder (`kit-skeleton`): `--surface-fill` at
/// `--radius-sm`, a sheen sweeping across it once a `durLoop`, still under
/// Reduce Motion.
public final class SkeletonView: UIView {
    private let sheen = CAGradientLayer()

    public init(height: Double) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceFill
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        clipsToBounds = true
        sheen.startPoint = CGPoint(x: 0, y: 0.5)
        sheen.endPoint = CGPoint(x: 1, y: 0.5)
        sheen.locations = [0, 0.3, 0.5, 0.7, 1]
        layer.addSublayer(sheen)
        heightAnchor.constraint(equalToConstant: height).isActive = true
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: SkeletonView, _: UITraitCollection) in view.paint() }
        NotificationCenter.default.addObserver(self, selector: #selector(motionChanged), name: UIAccessibility.reduceMotionStatusDidChangeNotification, object: nil)
        paint()
    }

    @objc private func motionChanged() {
        setNeedsLayout()
    }

    @available(*, unavailable)
    public required init?(coder _: NSCoder) {
        fatalError("SkeletonView is built in code")
    }

    private func paint() {
        let clear = UIColor.clear.cgColor
        let ink = Palette.skeletonSheen.resolvedColor(with: traitCollection)
        sheen.colors = [ink.withAlphaComponent(0).cgColor, ink.withAlphaComponent(0).cgColor, ink.cgColor, ink.withAlphaComponent(0).cgColor, clear]
    }

    override public func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        sheen.frame = bounds
        // With less motion there is no sheen at all (`kit-skeleton::after` exists only with motion allowed).
        sheen.isHidden = UIAccessibility.isReduceMotionEnabled
        CATransaction.commit()
        // The sweep spans the width it has now.
        if sweptWidth != bounds.width { stopSweep() }
        sweep()
    }

    override public func didMoveToWindow() {
        super.didMoveToWindow()
        sweep()
    }

    override public var isHidden: Bool {
        didSet { if isHidden != oldValue { sweep() } }
    }

    override public var alpha: CGFloat {
        didSet { if (alpha < 0.01) != (oldValue < 0.01) { sweep() } }
    }

    /// It sweeps only while it can be seen, as KitSpinner turns: in a
    /// window, shown, not clear, with motion allowed and a width to cross.
    /// A sweep left running under a hidden or cleared placeholder drew a
    /// frame every refresh for nothing and kept the app from ever going idle
    /// (XCTest, rdar://25562105).
    private func sweep() {
        let seen = window != nil && !isHidden && alpha >= 0.01 && !sheen.isHidden && bounds.width > 0
        let sweeping = sheen.animation(forKey: "sweep") != nil
        guard seen != sweeping else { return }
        guard seen else {
            stopSweep()
            return
        }
        let sweep = CABasicAnimation(keyPath: "transform.translation.x")
        sweep.fromValue = -bounds.width
        sweep.toValue = bounds.width
        sweep.duration = Motion.durLoop
        sweep.repeatCount = .infinity
        sheen.add(sweep, forKey: "sweep")
        sweptWidth = bounds.width
        LoopLog.on("sweep", self)
    }

    /// The width the running sweep crosses.
    private var sweptWidth = 0.0

    private func stopSweep() {
        guard sheen.animation(forKey: "sweep") != nil else { return }
        sheen.removeAnimation(forKey: "sweep")
        LoopLog.off("sweep", self)
    }
}
