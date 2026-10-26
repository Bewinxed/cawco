import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// Configure › Memory (routes/config/memory/+page.svelte): the fleet's
/// memory. The user CLAUDE.md every session loads flat, the documents it
/// links under memories/ (a `models/<model>.md` is put in front of the
/// session running that model only), and the scoped documents each session
/// of a role, a project or both loads. Each row opens its editor and says
/// where it has landed; its ⋯ deletes it everywhere at once, with Undo. A
/// filter over the rows; where the model-memory hook did not register, that
/// is said under them.
final class MemorySectionController: ConfigSectionController {
    private lazy var add = KitButton.make(Words.Memory.newDocument, glyph: .plus, variant: .action) { [weak self] in self?.openNew() }
    private let filter = KitField(placeholder: Words.Memory.filter)
    private let list = RowList(label: Words.Memory.list)
    private let rows = KeyedRows()
    private let noMatch = metaLine()
    private var chips: [String: RolloutChip] = [:]
    private var busy: Set<String> = []

    override func viewDidLoad() {
        super.viewDidLoad()
        add.accessibilityIdentifier = "memory.new"
        setActions([add])
        filter.accessibilityLabel = Words.Memory.filterLabel
        filter.widthAnchor.constraint(lessThanOrEqualToConstant: 256).isActive = true
        filter.addAction(UIAction { [weak self] _ in self?.requestRefresh() }, for: .editingChanged)
        toolbar.addArrangedSubview(filter)
        setContent([list, noMatch])
    }

    override func viewIsAppearing(_ animated: Bool) {
        super.viewIsAppearing(animated)
        Task { await hub.configuration.load() }
    }

    private func chip(_ scope: FaultScope, _ name: String, what: String) -> RolloutChip {
        let key = "\(scope):\(name)"
        let made = chips[key] ?? RolloutChip(hub: hub, scope: scope, name: name, what: what)
        made.openFault = { [weak self] group in
            guard let self else { return }
            navigationController?.pushViewController(FleetFaultController(group: group, hub: hub), animated: true)
        }
        chips[key] = made
        made.draw()
        return made
    }

    /// Its size and how long since it was saved, and an edit waiting in its editor.
    private func facts(_ file: MemoryFile, path: String) -> String {
        Words.Memory.facts(size: FleetSkills.bytes(Double(file.content.utf8.count)), ago: FleetMemory.ago(file.updatedAt))
            + (ConfigDrafts.shared.holds(ConfigDrafts.path("memory", path)) ? Words.Memory.unsavedDraft : "")
    }

    override func refreshContent() {
        let config: FleetConfig = hub.configuration
        ready = config.snapshot != nil
        problem = config.snapshot == nil ? config.problem : nil
        let down = hub.writesBlocked
        add.isEnabled = down == nil
        add.accessibilityHint = down
        let wanted = (filter.text ?? "").trimmingCharacters(in: .whitespaces).lowercased()
        let docs = (config.snapshot?.memoryDocs ?? []).filter { wanted.isEmpty || $0.path.lowercased().contains(wanted) }
        let mainShown = wanted.isEmpty || FleetMemory.main.lowercased().contains(wanted)
        let keys = (mainShown ? [FleetMemory.main] : []) + docs.map(\.path)
        list.set(rows.keep(keys))
        list.isHidden = keys.isEmpty
        noMatch.text = Words.Memory.noMatch(filter: (filter.text ?? "").trimmingCharacters(in: .whitespaces))
        noMatch.isHidden = !keys.isEmpty

        if mainShown {
            let row = rows.row(FleetMemory.main)
            let memory = FleetMemory.file(FleetMemory.main, hub: hub)
            row.opens = { [weak self] in self?.open(FleetMemory.main) }
            row.show(name: FleetMemory.fileLabel(FleetMemory.main),
                     meta: memory.map { "\(Words.Memory.everySession) · \(facts($0, path: FleetMemory.main))" } ?? Words.Memory.noMemory,
                     glyph: .book, hue: section.hue, mono: true,
                     actions: memory == nil ? [] : [RowAction(label: Words.Memory.deleteEverywhere, glyph: .trash, destructive: true,
                                                              disabled: busy.contains(FleetMemory.main)) { [weak self] in self?.remove(FleetMemory.main) }])
            row.setRollout(memory == nil ? nil : chip(.memory, "", what: FleetMemory.main))
            let faults = RowFaults(hub: hub, scope: .memory, key: "")
            row.setBelow(faults.isHidden ? [] : [faults])
            row.accessibilityIdentifier = "memory.row.main"
        }
        for doc in docs {
            let row = rows.row(doc.path)
            let path = doc.path
            let file = MemoryFile(content: doc.content, hash: doc.hash, updatedAt: doc.updatedAt, scope: doc.scope)
            row.opens = { [weak self] in self?.open(path) }
            row.show(name: FleetMemory.docLabel(path, scope: doc.scope),
                     meta: "\(FleetMemory.loadedInto(doc.scope, projects: hub.fleet.projects)) · \(facts(file, path: path))",
                     glyph: .book, hue: section.hue, mono: true,
                     actions: [RowAction(label: Words.Memory.deleteEverywhere, glyph: .trash, destructive: true, disabled: busy.contains(path)) { [weak self] in
                         self?.remove(path)
                     }])
            // A role's document reaches its sessions as they start, from the hub: it is on no machine.
            row.setRollout(doc.scope?.role == nil ? chip(.memoryDocs, path, what: path) : nil)
            let faults = RowFaults(hub: hub, scope: .memoryDocs, key: path)
            row.setBelow(faults.isHidden ? [] : [faults])
        }
    }

