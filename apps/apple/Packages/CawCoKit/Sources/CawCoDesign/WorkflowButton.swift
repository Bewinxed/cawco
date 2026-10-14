import UIKit

public extension KitButton {
    /// The workflows pages' button (workflows.css `.wf-btn`): raised on the
    /// control border, radius 8, the label role, 7/11pt in from its 1pt
    /// border, 36pt under a pointer and 44pt square at the least under a
    /// finger on the pages, pressing to `pressScale`. `primary` is
    /// `.wf-primary`: the action surface under the on-brand ink, no edge.
    /// `inDialog` stands it on the button token (`cBtnH`) at every pointer.
    static func workflow(_ title: String, primary: Bool = false, inDialog: Bool = false, action: @escaping () -> Void) -> UIButton {
        let coarse = !inDialog && UITraitCollection.current.userInterfaceIdiom != .mac
        let button = make(title, variant: primary ? .action : .outline, height: coarse ? .lg : .standard, action: action)
        var config = button.configuration
        config?.attributedTitle = AttributedString(title, attributes: TypeScale.typeLabel.container(color: primary ? Palette.onBrand : Palette.inkStrong))
        config?.contentInsets = NSDirectionalEdgeInsets(top: Space.space2 + 1, leading: Space.space3 + 1, bottom: Space.space2 + 1, trailing: Space.space3 + 1)
        config?.background.cornerRadius = Radius.radiusSm
        config?.background.customView?.layer.cornerRadius = Radius.radiusSm
        button.configuration = config
        if coarse { button.widthAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHLg).isActive = true }
        return button
    }
}
