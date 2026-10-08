import CawCoCore
import CawCoDesign
import Observation
import UIKit

/// The launch form (WorkflowLaunch.svelte): "Run <name>", the workflow's own
/// inputs (the Start node's for a graph, the `inputs` export for a program),
/// the workspace it runs in (a project fills the machine and the directory;
/// either can be set by hand, the directory browsed on an online machine), an
/// optional supervisor, and Cancel beside Start run. A required input left
/// empty stops the start and takes the keyboard. Start run waits for an
/// online machine, a directory and the hub; while it runs the dialog stays
/// up, and what the hub refused is said above the buttons.
final class WorkflowLaunchController: KitDialogController {
    private let hub: HubConnection
    private let workflow: WorkflowRow
    private let onLaunched: (String) -> Void
    private var machineId = ""
    private var supervisor = ""
    private var types: [String] = []
    private var busy = false
    /// Each input's control, in the order the workflow declares them.
    private var inputs: [(field: WorkflowField, control: UIView)] = []
    private let projectSelect = WorkflowSelect(height: Size.cInputH)
    private let machineSelect = WorkflowSelect(height: Size.cInputH)
    private let directory = WorkflowInput(mono: true, height: Size.cInputH)
    private let supervisorSelect = WorkflowSelect(height: Size.cInputH)
    private let failure = WorkflowError()
    private var picker: DirectoryPickerView!
    private var cancel: UIButton!
    private var start: UIButton!
    private var chosenProject = ""

    init(hub: HubConnection, workflow: WorkflowRow, onLaunched: @escaping (String) -> Void) {
        self.hub = hub
        self.workflow = workflow
        self.onLaunched = onLaunched
        super.init(width: .xl)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("WorkflowLaunchController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        // The form's parts stand the dialog's 24pt apart, as every dialog's do.
        let header = KitDialogController.header(
            title: "Run \(workflow.name)",
            description: "Choose the inputs and workspace for this workflow run."
        )
        body.addArrangedSubview(header)

        let defaults = workflow.graph?.settings
        let project = defaults?.defaultProject.flatMap { id in hub.fleet.projects.first { $0.id == id } }
        machineId = defaults?.defaultMachine ?? project?.primaryPlace?.machineId ?? ""
        directory.text = project?.checkout(on: machineId)?.path ?? ""
        supervisor = defaults?.defaultSupervisor?.delegateType ?? ""

        for field in workflow.fields {
            let control = control(for: field)
            control.accessibilityIdentifier = "launch-\(field.name)"
            inputs.append((field, control))
            body.addArrangedSubview(WorkflowForm.labelled("\(field.label)\(field.required ? " (required)" : "")", control))
        }

        // `.wf-well`: the recess, 7pt in, its parts 11pt apart.
        let heading = KitLabel(WorkflowForm.text(TypeScale.typeLabel), ink: Palette.inkStrong)
        heading.text = "Workspace"
        heading.accessibilityTraits = .header
        projectSelect.onChange = { [weak self] id in self?.choose(project: id) }
        machineSelect.onChange = { [weak self] id in
            self?.machineId = id
            self?.draw()
        }
        directory.addAction(UIAction { [weak self] _ in self?.draw() }, for: .editingChanged)
        picker = DirectoryPickerView(hub: hub, machineId: { [weak self] in self?.machineId ?? "" }, value: { [weak self] in self?.directory.text ?? "" })
        picker.onSelect = { [weak self] path in
            self?.directory.text = path
            self?.draw()
        }
        picker.onResize = { [weak self] in self?.morph {} }
        let well = UIStackView(arrangedSubviews: [
            heading,
            WorkflowForm.labelled("Project", projectSelect),
            WorkflowForm.labelled("Machine", machineSelect),
            WorkflowForm.labelled("Directory", directory),
            picker,
        ])
        well.axis = .vertical
        well.spacing = Space.space3
        well.isLayoutMarginsRelativeArrangement = true
        well.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space2, bottom: Space.space2, trailing: Space.space2)
        well.backgroundColor = Palette.surfaceRecess
        well.layer.cornerRadius = Radius.radiusSm
        well.layer.cornerCurve = .continuous
        body.addArrangedSubview(well)

        supervisorSelect.onChange = { [weak self] name in self?.supervisor = name }
        body.addArrangedSubview(WorkflowForm.labelled("Supervisor", supervisorSelect))
        failure.isHidden = true
        body.addArrangedSubview(failure)

        cancel = KitButton.workflow("Cancel", inDialog: true) { [weak self] in self?.requestClose() }
        start = KitButton.workflow("Start run", primary: true, inDialog: true) { [weak self] in self?.submit() }
        let foot = UIStackView(arrangedSubviews: [cancel, UIView(), start])
        foot.spacing = Space.space2
        foot.alignment = .center
        body.addArrangedSubview(foot)

        // The form opens with its first control focused (bits-ui's dialog):
        // the ring, and under a pointer the keyboard's caret too. A select
        // that is opened takes the ring; a field that is typed in draws its own.
        moveRing(to: (inputs.first?.control as? any WorkflowRinged) ?? projectSelect)
        for select in inputs.compactMap({ $0.control as? WorkflowSelect }) + [projectSelect, machineSelect, supervisorSelect] {
            select.addAction(UIAction { [weak self, weak select] _ in self?.moveRing(to: select) }, for: .menuActionTriggered)
        }
        for name in [UITextField.textDidBeginEditingNotification, UITextView.textDidBeginEditingNotification] {
            NotificationCenter.default.addObserver(self, selector: #selector(fieldTookFocus(_:)), name: name, object: nil)
        }

        sync()
        Task {
            do {
                types = try await hub.workflows.delegateTypes()
                draw()
            } catch {
                say(error.localizedDescription)
            }
        }
    }

    private weak var ring: (any WorkflowRinged)?

    private func moveRing(to control: (any WorkflowRinged)?) {
        ring?.ringed = false
        ring = control
        control?.ringed = true
    }

    @objc private func fieldTookFocus(_ note: Notification) {
        guard let field = note.object as? UIView, field.isDescendant(of: body) else { return }
        moveRing(to: nil)
    }

    /// Under a pointer the web's focus is the keyboard's: the first control takes it when it is a field.
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if !WorkflowForm.coarse, let field = ring, !(field is WorkflowSelect) { field.becomeFirstResponder() }
    }

