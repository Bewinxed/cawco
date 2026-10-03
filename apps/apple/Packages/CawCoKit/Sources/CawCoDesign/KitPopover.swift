import UIKit

/// The kit's floating surface (app.css `.kit-pop`, bits-ui Popover): a card
/// hung off its trigger, no arrow, `sideOffset` below it (or above when the
/// screen has no room), its start or end edge on the trigger's and kept 8pt
/// inside the screen. It grows out of the trigger: from 8pt toward it and
/// the pop scale to rest as it fades in over `durPop` on the drawer curve,
/// and back over `durExit`; with less motion only the fade. A tap outside
/// closes it. The content sizes it through `preferredContentSize`.
public final class KitPopover: NSObject, UIViewControllerTransitioningDelegate {
    public enum Align: Sendable { case start, end }

    private weak var source: UIView?
    private let align: Align
    private let offset: Double

    /// Presents `content` off `source`; keep the returned object for as long as it is up.
    @MainActor
    @discardableResult
    public static func present(_ content: UIViewController, from source: UIView, in presenter: UIViewController, align: Align = .start, offset: Double = 6) -> KitPopover {
        let popover = KitPopover(source: source, align: align, offset: offset)
        content.modalPresentationStyle = .custom
        content.transitioningDelegate = popover
        objc_setAssociatedObject(content, &KitPopover.key, popover, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        presenter.present(content, animated: true)
        return popover
    }

    nonisolated(unsafe) private static var key = 0

    private init(source: UIView, align: Align, offset: Double) {
        self.source = source
        self.align = align
        self.offset = offset
    }

    public func presentationController(forPresented presented: UIViewController, presenting: UIViewController?, source _: UIViewController) -> UIPresentationController? {
        Presentation(presentedViewController: presented, presenting: presenting, anchor: source, align: align, offset: offset)
    }

    public func animationController(forPresented _: UIViewController, presenting _: UIViewController, source _: UIViewController) -> (any UIViewControllerAnimatedTransitioning)? {
        Animator(presenting: true)
    }

    public func animationController(forDismissed _: UIViewController) -> (any UIViewControllerAnimatedTransitioning)? {
        Animator(presenting: false)
    }

    final class Presentation: UIPresentationController {
        private weak var anchor: UIView?
        private let align: Align
        private let offset: Double
        private let catcher = UIView()
        /// Whether the card hangs above its trigger (no room below).
        private(set) var above = false

        init(presentedViewController: UIViewController, presenting: UIViewController?, anchor: UIView?, align: Align, offset: Double) {
            self.anchor = anchor
            self.align = align
            self.offset = offset
            super.init(presentedViewController: presentedViewController, presenting: presenting)
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
            guard let container = containerView, let anchor else { return .zero }
            let trigger = anchor.convert(anchor.bounds, to: container)
            var bounds = container.bounds.inset(by: container.safeAreaInsets)
            if let keyboardTop { bounds.size.height = min(bounds.height, keyboardTop - bounds.minY) }
            let safe = bounds.insetBy(dx: 8, dy: 8)
            var size = presentedViewController.preferredContentSize
            size.width = min(size.width, safe.width)
            size.height = min(size.height, safe.height)
            // Floating UI's flip, then its shift: below the trigger, else above
            // it, else as near it as the screen (and the keyboard) leave room for.
            let below = trigger.maxY + offset
            above = below + size.height > safe.maxY && trigger.minY - offset - size.height >= safe.minY
            var y = above ? trigger.minY - offset - size.height : below
            y = min(max(y, safe.minY), safe.maxY - size.height)
            var x = align == .start ? trigger.minX : trigger.maxX - size.width
            x = min(max(x, safe.minX), safe.maxX - size.width)
            return CGRect(origin: CGPoint(x: x, y: y), size: size)
        }

        override func presentationTransitionWillBegin() {
            guard let container = containerView else { return }
            catcher.frame = container.bounds
            catcher.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            catcher.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(outside)))
            container.insertSubview(catcher, at: 0)
            NotificationCenter.default.addObserver(self, selector: #selector(keyboardMoved(_:)), name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
        }

        override func containerViewWillLayoutSubviews() {
            presentedView?.frame = frameOfPresentedViewInContainerView
        }

        override func preferredContentSizeDidChange(forChildContentContainer _: any UIContentContainer) {
            containerView?.setNeedsLayout()
            Motion.easeOut.animator(Motion.durMorph) { self.containerView?.layoutIfNeeded() }.startAnimation()
        }

        /// Where the card grows from: the trigger's side of it.
        var origin: CGPoint {
            let frame = frameOfPresentedViewInContainerView
            guard let container = containerView, let anchor else { return CGPoint(x: 0.5, y: 0) }
            let trigger = anchor.convert(anchor.bounds, to: container)
            let x = frame.width > 0 ? min(1, max(0, (trigger.midX - frame.minX) / frame.width)) : 0.5
            return CGPoint(x: x, y: above ? 1 : 0)
        }

        @objc private func outside() {
            presentedViewController.dismiss(animated: true)
        }
    }

    private final class Animator: NSObject, UIViewControllerAnimatedTransitioning {
        private let presenting: Bool

        init(presenting: Bool) {
            self.presenting = presenting
        }

        func transitionDuration(using _: (any UIViewControllerContextTransitioning)?) -> TimeInterval {
            presenting ? Motion.durPop : Motion.durExit
        }

        func animateTransition(using context: any UIViewControllerContextTransitioning) {
            let controller = context.viewController(forKey: presenting ? .to : .from)
            guard let view = context.view(forKey: presenting ? .to : .from), let controller else {
                context.completeTransition(true)
                return
            }
            let presentation = controller.presentationController as? Presentation
            let still = UIAccessibility.isReduceMotionEnabled
            let rise = (presentation?.above ?? false) ? Motion.popRise : -Motion.popRise
            let away = still ? .identity : CGAffineTransform(translationX: 0, y: rise).scaledBy(x: Motion.popScale, y: Motion.popScale)
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
            let animator = Motion.easeDrawer.animator(transitionDuration(using: context)) { [presenting] in
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
        view.layer.shadowColor = UIColor.black.cgColor
        view.layer.shadowOpacity = 0.16
        view.layer.shadowRadius = 24
        view.layer.shadowOffset = CGSize(width: 0, height: 18)
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
