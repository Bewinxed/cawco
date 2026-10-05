import UIKit

/// One tab's pane giving way to the next (pane-slide.ts): the two stand in
/// one cell and slide 8% across in tab order as they cross-fade, over
/// `durControl` on the drawer curve. `direction` is +1 moving to a later
/// tab, -1 to an earlier one: the new pane comes in from that side and the
/// old one leaves the other way. With less motion only the fade runs.
public final class PaneSlideView: UIView {
    public private(set) var current: UIView?

    public init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        clipsToBounds = true
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("PaneSlideView is built in code")
    }

    /// Which way a move from one tab to another goes, in the tabs' order (`towards`).
    public static func towards(_ order: [String], from: String, to: String) -> Int {
        guard let a = order.firstIndex(of: from), let b = order.firstIndex(of: to), a != b else { return 1 }
        return b > a ? 1 : -1
    }

    public func show(_ next: UIView, direction: Int = 1) {
        let leaving = current
        current = next
        next.translatesAutoresizingMaskIntoConstraints = false
        addSubview(next)
        NSLayoutConstraint.activate([
            next.topAnchor.constraint(equalTo: topAnchor),
            next.bottomAnchor.constraint(equalTo: bottomAnchor),
            next.leadingAnchor.constraint(equalTo: leadingAnchor),
            next.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
        guard let leaving, window != nil else {
            leaving?.removeFromSuperview()
            return
        }
        layoutIfNeeded()
        let travel = UIAccessibility.isReduceMotionEnabled ? 0 : 0.08 * bounds.width * Double(direction)
        leaving.isUserInteractionEnabled = false
        next.alpha = 0
        next.transform = CGAffineTransform(translationX: travel, y: 0)
        let animator = Motion.easeDrawer.animator(Motion.durControl) {
            next.alpha = 1
            next.transform = .identity
            leaving.alpha = 0
            leaving.transform = CGAffineTransform(translationX: -travel, y: 0)
        }
        animator.addCompletion { _ in leaving.removeFromSuperview() }
        animator.startAnimation()
    }
}
