import UIKit

/// The web composer's `material-panel`, applied only to its chrome. Below
/// iOS26 the effect is absent; the existing content still draws its surface.
public final class MaterialPanelView: UIView {
    public private(set) var hasGlass = false
    public init(radius: Double = Radius.radiusMd) {
        super.init(frame: .zero)
        isUserInteractionEnabled = false
        clipsToBounds = true
        layer.cornerRadius = radius
        layer.cornerCurve = .continuous
        if #available(iOS 26.0, macCatalyst 26.0, *) {
            hasGlass = true
            let glass = UIGlassEffect(style: .regular)
            glass.tintColor = Palette.materialPanel
            let effect = UIVisualEffectView(effect: glass)
            effect.frame = bounds
            effect.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            addSubview(effect)
        }
    }
    @available(*, unavailable)
    public required init?(coder: NSCoder) { fatalError("MaterialPanelView is built in code") }
}
