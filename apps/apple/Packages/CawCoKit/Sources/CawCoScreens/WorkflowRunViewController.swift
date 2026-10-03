import CawCoCore
import CawCoAPI
import CawCoDesign
import UIKit

/// WorkflowRunView.svelte: run identity/inputs/steps and the hub's parked ask.
/// Choice, note, typed JSON and Other are rendered only when the ask offers them.
final class WorkflowRunViewController: ObservedViewController, UIGestureRecognizerDelegate {
    let runId: String
    private let hub: HubConnection
    private let detail: WorkflowRunDetail
    private let column = UIStackView()
    private let content = UIStackView()
    private let answerForm = UIStackView()
    private let feedback = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private let note = UITextField()
    private let other = UITextField()
    private let value = UITextView(usingTextLayoutManager: true)
    private var answerButtons: [UIButton] = []
    private var askId: String?
    private var contentPrint = ""
    private var selectedChoice: String?
    var onReturn: () -> Void = {}
    var onOpen: (String) -> Void = { _ in }

    init(hub: HubConnection, runId: String) {
        self.hub = hub; self.runId = runId
        detail = hub.workflowRuns.open(runId)
        super.init(nibName: nil, bundle: nil)
    }
    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("WorkflowRunViewController is built in code") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        let back = UIBarButtonItem(title: "Fleet", image: UIImage(systemName: "chevron.backward"), primaryAction: UIAction { [weak self] _ in self?.onReturn() })
        NavigationItems.configure(navigationItem, leading: [back])
        for stack in [column, content, answerForm] { stack.axis = .vertical; stack.spacing = Space.space3 }
        column.translatesAutoresizingMaskIntoConstraints = false
        column.addArrangedSubview(content); column.addArrangedSubview(answerForm); column.addArrangedSubview(feedback)
        let scroll = UIScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.keyboardDismissMode = .interactive
        view.addSubview(scroll); scroll.addSubview(column)
        let endEditing = UITapGestureRecognizer(target: self, action: #selector(endFormEditing))
        endEditing.cancelsTouchesInView = false
        endEditing.delegate = self
        view.addGestureRecognizer(endEditing)
        NSLayoutConstraint.activate([
            scroll.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
            column.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: Space.space4),
            column.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -Space.space4),
            column.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: Space.space6),
            column.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -Space.space7),
        ])
    }

    override func refreshContent() {
        guard isViewLoaded else { return }
        guard let run = detail.run else { feedback.text = detail.error ?? "Reading workflow run…"; return }
        let title = hub.fleet.workflowNames[run.workflowId] ?? "Workflow"
        navigationItem.title = title
        let print = String(data: (try? JSONEncoder().encode(run)) ?? Data(), encoding: .utf8) ?? ""
        if print != contentPrint {
            contentPrint = print
            content.arrangedSubviews.forEach { $0.removeFromSuperview() }
            let state: SessionStatus = switch run.status {
            case .running: .working
            case .waiting: .needsYou
            case .done: .done
            case .failed: .error
            case .cancelled: .stopped
            }
            content.addArrangedSubview(StatusGlyph(state))
            content.addArrangedSubview(label("Started \(run.startedAt.formatted(date: .abbreviated, time: .shortened))", role: TypeScale.typeMeta))
            for (key, input) in run.inputs.value.sorted(by: { $0.key < $1.key }) { content.addArrangedSubview(label("\(key)  \(shown(input))", role: TypeScale.typeMeta)) }
            if let failure = run.failure { let error = label(failure); error.ink = Palette.statusFailInk; content.addArrangedSubview(error) }
            for step in run.steps.sorted(by: { $0.seq < $1.seq }) {
                content.addArrangedSubview(label("\(step.nodeId) · \(step.status)", role: TypeScale.typeLabel))
                if let failure = step.failure { content.addArrangedSubview(label(failure)) }
                let result = shown(step.result)
                if result != "null" { content.addArrangedSubview(label(result)) }
                if let session = step.instanceId {
                    content.addArrangedSubview(KitButton.make("Open session", variant: .outline, height: .lg) { [weak self] in self?.onOpen(session) })
                }
                if let child = step.childRunId {
                    content.addArrangedSubview(KitButton.make("Open child run", variant: .outline, height: .lg) { [weak self] in self?.onOpen(BoardRun.prefix + child) })
                }
                if run.status != .running && run.status != .waiting {
                    content.addArrangedSubview(KitButton.make("Re-run from this step", variant: .outline, height: .lg) { [weak self] in
                        guard let self else { return }; hub.workflowRuns.rerun(runId, fromStepId: step.id) { id in self.onOpen(BoardRun.prefix + id) }
                    })
                }
            }
            let going = run.status == .running || run.status == .waiting
            content.addArrangedSubview(KitButton.make(going ? "Cancel run" : "Re-run", variant: .outline, height: .lg) { [weak self] in
                guard let self else { return }
                if going { confirmCancel() }
                else { hub.workflowRuns.rerun(runId) { id in self.onOpen(BoardRun.prefix + id) } }
            })
            content.addArrangedSubview(KitButton.make("Edit workflow", variant: .outline, height: .lg) { [weak self] in
                guard let address = self?.hub.address else { return }
                UIApplication.shared.open(address.appendingPathComponent("workflows/\(run.workflowId)"))
            })
        }
        if let ask = run.ask, run.status == .waiting {
            if askId != ask.stepId { buildAnswer(ask); askId = ask.stepId }
            answerForm.isHidden = false
        } else { answerForm.isHidden = true; askId = nil }
        let enabled = detail.acting == nil && hub.state == .connected
        answerButtons.forEach { $0.isEnabled = enabled }
        note.isEnabled = enabled; other.isEnabled = enabled; value.isEditable = enabled
        switch detail.answerStage {
        case .submitting: feedback.text = "Answering…"
        case .answered: feedback.text = "Answered"
        case .failed: feedback.text = detail.error
        case .pending: feedback.text = detail.error ?? (hub.state == .connected ? "" : "Can't answer while the hub is unreachable")
        }
        feedback.ink = detail.error == nil ? Palette.inkMuted : Palette.statusFailInk
        feedback.isHidden = feedback.text?.isEmpty != false
    }

    private func buildAnswer(_ ask: CawCoAPI.Components.Schemas.WorkflowAsk) {
        answerForm.arrangedSubviews.forEach { $0.removeFromSuperview() }
        answerButtons = []; selectedChoice = nil; note.text = ""; other.text = ""; value.text = ""
        answerForm.addArrangedSubview(label("Answer · \(ask.question)", role: TypeScale.typeTitle))
        for option in ask.options {
            let button = KitButton.make(option.label, variant: .outline, height: .lg) { [weak self] in self?.submit(choice: option.label) }
            answerButtons.append(button); answerForm.addArrangedSubview(button)
            if let description = option.description { answerForm.addArrangedSubview(label(description, role: TypeScale.typeMeta)) }
        }
        field(note, name: "Note (optional)")
        if let schema = ask.answerSchema {
            answerForm.addArrangedSubview(label("Answer value (JSON)", role: TypeScale.typeLabel))
            answerForm.addArrangedSubview(label(shown(schema), role: TypeScale.typeMeta))
            value.font = TypeScale.typeBody.font; value.textColor = Palette.inkStrong; value.backgroundColor = Palette.surfaceRaised
            value.layer.cornerRadius = Radius.radiusMd
            value.accessibilityLabel = "Answer value (JSON)"
            value.accessibilityIdentifier = "workflow-answer-value"
            value.heightAnchor.constraint(equalToConstant: Space.space8 * 3).isActive = true
            answerForm.addArrangedSubview(value)
            if ask.options.isEmpty { addSend { [weak self] in self?.submit(choice: nil) } }
        }
        if ask.allowOther {
            field(other, name: "Other answer")
            addSend { [weak self] in self?.submit(choice: self?.other.text) }
        }
    }

    private func addSend(_ action: @escaping () -> Void) {
        let button = KitButton.make("Send answer", variant: .outline, height: .lg, action: action)
        answerButtons.append(button); answerForm.addArrangedSubview(button)
    }
    private func field(_ field: UITextField, name: String) {
        answerForm.addArrangedSubview(label(name, role: TypeScale.typeLabel))
        field.font = TypeScale.typeBody.font; field.textColor = Palette.inkStrong; field.backgroundColor = Palette.surfaceRaised
        field.accessibilityLabel = name; field.layer.cornerRadius = Radius.radiusMd
        field.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHLg).isActive = true
        answerForm.addArrangedSubview(field)
    }
    private func submit(choice: String?) {
        selectedChoice = choice
        view.endEditing(true)
        hub.workflowRuns.answer(runId, choice: choice, note: note.text ?? "", valueText: value.text ?? "")
        requestRefresh()
    }
    private func label(_ text: String, role: TypeRole = TypeScale.typeBody) -> KitLabel {
        let label = KitLabel(role, ink: Palette.inkStrong, lines: 0); label.text = text; return label
    }
    private func shown(_ value: Any?) -> String {
        guard let value else { return "" }
        if let text = value as? String { return text }
        if let encoded = value as? any Encodable,
           let data = try? JSONEncoder().encode(encoded), let text = String(data: data, encoding: .utf8) { return text }
        return String(describing: value)
    }
    private func confirmCancel() {
        let alert = UIAlertController(title: "Cancel workflow run?", message: "Stops live step sessions and any child runs. Pending steps will be skipped.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Keep running", style: .cancel))
        alert.addAction(UIAlertAction(title: "Cancel run", style: .destructive) { [weak self] _ in
            guard let self else { return }; hub.workflowRuns.cancel(runId)
        })
        present(alert, animated: true)
    }
    @objc private func endFormEditing() { view.endEditing(true) }
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        var target = touch.view
        while let candidate = target {
            if candidate is UITextField || candidate is UITextView || candidate is UIControl { return false }
            target = candidate.superview
        }
        return true
    }
}
