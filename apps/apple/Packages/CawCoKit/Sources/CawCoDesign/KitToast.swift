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
    public static func show(_ message: String, description: String? = nil, kind: Kind = .plain, action: Action? = nil, sticky: Bool = false, in view: UIView?) {
        guard let layer = layer(for: view) else { return }
        layer.add(ToastView(message: message, description: description, kind: kind, action: action), sticky: sticky)
        UIAccessibility.post(notification: .announcement, argument: message)
    }

    /// The update notice (DESIGN.md, Update notice; the dashboard's
    /// UpdateNotice.svelte): `lead` (Caw at 48pt) on the leading edge, the
    /// title in label type, the line in meta type, and the act's `sm` button
    /// at the text column's trailing edge. It stays until its ✕ or its act:
    /// no timeout, no swipe. The ✕ is a 20pt pill chip on the lead's top
    /// corner, 44pt under a finger, read as "Dismiss".
    public static func notice(_ title: String, line: String, lead: UIView, action: Action?, in view: UIView?) {
        guard let layer = layer(for: view) else { return }
        layer.add(ToastView(notice: title, line: line, lead: lead, action: action), sticky: true)
        UIAccessibility.post(notification: .announcement, argument: "\(title). \(line)")
    }

    private static func layer(for view: UIView?) -> ToastWindow? {
        guard let scene = view?.window?.windowScene ?? UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first else { return nil }
        if let made = layers[ObjectIdentifier(scene)] { return made }
        let made = ToastWindow(windowScene: scene)
        layers[ObjectIdentifier(scene)] = made
        return made
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

    func add(_ toast: ToastView, sticky: Bool) {
        guard let host = rootViewController?.view else { return }
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

/// The update notice's ✕ (UpdateNotice.svelte `.x`): a 20pt pill chip on the
/// raised surface in the control edge with the tile shadow, a 12pt close
/// glyph in muted ink, and a 44pt touch area; VoiceOver reads it as "Dismiss".
private final class NoticeCloseChip: UIButton {
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
        boxShadow = Shadow.shadowTile
        accessibilityLabel = "Dismiss"
        accessibilityIdentifier = "notice-dismiss"
        addAction(UIAction { _ in run() }, for: .touchUpInside)
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: Size.cBadgeH),
            heightAnchor.constraint(equalToConstant: Size.cBadgeH),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (chip: NoticeCloseChip, _: UITraitCollection) in chip.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("NoticeCloseChip is built in code")
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
    /// The box's edge: the control border on a toast, the hairline on the notice.
    private let edge: UIColor

    /// The floating surface every toast and the notice stand on.
    private init(edge: UIColor) {
        self.edge = edge
        super.init(frame: .zero)
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Radius.radiusLg
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        boxShadow = Shadow.shadowOverlay
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: ToastView, _: UITraitCollection) in view.paint() }
        paint()
    }

    convenience init(message: String, description: String?, kind: Toast.Kind, action: Toast.Action?) {
        self.init(edge: Palette.borderControl)
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
    }

    /// UpdateNotice.svelte's box: 12pt by 14pt in, `lead` at 48pt holding the
    /// leading column's top without sizing any row, the text column
    /// `space-3` after it, rows `space-row` apart, the act `space-2` under
    /// them at the column's trailing edge, and the ✕ 6pt into the lead's
    /// top corner. Only the ✕ or the act closes it.
    convenience init(notice title: String, line: String, lead: UIView, action: Toast.Action?) {
        self.init(edge: Palette.borderHairline)
        let padBlock = 12.0, padInline = 14.0, side = 48.0
        lead.translatesAutoresizingMaskIntoConstraints = false
        addSubview(lead)
        let heading = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
        heading.text = title
        heading.accessibilityTraits = .header
        let words = KitLabel(TypeScale.typeMeta, ink: Palette.inkStrong, lines: 0)
        words.text = line
        let column = UIStackView(arrangedSubviews: [heading, words])
        column.axis = .vertical
        column.spacing = Space.spaceRow
        // The words, the act and the ✕ each read on their own; the lead is a picture.
        var elements: [Any] = [heading, words]
        if let action {
            let act = KitButton.make(action.label, variant: .action, height: .sm) { [weak self] in
                action.run()
                self?.onDismiss(nil)
            }
            let buttons = UIStackView(arrangedSubviews: [UIView(), act])
            buttons.alignment = .center
            column.addArrangedSubview(buttons)
            column.setCustomSpacing(Space.space2, after: words)
            elements.append(act)
        }
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        let close = NoticeCloseChip { [weak self] in self?.onDismiss(nil) }
        addSubview(close)
        // The box's floor is the lead's height; the column alone sets it past that.
        let fit = bottomAnchor.constraint(equalTo: column.bottomAnchor, constant: padBlock)
        fit.priority = .defaultHigh
        NSLayoutConstraint.activate([
            lead.topAnchor.constraint(equalTo: topAnchor, constant: padBlock),
            lead.leadingAnchor.constraint(equalTo: leadingAnchor, constant: padInline),
            lead.widthAnchor.constraint(equalToConstant: side),
            lead.heightAnchor.constraint(equalToConstant: side),
            bottomAnchor.constraint(greaterThanOrEqualTo: lead.bottomAnchor, constant: padBlock),
            column.topAnchor.constraint(equalTo: topAnchor, constant: padBlock),
            column.leadingAnchor.constraint(equalTo: lead.trailingAnchor, constant: Space.space3),
            column.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -padInline),
            bottomAnchor.constraint(greaterThanOrEqualTo: column.bottomAnchor, constant: padBlock),
            fit,
            close.topAnchor.constraint(equalTo: topAnchor, constant: 6),
            close.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 6),
        ])
        isAccessibilityElement = false
        elements.append(close)
        accessibilityElements = elements
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ToastView is built in code")
    }

    private func paint() {
        layer.borderColor = edge.resolvedColor(with: traitCollection).cgColor
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
