import UIKit

public extension UIButton {
    /// The button's menu, set once and made as it opens from what stands
    /// then. A refresh that set a new menu on a button whose menu a tap was
    /// opening cancelled it: the touch landed and no menu came.
    func menuOnOpen(_ make: @escaping @MainActor () -> [UIMenuElement]) {
        menu = UIMenu(children: [UIDeferredMenuElement.uncached { done in done(make()) }])
    }
}
