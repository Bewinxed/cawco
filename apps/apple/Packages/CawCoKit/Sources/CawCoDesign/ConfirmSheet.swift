import UIKit

public extension KitButton {
    /// The workflows pages' button (workflows.css `.wf-btn`): raised on the
    /// control border, radius 8, the label role, 7/11pt in from its 1pt
    /// border, 36pt under a pointer and 44pt square at the least under a
    /// finger on the pages, pressing to `pressScale`. `primary` is
    /// `.wf-primary`: the action surface under the on-brand ink, no edge.
    /// `inDialog` stands it on the button token (`cBtnH`) at every pointer.
    static func workflow(_ title: String, primary: Bool = false, inDialog: Bool = false, action: @escaping () -> Void) -> UIButton {
        let coarse = !inDialog && UITraitCollection.current.userInterfaceIdiom != .mac
        let button = make(title, variant: primary ? .action : .outline, height: coarse ? .lg : .standard, action: action)
        var config = button.configuration
        config?.attributedTitle = AttributedString(title, attributes: TypeScale.typeLabel.container(color: primary ? Palette.onBrand : Palette.inkStrong))
        config?.contentInsets = NSDirectionalEdgeInsets(top: Space.space2 + 1, leading: Space.space3 + 1, bottom: Space.space2 + 1, trailing: Space.space3 + 1)
        config?.background.cornerRadius = Radius.radiusSm
        config?.background.customView?.layer.cornerRadius = Radius.radiusSm
        button.configuration = config
        if coarse { button.widthAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHLg).isActive = true }
        return button
    }

    /// The kit's destructive button (button.svelte `destructive`): the
    /// error edge and ink on no fill.
    static func destructive(_ title: String, action: @escaping () -> Void) -> UIButton {
        let button = make(title, variant: .outline, height: .lg, action: action)
        var config = button.configuration
        config?.attributedTitle = AttributedString(title, attributes: TypeScale.typeButton.container(color: Palette.error11, tracking: -0.01))
        config?.background.strokeColor = Palette.error9
        config?.background.backgroundColor = .clear
        button.configuration = config
        let resting = button.configurationUpdateHandler
        button.configurationUpdateHandler = { button in
            resting?(button)
            button.configuration?.background.backgroundColor = button.isHighlighted ? Palette.error3 : .clear
        }
        return button
    }
}

/// The house confirm (cawco/ConfirmDialog.svelte) in the house sheet: the
/// title in the title role and its body muted. On a phone they are centred
/// over the confirming button and Cancel under it, each full width; from
/// 640pt they read from the leading edge over Cancel and the confirming
/// button in a row at the end. Confirming pends with its own label; a
/// refusal stays the sheet's, said under the body.
@MainActor
public final class ConfirmSheetController: UIViewController {
    private let titleText: String
    private let body: String
    private let confirmLabel: String
    private let pendingLabel: String
    private let destructive: Bool
    private let run: (@escaping (String?) -> Void) -> Void
    private let failure = KitLabel(TypeScale.typeBody, ink: Palette.statusFailInk, lines: 0)
    private var confirm: UIButton!
    private var cancel: UIButton!

    /// `run` does the work and hands back its refusal, or nil once done.
    public init(title: String, body: String, confirmLabel: String, pendingLabel: String, destructive: Bool, run: @escaping (@escaping (String?) -> Void) -> Void) {
        titleText = title
        self.body = body
        self.confirmLabel = confirmLabel
        self.pendingLabel = pendingLabel
        self.destructive = destructive
        self.run = run
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ConfirmSheetController is built in code")
    }

    /// The confirm, presented in the house sheet from `host`.
    public static func present(from host: UIViewController, title: String, body: String, confirmLabel: String, pendingLabel: String, destructive: Bool, run: @escaping (@escaping (String?) -> Void) -> Void) {
        let content = ConfirmSheetController(title: title, body: body, confirmLabel: confirmLabel, pendingLabel: pendingLabel, destructive: destructive, run: run)
        host.present(HouseSheetController(content), animated: true)
    }

    override public func viewDidLoad() {
        super.viewDidLoad()
        confirm = destructive
            ? KitButton.destructive(confirmLabel) { [weak self] in self?.accept() }
            : KitButton.make(confirmLabel, variant: .action, height: .lg) { [weak self] in self?.accept() }
        cancel = KitButton.make("Cancel", variant: .outline, height: .lg) { [weak self] in self?.dismiss(animated: true) }
        // The kit's footer sets the form: stacked full width on a phone, the
        // confirming button on top; a row at the end from 640pt
        // (alert-dialog-footer `flex-col-reverse`, `sm:flex-row sm:justify-end`).
        // Its buttons go in reading order.
        let footer = KitDialogController.footer([cancel, confirm])
        let wide = footer.axis == .horizontal
        let alignment: NSTextAlignment = wide ? .natural : .center
        let heading = KitLabel(TypeScale.typeTitle.with(weight: .medium), ink: Palette.inkStrong, lines: 0)
        heading.text = titleText
        heading.textAlignment = alignment
        heading.accessibilityTraits = .header
        let description = KitLabel(TypeScale.typeLabel.with(weight: .regular), ink: Palette.inkMuted, lines: 0)
        description.text = body
        description.textAlignment = alignment
        // `text-balance` below `md`, `text-pretty` from it (alert-dialog-description.svelte).
        description.wrap = wide ? .pretty : .balance
        failure.isHidden = true
        failure.textAlignment = alignment
        // `p.failure` (cawco/ConfirmDialog.svelte).
        failure.wrap = .pretty
        // alert-dialog-header: `gap-1.5`.
        let header = UIStackView(arrangedSubviews: [heading, description, failure])
        header.axis = .vertical
        header.spacing = 6
        // `.kit-dialog-body`: `gap-6` between the header and the footer.
        let column = UIStackView(arrangedSubviews: [header, footer])
        column.axis = .vertical
        column.spacing = 24
        column.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(column)
        // `.kit-dialog-body` is padded `space-5` all round: the house sheet
        // already holds its content 8pt inside the card at the sides and foot.
        let side = Space.space5 - 8
        NSLayoutConstraint.activate([
            column.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: side),
            column.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -side),
            column.topAnchor.constraint(equalTo: view.topAnchor, constant: Space.space5),
            column.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -side),
        ])
    }

    private var running = false

    /// The pending button keeps its full ink; Cancel dims while it runs.
    private func accept() {
        guard !running else { return }
        running = true
        cancel.isEnabled = false
        PromptCardView.setPending(confirm, true, label: pendingLabel)
        run { [weak self] refusal in
            guard let self else { return }
            guard let refusal else {
                dismiss(animated: true)
                return
            }
            running = false
            PromptCardView.setPending(confirm, false, label: pendingLabel)
            cancel.isEnabled = true
            failure.text = refusal
            failure.isHidden = false
        }
    }
}
