#if targetEnvironment(macCatalyst)
import UIKit
import UIKit.UIGestureRecognizerSubclass

/// The Mac window's own moves, now that the shell's bar is its top edge
/// (MacBar, ShellController `placeMacBar`). A Catalyst window keeps its
/// titlebar's 32pt strip as a drag region even with no title and no toolbar,
/// and AppKit moves the window from a press there before UIKit sees it: the
/// top of every tab and of Caw's glass group, which stand in that strip, moved
/// the window instead of taking the click (a `-mac-probe` press on a tab 3pt
/// below its top called `performWindowDragWithEvent:`; one at its middle did
/// not). The same failure as Electron's hidden-inset titlebars
/// (github.com/electron/electron/issues/21632). So each shell window stops
/// moving itself from that strip (NSWindow `isMovable`), and the shell moves
/// it from what is empty: the bar's background and the rail's top over its
/// header, where the traffic lights stand (`WindowDragGesture`).
@MainActor
enum MacWindow {
    private static func object(_ name: String, _ key: String) -> NSObject? {
        (NSClassFromString(name) as? NSObject.Type)?.value(forKey: key) as? NSObject
    }

    /// The shell's own NSWindow leaves its moves to the shell; a window with
    /// no shell in it (the hub's sheet before a connection) keeps moving by
    /// itself. Run when the shell appears and when its scene comes to the
    /// front, so it is taken over before a press can reach its strip.
    static func takeOverMoves(of scene: UIWindowScene) {
        guard let window = nsWindow(of: scene), (window.value(forKey: "isMovable") as? Bool) != false else { return }
        window.setValue(false, forKey: "movable")
    }

    /// The scene's NSWindow: the one whose frame, in the display's top-left
    /// points, is the scene's system frame (the -mac-probe pass measured the two as one space).
    private static func nsWindow(of scene: UIWindowScene) -> NSObject? {
        guard let windows = object("NSApplication", "sharedApplication")?.value(forKey: "windows") as? [NSObject],
              let primary = ((object("NSScreen", "screens") as? [NSObject])?.first?.value(forKey: "frame") as? NSValue)?.cgRectValue else { return nil }
        let target = scene.effectiveGeometry.systemFrame
        return windows.first { window in
            guard let frame = (window.value(forKey: "frame") as? NSValue)?.cgRectValue else { return false }
            let flipped = CGRect(x: frame.minX, y: primary.height - frame.maxY, width: frame.width, height: frame.height)
            return abs(flipped.minX - target.minX) < 1 && abs(flipped.minY - target.minY) < 1
                && abs(flipped.width - target.width) < 1 && abs(flipped.height - target.height) < 1
        }
    }

    /// The press being handled now moves its window with the mouse; a second
    /// press in a row does what the reader's titlebar double-click does
    /// (System Settings, Desktop & Dock: "Double-click a window's title bar to").
    #if DEBUG
    /// What the last press that asked to move saw as AppKit's current event (`-mac-probe`).
    static var lastAsk = "none"

    /// AppKit's current event, as a press sees it: its type (1 a left mouse-down) and whether it has a window.
    static var currentEventSummary: String {
        (object("NSApplication", "sharedApplication")?.value(forKey: "currentEvent") as? NSObject)
            .map { "type \($0.value(forKey: "type") ?? "?") window \($0.value(forKey: "window") != nil)" } ?? "none"
    }
    #endif

    static func move(tapCount: Int) {
        let current = object("NSApplication", "sharedApplication")?.value(forKey: "currentEvent") as? NSObject
        #if DEBUG
        lastAsk = currentEventSummary
        #endif
        // NSEventTypeLeftMouseDown: the press itself, the event a window drag starts from.
        guard let event = current, (event.value(forKey: "type") as? UInt) == 1, let window = event.value(forKey: "window") as? NSObject else { return }
        if tapCount == 2 {
            switch UserDefaults.standard.string(forKey: "AppleActionOnDoubleClick") {
            case "None": break
            case "Minimize": window.perform(NSSelectorFromString("performMiniaturize:"), with: nil)
            default: window.perform(NSSelectorFromString("performZoom:"), with: nil)
            }
            return
        }
        // Movable for this one drag only: AppKit refuses to move an unmovable window.
        window.setValue(true, forKey: "movable")
        window.perform(NSSelectorFromString("performWindowDragWithEvent:"), with: event)
        window.setValue(false, forKey: "movable")
    }
}

/// Moves the window from a press on what is empty in its view: `empty` says,
/// for a press, whether nothing there takes it. It never recognises, so
/// every press still reaches what it landed on.
final class WindowDragGesture: UIGestureRecognizer {
    private let empty: (UITouch) -> Bool

    init(empty: @escaping (UITouch) -> Bool) {
        self.empty = empty
        super.init(target: nil, action: nil)
        cancelsTouchesInView = false
        delaysTouchesBegan = false
        delaysTouchesEnded = false
    }

    #if DEBUG
    /// The last press this saw: its view, its type, whether it was empty (`-mac-probe`).
    static var lastTouch = "none"
    #endif

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        #if DEBUG
        let current = MacWindow.currentEventSummary
        Self.lastTouch = touches.map { "\($0.view.map { "\(type(of: $0))" } ?? "nil") type \($0.type.rawValue) empty \(empty($0)) current event \(current)" }.joined(separator: ", ")
        #endif
        if touches.count == 1, let touch = touches.first, empty(touch) {
            MacWindow.move(tapCount: touch.tapCount)
        }
        state = .failed
    }

    /// Whether nothing between `view`, where a press landed, and `holder`
    /// takes a press: no control, no tab, no row.
    static func nothingTakes(_ view: UIView?, under holder: UIView) -> Bool {
        var at = view
        while let view = at, view !== holder {
            if view is UIControl || view is TabView || view is UICollectionViewCell || view is UITableViewCell { return false }
            at = view.superview
        }
        return at === holder
    }
}
#endif
