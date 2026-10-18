import UIKit

public extension UIButton {
    /// The button's menu, set once and made as it opens from what stands
    /// then. A refresh that set a new menu on a button whose menu a tap was
    /// opening cancelled it: the touch landed and no menu came.
    func menuOnOpen(options: UIMenu.Options = [], _ make: @escaping @MainActor () -> [UIMenuElement]) {
        menu = UIMenu(options: options, children: [UIDeferredMenuElement.uncached { done in done(make()) }])
    }
}
