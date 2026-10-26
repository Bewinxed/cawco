import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// Configure › Delegate types (routes/config/delegate-types/+page.svelte):
/// the presets a session's `delegate` call routes against. A calling agent
/// reads the description and picks the type that matches what it needs
/// done, so the description is each row's meta; how it runs follows it.
/// Grouped by where they apply: the fleet's, each row led by its harness's
/// mark, opening its editor, its ⋯ deleting it at once with Undo in the
/// toast; then each project's own, the files in its `delegates/` folder,
/// which its sessions pick before a fleet type of the same name, each row
/// opening its file. A file there that made no type is said under its
/// project in the hub's words, so it never just goes missing.
final class DelegateTypesSectionController: ConfigSectionController {
    private let types: FleetDelegateTypes
    private lazy var add = KitButton.make(Words.DelegateTypes.add, glyph: .plus, variant: .action) { [weak self] in self?.open(nil) }
    private let list = RowList(label: Words.DelegateTypes.list)
    private let rows = KeyedRows()
    private var empty: KitEmptyState?
    private var busy: Set<String> = []
    /// Each project's group, under the fleet's, in the hub's order.
    private let projectGroups = UIStackView()
    private var drawnProjects: [String: ProjectGroup] = [:]

    /// One project's group (`.group`): its name over its types, then its files that made none.
    private struct ProjectGroup {
        let view: UIStackView
        let list: RowList
        let rows: KeyedRows
        let faults: UIStackView
        let name: String
    }

