import OSLog
import UIKit

/// The kit's toasts (ui/sonner on svelte-sonner, as the root layout sets
/// it: expanded, top-centre under the top bar up to 640pt, bottom-right on
/// a desk, standing on the composer and the transcript's dock when they
/// show: `Toast.stand(on:)`). Each is the floating surface (`--surface-raised` in the control
/// border, `--radius-lg`, the overlay shadow), 16pt in, a 16pt glyph for
/// its kind 6pt before the message in body type. They paint above
/// everything, a dialog included, in a window of their own that takes no
/// taps but on the toasts. One arrives from `popRise` short of its place on
/// the side of the edge it comes from over `durPanel`; the stack makes room
/// over `durFade` on the in-out curve; one leaves toward its edge over
/// `durExit`. After 4s it goes; a swipe toward its edge past 45pt, or a
/// flick faster than 0.11pt/ms, takes it at once.
@MainActor
public enum Toast {
    public enum Kind: Sendable { case plain, success, error, info, warning, loading }

    public static func success(_ message: String, in view: UIView?) { show(message, kind: .success, in: view) }
    public static func error(_ message: String, in view: UIView?) { show(message, kind: .error, in: view) }

    /// What a toast offers to do about what it says (sonner's `action`).
    public struct Action {
        public let label: String
        public let run: @MainActor () -> Void

        public init(_ label: String, run: @escaping @MainActor () -> Void) {
            self.label = label
            self.run = run
        }
    }

    /// `description`: a second line under the message, in muted ink.
    /// `sticky`: it stays until swiped away or its action is taken
    /// (`duration: Infinity`), for a toast that carries the way to recover.
    /// `id` (sonner's `id`): a toast with the same id still standing is
    /// changed in place, keeping its place in the stack, its time restarted.
    public static func show(_ message: String, description: String? = nil, kind: Kind = .plain, action: Action? = nil, sticky: Bool = false, id: String? = nil, in view: UIView?) {
        guard let scene = view?.window?.windowScene ?? UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first else { return }
        let layer = layers[ObjectIdentifier(scene)] ?? {
            let made = ToastWindow(windowScene: scene)
            layers[ObjectIdentifier(scene)] = made
            return made
        }()
        layer.add(message, description: description, kind: kind, action: action, sticky: sticky, id: id)
        UIAccessibility.post(notification: .announcement, argument: message)
        #if DEBUG
        // Every toast, for a simulator pass to count (probe-ios-catchup.ts).
        Logger(subsystem: "dev.cawco.app", category: "Transcript").notice("toast shown: \(message, privacy: .public). \(description ?? "", privacy: .public)\(id.map { " id \($0)" } ?? "", privacy: .public)")
        #endif
    }

    /// Takes the toast standing with `id` away (sonner's `toast.dismiss(id)`); nothing when none stands.
    public static func dismiss(id: String, in view: UIView?) {
        guard let scene = view?.window?.windowScene ?? UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
              let layer = layers[ObjectIdentifier(scene)] else { return }
        layer.dismiss(id: id)
    }

    private static var layers: [ObjectIdentifier: ToastWindow] = [:]

    /// What stands at the window's foot (a composer, the transcript's dock:
    /// its pills and its "Not caught up" line). On a desk the toasts stand on
    /// the highest one showing, a `space3` step above it, never over it
    /// (DESIGN.md, "Toast": "standing on the tallest composer when one
    /// shows"; +layout.svelte `composerLift`). Held weakly: a view that goes
    /// is no floor.
    static let floors = NSHashTable<UIView>.weakObjects()

    /// `view` is a floor for the toasts from now on.
    public static func stand(on view: UIView) {
        floors.add(view)
    }

    /// A floor showed, went or moved: the toasts standing restand on it.
    public static func floorsMoved() {
        for layer in layers.values { layer.restandOnFloors() }
    }
}

/// The toasts' layer: a window above the app's that lets every tap through but those on a toast.
private final class ToastWindow: UIWindow {
    private var toasts: [ToastView] = []
    private static let gap = 14.0
    private static let lifetime = 4.0

    override init(windowScene: UIWindowScene) {
        super.init(windowScene: windowScene)
        windowLevel = .alert + 1
        backgroundColor = .clear
        let root = UIViewController()
        root.view = PassThroughView()
        rootViewController = root
        isHidden = false
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ToastWindow is built in code")
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        return hit === rootViewController?.view ? nil : hit
    }

    /// Up to 640pt a toast drops from the top, under the top bar; wider it sits in the bottom-right corner.
    private var narrow: Bool { bounds.width <= 640 }

