import UIKit

/// The app's one confirm (ConfirmDialog.svelte on the kit's `alert-dialog`):
/// a centred card over the scrim, `--radius-modal` on the recess with the
/// overlay shadow and 6pt of frame round the raised body (`--radius-lg`,
/// 18pt in). The title in title type, the description in label type and
/// muted ink, then Cancel and the confirm. The confirm runs the asked work
/// and stays pending, the dialog open, until it ends: work that fails keeps
/// it open and says why under the description; only work that succeeds
/// closes it. It rises 6pt as it fades in over `durPanel` on the out curve
/// and leaves the same way over `durExit`. Up to 448pt wide from a 640pt
/// screen (its text left, its buttons in a row at the end), 320pt below
/// (centred, the confirm stacked over Cancel).
public final class ConfirmDialog: UIViewController, UIViewControllerTransitioningDelegate {
    private let titleText: String
    private let body: String?
    private let confirmLabel: String
    private let pendingLabel: String?
    private let cancelLabel: String
    private let destructive: Bool
    private let work: () async throws -> Void
    private let frameView = UIView()
    private let card = UIView()
    /// `p.failure` (cawco/ConfirmDialog.svelte): a paragraph, so it wraps `pretty`.
    private let failure = KitLabel(TypeScale.typeBody, ink: Palette.statusFailInk, lines: 0)
    private var confirm: UIButton!
    private var running = false

    public init(title: String, body: String? = nil, confirmLabel: String = "Confirm", pendingLabel: String? = nil,
                cancelLabel: String = "Cancel", destructive: Bool = false, work: @escaping () async throws -> Void) {
        titleText = title
        self.body = body
        self.confirmLabel = confirmLabel
        self.pendingLabel = pendingLabel
        self.cancelLabel = cancelLabel
        self.destructive = destructive
        self.work = work
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .custom
        transitioningDelegate = self
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ConfirmDialog is built in code")
    }

    override public func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        frameView.backgroundColor = Palette.surfaceRecess
        frameView.layer.cornerRadius = Radius.radiusModal
        frameView.layer.cornerCurve = .continuous
        frameView.boxShadow = Shadow.shadowOverlay
        frameView.translatesAutoresizingMaskIntoConstraints = false
        card.backgroundColor = Palette.surfaceRaised
        card.layer.cornerRadius = Radius.radiusLg
        card.layer.cornerCurve = .continuous
        card.translatesAutoresizingMaskIntoConstraints = false
        frameView.addSubview(card)
        view.addSubview(frameView)

        let title = KitLabel(TypeScale.typeTitle, ink: Palette.foreground, lines: 0)
        title.text = titleText
        let description = KitLabel(TypeScale.typeLabel.withWeight(.regular), ink: Palette.mutedForeground, lines: 0)
        description.text = body
        // `text-balance md:text-pretty` (alert-dialog-description.svelte).
        description.wrap = UIScreen.main.bounds.width >= 768 ? .pretty : .balance
        description.isHidden = body == nil
        failure.wrap = .pretty
        failure.isHidden = true
        let header = UIStackView(arrangedSubviews: [title, description, failure])
        header.axis = .vertical
        header.spacing = 6
        header.alignment = .fill

