import CawCoDesign
import UIKit

/// The ground under the page's dock (Home.svelte `.dock`):
/// `linear-gradient(transparent, var(--surface-recess) var(--space-4))`, so
/// the list fades out under the button instead of ending on a line.
final class DockView: UIView {
    override class var layerClass: AnyClass { CAGradientLayer.self }

    override init(frame: CGRect) {
        super.init(frame: frame)
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: DockView, _: UITraitCollection) in view.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("DockView is built in code") }

    private func paint() {
        guard let gradient = layer as? CAGradientLayer else { return }
        let ground = Palette.surfaceRecess.resolvedColor(with: traitCollection)
        gradient.colors = [ground.withAlphaComponent(0).cgColor, ground.cgColor]
        setNeedsLayout()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard let gradient = layer as? CAGradientLayer, bounds.height > 0 else { return }
        gradient.locations = [0, NSNumber(value: min(1, Space.space4 / bounds.height))]
    }
}
