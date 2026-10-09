import UIKit

/// The app's one confirm (ConfirmDialog.svelte on the kit's `alert-dialog`),
/// in the kit's dialog chrome without a close button. The title in title
/// type, the description in label type and muted ink, 6pt apart
/// (`gap-1.5`), then Cancel and the confirm in the kit footer. The confirm
/// runs the asked work and stays pending, the dialog open, until it ends:
/// work that fails keeps it open and says why under the description; only
/// work that succeeds closes it. Up to 448pt wide from a 640pt screen (its
/// text left, its buttons in a row at the end), 320pt below (centred, the
/// confirm stacked over Cancel). A body of several paragraphs (split by a
/// blank line) reads from its start at every width. `grant` draws the
/// confirm as a consequential grant (button.svelte `grant`): the warning
/// tint, its ink and a real edge, the shield before the label.
public final class ConfirmDialog: KitDialogController {
    private let titleText: String
    private let bodyText: String?
    private let confirmLabel: String
    private let pendingLabel: String?
    private let cancelLabel: String
    private let destructive: Bool
    private let grant: Bool
    private let work: () async throws -> Void
    private let failure = KitLabel(TypeScale.typeBody, ink: Palette.statusFailInk, lines: 0)
    private var confirm: UIButton!

    public init(title: String, body: String? = nil, confirmLabel: String = "Confirm", pendingLabel: String? = nil,
                cancelLabel: String = "Cancel", destructive: Bool = false, grant: Bool = false,
                work: @escaping () async throws -> Void) {
        titleText = title
        bodyText = body
        self.confirmLabel = confirmLabel
        self.pendingLabel = pendingLabel
        self.cancelLabel = cancelLabel
        self.destructive = destructive
        self.grant = grant
        self.work = work
        super.init(width: KitDialogController.wide ? .md : .xs, closable: false)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ConfirmDialog is built in code")
    }

