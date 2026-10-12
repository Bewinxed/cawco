import UIKit

/// The kit's floating surface (app.css `.kit-pop`, bits-ui Popover): a card
/// hung off its trigger, no arrow, `sideOffset` below it (or above when the
/// screen has no room), its start or end edge on the trigger's and kept 8pt
/// inside the screen. It grows out of the trigger: from 8pt toward it and
/// the pop scale to rest as it fades in over `durPop` on the drawer curve,
/// and back over `durExit`; with less motion only the fade. A tap outside
/// closes it. The content sizes it through `preferredContentSize`.
public final class KitPopover: NSObject, UIViewControllerTransitioningDelegate {
    public enum Align: Sendable { case start, end, center }
    /// Which side of its trigger it opens on first (bits-ui `side`); it
    /// flips to the other where the screen has no room.
    public enum Side: Sendable { case bottom, top }

    /// How the card arrives: from `scale` and `rise` toward its trigger, to
    /// rest over `duration` on `curve`. A popover may set its own
    /// (`--pop-scale`, `--pop-rise`, its open duration and timing).
    public struct Entrance: Sendable {
        public var scale: Double
        public var rise: Double
        public var duration: Double
        public var curve: TimingCurve

        public init(scale: Double, rise: Double, duration: Double, curve: TimingCurve) {
            self.scale = scale
            self.rise = rise
            self.duration = duration
            self.curve = curve
        }

        /// `.kit-pop`'s own: the pop scale and rise over `durPop` on the drawer curve.
        public static let standard = Entrance(scale: Motion.popScale, rise: Motion.popRise, duration: Motion.durPop, curve: Motion.easeDrawer)
    }

    private weak var source: UIView?
    private let align: Align
    private let side: Side
    /// The part of `source` it hangs off, in the source's coordinates (a
    /// cell's row across its whole wall, bits-ui `customAnchor`); nil: all of it.
    private let rect: CGRect?
    private let offset: Double
    private let entrance: Entrance
    /// Views under the popover that still take touches while it is up: the
    /// sibling triggers of a popover group, so a press on one moves to its
    /// popover instead of only closing this one.
    private var passthrough: [Weak] = []

    struct Weak {
        weak var view: UIView?
    }

