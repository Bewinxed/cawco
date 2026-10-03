import UIKit

/// A row's web hover wash, driven by an actual pointer interaction. It never
/// changes the layout, lifts the content or persists after the pointer leaves.
public final class PointerSurface: NSObject, UIPointerInteractionDelegate {
    private weak var view: UIView?
    private let restingColor: UIColor?

    public init(_ view: UIView) {
        self.view = view
        restingColor = view.backgroundColor
        super.init()
        view.addInteraction(UIPointerInteraction(delegate: self))
    }

    public func pointerInteraction(_ interaction: UIPointerInteraction, styleFor region: UIPointerRegion) -> UIPointerStyle? {
        guard let view else { return nil }
        return UIPointerStyle(effect: .hover(UITargetedPreview(view: view), preferredTintMode: .none, prefersShadow: false, prefersScaledContent: false), shape: .roundedRect(view.bounds, radius: Radius.radiusMd))
    }

    public func pointerInteraction(_ interaction: UIPointerInteraction, willEnter region: UIPointerRegion, animator: any UIPointerInteractionAnimating) {
        animator.addAnimations { [weak self] in self?.view?.backgroundColor = Palette.surfaceHover }
    }

    public func pointerInteraction(_ interaction: UIPointerInteraction, willExit region: UIPointerRegion, animator: any UIPointerInteractionAnimating) {
        animator.addAnimations { [weak self] in self?.view?.backgroundColor = self?.restingColor }
    }
}