    override public func viewDidLoad() {
        super.viewDidLoad()
        let title = KitLabel(TypeScale.typeTitle, ink: Palette.foreground, lines: 0)
        title.text = titleText
        title.accessibilityTraits = .header
        let description = KitLabel(TypeScale.typeLabel, ink: Palette.mutedForeground, lines: 0)
        description.text = bodyText
        // `text-balance md:text-pretty` (alert-dialog-description.svelte).
        description.wrap = UIScreen.main.bounds.width >= 768 ? .pretty : .balance
        description.isHidden = bodyText == nil
        failure.isHidden = true
        let header = UIStackView(arrangedSubviews: [title, description, failure])
        header.axis = .vertical
        header.spacing = 6
        // Centred below 640pt, unless several paragraphs read from their start.
        if !KitDialogController.wide, bodyText?.contains("\n\n") != true {
            [title, description, failure].forEach { $0.textAlignment = .center }
        }

        if destructive || grant {
            let style = grant ? Self.grantStyle(confirmLabel) : Self.destructiveStyle(confirmLabel)
            confirm = UIButton(configuration: style, primaryAction: UIAction { [weak self] _ in self?.accept() })
            confirm.houseStyle()
            confirm.translatesAutoresizingMaskIntoConstraints = false
            confirm.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnH).isActive = true
        } else {
            confirm = KitButton.make(confirmLabel, variant: .action) { [weak self] in self?.accept() }
        }
        let cancel = KitButton.make(cancelLabel, variant: .outline) { [weak self] in self?.dismiss(animated: true) }
        body.addArrangedSubview(header)
        body.addArrangedSubview(KitDialogController.footer([cancel, confirm]))
    }

    /// A destructive confirm: the error border and ink on no fill (button.svelte `destructive`).
    private static func destructiveStyle(_ title: String) -> UIButton.Configuration {
        var config = UIButton.Configuration.plain()
        config.attributedTitle = AttributedString(title, attributes: TypeScale.typeButton.container(color: Palette.error11, tracking: -0.01))
        config.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: Space.space4, bottom: 0, trailing: Space.space4)
        config.background.cornerRadius = Radius.radiusMd
        config.background.backgroundColor = .clear
        config.background.strokeColor = Palette.error9
        config.background.strokeWidth = 1
        config.imagePadding = 8
        config.activityIndicatorColorTransformer = UIConfigurationColorTransformer { _ in Palette.error11 }
        return config
    }

    /// A grant wider than the one asked for (button.svelte `grant`): the
    /// warning tint, its ink and edge, the same under the finger.
    private static func grantStyle(_ title: String) -> UIButton.Configuration {
        var config = UIButton.Configuration.plain()
        config.attributedTitle = AttributedString(title, attributes: TypeScale.typeButton.container(color: Palette.statusAttnInk, tracking: -0.01))
        config.image = Glyph.shield.image
        config.imageColorTransformer = UIConfigurationColorTransformer { _ in Palette.statusAttnInk }
        config.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: Space.space4, bottom: 0, trailing: Space.space4)
        config.background.cornerRadius = Radius.radiusMd
        config.background.backgroundColor = Palette.statusAttnBg
        config.background.strokeColor = Palette.statusAttnInk
        config.background.strokeWidth = 1
        config.imagePadding = 8
        config.activityIndicatorColorTransformer = UIConfigurationColorTransformer { _ in Palette.statusAttnInk }
        return config
    }

    /// The confirm's label and spinner while the work runs.
    private func pending(_ on: Bool) {
        let label = on ? (pendingLabel ?? confirmLabel) : confirmLabel
        let ink = grant ? Palette.statusAttnInk : (destructive ? Palette.error11 : Palette.onAction)
        confirm.configuration?.attributedTitle = AttributedString(label, attributes: TypeScale.typeButton.container(color: ink, tracking: -0.01))
        confirm.configuration?.showsActivityIndicator = on
        confirm.configuration?.imagePadding = 8
        confirm.configuration?.activityIndicatorColorTransformer = UIConfigurationColorTransformer { _ in ink }
    }

    /// While the work runs the scrim and Escape leave the dialog up; Cancel still closes it.
    private func accept() {
        guard !holdsOpen else { return }
        holdsOpen = true
        pending(true)
        Task { @MainActor in
            do {
                try await work()
                holdsOpen = false
                dismiss(animated: true)
            } catch {
                holdsOpen = false
                pending(false)
                failure.text = error.localizedDescription
                morph { failure.isHidden = false }
                UIAccessibility.post(notification: .announcement, argument: failure.text)
            }
        }
    }
}

/// The scrim (`kit-scrim`: `--scrim` with its blur), fading in over
/// `durPanel` and out over `durExit`; a tap on it closes what it holds.
///
/// The blur is the token's `scrimBlur` (2pt), which no system material is:
/// those blur by tens of points and bring a tint of their own, and at night
/// that tint over `--scrim` hid the page altogether. So the effect view's
/// blur is held at the fraction of the way in that gives 2pt, taking the
/// full effect's radius as 30pt.
public final class ScrimPresentation: UIPresentationController, UIGestureRecognizerDelegate {
    private let scrim = UIVisualEffectView(effect: nil)
    private let onTap: () -> Void
    private var blur: UIViewPropertyAnimator?
    private var tap: UITapGestureRecognizer?
    private static let fullBlur = 30.0

    public init(presentedViewController: UIViewController, presenting: UIViewController?, onTap: @escaping () -> Void) {
        self.onTap = onTap
        super.init(presentedViewController: presentedViewController, presenting: presenting)
    }