    /// Presents `content` off `source`; keep the returned object for as long as it is up.
    @MainActor
    @discardableResult
    public static func present(_ content: UIViewController, from source: UIView, rect: CGRect? = nil, in presenter: UIViewController,
                               align: Align = .start, side: Side = .bottom, offset: Double = 6,
                               entrance: Entrance = .standard, passthrough: [UIView] = []) -> KitPopover {
        let popover = KitPopover(source: source, rect: rect, align: align, side: side, offset: offset, entrance: entrance)
        popover.passthrough = passthrough.map { Weak(view: $0) }
        content.modalPresentationStyle = .custom
        content.transitioningDelegate = popover
        objc_setAssociatedObject(content, &KitPopover.key, popover, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        presenter.present(content, animated: true)
        return popover
    }

    nonisolated(unsafe) private static var key = 0

    private init(source: UIView, rect: CGRect?, align: Align, side: Side, offset: Double, entrance: Entrance) {
        self.source = source
        self.rect = rect
        self.align = align
        self.side = side
        self.offset = offset
        self.entrance = entrance
    }

    public func presentationController(forPresented presented: UIViewController, presenting: UIViewController?, source _: UIViewController) -> UIPresentationController? {
        let presentation = Presentation(presentedViewController: presented, presenting: presenting, anchor: source, rect: rect, align: align, side: side,
                                        offset: offset)
        presentation.catcher.passthrough = passthrough
        return presentation
    }

    /// The ground under the card: a tap on it closes the popover, but where a
    /// passthrough control stands the tap is that control's own press.
    final class Catcher: UIView {
        var passthrough: [Weak] = []

        func control(at point: CGPoint) -> UIControl? {
            for entry in passthrough {
                guard let view = entry.view as? UIControl, view.window != nil, !view.isHidden else { continue }
                if view.point(inside: convert(point, to: view), with: nil) { return view }
            }
            return nil
        }
    }

    public func animationController(forPresented _: UIViewController, presenting _: UIViewController, source _: UIViewController) -> (any UIViewControllerAnimatedTransitioning)? {
        Animator(presenting: true, entrance: entrance)
    }

    public func animationController(forDismissed _: UIViewController) -> (any UIViewControllerAnimatedTransitioning)? {
        Animator(presenting: false, entrance: entrance)
    }

    final class Presentation: UIPresentationController {
        private weak var anchor: UIView?
        private let rect: CGRect?
        private let align: Align
        private let side: Side
        private let offset: Double
        let catcher = Catcher()
        /// Whether the card hangs above its trigger.
        private(set) var above = false

        init(presentedViewController: UIViewController, presenting: UIViewController?, anchor: UIView?, rect: CGRect?, align: Align, side: Side,
             offset: Double) {
            self.anchor = anchor
            self.rect = rect
            self.align = align
            self.side = side
            self.offset = offset
            super.init(presentedViewController: presentedViewController, presenting: presenting)
        }

        /// The trigger's frame in the container: its `rect`, or all of it.
        private func trigger(in container: UIView) -> CGRect? {
            guard let anchor else { return nil }
            return anchor.convert(rect ?? anchor.bounds, to: container)
        }

        /// The keyboard's top in the container, while one is up: the card keeps above it.
        private var keyboardTop: CGFloat?

        @objc private func keyboardMoved(_ note: Notification) {
            guard let container = containerView, let end = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
            let frame = container.convert(end, from: nil)
            keyboardTop = frame.minY < container.bounds.maxY ? frame.minY : nil
            container.setNeedsLayout()
            Motion.easeOut.animator(Motion.durMorph) { container.layoutIfNeeded() }.startAnimation()
        }

        override var frameOfPresentedViewInContainerView: CGRect {
            guard let container = containerView, let trigger = trigger(in: container) else { return .zero }
            var bounds = container.bounds.inset(by: container.safeAreaInsets)
            if let keyboardTop { bounds.size.height = min(bounds.height, keyboardTop - bounds.minY) }
            let safe = bounds.insetBy(dx: 8, dy: 8)
            var size = presentedViewController.preferredContentSize
            size.width = min(size.width, safe.width)
            size.height = min(size.height, safe.height)
            // Floating UI's flip, then its shift: on its side of the trigger,
            // else the other, else as near it as the screen (and the keyboard) leave room for.
            let below = trigger.maxY + offset
            let over = trigger.minY - offset - size.height
            let roomBelow = below + size.height <= safe.maxY
            let roomAbove = over >= safe.minY
            above = side == .top ? roomAbove || !roomBelow : !roomBelow && roomAbove
            var y = above ? over : below
            y = min(max(y, safe.minY), safe.maxY - size.height)
            var x = switch align {
            case .start: trigger.minX
            case .end: trigger.maxX - size.width
            case .center: trigger.midX - size.width / 2
            }
            x = min(max(x, safe.minX), safe.maxX - size.width)
            return CGRect(origin: CGPoint(x: x, y: y), size: size)
        }

        override func presentationTransitionWillBegin() {
            guard let container = containerView else { return }
            catcher.frame = container.bounds
            catcher.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            catcher.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(outside(_:))))
            container.insertSubview(catcher, at: 0)
            NotificationCenter.default.addObserver(self, selector: #selector(keyboardMoved(_:)), name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
        }

        override func containerViewWillLayoutSubviews() {
            presentedView?.frame = frameOfPresentedViewInContainerView
        }

        override func preferredContentSizeDidChange(forChildContentContainer _: any UIContentContainer) {
            containerView?.setNeedsLayout()
            let pace = (presentedViewController as? KitPopoverController)?.resize
            (pace?.curve ?? Motion.easeOut).animator(pace?.duration ?? Motion.durMorph) { self.containerView?.layoutIfNeeded() }.startAnimation()
        }

        /// Where the card grows from: the trigger's side of it.
        var origin: CGPoint {
            let frame = frameOfPresentedViewInContainerView
            guard let container = containerView, let trigger = trigger(in: container) else { return CGPoint(x: 0.5, y: 0) }
            let x = frame.width > 0 ? min(1, max(0, (trigger.midX - frame.minX) / frame.width)) : 0.5
            return CGPoint(x: x, y: above ? 1 : 0)
        }

        @objc private func outside(_ tap: UITapGestureRecognizer) {
            if let control = catcher.control(at: tap.location(in: catcher)) {
                control.sendActions(for: .touchUpInside)
                return
            }
            presentedViewController.dismiss(animated: true)
        }
    }

