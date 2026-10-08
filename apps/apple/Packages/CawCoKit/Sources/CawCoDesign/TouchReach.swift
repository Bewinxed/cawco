import UIKit

/// The web's `.touch-hit` (app.css): under a finger a control drawn smaller
/// than 44×44 (the HIG's least touch target, `cBtnHLg`) takes touches from a
/// 44pt box centred on it, while its drawing and the layout around it stay as
/// they are.
///
/// UIKit never asks a view about a touch outside its parent, so no control
/// and no container can grow its own reach: the window does it for all of
/// them (`ReachWindow`). A touch on a control's drawn box, or on text, stays
/// where it lands. Anywhere else it goes to the nearest enabled control whose
/// reach holds it, as the web's `--hit-gap-x` splits the gap between two
/// neighbours at its midpoint, provided that control stands frontmost at its
/// own edge: nothing behind a sheet, under a scrim or scrolled out of sight
/// takes a touch. A Mac's pointer and an iPad's hover take the drawn boxes
/// alone.
public enum TouchReach {
    /// `box` grown to at least 44×44 about its centre.
    public static func reach(_ box: CGRect) -> CGRect {
        let side = Size.cBtnHLg
        return box.insetBy(dx: min(0, (box.width - side) / 2), dy: min(0, (box.height - side) / 2))
    }

    /// The view a touch at `point` (in `window`'s space) goes to, given the
    /// view UIKit's own hit test found (`direct`) and that hit test
    /// (`frontmost`), which tells whether a control is the one drawn on top.
    @MainActor
    static func resolve(_ direct: UIView?, at point: CGPoint, in window: UIWindow, event: UIEvent?,
                        frontmost: (CGPoint) -> UIView?) -> UIView? {
        guard window.traitCollection.userInterfaceIdiom != .mac, event?.type != .hover else { return direct }
        if let direct, owned(direct) { return direct }
        var found: [(control: UIControl, box: CGRect, gap: Double)] = []
        collect(in: window, window: window, point: point, clip: window.bounds, into: &found)
        for candidate in found.sorted(by: { $0.gap < $1.gap }) {
            let box = candidate.box
            let edge = CGPoint(x: min(max(point.x, box.minX + 0.5), box.maxX - 0.5),
                               y: min(max(point.y, box.minY + 0.5), box.maxY - 0.5))
            guard let top = frontmost(edge), top === candidate.control || top.isDescendant(of: candidate.control) else { continue }
            return candidate.control
        }
        return direct
    }

    /// A touch already on a control, or on text (a field, a text view, a
    /// web page's content), is that view's.
    @MainActor
    private static func owned(_ view: UIView) -> Bool {
        var current: UIView? = view
        while let at = current, !(at is UIWindow) {
            if at is UIControl || at is UITextInput { return true }
            current = at.superview
        }
        return false
    }

    /// Every enabled control under `view` whose reach holds `point`, with its
    /// drawn box (window space) and its distance from `point`. A clipping
    /// view's content is searched only where it can be seen.
    @MainActor
    private static func collect(in view: UIView, window: UIWindow, point: CGPoint, clip: CGRect,
                                into found: inout [(control: UIControl, box: CGRect, gap: Double)]) {
        let slack = Size.cBtnHLg / 2
        for child in view.subviews where !child.isHidden && child.alpha > 0.01 && child.isUserInteractionEnabled {
            let box = child.convert(child.bounds, to: window)
            guard box.insetBy(dx: -slack, dy: -slack).intersects(clip) else { continue }
            if let control = child as? UIControl, control.isEnabled, !(control is KeepsDrawnBox), reach(box).contains(point) {
                found.append((control, box, distance(point, box)))
            }
            if child.clipsToBounds {
                guard box.insetBy(dx: -slack, dy: -slack).contains(point) else { continue }
                collect(in: child, window: window, point: point, clip: clip.intersection(box), into: &found)
            } else {
                collect(in: child, window: window, point: point, clip: clip, into: &found)
            }
        }
    }

    static func distance(_ point: CGPoint, _ rect: CGRect) -> Double {
        let dx = max(rect.minX - point.x, 0, point.x - rect.maxX)
        let dy = max(rect.minY - point.y, 0, point.y - rect.maxY)
        return (dx * dx + dy * dy).squareRoot()
    }
}

/// The app's window: the one place every control's touch reach is honoured
/// (`TouchReach`), above every container that holds a control.
public final class ReachWindow: UIWindow {
    override public func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        TouchReach.resolve(super.hitTest(point, with: event), at: point, in: self, event: event) { at in
            super.hitTest(at, with: event)
        }
    }
}

/// A control that answers only its drawn box, where its reach would take a
/// neighbour that is not a control (a tab's details chevron and the tab's
/// own title).
public protocol KeepsDrawnBox: UIControl {}