    override init(section: ConfigSection, context: ShellContext) {
        types = FleetDelegateTypes(hub: context.hub)
        super.init(section: section, context: context)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("DelegateTypesSectionController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        add.accessibilityIdentifier = "delegate-types.add"
        setActions([add])
        let empty = KitEmptyState(icon: section.glyph, title: Words.DelegateTypes.emptyTitle, line: Words.DelegateTypes.emptyLine)
        self.empty = empty
        let fleet = UIStackView(arrangedSubviews: [nsSectionHeader(section.glyph, hue: section.hue, Words.DelegateTypes.fleet), empty, list])
        fleet.axis = .vertical
        fleet.spacing = 8
        projectGroups.axis = .vertical
        setContent([fleet, projectGroups])
    }

    override func viewIsAppearing(_ animated: Bool) {
        super.viewIsAppearing(animated)
        Task { await types.read() }
    }

    override func refreshContent() {
        ready = types.types != nil
        problem = (types.types == nil ? types.problem : nil) ?? types.projectProblem
        let down = hub.writesBlocked
        add.isEnabled = down == nil
        add.accessibilityHint = down
        let all = types.types ?? []
        empty?.isHidden = !all.isEmpty
        list.isHidden = all.isEmpty
        let shown = rows.keep(all.map(\.name))
        for type in all {
            let row = rows.row(type.name)
            let name = type.name
            row.opens = { [weak self] in self?.open(name) }
            row.show(name: name, meta: "\(type.description) · \(Self.runsOn(type))", mark: BrandLogo.harnessView(type.harness.rawValue), mono: true,
                     actions: [RowAction(label: Words.DelegateTypes.remove, glyph: .trash, destructive: true, disabled: busy.contains(name)) { [weak self] in
                         self?.remove(name)
                     }])
            row.accessibilityIdentifier = "delegate-types.row.\(name)"
            if types.flash == name {
                row.flash()
                types.marked()
            }
        }
        list.set(shown)
        drawProjects(types.projectTypes ?? [])
    }

    /// Each project's group, made once and redrawn in place; one the hub no longer lists goes.
    private func drawProjects(_ entries: [ProjectTypes]) {
        let listed = Set(entries.map(\.projectId))
        for (id, group) in drawnProjects where !listed.contains(id) {
            group.view.removeFromSuperview()
            drawnProjects[id] = nil
        }
        for entry in entries {
            let group = projectGroup(entry)
            let shown = group.rows.keep(entry.types.map(\.value1.name))
            for type in entry.types {
                let row = group.rows.row(type.value1.name)
                let path = type.value2.path ?? ""
                let projectId = entry.projectId
                row.opens = path.isEmpty ? nil : { [weak self] in self?.openFile(path, in: projectId) }
                row.show(name: type.value1.name, meta: [path, type.value1.description, Self.runsOn(type.value1)].filter { !$0.isEmpty }.joined(separator: " · "),
                         mark: BrandLogo.harnessView(type.value1.harness.rawValue), mono: true)
                row.setBadge(type.value2.shadows == true ? KitBadge(Words.DelegateTypes.shadows(name: type.value1.name), variant: .secondary) : nil)
                row.accessibilityIdentifier = "delegate-types.project.\(projectId).\(type.value1.name)"
            }
            group.list.isHidden = shown.isEmpty
            group.list.set(shown)
            group.faults.arrangedSubviews.forEach { $0.removeFromSuperview() }
            for fault in entry.problems {
                group.faults.addArrangedSubview(RowFault(Words.DelegateTypes.fileProblem(path: fault.path, problem: fault.problem), again: nil))
            }
            group.faults.isHidden = entry.problems.isEmpty
        }
        let order = entries.compactMap { drawnProjects[$0.projectId]?.view }
        if projectGroups.arrangedSubviews != order {
            projectGroups.arrangedSubviews.forEach { projectGroups.removeArrangedSubview($0) }
            order.forEach(projectGroups.addArrangedSubview)
        }
    }

    /// A project's group, made the first time it is listed, its header's name kept to the project's.
    private func projectGroup(_ entry: ProjectTypes) -> ProjectGroup {
        if let kept = drawnProjects[entry.projectId], kept.name == entry.projectName { return kept }
        drawnProjects[entry.projectId]?.view.removeFromSuperview()
        let list = RowList(label: Words.DelegateTypes.projectList(project: entry.projectName))
        let faults = UIStackView()
        faults.axis = .vertical
        faults.spacing = 8
        let view = editorSection(.folder, hue: section.hue, entry.projectName, [list, faults])
        let made = ProjectGroup(view: view, list: list,
                                rows: drawnProjects[entry.projectId]?.rows ?? KeyedRows(), faults: faults, name: entry.projectName)
        drawnProjects[entry.projectId] = made
        return made
    }

    /// A project type's file, read as it is on the hub (the project page's `?file=`).
    private func openFile(_ path: String, in projectId: String) {
        let sheet = FolderFileController(hub: hub, projectId: projectId, path: path)
        present(HouseSheetController(sheet, title: path, scroller: sheet.scroll), animated: true)
    }

    /// Harness, model, effort, and every narrowing, as one short line.
    static func runsOn(_ type: DelegateType) -> String {
        var parts = [type.harness.rawValue, type.model]
        if let effort = type.effort { parts.append(Words.DelegateTypes.effortOf(effort: effort.rawValue)) }
        if let skills = type.skills, !skills.isEmpty { parts.append(Words.DelegateTypes.skillCount(count: skills.count)) }
        if let denied = type.denyTools, !denied.isEmpty { parts.append(Words.DelegateTypes.deniedCount(count: denied.count)) }
        if type.canDelegate == true { parts.append(Words.DelegateTypes.mayDelegateShort) }
        return parts.joined(separator: " · ")
    }

    #if DEBUG
    func probeOpenNew() { open(nil) }



    #endif

    private func open(_ name: String?) {
        let type = name.flatMap { name in types.types?.first { $0.name == name } }
        let editor = DelegateTypeEditorController(section: section, context: context, types: types, type: type)
        navigationController?.pushViewController(editor, animated: true)
    }

    /// Delete: at once, with Undo in the toast (deletes.ts).
    private func remove(_ name: String) {
        busy.insert(name)
        requestRefresh()
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let deleted = try await types.remove(name)
                ConfigUndo.offer(Words.Configure.deleted(what: name), mark: name, deleted: deleted, hub: hub, in: view) { [types] in
                    await types.read()
                    types.mark(name)
                }
            } catch {
                Toast.error(ThreadsStore.failureWords(error), in: view.window)
            }
            busy.remove(name)
            requestRefresh()
        }
    }
}

