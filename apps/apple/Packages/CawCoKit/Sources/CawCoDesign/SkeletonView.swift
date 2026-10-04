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
        paint()
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
        sheen.frame = bounds
        sheen.removeAnimation(forKey: "sweep")
        guard !UIAccessibility.isReduceMotionEnabled, bounds.width > 0 else { return }
        let sweep = CABasicAnimation(keyPath: "transform.translation.x")
        sweep.fromValue = -bounds.width
        sweep.toValue = bounds.width
        sweep.duration = Motion.durLoop
        sweep.repeatCount = .infinity
        sheen.add(sweep, forKey: "sweep")
    }
}