    override public func presentationTransitionWillBegin() {
        guard let container = containerView else { return }
        scrim.frame = container.bounds
        scrim.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        let tint = UIView(frame: scrim.bounds)
        tint.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        tint.backgroundColor = Palette.scrim
        scrim.contentView.addSubview(tint)
        let blur = UIViewPropertyAnimator(duration: 1, curve: .linear) { [scrim] in scrim.effect = UIBlurEffect(style: .regular) }
        blur.pausesOnCompletion = true
        blur.fractionComplete = Size.scrimBlur / Self.fullBlur
        self.blur = blur
        scrim.alpha = 0
        container.insertSubview(scrim, at: 0)
        // On the container, since what is presented fills it with a clear
        // root that stands over the scrim: a tap that lands on that root, or
        // on the scrim, is a tap outside the panel.
        let tap = UITapGestureRecognizer(target: self, action: #selector(tapped))
        tap.delegate = self
        container.addGestureRecognizer(tap)
        self.tap = tap
        Motion.easeOut.animator(Motion.durPanel) { self.scrim.alpha = 1 }.startAnimation()
    }

    override public func presentationTransitionDidEnd(_ completed: Bool) {
        if !completed { release() }
    }

    override public func dismissalTransitionWillBegin() {
        // The scrim goes in step with what is presented: over that transition's own duration.
        Motion.easeOut.animator(presentedViewController.transitionCoordinator?.transitionDuration ?? Motion.durExit) { self.scrim.alpha = 0 }.startAnimation()
    }

    override public func dismissalTransitionDidEnd(_ completed: Bool) {
        if completed { release() }
    }

    /// A held animator has to be stopped before it is let go.
    private func release() {
        blur?.stopAnimation(true)
        blur = nil
        if let tap { tap.view?.removeGestureRecognizer(tap) }
        tap = nil
        scrim.removeFromSuperview()
    }

    @objc private func tapped() { onTap() }

    public func gestureRecognizer(_: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        guard let hit = touch.view else { return false }
        return hit === presentedViewController.view || hit.isDescendant(of: scrim)
    }
}

/// `kit-dialog-in` / `-out`: 6pt of rise and a fade.
final class DialogAnimator: NSObject, UIViewControllerAnimatedTransitioning {
    private let presenting: Bool
    /// The control the dialog grows from and goes back into (WorkflowLaunch.svelte `fromButton`).
    private weak var origin: UIView?

    init(presenting: Bool, origin: UIView? = nil) {
        self.presenting = presenting
        self.origin = origin
    }

    func transitionDuration(using _: (any UIViewControllerContextTransitioning)?) -> TimeInterval {
        presenting ? Motion.durPanel : Motion.durExit
    }

    func animateTransition(using context: any UIViewControllerContextTransitioning) {
        let key: UITransitionContextViewKey = presenting ? .to : .from
        guard let view = context.view(forKey: key) else {
            context.completeTransition(true)
            return
        }
        let still = UIAccessibility.isReduceMotionEnabled
        if presenting {
            view.frame = context.containerView.bounds
            context.containerView.addSubview(view)
            view.layoutIfNeeded()
        }
        var away = still ? CGAffineTransform.identity : CGAffineTransform(translationX: 0, y: 6)
        var curve = Motion.easeOut
        let dialog = context.viewController(forKey: presenting ? .to : .from) as? KitDialogController
        if !still, let origin, origin.window != nil, let box = dialog?.cardFrame, box.width > 0 {
            // The card's centre on the button's, scaled toward the button's
            // width and no smaller than half, about the card's own centre.
            let at = origin.convert(origin.bounds, to: context.containerView)
            let scale = max(0.5, at.width / box.width)
            let offset = CGPoint(x: box.midX - view.bounds.midX, y: box.midY - view.bounds.midY)
            away = CGAffineTransform(translationX: at.midX - view.bounds.midX, y: at.midY - view.bounds.midY)
                .scaledBy(x: scale, y: scale)
                .translatedBy(x: -offset.x, y: -offset.y)
            curve = presenting ? Motion.easeDrawer : Motion.easeOut
        }
        if presenting {
            view.alpha = 0
            view.transform = away
        }
        let animator = curve.animator(transitionDuration(using: context)) { [presenting] in
            view.alpha = presenting ? 1 : 0
            view.transform = presenting ? .identity : away
        }
        animator.addCompletion { _ in context.completeTransition(!context.transitionWasCancelled) }
        animator.startAnimation()
    }
}
