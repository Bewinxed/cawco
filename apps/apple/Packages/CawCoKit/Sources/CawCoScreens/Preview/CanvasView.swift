import CawCoDesign
import Foundation
import UIKit

/// A component canvas's view, in the artifact panel's head (CanvasView.svelte;
/// component canvas §2, "How he watches and steers"): its frames' scheme,
/// their widths, reduced motion, and the zoom, each posted to the canvas
/// page through the overlay (`cawco:canvas-view`, preview-overlay page.ts).
/// The kit's menu under the head's own `sm` ghost, as Inspect beside it;
/// in More, a submenu of the same entries. Kept per session, as the web
/// keeps it (`cawco-canvas-view:<session>`), and told to each load of the
/// page once it says it is ready.
@MainActor
final class CanvasViewControl {
    enum Scheme: String, CaseIterable {
        case page, light, dark, both

        var words: String {
            switch self {
            case .page: "As the page"
            case .light: "Light"
            case .dark: "Dark"
            case .both: "Light and dark"
            }
        }
    }

    enum Width: String, CaseIterable {
        case own, phone = "390", tablet = "768", desk = "1280", all

        var words: String {
            switch self {
            case .own: "Each story's own"
            case .phone: "Phone, 390"
            case .tablet: "Tablet, 768"
            case .desk: "Desk, 1280"
            case .all: "Every width"
            }
        }
    }

    /// Zoom to fit, or to 100%: the canvas's scale 1, as the web posts it (`send(chosen, 1)`).
    enum Zoom {
        case fit, whole
    }

    /// The view as kept: what the web stores as `{scheme, width, motion}`.
    struct Chosen: Equatable {
        var scheme = Scheme.page
        var width = Width.own
        var reduced = false
    }

    /// One entry of the menu, and what pressing it does (`pick`).
    enum Choice: Equatable {
        case scheme(Scheme), width(Width), motion, zoom(Zoom)

        var words: String {
            switch self {
            case let .scheme(scheme): scheme.words
            case let .width(width): width.words
            case .motion: "Reduced motion"
            case .zoom(.fit): "Zoom to fit"
            case .zoom(.whole): "Zoom to 100%"
            }
        }
    }

    /// Every entry, in the menu's order.
    static let choices: [Choice] = Scheme.allCases.map(Choice.scheme) + Width.allCases.map(Choice.width) + [.motion, .zoom(.fit), .zoom(.whole)]

    /// The head's own button: the `sm` ghost, its glyph layers, the menu its primary action.
    let button: UIButton
    private(set) var chosen: Chosen
    private let key: String
    private let post: ([String: Any]) -> Void

    init(instanceId: String, post: @escaping ([String: Any]) -> Void) {
        key = "cawco-canvas-view:\(instanceId)"
        self.post = post
        chosen = Self.kept(UserDefaults.standard.string(forKey: key))
        button = KitButton.make("", glyph: .dataLayers, variant: .ghost, height: .sm) {}
        button.accessibilityLabel = "Canvas view"
        button.toolTip = "Canvas view: scheme, widths, motion, zoom"
        button.showsMenuAsPrimaryAction = true
        button.menu = UIMenu(children: [UIDeferredMenuElement.uncached { [weak self] done in
            MainActor.assumeIsolated { done(self?.entries() ?? []) }
        }])
    }

    /// The view kept for the session, each part the web's JSON holds; an unreadable one is the canvas's own view.
    private static func kept(_ stored: String?) -> Chosen {
        var chosen = Chosen()
        guard let data = stored?.data(using: .utf8),
              let said = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return chosen }
        if let scheme = (said["scheme"] as? String).flatMap(Scheme.init(rawValue:)) { chosen.scheme = scheme }
        if let width = (said["width"] as? String).flatMap(Width.init(rawValue:)) { chosen.width = width }
        if let motion = said["motion"] as? String, ["on", "reduce"].contains(motion) { chosen.reduced = motion == "reduce" }
        return chosen
    }

    /// The menu (CanvasView.svelte's content): Scheme and Width each a
    /// choice of one, Reduced motion a check, then the two zooms.
    func entries() -> [UIMenuElement] {
        let action = { (choice: Choice) -> UIAction in
            UIAction(title: choice.words, state: self.isOn(choice) ? .on : .off) { [weak self] _ in self?.pick(choice) }
        }
        return [
            UIMenu(title: "Scheme", options: [.displayInline, .singleSelection], children: Scheme.allCases.map { action(.scheme($0)) }),
            UIMenu(title: "Width", options: [.displayInline, .singleSelection], children: Width.allCases.map { action(.width($0)) }),
            UIMenu(options: .displayInline, children: [action(.motion)]),
            UIMenu(options: .displayInline, children: [action(.zoom(.fit)), action(.zoom(.whole))]),
        ]
    }

    /// More's entry while the head has no room for the button: the same menu, one level in.
    func submenu() -> UIMenu {
        UIMenu(title: "Canvas view", image: Glyph.dataLayers.image, children: entries())
    }

    func isOn(_ choice: Choice) -> Bool {
        switch choice {
        case let .scheme(scheme): chosen.scheme == scheme
        case let .width(width): chosen.width == width
        case .motion: chosen.reduced
        case .zoom: false
        }
    }

    /// What an entry does: the view changes and goes to the page, or the page zooms.
    func pick(_ choice: Choice) {
        var next = chosen
        switch choice {
        case let .scheme(scheme): next.scheme = scheme
        case let .width(width): next.width = width
        case .motion: next.reduced.toggle()
        case let .zoom(zoom):
            send(next, zoom: zoom)
            return
        }
        send(next)
    }

    /// The page said it is ready: each load takes the view kept for the session.
    func tell() {
        send(chosen)
    }

    /// The web's `send`: kept, then posted as the page takes it, every permutation for "every width".
    private func send(_ next: Chosen, zoom: Zoom? = nil) {
        chosen = next
        let stored: [String: Any] = ["scheme": next.scheme.rawValue, "width": next.width.rawValue, "motion": next.reduced ? "reduce" : "on"]
        if let data = try? JSONSerialization.data(withJSONObject: stored) {
            UserDefaults.standard.set(String(decoding: data, as: UTF8.self), forKey: key)
        }
        let widths: Any = switch next.width {
        case .own, .all: NSNull()
        case .phone, .tablet, .desk: [Int(next.width.rawValue) ?? 0]
        }
        var view: [String: Any] = [
            "scheme": next.scheme.rawValue,
            "widths": widths,
            "all": next.width == .all,
            "motion": next.reduced ? "reduce" : "on",
        ]
        switch zoom {
        case .fit: view["zoom"] = "fit"
        case .whole: view["zoom"] = 1
        case nil: break
        }
        post(["type": "cawco:canvas-view", "view": view])
    }
}