    private final class Animator: NSObject, UIViewControllerAnimatedTransitioning {
        private let presenting: Bool
        private let entrance: Entrance

        init(presenting: Bool, entrance: Entrance) {
            self.presenting = presenting
            self.entrance = entrance
        }

        func transitionDuration(using _: (any UIViewControllerContextTransitioning)?) -> TimeInterval {
            presenting ? entrance.duration : Motion.durExit
        }

        func animateTransition(using context: any UIViewControllerContextTransitioning) {
            let controller = context.viewController(forKey: presenting ? .to : .from)
            guard let view = context.view(forKey: presenting ? .to : .from), let controller else {
                context.completeTransition(true)
                return
            }
            let presentation = controller.presentationController as? Presentation
            let still = UIAccessibility.isReduceMotionEnabled
            let rise = (presentation?.above ?? false) ? entrance.rise : -entrance.rise
            let away = still ? .identity : CGAffineTransform(translationX: 0, y: rise).scaledBy(x: entrance.scale, y: entrance.scale)
            if presenting {
                context.containerView.addSubview(view)
                view.frame = context.finalFrame(for: controller)
                if let origin = presentation?.origin {
                    let frame = view.frame
                    view.layer.anchorPoint = origin
                    view.frame = frame
                }
                view.alpha = 0
                view.transform = away
            }
            let animator = entrance.curve.animator(transitionDuration(using: context)) { [presenting] in
                view.alpha = presenting ? 1 : 0
                view.transform = presenting ? .identity : away
            }
            animator.addCompletion { _ in context.completeTransition(!context.transitionWasCancelled) }
            animator.startAnimation()
        }
    }
}

/// The card a `KitPopover` shows: `.kit-pop`'s 1pt control border,
/// `--radius-lg`, the raised surface and the overlay shadow; or the panel
/// material (`material-panel`) where a caller asks for it.
open class KitPopoverController: UIViewController {
    public let card = UIView()
    /// How the card follows a change of its content's size: a popover whose
    /// content folds open sets the fold's own pace (default `durMorph` on the out curve).
    public var resize: (duration: TimeInterval, curve: TimingCurve)?
    private let material: Bool
    private var blur: UIVisualEffectView?

    public init(material: Bool = false) {
        self.material = material
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    public required init?(coder _: NSCoder) {
        fatalError("KitPopoverController is built in code")
    }

    override open func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        card.layer.cornerRadius = Radius.radiusLg
        card.layer.cornerCurve = .continuous
        card.layer.borderWidth = 1
        card.clipsToBounds = true
        card.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(card)
        NSLayoutConstraint.activate([
            card.topAnchor.constraint(equalTo: view.topAnchor),
            card.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            card.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            card.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        if material, !UIAccessibility.isReduceTransparencyEnabled {
            let effect = UIVisualEffectView(effect: UIBlurEffect(style: .systemThinMaterial))
            effect.frame = card.bounds
            effect.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            card.insertSubview(effect, at: 0)
            blur = effect
        }
        // `.kit-pop { box-shadow: var(--shadow-overlay) }`, cast by the card's
        // rounded rect: the card clips its content, so the view, which is the
        // card's frame, casts it.
        view.layer.cornerRadius = Radius.radiusLg
        view.layer.cornerCurve = .continuous
        view.boxShadow = Shadow.shadowOverlay
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (controller: KitPopoverController, _: UITraitCollection) in controller.paint() }
        paint()
    }

    private func paint() {
        card.layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
        if material {
            card.backgroundColor = UIAccessibility.isReduceTransparencyEnabled ? Palette.background : Palette.materialPanel
        } else {
            card.backgroundColor = Palette.surfaceRaised
        }
    }
}
