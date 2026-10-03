import UIKit

public extension KitButton {
    /// The workflow tab's button (workflows.css `.wf-btn`): raised on the
    /// control border, radius 8, the label role, 7/11pt in, 44pt for a
    /// finger, pressing to `pressScale`.
    static func workflow(_ title: String, action: @escaping () -> Void) -> UIButton {
        let button = make(title, variant: .outline, height: .lg, action: action)
        var config = button.configuration
        config?.attributedTitle = AttributedString(title, attributes: AttributeContainer(TypeScale.typeLabel.attributes(color: Palette.inkStrong)))
        config?.contentInsets = NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space3, bottom: Space.space2, trailing: Space.space3)
        config?.background.cornerRadius = Radius.radiusSm
        button.configuration = config
        button.widthAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHLg).isActive = true
        return button
    }

    /// The kit's destructive button (button.svelte `destructive`): the
    /// error edge and ink on no fill.
    static func destructive(_ title: String, stretch: Bool = false, action: @escaping () -> Void) -> UIButton {
        let button = make(title, variant: .outline, height: .lg, stretch: stretch, action: action)
        var config = button.configuration
        config?.attributedTitle = AttributedString(title, attributes: AttributeContainer(TypeScale.typeButton.attributes(color: Palette.error11, tracking: -0.01)))
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

/// The house confirm (cawco/ConfirmDialog.svelte, a phone's layout) in the
/// house sheet: the title in the title role and its body muted, centred; the
/// confirming button above Cancel, each full width. Confirming pends with
/// its own label; a refusal stays the sheet's, said under the body.
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
        let heading = KitLabel(TypeScale.typeTitle.with(weight: .medium), ink: Palette.inkStrong, lines: 0)
        heading.text = titleText
        heading.textAlignment = .center
        heading.accessibilityTraits = .header
        let description = KitLabel(TypeScale.typeLabel.with(weight: .regular), ink: Palette.inkMuted, lines: 0)
        description.text = body
        description.textAlignment = .center
        failure.isHidden = true
        failure.textAlignment = .center
        confirm = destructive
            ? KitButton.destructive(confirmLabel, stretch: true) { [weak self] in self?.accept() }
            : KitButton.make(confirmLabel, variant: .action, height: .lg, stretch: true) { [weak self] in self?.accept() }
        cancel = KitButton.make("Cancel", variant: .outline, height: .lg, stretch: true) { [weak self] in self?.dismiss(animated: true) }
        let header = UIStackView(arrangedSubviews: [heading, description, failure])
        header.axis = .vertical
        header.spacing = 6
        let footer = UIStackView(arrangedSubviews: [confirm, cancel])
        footer.axis = .vertical
        footer.spacing = Space.space2
        let column = UIStackView(arrangedSubviews: [header, footer])
        column.axis = .vertical
        column.spacing = Space.space4
        column.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(column)
        NSLayoutConstraint.activate([
            column.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            column.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            column.topAnchor.constraint(equalTo: view.topAnchor, constant: Space.space3),
            column.bottomAnchor.constraint(equalTo: view.bottomAnchor),
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
