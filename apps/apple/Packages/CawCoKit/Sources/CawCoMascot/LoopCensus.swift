#if DEBUG
import RiveRuntime
import UIKit

/// What keeps the app from going idle, for a simulator probe (DEBUG only):
/// every layer in `windows` carrying an animation that repeats for ever,
/// and every Rive view drawing, each named by the view that holds it, the
/// nearest label over it and the animation's key. XCTest takes an app with
/// an animation running as never idle (rdar://25562105), so a screen read
/// waits on any of these until it times out.
@MainActor
public enum LoopCensus {
    public static func running(in windows: [UIWindow]) -> [String] {
        var found: [String] = []
        for window in windows {
            visit(window, hidden: false, into: &found)
        }
        return found
    }

    /// Walked once a second on the main thread, so a view is named only when something is found on it.
    private static func visit(_ view: UIView, hidden: Bool, into found: inout [String]) {
        let hidden = hidden || view.isHidden || view.alpha < 0.01
        let name = { "\(type(of: view)) \"\(label(of: view))\"\(hidden ? " (hidden)" : "")" }
        if let rive = view as? RiveUIView, !rive.isPaused {
            found.append("Rive drawing in \(name())")
        }
        for key in forEver(on: view.layer) {
            found.append("\(key) for ever on \(name())")
        }
        for child in view.subviews {
            visit(child, hidden: hidden, into: &found)
        }
    }

    /// The keys of the animations that repeat for ever on `layer` and the sublayers no other view owns.
    private static func forEver(on layer: CALayer) -> [String] {
        var keys: [String] = []
        for key in layer.animationKeys() ?? [] {
            guard let animation = layer.animation(forKey: key) else { continue }
            if animation.repeatCount == .infinity || animation.repeatDuration == .infinity {
                keys.append(key)
            }
        }
        for sublayer in layer.sublayers ?? [] where !(sublayer.delegate is UIView) {
            keys += forEver(on: sublayer)
        }
        return keys
    }

    /// The view's own label or id, or the nearest one over it.
    private static func label(of view: UIView) -> String {
        var at: UIView? = view
        while let one = at {
            if let label = one.accessibilityLabel, !label.isEmpty { return label }
            if let id = one.accessibilityIdentifier, !id.isEmpty { return id }
            at = one.superview
        }
        return ""
    }
}
#endif
