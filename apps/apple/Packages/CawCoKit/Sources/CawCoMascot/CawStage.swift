import UIKit

/// Whether each `CawView` can be seen, read again at the end of every turn of the main run loop,
/// before Core Animation commits it. A turn is what changes visibility (a sheet presented or
/// dismissed, a view hidden or faded, a pane scrolled away, the scene sent to the background), so
/// a Caw is paused in the same frame he goes out of sight and runs again in the frame he comes
/// back. The observer only runs on turns the run loop takes anyway: it never wakes it.
@MainActor
enum CawStage {
    private static let views = NSHashTable<CawView>.weakObjects()
    private static var observer: CFRunLoopObserver?

    /// Before Core Animation's commit (order 2,000,000), after UIKit's layout.
    private static let order = 1_999_500

    static func watch(_ view: CawView) {
        views.add(view)
        guard observer == nil else {
            return
        }
        let made = CFRunLoopObserverCreateWithHandler(nil, CFRunLoopActivity([.beforeWaiting, .exit]).rawValue, true, order) { _, _ in
            MainActor.assumeIsolated {
                for view in views.allObjects {
                    view.restage()
                }
            }
        }
        CFRunLoopAddObserver(CFRunLoopGetMain(), made, .commonModes)
        observer = made
    }

    /// Whether any of `view` can be seen: in a window of a scene that is not in the background,
    /// inside the window's bounds, nothing from it up hidden or clear, and no sheet presented over
    /// the controller it stands in covering it.
    static func seen(_ view: UIView) -> Bool {
        guard let window = view.window, !window.isHidden,
              let scene = window.windowScene, scene.activationState != .background, scene.activationState != .unattached
        else {
            return false
        }
        // One walk up to the window: hidden, clear, and the views he stands in.
        var alpha = 1.0
        var line: [UIView] = []
        var node: UIView? = view
        while let at = node {
            if at.isHidden {
                return false
            }
            alpha *= at.alpha
            line.append(at)
            node = at.superview
        }
        guard alpha > 0.01 else {
            return false
        }
        let box = view.convert(view.bounds, to: nil)
        guard !box.isEmpty, box.intersects(window.bounds) else {
            return false
        }
        guard let first = window.rootViewController?.presentedViewController else {
            return true
        }
        return !covered(box, line: line, in: window, from: first)
    }

    /// A controller presented over the one `line` (his view and those it stands in) belongs to,
    /// whose view holds all of `box`.
    private static func covered(_ box: CGRect, line: [UIView], in window: UIWindow, from first: UIViewController) -> Bool {
        var covered = false
        var presented: UIViewController? = first
        while let sheet = presented {
            if let surface = sheet.viewIfLoaded, surface.window === window {
                if line.contains(where: { $0 === surface }) {
                    // His own level: only what is presented over it covers him.
                    covered = false
                } else if surface.convert(surface.bounds, to: nil).contains(box) {
                    covered = true
                }
            }
            presented = sheet.presentedViewController
        }
        return covered
    }
}