    func add(_ message: String, description: String?, kind: Toast.Kind, action: Toast.Action?, sticky: Bool, id: String?) {
        guard let host = rootViewController?.view else { return }
        let toast = ToastView(message: message, description: description, kind: kind, action: action)
        toast.id = id
        toast.onDismiss = { [weak self, weak toast] velocity in
            guard let self, let toast else { return }
            remove(toast, thrown: velocity)
        }
        host.addSubview(toast)
        let width = narrow ? bounds.width - 24 : 356
        let size = toast.systemLayoutSizeFitting(CGSize(width: width, height: 0), withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel)
        toast.bounds = CGRect(origin: .zero, size: CGSize(width: width, height: size.height))
        if let id, let index = toasts.firstIndex(where: { $0.id == id }) {
            // Changed in place: the new words take the standing one's place, no arrival.
            toasts[index].removeFromSuperview()
            toasts[index] = toast
            toast.center = place(toast, at: index)
            restack(except: toast)
            expire(toast, sticky: sticky)
            return
        }
        toasts.insert(toast, at: 0)
        let rest = place(toast, at: 0)
        #if DEBUG
        // Where it rests against the highest floor showing, for a simulator pass to read.
        // Where it enters from: `popRise` short of its place on its edge's side, its foot that much lower on a desk.
        let entering = narrow || UIAccessibility.isReduceMotionEnabled ? 0 : Motion.popRise
        let line = String(format: "toast stands: x %.1f y %.1f w %.1f h %.1f foot %.1f enters foot %.1f floor top %@ clear %@ entering clear %@",
                          rest.x - toast.bounds.width / 2, rest.y - toast.bounds.height / 2, toast.bounds.width, toast.bounds.height,
                          rest.y + toast.bounds.height / 2, rest.y + toast.bounds.height / 2 + entering,
                          floorTop.map { String(format: "%.1f", $0) } ?? "none",
                          floorTop.map { rest.y + toast.bounds.height / 2 <= $0 - Space.space3 + 0.5 ? "true" : "false" } ?? "n/a",
                          floorTop.map { rest.y + toast.bounds.height / 2 + entering <= $0 ? "true" : "false" } ?? "n/a")
        Logger(subsystem: "dev.cawco.app", category: "Transcript").notice("\(line, privacy: .public)")
        #endif
        let still = UIAccessibility.isReduceMotionEnabled
        toast.center = still ? rest : CGPoint(x: rest.x, y: rest.y + (narrow ? -Motion.popRise : Motion.popRise))
        toast.alpha = 0
        Motion.easeOut.animator(Motion.durPanel) {
            toast.alpha = 1
            toast.center = rest
        }.startAnimation()
        restack(except: toast)
        expire(toast, sticky: sticky)
    }

    /// After its lifetime a toast goes, unless it is sticky, under a finger, or already replaced.
    private func expire(_ toast: ToastView, sticky: Bool) {
        guard !sticky else { return }
        Task { @MainActor [weak self, weak toast] in
            try? await Task.sleep(for: .seconds(Self.lifetime))
            guard let self, let toast, toast.superview != nil, !toast.held else { return }
            remove(toast, thrown: nil)
        }
    }

    func dismiss(id: String) {
        guard let toast = toasts.first(where: { $0.id == id }) else { return }
        remove(toast, thrown: nil)
    }

    /// Where the toast at `index` (0 nearest its edge) rests. On a desk, the
    /// corner's foot is 24pt over the safe area's, or a `space3` step over
    /// the highest floor showing (`Toast.floors`), whichever is higher.
    private func place(_ toast: ToastView, at index: Int) -> CGPoint {
        let before = toasts.prefix(index).reduce(0) { $0 + $1.bounds.height + Self.gap }
        let half = toast.bounds.height / 2
        if narrow {
            return CGPoint(x: bounds.midX, y: safeAreaInsets.top + Size.cTopBarH + Space.space2 + before + half)
        }
        let foot = min(bounds.maxY - safeAreaInsets.bottom - 24, floorTop.map { $0 - Space.space3 } ?? .greatestFiniteMagnitude)
        return CGPoint(x: bounds.maxX - safeAreaInsets.right - 24 - toast.bounds.width / 2,
                       y: foot - before - half)
    }

    /// The top of the highest floor showing in this window's scene, in this
    /// window's points: a view on screen, nothing over it hidden, drawn.
    private var floorTop: CGFloat? {
        var top: CGFloat?
        for view in Toast.floors.allObjects {
            guard let window = view.window, window.windowScene === windowScene, view.alpha > 0.01,
                  !sequence(first: view, next: \.superview).contains(where: \.isHidden) else { continue }
            let frame = view.convert(view.bounds, to: coordinateSpace)
            top = min(top ?? frame.minY, frame.minY)
        }
        return top
    }

    /// The floors moved: every toast standing restands.
    func restandOnFloors() {
        guard !toasts.isEmpty, !narrow else { return }
        restack()
        #if DEBUG
        // Each toast's new foot against the floor, for a simulator pass to read.
        for (index, toast) in toasts.enumerated() {
            let rest = place(toast, at: index)
            let line = String(format: "toast restands: foot %.1f floor top %@", rest.y + toast.bounds.height / 2, floorTop.map { String(format: "%.1f", $0) } ?? "none")
            Logger(subsystem: "dev.cawco.app", category: "Transcript").notice("\(line, privacy: .public)")
        }
        #endif
    }

