import CawCoDesign
import UIKit

/// The project page's "New session" popover (project/[id]/+page.svelte):
/// an optional first prompt, then Start, or Start empty without one. 320pt
/// wide, 16pt in, its rows 12pt apart; Return in the field starts.
final class ProjectStartController: KitPopoverController, UITextFieldDelegate {
    private let field = KitField(placeholder: "What should this session do?")
    private let onStart: (String?) -> Void
    private let stack = UIStackView()

    /// `onStart`: the prompt as typed, or nil for an empty start.
    init(onStart: @escaping (String?) -> Void) {
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
        let prompt = UIStackView(arrangedSubviews: [label, field])
        prompt.axis = .vertical
        prompt.spacing = Space.space1
        let empty = KitButton.make("Start empty", variant: .ghost, height: .sm) { [weak self] in self?.start(nil) }
        let go = KitButton.make("Start", variant: .action, height: .sm) { [weak self] in self?.start(self?.field.text) }
        // `justify-end gap-2`.
        let actions = UIStackView(arrangedSubviews: [UIView(), empty, go])
        actions.spacing = 8
        actions.alignment = .center
        stack.addArrangedSubview(prompt)
        stack.addArrangedSubview(actions)
        stack.axis = .vertical
        // `flex-col gap-3 p-4`, inside the card's 1pt border.
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(stack)
        let inset = 16 + 1.0
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: card.topAnchor, constant: inset),
            stack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: inset),
            stack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -inset),
        ])
        let width = min(320, (view.window?.bounds.width ?? UIScreen.main.bounds.width) - 32)
        let height = stack.systemLayoutSizeFitting(CGSize(width: width - inset * 2, height: 0), withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height + inset * 2
        preferredContentSize = CGSize(width: width, height: height)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        field.becomeFirstResponder()
    }

    private func start(_ prompt: String?) {
        let text = prompt?.trimmingCharacters(in: .whitespacesAndNewlines)
        dismiss(animated: true)
        onStart(text?.isEmpty == false ? text : nil)
    }

    func textFieldShouldReturn(_: UITextField) -> Bool {
        start(field.text)
        return true
    }
}
