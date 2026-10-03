import CawCoCore
import CawCoDesign
import UIKit

/// Prompt.svelte's question form: the actual parked questions and labels,
/// keyed by question text, with the same single/multi-select answer shape.
final class QuestionAnswerViewController: ObservedViewController {
    private let hub: HubConnection
    private let ask: ParkedAsk
    private let machineId: String
    private let stack = UIStackView()
    private let feedback = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private var answerButton: UIButton!
    private var dismissButton: UIButton!
    private var selections: [String: [String]] = [:]
    private var buttons: [[UIButton]] = []
    private var commandId: String?
    var onReturn: () -> Void = {}

    init(hub: HubConnection, ask: ParkedAsk, machineId: String) {
        self.hub = hub; self.ask = ask; self.machineId = machineId
        super.init(nibName: nil, bundle: nil)
    }
    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("QuestionAnswerViewController is built in code") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        navigationItem.title = "Question from the agent"
        let close = UIBarButtonItem(title: "Fleet", image: UIImage(systemName: "chevron.backward"), primaryAction: UIAction { [weak self] _ in self?.onReturn() })
        NavigationItems.configure(navigationItem, leading: [close])
        stack.axis = .vertical; stack.spacing = Space.space3; stack.translatesAutoresizingMaskIntoConstraints = false
        let status = StatusGlyph(.needsYou)
        stack.addArrangedSubview(status)
        for (qi, question) in ask.questions.enumerated() {
            let label = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong, lines: 0)
            label.text = question.question
            stack.addArrangedSubview(label)
            var row: [UIButton] = []
            for (i, option) in question.options.enumerated() {
                let button = KitButton.make("\(i + 1)  \(option.label)", variant: .outline, height: .lg) { [weak self] in self?.toggle(qi, option.label) }
                button.accessibilityLabel = option.label
                row.append(button)
            }
            buttons.append(row)
            stack.addArrangedSubview(WrappedOptions(row))
        }
        answerButton = KitButton.make("Answer", glyph: .tick, variant: .action, height: .lg) { [weak self] in self?.submit() }
        dismissButton = KitButton.make("Dismiss", variant: .outline, height: .lg) { [weak self] in self?.dismissQuestion() }
        let actions = UIStackView(arrangedSubviews: [answerButton, dismissButton])
        actions.spacing = Space.space2; actions.alignment = .center
        stack.addArrangedSubview(actions); stack.addArrangedSubview(feedback)
        let scroll = UIScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scroll); scroll.addSubview(stack)
        NSLayoutConstraint.activate([
            scroll.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
            stack.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: Space.space4),
            stack.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -Space.space4),
            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: Space.space4),
            stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -Space.space4),
        ])
    }

    private var record: Ledger.Command? { commandId.flatMap { hub.ledger.commands[$0] } }
    private var answerable: Bool { hub.state == .connected && (record == nil || record?.stage == .failed) }

    override func refreshContent() {
        guard answerButton != nil else { return }
        let complete = ask.questions.allSatisfy { !(selections[$0.question] ?? []).isEmpty }
        answerButton.isEnabled = answerable && complete
        dismissButton.isEnabled = answerable
        for (qi, question) in ask.questions.enumerated() {
            for (i, option) in question.options.enumerated() {
                let button = buttons[qi][i]
                let selected = (selections[question.question] ?? []).contains(option.label)
                button.isEnabled = answerable
                button.accessibilityTraits = selected ? [.button, .selected] : .button
                button.configuration?.background.backgroundColor = selected ? Palette.surfaceRecess : Palette.surfaceRaised
                button.configuration?.background.strokeColor = selected ? Palette.brandSolid : Palette.borderControl
            }
        }
        switch record?.stage {
        case .submitted, .accepted: feedback.text = "Answering…"
        case .applied: feedback.text = "Answered"
        case .failed: feedback.text = "Couldn't send that answer. \(record?.reason ?? "")"
        case nil: feedback.text = hub.state == .connected ? "needs you" : "Reconnecting — can't answer yet."
        }
        feedback.ink = record?.stage == .failed ? Palette.statusFailInk : Palette.inkMuted
    }

    private func toggle(_ index: Int, _ label: String) {
        guard answerable else { return }
        let question = ask.questions[index]
        var chosen = selections[question.question] ?? []
        if question.multiSelect {
            if chosen.contains(label) { chosen.removeAll { $0 == label } } else { chosen.append(label) }
        } else { chosen = chosen == [label] ? [] : [label] }
        selections[question.question] = chosen
        requestRefresh()
    }

    private func submit() {
        guard answerable else { return }
        hub.needs.answerQuestion(ask, machineId: machineId, answers: selections)
        commandId = hub.needs.answerSent(for: ask)?.id
        requestRefresh()
    }
    private func dismissQuestion() {
        guard answerable else { return }
        hub.needs.answer(ask, machineId: machineId, .deny)
        commandId = hub.needs.answerSent(for: ask)?.id
        requestRefresh()
    }
}

/// The web's wrapping option chips. The button's content determines its
/// width; the window determines only where the next row begins.
final class WrappedOptions: UIView {
    private let options: [UIButton]
    private var measuredWidth = 0.0
    init(_ options: [UIButton]) {
        self.options = options
        super.init(frame: .zero)
        for option in options { option.translatesAutoresizingMaskIntoConstraints = true; addSubview(option) }
    }
    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("WrappedOptions is built in code") }
    override var intrinsicContentSize: CGSize { CGSize(width: UIView.noIntrinsicMetric, height: arrange(width: bounds.width, apply: false)) }
    override func layoutSubviews() {
        super.layoutSubviews()
        _ = arrange(width: bounds.width, apply: true)
        if measuredWidth != bounds.width { measuredWidth = bounds.width; invalidateIntrinsicContentSize() }
    }
    private func arrange(width: Double, apply: Bool) -> Double {
        guard width > 0 else { return Size.cBtnHLg }
        var x = 0.0, y = 0.0, height = 0.0
        for option in options {
            let fit = option.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
            let w = min(width, max(Space.space8, fit.width)), h = max(Size.cBtnHLg, fit.height)
            if x > 0 && x + w > width { x = 0; y += height + Space.space2; height = 0 }
            if apply { option.frame = CGRect(x: x, y: y, width: w, height: h) }
            x += w + Space.space2; height = max(height, h)
        }
        return y + height
    }
}
