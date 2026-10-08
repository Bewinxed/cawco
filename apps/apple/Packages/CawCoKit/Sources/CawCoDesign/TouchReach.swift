import UIKit

/// The web's `.touch-hit` (app.css), which every kit button wears: under a
/// finger a control drawn smaller than 44×44 (the HIG's least touch target,
/// `cBtnHLg`) takes touches from a 44pt box centred on it, while its drawing
/// and the layout around it stay as they are. Like the web's `--hit-gap-x`,
/// the reach stops where a neighbouring control is nearer: a touch on a
/// neighbour, or closer to one, is the neighbour's.
public enum TouchReach {
    /// Whether `point` (in `view`'s coordinates) is one `view` answers.
    @MainActor
    public static func contains(_ view: UIView, _ point: CGPoint) -> Bool {
        let bounds = view.bounds
        if bounds.contains(point) { return true }
        guard view.traitCollection.userInterfaceIdiom != .mac else { return false }
        guard reach(bounds).contains(point), let parent = view.superview else { return false }
        let mine = distance(point, bounds)
        let at = view.convert(point, to: parent)
        for sibling in parent.subviews where sibling !== view && takesTouches(sibling) {
            if distance(at, sibling.frame) < mine { return false }
        }
        return true
    }

    /// `box` grown to at least 44×44 about its centre.
    static func reach(_ box: CGRect) -> CGRect {
        let side = Size.cBtnHLg
        return box.insetBy(dx: min(0, (box.width - side) / 2), dy: min(0, (box.height - side) / 2))
    }

    static func distance(_ point: CGPoint, _ rect: CGRect) -> Double {
        let dx = max(rect.minX - point.x, 0, point.x - rect.maxX)
        let dy = max(rect.minY - point.y, 0, point.y - rect.maxY)
        return (dx * dx + dy * dy).squareRoot()
    }

    @MainActor
    private static func takesTouches(_ view: UIView) -> Bool {
        !view.isHidden && view.alpha > 0.01 && view.isUserInteractionEnabled && (view is UIControl || !(view.gestureRecognizers ?? []).isEmpty)
    }
}

/// A button with the kit's touch reach (`KitButton.make` makes these).
public final class ReachButton: UIButton {
    override public func point(inside point: CGPoint, with _: UIEvent?) -> Bool {
        TouchReach.contains(self, point)
    }
}

/// A card whose buttons keep their reach when the stack holding them is no
/// taller than they are (a dialog's footer): UIKit never asks a child about
/// a touch outside its parent, so a touch in that margin lands here and goes
/// to the nearest button whose reach holds it. A touch on a control itself
/// always goes to it. A Mac's pointer takes the drawn boxes alone.
final class ReachCard: UIView {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let direct = super.hitTest(point, with: event)
        guard traitCollection.userInterfaceIdiom != .mac, isUserInteractionEnabled, !isHidden, alpha > 0.01,
              self.point(inside: point, with: event) else { return direct }
        var view = direct
        while let current = view, current !== self {
            if current is UIControl { return direct }
            view = current.superview
        }
        var best: (button: UIButton, distance: Double)?
        func visit(_ view: UIView) {
            guard !view.isHidden, view.alpha > 0.01, view.isUserInteractionEnabled else { return }
            if let button = view as? UIButton {
                let box = button.convert(button.bounds, to: self)
                guard TouchReach.reach(box).contains(point) else { return }
                let distance = TouchReach.distance(point, box)
                if best.map({ distance < $0.distance }) ?? true { best = (button, distance) }
                return
            }
            view.subviews.forEach(visit)
        }
        visit(self)
        return best?.button ?? direct
    }
}

/// A plain control with the kit's touch reach: a copyable line, a figure that is a link.
public final class ReachControl: UIControl {
    override public func point(inside point: CGPoint, with _: UIEvent?) -> Bool {
        TouchReach.contains(self, point)
    }
}