/// The toast after a Configure delete, which went through at once with
/// nothing asked first (config/undo.ts; JOURNEY.md Flow 5): Undo for as long
/// as the hub keeps the item, the toast closed when that window runs out.
/// Undo puts it back, and `landed` reads its list again; a failed Undo says
/// why in a toast of its own.
@MainActor
enum ConfigUndo {
    static func offer(_ words: String, mark: String, deleted: Components.Schemas.Undoable, hub: HubConnection, in view: UIView?,
                      landed: @escaping @MainActor () async -> Void) {
        let id = "deleted:\(mark)"
        weak var anchor = view
        Toast.show(words, action: Toast.Action(Words.Configure.undo) {
            Task { @MainActor in
                do {
                    try await FleetTrash.restore(deleted, hub: hub)
                    await landed()
                } catch {
                    Toast.error(ThreadsStore.failureWords(error), in: anchor)
                }
            }
        }, id: id, in: view)
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(Int(deleted.restorableForMs)))
            Toast.dismiss(id: id, in: anchor)
        }
    }
}

/// A delegate type's editor (DelegateTypeEditor.svelte). The description is
/// the whole of how a calling agent routes here, so it gets the largest
/// field, above harness, model and effort rather than beside them. A field
/// says its problem once it has been left or Save was pressed; a new name
/// that another type holds is refused before the hub sees it.
final class DelegateTypeEditorController: ConfigEditorController, UITextFieldDelegate, UITextViewDelegate {
    private let types: FleetDelegateTypes
    private let original: DelegateType?
    private var harness: String
    private var effort: String?
    private var canDelegate: Bool
    private var created = false
    private var attempted = false
    private var touched: Set<String> = []
    /// Why the hub refused the last Save or Delete.
    private var refusal: String?

    private let nameInput = TitleInput(label: Words.DelegateTypes.nameLabel, placeholder: Words.DelegateTypes.namePlaceholder, mono: true)
    private let nameNote = metaLine()
    private let nameProblem = metaLine(ink: Palette.statusFailInk)
    private let failure = metaLine(ink: Palette.statusFailInk)
    private let descriptionArea = ConfigTextArea(placeholder: Words.DelegateTypes.descriptionPlaceholder)
    private var descriptionField: ConfigField!
    private let harnessChoice = ChoiceField(label: Words.DelegateTypes.harness)
    private let model = ModelField()
    private var modelField: ConfigField!
    private let effortChoice = ChoiceField(label: Words.DelegateTypes.effort)
    private let skills = KitField(placeholder: Words.DelegateTypes.skillsPlaceholder, mono: true)
    private let denied = KitField(placeholder: Words.DelegateTypes.deniedPlaceholder, mono: true)
    private let delegates = SwitchField(label: Words.DelegateTypes.mayDelegate)

    /// The fields as the form holds them: what a draft keeps, and what Save writes from.
    private struct Fields: Equatable {
        var name: String
        var description: String
        var harness: String
        var model: String
        var effort: String?
        var skills: String
        var denied: String
        var canDelegate: Bool
    }

    /// What is saved, as the form would hold it: fields that come back to it are no edit.
    private var baseline: Fields
    /// The edits left here unsaved last time, put back as the editor opens.
    private let restored: Fields?