    private func restack(except arriving: ToastView? = nil) {
        let still = UIAccessibility.isReduceMotionEnabled
        for (index, toast) in toasts.enumerated() where toast !== arriving {
            let rest = place(toast, at: index)
            if still { toast.center = rest } else {
                Motion.easeInOut.animator(Motion.durFade) { toast.center = rest }.startAnimation()
            }
        }
    }

    private func remove(_ toast: ToastView, thrown velocity: CGFloat?) {
        guard let index = toasts.firstIndex(where: { $0 === toast }) else { return }
        toasts.remove(at: index)
        let edge: CGFloat = narrow ? -1 : 1
        let travel = velocity.map { $0 > 0 ? 1.0 : -1.0 } ?? edge
        let still = UIAccessibility.isReduceMotionEnabled
        let leave = Motion.easeOut.animator(Motion.durExit) {
            toast.alpha = 0
            if !still { toast.center.y += travel * (toast.bounds.height / 2 + 12) }
        }
        leave.addCompletion { _ in toast.removeFromSuperview() }
        leave.startAnimation()
        restack()
    }
}

private final class PassThroughView: UIView {}

private final class ToastView: UIView {
    var onDismiss: (CGFloat?) -> Void = { _ in }
    /// Its `Toast.show` id, by which a later one changes it in place or dismisses it.
    var id: String?
    /// Under a finger: it does not time out.
    private(set) var held = false
    private var start = CGPoint.zero
    private var began = Date()

    init(message: String, description: String?, kind: Toast.Kind, action: Toast.Action?) {
        super.init(frame: .zero)
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Radius.radiusLg
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        boxShadow = Shadow.shadowOverlay
        let label = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong, lines: 0)
        label.text = message
        let text = UIStackView(arrangedSubviews: [label])
        text.axis = .vertical
        text.spacing = 2
        if let description, !description.isEmpty {
            let detail = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted, lines: 0)
            detail.text = description
            text.addArrangedSubview(detail)
        }
        let row = UIStackView(arrangedSubviews: [text])
        row.spacing = 6
        row.alignment = .center
        if let action {
            // sonner's action: a small solid button at the toast's end.
            var config = UIButton.Configuration.plain()
            config.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 8, bottom: 0, trailing: 8)
            config.attributedTitle = AttributedString(action.label, attributes:
                TypeScale.typeLabel.withWeight(.medium).container(color: Palette.onInk))
            let button = UIButton(configuration: config)
            button.backgroundColor = Palette.inkSolid
            button.layer.cornerRadius = Radius.radiusSm
            button.layer.cornerCurve = .continuous
            button.heightAnchor.constraint(equalToConstant: 24).isActive = true
            button.setContentCompressionResistancePriority(.required, for: .horizontal)
            button.setContentHuggingPriority(.required, for: .horizontal)
            button.addAction(UIAction { [weak self] _ in
                action.run()
                self?.onDismiss(nil)
            }, for: .touchUpInside)
            row.addArrangedSubview(button)
            row.setCustomSpacing(12, after: text)
        }
        let glyph: Glyph? = switch kind {
        case .plain, .loading: nil
        case .success: .passed
        case .error: .failed
        case .info: .info
        case .warning: .warning
        }
        if let glyph { row.insertArrangedSubview(GlyphView(glyph, size: 16, tint: Palette.inkStrong), at: 0) }
        if kind == .loading { row.insertArrangedSubview(KitSpinner(side: 16, tint: Palette.inkStrong), at: 0) }
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            row.topAnchor.constraint(equalTo: topAnchor, constant: 16),
            row.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -16),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
        ])
        addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(panned(_:))))
        // With an action the button is its own element; without, the toast reads as one.
        isAccessibilityElement = action == nil
        accessibilityLabel = [message, description].compactMap { $0 }.joined(separator: ". ")
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: ToastView, _: UITraitCollection) in view.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ToastView is built in code")
    }

    private func paint() {
        layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
    }

    /// Tracks the finger 1:1; past 45pt or on a flick faster than 0.11pt/ms it goes.
    @objc private func panned(_ pan: UIPanGestureRecognizer) {
        switch pan.state {
        case .began:
            held = true
            start = center
            began = Date()
        case .changed:
            center.y = start.y + pan.translation(in: superview).y
        case .ended, .cancelled:
            held = false
            let moved = pan.translation(in: superview).y
            let elapsed = max(1, Date().timeIntervalSince(began) * 1000)
            if abs(moved) > 45 || abs(moved) / elapsed > 0.11 {
                onDismiss(moved)
            } else {
                Motion.easeOut.animator(Motion.durControl) { self.center = self.start }.startAnimation()
            }
        default:
            break
        }
    }
}
