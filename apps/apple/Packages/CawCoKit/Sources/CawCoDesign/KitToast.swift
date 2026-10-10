import UIKit

/// The kit's toasts (ui/sonner on svelte-sonner, as the root layout sets
/// it: expanded, top-centre under the top bar up to 640pt, bottom-right on
/// a desk). Each is the floating surface (`--surface-raised` in the control
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
    /// `closable`: a notice closed only by its ✕ (DESIGN.md, Update notice):
    /// it never times out and does not swipe away; the ✕ is a 20pt pill chip
    /// on its top leading corner, 44pt under a finger, read as "Dismiss".
    public static func show(_ message: String, description: String? = nil, kind: Kind = .plain, action: Action? = nil,
                            sticky: Bool = false, closable: Bool = false, in view: UIView?) {
        guard let scene = view?.window?.windowScene ?? UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first else { return }
        let layer = layers[ObjectIdentifier(scene)] ?? {
            let made = ToastWindow(windowScene: scene)
            layers[ObjectIdentifier(scene)] = made
            return made
        }()
        layer.add(message, description: description, kind: kind, action: action, sticky: sticky || closable, closable: closable)
        UIAccessibility.post(notification: .announcement, argument: message)
    }

    private static var layers: [ObjectIdentifier: ToastWindow] = [:]
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

    func add(_ message: String, description: String?, kind: Toast.Kind, action: Toast.Action?, sticky: Bool, closable: Bool) {
        guard let host = rootViewController?.view else { return }
        let toast = ToastView(message: message, description: description, kind: kind, action: action, closable: closable)
        toast.onDismiss = { [weak self, weak toast] velocity in
            guard let self, let toast else { return }
            remove(toast, thrown: velocity)
        }
        host.addSubview(toast)
        toasts.insert(toast, at: 0)
        let width = narrow ? bounds.width - 24 : 356
        let size = toast.systemLayoutSizeFitting(CGSize(width: width, height: 0), withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel)
        toast.bounds = CGRect(origin: .zero, size: CGSize(width: width, height: size.height))
        let rest = place(toast, at: 0)
        let still = UIAccessibility.isReduceMotionEnabled
        toast.center = still ? rest : CGPoint(x: rest.x, y: rest.y + (narrow ? -Motion.popRise : Motion.popRise))
        toast.alpha = 0
        Motion.easeOut.animator(Motion.durPanel) {
            toast.alpha = 1
            toast.center = rest
        }.startAnimation()
        restack(except: toast)
        guard !sticky else { return }
        Task { @MainActor [weak self, weak toast] in
            try? await Task.sleep(for: .seconds(Self.lifetime))
            guard let self, let toast, toast.superview != nil, !toast.held else { return }
            remove(toast, thrown: nil)
        }
    }

    /// Where the toast at `index` (0 nearest its edge) rests.
    private func place(_ toast: ToastView, at index: Int) -> CGPoint {
        let before = toasts.prefix(index).reduce(0) { $0 + $1.bounds.height + Self.gap }
        let half = toast.bounds.height / 2
        if narrow {
            return CGPoint(x: bounds.midX, y: safeAreaInsets.top + Size.cTopBarH + Space.space2 + before + half)
        }
        return CGPoint(x: bounds.maxX - safeAreaInsets.right - 24 - toast.bounds.width / 2,
                       y: bounds.maxY - safeAreaInsets.bottom - 24 - before - half)
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

/// A closable notice's ✕ (DESIGN.md, Update notice): a 20pt pill chip on the
/// raised surface in the control edge, a 12pt close glyph in muted ink, and a
/// 44pt touch area; VoiceOver reads it as "Dismiss".
private final class ToastCloseChip: UIButton {
    init(_ run: @escaping @MainActor () -> Void) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        var config = UIButton.Configuration.plain()
        config.image = Glyph.close.image.resized(to: Size.iconSm)
        config.contentInsets = .zero
        configuration = config
        tintColor = Palette.inkMuted
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Size.cBadgeH / 2
        layer.borderWidth = 1
        accessibilityLabel = "Dismiss"
        accessibilityIdentifier = "toast-dismiss"
        addAction(UIAction { _ in run() }, for: .touchUpInside)
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: Size.cBadgeH),
            heightAnchor.constraint(equalToConstant: Size.cBadgeH),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (chip: ToastCloseChip, _: UITraitCollection) in chip.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ToastCloseChip is built in code")
    }

    private func paint() {
        layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
    }

    override func point(inside point: CGPoint, with _: UIEvent?) -> Bool {
        let grow = (Size.cBtnHLg - Size.cBadgeH) / 2
        return bounds.insetBy(dx: -grow, dy: -grow).contains(point)
    }
}

private final class ToastView: UIView {
    var onDismiss: (CGFloat?) -> Void = { _ in }
    /// Under a finger: it does not time out.
    private(set) var held = false
    private var start = CGPoint.zero
    private var began = Date()

    /// A closable toast's ✕ (`Toast.show(closable:)`).
    private var close: ToastCloseChip?

    init(message: String, description: String?, kind: Toast.Kind, action: Toast.Action?, closable: Bool) {
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
        if closable {
            // Only its ✕ closes it: no swipe, floating on the lead's top corner.
            let chip = ToastCloseChip { [weak self] in self?.onDismiss(nil) }
            addSubview(chip)
            NSLayoutConstraint.activate([
                chip.centerXAnchor.constraint(equalTo: leadingAnchor),
                chip.centerYAnchor.constraint(equalTo: topAnchor),
            ])
            close = chip
        } else {
            addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(panned(_:))))
        }
        // With an action or a ✕ those are their own elements; without, the toast reads as one.
        isAccessibilityElement = action == nil && !closable
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

    /// The ✕ hangs over the corner: its whole touch area counts as the toast's.
    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        if super.point(inside: point, with: event) { return true }
        guard let close else { return false }
        return close.point(inside: convert(point, to: close), with: event)
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