    init(section: ConfigSection, context: ShellContext, types: FleetDelegateTypes, type: DelegateType?) {
        self.types = types
        original = type
        baseline = Fields(name: type?.name ?? "", description: type?.description ?? "", harness: type?.harness.rawValue ?? "claude",
                          model: type?.model ?? "", effort: type?.effort?.rawValue, skills: type?.skills?.joined(separator: ", ") ?? "",
                          denied: type?.denyTools?.joined(separator: ", ") ?? "", canDelegate: type?.canDelegate == true)
        let path = ConfigDrafts.path("delegate-types", type?.name)
        restored = ConfigDrafts.shared.kept(path, as: Fields.self)
        let start = restored ?? baseline
        harness = start.harness
        effort = start.effort
        canDelegate = start.canDelegate
        super.init(section: section, context: context, title: type?.name ?? Words.DelegateTypes.newTitle,
                   saveLabel: type == nil ? Words.DelegateTypes.create : Words.DelegateTypes.save,
                   deleteLabel: type == nil ? nil : Words.DelegateTypes.remove)
        draftPath = path
        tile = BrandLogo.harnessView(harness)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("DelegateTypeEditorController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.accessibilityIdentifier = "config.editor.delegate-types"
        // The header: the name (fixed once it exists), what it is, the problem, and that it reaches new sessions only.
        let start = restored ?? baseline
        nameInput.text = start.name
        nameInput.isEnabled = original == nil
        nameInput.delegate = self
        nameInput.addAction(UIAction { [weak self] _ in self?.changed() }, for: .editingChanged)
        nameNote.text = original == nil ? Words.DelegateTypes.nameRule : Words.DelegateTypes.nameKept
        let notice = KitAlert(Words.DelegateTypes.newSessions, tone: .plain)
        for part in [nameInput, nameNote, nameProblem, notice, failure] as [UIView] { lead.addArrangedSubview(part) }

        descriptionArea.text = start.description
        descriptionArea.delegate = self
        descriptionField = ConfigField(label: Words.DelegateTypes.description, control: descriptionArea)
        harnessChoice.onChange = { [weak self] next in
            self?.harness = next
            self?.draw()
        }
        model.text = start.model
        model.onChange = { [weak self] in
            self?.touched.insert("model")
            self?.changed()
        }
        modelField = ConfigField(label: Words.DelegateTypes.model, control: model)
        effortChoice.onChange = { [weak self] next in
            self?.effort = next == "unset" ? nil : next
            self?.draw()
        }
        skills.text = start.skills
        denied.text = start.denied
        for field in [skills, denied] { field.addAction(UIAction { [weak self] _ in self?.changed() }, for: .editingChanged) }
        delegates.onChange = { [weak self] on in
            self?.canDelegate = on
            self?.draw()
        }

        parts.addArrangedSubview(editorSection(.document, hue: Palette.hueBlue500, Words.DelegateTypes.description, [descriptionField]))
        parts.addArrangedSubview(editorSection(.cpu, hue: Palette.hueBlue500, Words.DelegateTypes.runsOn,
                                               [metaLine(Words.DelegateTypes.runsOnNote), harnessChoice, modelField, effortChoice]))
        parts.addArrangedSubview(editorSection(.key, hue: Palette.hueBlue500, Words.DelegateTypes.reach,
                                               [metaLine(Words.DelegateTypes.reachNote), ConfigField(label: Words.DelegateTypes.skills, control: skills),
                                                ConfigField(label: Words.DelegateTypes.denied, control: denied), delegates]))
        draw()
    }

    override func refreshContent() {
        draw()
    }

    #if DEBUG
    /// The fields as a person fills them: each one's own change runs.
    func probeFill(name: String, description words: String, model id: String, effort level: String) {
        nameInput.text = name
        descriptionArea.text = words
        model.text = id
        effort = level
        touched = ["name", "description", "model"]
        draw()
    }
    #endif

    // MARK: The draft

    private func list(_ text: String?) -> [String]? {
        let items = (text ?? "").split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        return items.isEmpty ? nil : items
    }

    /// The type Save would write.
    private var submission: DelegateType? {
        let harness = Components.Schemas.HarnessKind(rawValue: harness)
        var made = original ?? DelegateType(description: "", harness: harness, model: "", name: "")
        made.name = (nameInput.text ?? "").trimmingCharacters(in: .whitespaces)
        made.description = descriptionArea.text.trimmingCharacters(in: .whitespacesAndNewlines)
        made.harness = harness
        made.model = model.text.trimmingCharacters(in: .whitespaces)
        made.effort = effort.map(Components.Schemas.EffortLevel.init(rawValue:))
        made.skills = list(skills.text)
        made.denyTools = list(denied.text)
        made.canDelegate = canDelegate
        return made
    }

    /// The field a draft is refused for, and why (core `delegateTypeProblem`, the fields this editor holds).
    private func problem(of draft: DelegateType?) -> (field: String, words: String)? {
        guard let draft else { return nil }
        if draft.name.range(of: "^[a-z][a-z0-9-]*$", options: .regularExpression) == nil { return ("name", Words.DelegateTypes.problemName) }
        if draft.description.isEmpty { return ("description", Words.DelegateTypes.problemDescription) }
        if draft.model.isEmpty { return ("model", Words.DelegateTypes.problemModel) }
        return nil
    }

    private var duplicate: Bool {
        guard original == nil, let name = submission?.name, !name.isEmpty else { return false }
        return types.types?.contains { $0.name == name } == true
    }

    private func shown(_ field: String) -> Bool { attempted || touched.contains(field) }

    private func changed() { draw() }

    private var fields: Fields {
        Fields(name: nameInput.text ?? "", description: descriptionArea.text, harness: harness, model: model.text, effort: effort,
               skills: skills.text ?? "", denied: denied.text ?? "", canDelegate: canDelegate)
    }

    private func draw() {
        guard isViewLoaded else { return }
        // A new type made ends its draft: a second Save would write it again.
        if !created, let draftPath { ConfigDrafts.shared.keep(draftPath, fields == baseline ? nil : fields) }
        let draft = submission
        let refused = problem(of: draft)
        let problemFor = { (field: String) in refused?.field == field && self.shown(field) ? refused?.words : nil }
        nameInput.invalid = problemFor("name") != nil || duplicate
        nameProblem.text = problemFor("name") ?? (duplicate ? Words.DelegateTypes.duplicate : nil)
        nameProblem.isHidden = nameProblem.text == nil
        failure.text = refusal
        failure.isHidden = refusal == nil
        descriptionField.say(hint: Words.DelegateTypes.descriptionHint, problem: problemFor("description"))
        modelField.say(problem: problemFor("model"))
        harnessChoice.set(ModelCatalog.harnesses.map { ($0, $0) }, value: harness)
        effortChoice.set([("unset", Words.DelegateTypes.unset)] + Words.DelegateTypes.effortLevels.map { ($0, $0) }, value: effort ?? "unset")
        model.offer(ModelCatalog.models(hub.fleet, harness: harness, machineIds: []).map(\.value))
        delegates.set(on: canDelegate, hint: canDelegate ? Words.DelegateTypes.mayDelegateOn : Words.DelegateTypes.mayDelegateOff)
        canSave = refused == nil && !duplicate
        navigationItem.title = original?.name ?? Words.DelegateTypes.newTitle
    }

    func textFieldDidEndEditing(_: UITextField) {
        touched.insert("name")
        draw()
    }

    func textViewDidChange(_: UITextView) { draw() }

    func textViewDidEndEditing(_: UITextView) {
        touched.insert("description")
        draw()
    }

    // MARK: Save and Delete

    /// Saving keeps the editor open on the type; a new one shows Saved, then
    /// the list comes back with it marked.
    override func save() async -> Bool {
        attempted = true
        draw()
        guard let draft = submission, problem(of: draft) == nil, !duplicate, !created else { return false }
        refusal = nil
        do {
            let saved = try await types.save(draft)
            baseline = fields
            if original == nil {
                created = true
                if let draftPath { ConfigDrafts.shared.drop(draftPath) }
                types.mark(saved.name)
                Task { @MainActor [weak self] in
                    try? await Task.sleep(for: .seconds(Motion.durHold))
                    self?.navigationController?.popViewController(animated: true)
                }
            }
            draw()
            return true
        } catch {
            refusal = ThreadsStore.failureWords(error)
            draw()
            return false
        }
    }

    /// Delete goes through at once, with Undo in the toast, and the list comes back.
    override func deleteNow() {
        guard let name = original?.name else { return }
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let deleted = try await types.remove(name)
                if let draftPath { ConfigDrafts.shared.drop(draftPath) }
                let back = navigationController?.viewControllers.dropLast().last?.view
                navigationController?.popViewController(animated: true)
                ConfigUndo.offer(Words.Configure.deleted(what: name), mark: name, deleted: deleted, hub: hub, in: back) { [types] in
                    await types.read()
                    types.mark(name)
                }
            } catch {
                refusal = ThreadsStore.failureWords(error)
                draw()
            }
        }
    }
}