        if destructive {
            confirm = UIButton(configuration: Self.destructiveStyle(confirmLabel), primaryAction: UIAction { [weak self] _ in self?.accept() })
            confirm.houseStyle()
            confirm.translatesAutoresizingMaskIntoConstraints = false
            confirm.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnH).isActive = true
        } else {
            confirm = KitButton.make(confirmLabel, variant: .action) { [weak self] in self?.accept() }
        }
        let cancel = KitButton.make(cancelLabel, variant: .outline) { [weak self] in self?.dismiss(animated: true) }
        let footer = UIStackView()
        footer.spacing = 8
        if wideLayout {
            footer.axis = .horizontal
            footer.addArrangedSubview(UIView())
            footer.addArrangedSubview(cancel)
            footer.addArrangedSubview(confirm)
        } else {
            footer.axis = .vertical
            footer.addArrangedSubview(confirm)
            footer.addArrangedSubview(cancel)
            title.textAlignment = .center
            description.textAlignment = .center
            failure.textAlignment = .center
        }
        let stack = UIStackView(arrangedSubviews: [header, footer])
        stack.axis = .vertical
        stack.spacing = 24
        stack.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(stack)
        let width = frameView.widthAnchor.constraint(equalToConstant: wideLayout ? 448 : 320)
        width.priority = .defaultHigh
        NSLayoutConstraint.activate([
            frameView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            frameView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            width,
            frameView.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, constant: -32),
            card.topAnchor.constraint(equalTo: frameView.topAnchor, constant: 6),
            card.bottomAnchor.constraint(equalTo: frameView.bottomAnchor, constant: -6),
            card.leadingAnchor.constraint(equalTo: frameView.leadingAnchor, constant: 6),
            card.trailingAnchor.constraint(equalTo: frameView.trailingAnchor, constant: -6),
            stack.topAnchor.constraint(equalTo: card.topAnchor, constant: 18),
            stack.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -18),
            stack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 18),
            stack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -18),
        ])
    }

    /// Decided once, from the screen it opens on.
    private lazy var wideLayout = UIScreen.main.bounds.width >= 640 || traitCollection.horizontalSizeClass == .regular

    /// A destructive confirm: the error border and ink on no fill (button.svelte `destructive`).
    private static func destructiveStyle(_ title: String) -> UIButton.Configuration {
        var config = UIButton.Configuration.plain()
        config.attributedTitle = AttributedString(title, attributes: AttributeContainer(TypeScale.typeButton.attributes(color: Palette.error11, tracking: -0.01)))
        config.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: Space.space4, bottom: 0, trailing: Space.space4)
        config.background.cornerRadius = Radius.radiusMd
        config.background.backgroundColor = .clear
        config.background.strokeColor = Palette.error9
        config.background.strokeWidth = 1
        config.imagePadding = 8
        config.activityIndicatorColorTransformer = UIConfigurationColorTransformer { _ in Palette.error11 }
        return config
    }

    /// The confirm's label and spinner while the work runs.
    private func pending(_ on: Bool) {
        let label = on ? (pendingLabel ?? confirmLabel) : confirmLabel
        let ink = destructive ? Palette.error11 : Palette.onAction
        confirm.configuration?.attributedTitle = AttributedString(label, attributes: AttributeContainer(TypeScale.typeButton.attributes(color: ink, tracking: -0.01)))
        confirm.configuration?.showsActivityIndicator = on
        confirm.configuration?.imagePadding = 8
        confirm.configuration?.activityIndicatorColorTransformer = UIConfigurationColorTransformer { _ in ink }
    }

    private func accept() {
        guard !running else { return }
        running = true
        pending(true)
        Task { @MainActor in
            do {
                try await work()
                dismiss(animated: true)
            } catch {
                running = false
                pending(false)
                failure.text = error.localizedDescription
                Motion.easeOut.animator(Motion.durMorph) {
                    self.failure.isHidden = false
                    self.view.layoutIfNeeded()
                }.startAnimation()
            }
        }
    }

    // MARK: Presentation

    public func presentationController(forPresented presented: UIViewController, presenting: UIViewController?, source _: UIViewController) -> UIPresentationController? {
        ScrimPresentation(presentedViewController: presented, presenting: presenting) { [weak self] in
            guard self?.running == false else { return }
            self?.dismiss(animated: true)
        }
    }

    public func animationController(forPresented _: UIViewController, presenting _: UIViewController, source _: UIViewController) -> (any UIViewControllerAnimatedTransitioning)? {
        DialogAnimator(presenting: true)
    }

    public func animationController(forDismissed _: UIViewController) -> (any UIViewControllerAnimatedTransitioning)? {
        DialogAnimator(presenting: false)
    }

    override public func accessibilityPerformEscape() -> Bool {
        guard !running else { return false }
        dismiss(animated: true)
        return true
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
        Motion.easeOut.animator(Motion.durExit) { self.scrim.alpha = 0 }.startAnimation()
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
