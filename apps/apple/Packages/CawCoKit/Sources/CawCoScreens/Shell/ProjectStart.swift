import CawCoDesign
import UIKit

/// The project page's "New session" popover (ProjectHead.svelte): an
/// optional first prompt, then Start, or Start empty without one. 320pt
/// wide, the kit popover's 6pt in, its rows 12pt apart; Return in the field
/// starts. A start waits for the hub: the popover closes once the session
/// stands, and a refusal stays in it, under the prompt, with the prompt kept.
final class ProjectStartController: KitPopoverController, UITextFieldDelegate {
    private let field = KitField(placeholder: "What should this session do?")
    private let onStart: (String?) async throws -> Void
    private let stack = UIStackView()
    private let problem = TaskSheetController.problemLabel()
    private var empty: UIButton!
    private var go: UIButton!
    private var starting: Bool?
    private static let inset = 6 + 1.0

    /// `onStart`: the prompt as typed, or nil for an empty start; it throws the hub's refusal.
    init(onStart: @escaping (String?) async throws -> Void) {
        self.onStart = onStart
        super.init()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ProjectStartController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let label = KitLabel(TypeScale.typeMeta, ink: Palette.mutedForeground)
        label.text = "First prompt (optional)"
        field.font = TypeScale.typeLabel.withWeight(.regular).font
        field.autocorrectionType = .no
        field.spellCheckingType = .no
        field.returnKeyType = .go
        field.delegate = self
        field.accessibilityLabel = "First prompt (optional)"
        let prompt = UIStackView(arrangedSubviews: [label, field, problem])
        prompt.axis = .vertical
        prompt.spacing = Space.space1
        empty = KitButton.make("Start empty", variant: .ghost, height: .sm) { [weak self] in self?.start(nil) }
        go = KitButton.make("Start", variant: .action, height: .sm) { [weak self] in self?.start(self?.field.text) }
        // `justify-end gap-2`.
        let actions = UIStackView(arrangedSubviews: [UIView(), empty, go])
        actions.spacing = 8
        actions.alignment = .center
        stack.addArrangedSubview(prompt)
        stack.addArrangedSubview(actions)
        stack.axis = .vertical
        // `flex-col gap-3` in the kit popover's 6pt padding (`kit-pop`), inside the card's 1pt border.
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: card.topAnchor, constant: Self.inset),
            stack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: Self.inset),
            stack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -Self.inset),
        ])
        fit()
    }

    /// The card's size for what it holds now; a change of it morphs the popover.
    private func fit() {
        let width = min(320, (view.window?.bounds.width ?? UIScreen.main.bounds.width) - 32)
        let height = stack.systemLayoutSizeFitting(CGSize(width: width - Self.inset * 2, height: 0), withHorizontalFittingPriority: .required,
                                                   verticalFittingPriority: .fittingSizeLevel).height + Self.inset * 2
        preferredContentSize = CGSize(width: width, height: height)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        field.becomeFirstResponder()
    }

    private func start(_ prompt: String?) {
        guard starting == nil else { return }
        let text = prompt?.trimmingCharacters(in: .whitespacesAndNewlines)
        let first = text?.isEmpty == false ? text : nil
        starting = first != nil
        pending()
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try await onStart(first)
                dismiss(animated: true)
            } catch {
                starting = nil
                pending()
                problem.text = error.localizedDescription
                problem.isHidden = false
                fit()
                UIAccessibility.post(notification: .announcement, argument: problem.text)
            }
        }
    }

    /// The pressed button says it is starting; neither takes a second press meanwhile.
    private func pending() {
        let busy = starting != nil
        KitButton.setTitle(starting == true ? "Starting…" : "Start", of: go, variant: .action, height: .sm)
        KitButton.setTitle(starting == false ? "Starting…" : "Start empty", of: empty, variant: .ghost, height: .sm)
        go.configuration?.showsActivityIndicator = starting == true
        empty.configuration?.showsActivityIndicator = starting == false
        go.isEnabled = !busy
        empty.isEnabled = !busy
    }

    func textFieldShouldReturn(_: UITextField) -> Bool {
        start(field.text)
        return true
    }
}