    private func open(_ path: String) {
        navigationController?.pushViewController(MemoryEditorController(section: section, context: context, path: path), animated: true)
    }


    /// Delete: at once, with Undo in the toast.
    private func remove(_ path: String) {
        busy.insert(path)
        requestRefresh()
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let deleted = try await FleetMemory.remove(path, hub: hub)
                ConfigDrafts.shared.drop(ConfigDrafts.path("memory", path))
                ConfigUndo.offer(Words.Configure.deleted(what: path), mark: path, deleted: deleted, hub: hub, in: view) { [hub] in
                    await hub.configuration.load()
                }
            } catch {
                Toast.error(ThreadsStore.failureWords(error), in: view.window)
            }
            busy.remove(path)
            requestRefresh()
        }
    }

    private func openNew() {
        let taken = (hub.configuration.snapshot?.memoryDocs ?? []).map(\.path)
        let new = NewMemoryController(hub: hub, taken: taken)
        new.opened = { [weak self] path in self?.open(path) }
        KitPopover.present(new, from: add, in: self, align: .end)
    }
}

/// A new memory document (NewMemoryPopover.svelte): its path under
/// memories/, then the editor. A write to a path the hub has never seen is
/// how a document comes into being.
final class NewMemoryController: KitPopoverController {
    var opened: (String) -> Void = { _ in }
    private let hub: HubConnection
    private let taken: [String]
    private let path = KitField(placeholder: Words.Memory.pathPlaceholder, mono: true)
    private var field: ConfigField!
    private let failure = metaLine(ink: Palette.statusFailInk)
    private var submit: UIButton!
    private var asked = false
    private var busy = false
    private let column = UIStackView()

    init(hub: HubConnection, taken: [String]) {
        self.hub = hub
        self.taken = taken
        super.init()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("NewMemoryController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        field = ConfigField(label: Words.Memory.pathUnder(layer: "\(Words.Skills.userLayer)/memories"), control: path)
        path.addAction(UIAction { [weak self] _ in self?.draw() }, for: .editingChanged)
        path.addAction(UIAction { [weak self] _ in self?.create() }, for: .editingDidEndOnExit)
        failure.isHidden = true
        submit = KitButton.make(Words.Memory.create, variant: .action, height: .sm) { [weak self] in self?.create() }
        for part in [field!, failure, UIStackView(arrangedSubviews: [UIView(), submit])] as [UIView] { column.addArrangedSubview(part) }
        column.axis = .vertical
        column.spacing = 12
        column.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(column)
        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: card.topAnchor, constant: 12),
            column.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 12),
            column.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -12),
        ])
        draw()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        path.becomeFirstResponder()
    }

    private var trimmed: String { (path.text ?? "").trimmingCharacters(in: .whitespaces) }

    private var problem: String? {
        if trimmed.isEmpty { return asked ? Words.Memory.needsPath : nil }
        return FleetMemory.newPathProblem(trimmed, taken: taken)
    }

    private func draw() {
        field.sayCoded(Words.Memory.pathHint, problem: problem)
        KitButton.setTitle(busy ? Words.Memory.creating : Words.Memory.create, of: submit, variant: .action, height: .sm)
        submit.configuration?.showsActivityIndicator = busy
        submit.isEnabled = !busy && hub.writesBlocked == nil
        let width = min(360, (view.window?.bounds.width ?? UIScreen.main.bounds.width) - 32)
        let height = column.systemLayoutSizeFitting(CGSize(width: width - 24, height: 0), withHorizontalFittingPriority: .required,
                                                    verticalFittingPriority: .fittingSizeLevel).height + 24
        preferredContentSize = CGSize(width: width, height: height)
    }

    private func create() {
        asked = true
        guard !trimmed.isEmpty, problem == nil, !busy else { return draw() }
        busy = true
        failure.isHidden = true
        draw()
        let wanted = trimmed
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                switch try await FleetMemory.create(wanted, hub: hub) {
                case .written:
                    dismiss(animated: true) { [opened] in opened(wanted) }
                    return
                case .conflict:
                    await hub.configuration.load()
                    failure.text = Words.Memory.writtenElsewhere(path: wanted)
                }
            } catch {
                failure.text = ThreadsStore.failureWords(error)
            }
            busy = false
            failure.isHidden = false
            draw()
        }
    }
}
