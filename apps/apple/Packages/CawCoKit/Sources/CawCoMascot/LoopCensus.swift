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

    private static func visit(_ view: UIView, hidden: Bool, into found: inout [String]) {
        let hidden = hidden || view.isHidden || view.alpha < 0.01
        let name = "\(type(of: view)) \"\(label(of: view))\"\(hidden ? " (hidden)" : "")"
        if let rive = view as? RiveUIView, !rive.isPaused {
            found.append("Rive drawing in \(name)")
        }
        layers(view.layer, name: name, into: &found)
        for child in view.subviews {
            visit(child, hidden: hidden, into: &found)
        }
    }

    /// `layer` and the sublayers no other view owns.
    private static func layers(_ layer: CALayer, name: String, into found: inout [String]) {
        for key in layer.animationKeys() ?? [] {
            guard let animation = layer.animation(forKey: key) else { continue }
            if animation.repeatCount == .infinity || animation.repeatDuration == .infinity {
                found.append("\(key) for ever on \(name)")
            }
        }
        for sublayer in layer.sublayers ?? [] where !(sublayer.delegate is UIView) {
            layers(sublayer, name: name, into: &found)
        }
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