    /// An input's control by its type: a menu of its options, and one line
    /// for anything else (a path in mono); each starts at its default.
    private func control(for field: WorkflowField) -> UIView {
        let preset = field.preset ?? ""
        switch field.type {
        case .select:
            let select = WorkflowSelect(height: Size.cInputH)
            let options = [WorkflowSelect.Option(value: "", label: "Choose")] + (field.options ?? []).map { WorkflowSelect.Option(value: $0, label: $0) }
            select.set(options, value: options.contains { $0.value == preset } ? preset : "")
            return select
        case .path, .text:
            let input = WorkflowInput(mono: field.type == .path, height: Size.cInputH)
            input.text = preset
            return input
        }
    }

    private func value(of control: UIView) -> String {
        switch control {
        case let select as WorkflowSelect: select.value
        case let input as WorkflowInput: input.text ?? ""
        default: ""
        }
    }

    /// Choosing a project sets its machine and its directory.
    private func choose(project id: String) {
        chosenProject = id
        guard let home = hub.fleet.projects.first(where: { $0.id == id })?.primaryPlace else { return }
        machineId = home.machineId
        directory.text = home.path
        draw()
    }

    /// Draws the form, and again whenever the fleet it reads moves: one
    /// observation, renewed each time it fires.
    private func sync() {
        withObservationTracking {
            draw()
        } onChange: { [weak self] in
            Task { @MainActor in self?.sync() }
        }
    }

    private func draw() {
        let machines = hub.fleet.machines
        projectSelect.set(
            [.init(value: "", label: "Choose a project or enter a directory")] + hub.fleet.projects.map { .init(value: $0.id, label: $0.name) },
            value: chosenProject
        )
        machineSelect.set(
            [.init(value: "", label: "Choose a machine", disabled: true)] + machines.map { machine in
                let online = machine.status == "online"
                return .init(value: machine.machineId, label: online ? machine.hostname : "\(machine.hostname) · offline", disabled: !online)
            },
            value: machines.contains { $0.machineId == machineId } ? machineId : ""
        )
        supervisorSelect.set([.init(value: "", label: "None")] + types.map { .init(value: $0, label: $0) }, value: types.contains(supervisor) ? supervisor : "")
        let online = machines.contains { $0.machineId == machineId && $0.status == "online" }
        if picker.isHidden == online {
            morph { picker.isHidden = !online }
        }
        let path = directory.text ?? ""
        cancel.isEnabled = !busy
        start.isEnabled = online && !path.isEmpty && hub.state == .connected
        holdsOpen = busy
    }

    private func say(_ text: String) {
        morph {
            failure.text = text
            failure.isHidden = text.isEmpty
        }
        if !text.isEmpty { UIAccessibility.post(notification: .announcement, argument: text) }
    }

    private func submit() {
        guard !busy else { return }
        // A required input left empty stops the start where a form's own check would.
        if let empty = inputs.first(where: { $0.field.required && value(of: $0.control).isEmpty }) {
            switch empty.control {
            case let select as WorkflowSelect: select.missing = true
            case let input as WorkflowInput: input.missing = true; input.becomeFirstResponder()
            default: break
            }
            UIAccessibility.post(notification: .announcement, argument: "\(empty.field.label) is required")
            return
        }
        view.endEditing(true)
        busy = true
        say("")
        PromptCardView.setPending(start, true, label: "Starting workflow run…")
        draw()
        let values = Dictionary(uniqueKeysWithValues: inputs.map { ($0.field.name, value(of: $0.control)) })
        Task {
            do {
                let runId = try await hub.workflows.launch(workflow.id, inputs: values, machineId: machineId, path: directory.text ?? "", supervisor: supervisor)
                busy = false
                holdsOpen = false
                // The web's order: the run's tab opens, then the form closes over it.
                onLaunched(runId)
                dismiss(animated: true)
            } catch {
                busy = false
                PromptCardView.setPending(start, false, label: "Starting workflow run…")
                draw()
                say(error.localizedDescription)
            }
        }
    }
}
