import CawCoAPI
import CawCoCore
import CawCoDesign
import CawCoTranscript
import GameController
import UIKit

/// A file's edits not saved yet (ConfigDrafts): leaving it and coming back finds them, and the list says so.
private struct MemoryDraft {
    let text: String
    /// The version the edit started from.
    let base: String?
    let scope: MemoryScope?
}

/// One memory file (MemoryEditor.svelte): the editor, then what it used to
/// say, then what each machine has. A save names the version the edit
/// started from; if the fleet's copy moved on since, nothing is written and
/// the two are shown side by side, to take the latest or save over it. A
/// machine only ever gives back the copy CawCo wrote it, so one edited on
/// the machine itself waits here until it is adopted or overwritten.
final class MemoryEditorController: ConfigEditorController {
    private static let latest = 5
    private let path: String
    private var isMain: Bool { path == FleetMemory.main }

    private var text: String
    private var scope: MemoryScope?
    private var base: String?
    private var conflict: MemoryFile?
    private var forcing = false
    private var saveProblem: String?
    private var deleteProblem: String?

    private let filePicker = KitSelect(small: true)
    private let rolePicker = KitSelect(small: true)
    private let projectPicker = KitSelect(small: true)
    private let titleLabel = KitLabel(TypeScale.typeCode.with(points: TypeScale.typeTitle.points), ink: Palette.inkStrong, lines: 0)
    private let loadedLine = metaLine()
    private let facts = metaLine()
    private let chipSlot = UIStackView()
    private let faultSlot = UIStackView()
    private let conflictBox = UIStackView()
    private let editor: MarkdownEditingView
    private let historyBody = UIStackView()
    private let machinesBody = UIStackView()
    private var machinesSection: UIView!

    // History.
    private var versions: [MemoryVersion]?
    private var historyError: String?
    private var allVersions = false
    private var shown: Int?
    private var contents: [Int: String] = [:]
    private var reading: Set<Int> = []
    private var restoring: Int?
    private var restoreFailed: (id: Int, reason: String)?
    private var versionProblem: [Int: String] = [:]

    // Per machine.
    private var comparing: String?
    private var copies: [String: String?] = [:]
    private var peeking: Set<String> = []
    private var unread: [String: String] = [:]
    private var settling: [String: String] = [:]
    private var settleFailed: [String: String] = [:]

    init(section: ConfigSection, context: ShellContext, path: String) {
        self.path = path
        let saved = FleetMemory.file(path, hub: context.hub)
        let kept = ConfigDrafts.path("memory", path)
        let draft = ConfigDrafts.shared.kept(kept, as: MemoryDraft.self)
        text = draft?.text ?? saved?.content ?? ""
        scope = draft?.scope ?? saved?.scope
        base = draft?.base ?? saved?.hash
        let label = path == FleetMemory.main ? FleetMemory.fileLabel(path) : FleetMemory.docLabel(path, scope: saved?.scope)
        editor = MarkdownEditingView(label: label)
        super.init(section: section, context: context, title: label, saveLabel: Words.Memory.save,
                   deleteLabel: saved == nil ? nil : Words.Memory.deleteEverywhere)
        draftPath = kept
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("MemoryEditorController is built in code")
    }

    private var saved: MemoryFile? { FleetMemory.file(path, hub: hub) }
    private var savedScope: MemoryScope? { saved?.scope }
    private var dirty: Bool { text != (saved?.content ?? "") || !FleetMemory.sameScope(scope, savedScope) }
    /// A document scoped to sessions by role, type or model reaches them from the hub: it is on no machine.
    private var onMachines: Bool { !FleetMemory.scoped(savedScope) || FleetMemory.placedOnly(savedScope) }
    private var label: String { isMain ? FleetMemory.fileLabel(path) : FleetMemory.docLabel(path, scope: savedScope) }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.accessibilityIdentifier = "config.editor.memory"
        // The header: which file, its sessions, its title, its facts, where it landed.
        filePicker.accessibilityLabel = Words.Memory.file
        rolePicker.accessibilityLabel = Words.Memory.role
        projectPicker.accessibilityLabel = Words.Memory.projects
        menuPickers()
        // Each chip at its own width, the ones that do not fit on the next line.
        let pickers = WrapLayout(isMain ? [filePicker] : [filePicker, rolePicker, projectPicker], gap: 8, centred: true)
        titleLabel.accessibilityTraits = .header
        titleLabel.tracking = -0.01
        chipSlot.alignment = .leading
        faultSlot.axis = .vertical
        faultSlot.spacing = 4
        for part in [pickers, titleLabel, loadedLine, facts, chipSlot, faultSlot] as [UIView] { lead.addArrangedSubview(part) }
        loadedLine.isHidden = isMain

        // Contents: the conflict when there is one, then the well.
        conflictBox.axis = .vertical
        conflictBox.spacing = 8
        conflictBox.isHidden = true
        editor.show(text)
        editor.onChange = { [weak self] next in
            self?.text = next
            self?.keepDraft()
            self?.draw()
        }
        let well = UIView()
        well.backgroundColor = Palette.surfaceRecess
        well.layer.cornerRadius = Radius.radiusMd
        well.layer.cornerCurve = .continuous
        well.addSubview(editor)
        NSLayoutConstraint.activate([
            editor.topAnchor.constraint(equalTo: well.topAnchor, constant: 4),
            editor.bottomAnchor.constraint(equalTo: well.bottomAnchor, constant: -4),
            editor.leadingAnchor.constraint(equalTo: well.leadingAnchor),
            editor.trailingAnchor.constraint(equalTo: well.trailingAnchor),
        ])
        parts.addArrangedSubview(editorSection(.document, hue: Palette.hueBlue600, Words.Memory.contents, [conflictBox, well]))
        historyBody.axis = .vertical
        historyBody.spacing = 2
        parts.addArrangedSubview(editorSection(.history, hue: Palette.hueBlue600, Words.Memory.history, [historyBody]))
        machinesBody.axis = .vertical
        machinesBody.spacing = 2
        machinesSection = editorSection(.laptop, hue: Palette.hueBlue600, Words.Memory.perMachine, [machinesBody])
        parts.addArrangedSubview(machinesSection)
        loadHistory()
        draw()
    }

    override var keyCommands: [UIKeyCommand]? {
        [UIKeyCommand(input: "s", modifierFlags: .command, action: #selector(saveKey))]
    }

    @objc private func saveKey() {
        Task { _ = await save() }
    }

    override func refreshContent() {
        draw()
    }


    private func keepDraft() {
        ConfigDrafts.shared.keep(ConfigDrafts.path("memory", path), dirty ? MemoryDraft(text: text, base: base, scope: scope) : nil)
    }

    // MARK: Drawing

    private func draw() {
        guard isViewLoaded else { return }
        if !dirty { base = saved?.hash }
        navigationItem.title = label
        titleLabel.text = label
        drawPickers()
        loadedLine.text = Words.Memory.loadedInto(sessions: FleetMemory.loadedInto(scope, projects: hub.fleet.projects))
        drawFacts()
        chipSlot.arrangedSubviews.forEach { $0.removeFromSuperview() }
        if saved != nil, onMachines {
            let chip = RolloutChip(hub: hub, scope: isMain ? .memory : .memoryDocs, name: isMain ? "" : path, what: label)
            chip.openFault = { [weak self] group in
                guard let self else { return }
                navigationController?.pushViewController(FleetFaultController(group: group, hub: hub), animated: true)
            }
            chipSlot.addArrangedSubview(chip)
        }
        faultSlot.arrangedSubviews.forEach { $0.removeFromSuperview() }
        if let saveProblem { faultSlot.addArrangedSubview(RowFault(saveProblem) { [weak self] in Task { _ = await self?.save() } }) }
        if let deleteProblem { faultSlot.addArrangedSubview(RowFault(deleteProblem) { [weak self] in self?.deleteNow() }) }
        drawConflict()
        drawHistory()
        drawMachines()
        canSave = dirty
    }

    private func drawPickers() {
        filePicker.setValue(label)
        guard !isMain else { return }
        let role = scope?.role?.rawValue
        rolePicker.setValue(role == "orchestrator" ? Words.Memory.orchestrator : role == "leaf" ? Words.Memory.leaf : "\(Words.Memory.role): \(Words.Memory.none)")
        let names = (scope?.projectIds ?? []).compactMap { id in hub.fleet.projects.first { $0.id == id }?.name }
        projectPicker.setValue(names.isEmpty ? "\(Words.Memory.projects): \(Words.Memory.none)" : names.joined(separator: ", "))
    }

    /// The pickers' menus, set once and listed as each opens.
    private func menuPickers() {
        filePicker.menuOnOpen { [weak self] in
            guard let self else { return [] }
            let files = [FleetMemory.main] + (hub.configuration.snapshot?.memoryDocs ?? []).map(\.path)
            return files.map { file in
                let doc = self.hub.configuration.snapshot?.memoryDocs.first { $0.path == file }
                let name = file == FleetMemory.main ? FleetMemory.fileLabel(file) : FleetMemory.docLabel(file, scope: doc?.scope)
                let unsaved = ConfigDrafts.shared.holds(ConfigDrafts.path("memory", file)) ? Words.Memory.unsavedShort : ""
                return UIAction(title: name + unsaved, state: file == self.path ? .on : .off) { [weak self] _ in self?.go(file) }
            }
        }
        rolePicker.menuOnOpen { [weak self] in
            let role = self?.scope?.role?.rawValue ?? ""
            return [("", Words.Memory.none), ("orchestrator", Words.Memory.orchestrator), ("leaf", Words.Memory.leaf)].map { value, words in
                UIAction(title: words, state: role == value ? .on : .off) { [weak self] _ in self?.pickRole(value) }
            }
        }
        projectPicker.menuOnOpen { [weak self] in self?.projectItems() ?? [] }
    }

    /// A project picked toggles in or out, the menu staying open; None clears them all.
    private func projectItems() -> [UIMenuElement] {
        let picked = scope?.projectIds ?? []
        let projects = hub.fleet.projects.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
        return [UIAction(title: Words.Memory.none, state: picked.isEmpty ? .on : .off) { [weak self] _ in
            self?.pickProject(nil)
        }] + projects.map { project in
            UIAction(title: project.name, attributes: .keepsMenuPresented, state: picked.contains(project.id) ? .on : .off) { [weak self] _ in
                self?.pickProject(project.id)
            }
        }
    }

    private func go(_ file: String) {
        guard file != path, var stack = navigationController?.viewControllers else { return }
        stack[stack.count - 1] = MemoryEditorController(section: section, context: context, path: file)
        navigationController?.setViewControllers(stack, animated: false)
    }

    private func pickRole(_ value: String) {
        var next = scope ?? MemoryScope()
        next.role = value.isEmpty ? nil : Components.Schemas.MemoryScopeRole(rawValue: value)
        scope = next
        keepDraft()
        draw()
    }

    private func pickProject(_ id: String?) {
        var next = scope ?? MemoryScope()
        if let id {
            let had = next.projectIds ?? []
            next.projectIds = had.contains(id) ? had.filter { $0 != id } : had + [id]
            if next.projectIds?.isEmpty == true { next.projectIds = nil }
        } else {
            next.projectIds = nil
        }
        scope = next
        keepDraft()
        draw()
        // The menu stays open on a project toggled: its checks follow.
        projectPicker.contextMenuInteraction?.updateVisibleMenu { [weak self] menu in
            menu.replacingChildren(self?.projectItems() ?? menu.children)
        }
    }

    private func drawFacts() {
        let bytes = text.utf8.count
        let tokens = (Double(bytes) / 4).rounded()
        var parts = [FleetSkills.bytes(Double(bytes)), Words.Memory.tokens(count: Int(tokens).formatted())]
        if let saved {
            parts.append(Words.Memory.savedAgo(ago: FleetMemory.ago(saved.updatedAt)))
            parts.append(String(saved.hash.prefix(8)))
        } else {
            parts.append(Words.Memory.notWritten)
        }
        let line = NSMutableAttributedString(string: parts.joined(separator: "   "), attributes: TypeScale.typeMeta.attributes(color: Palette.inkMuted))
        if dirty {
            // ⌘S is said only while a keyboard is there to press it.
            let shortcut = GCKeyboard.coalesced == nil ? "" : Words.Memory.saveShortcut
            line.append(NSAttributedString(string: "   " + Words.Memory.unsaved + shortcut,
                                           attributes: TypeScale.typeMeta.withWeight(.semibold).attributes(color: Palette.inkStrong)))
        }
        facts.attributedText = line
        facts.accessibilityHint = Words.Memory.tokensTitle
    }

    private func drawConflict() {
        conflictBox.arrangedSubviews.forEach { $0.removeFromSuperview() }
        conflictBox.isHidden = conflict == nil
        guard let conflict else { return }
        conflictBox.addArrangedSubview(metaLine(Words.Memory.changedElsewhere, ink: Palette.statusAttnInk))
        conflictBox.addArrangedSubview(DiffView(path: path, old: conflict.content, new: text))
        let take = KitButton.make(Words.Memory.takeLatest, variant: .outline, height: .sm) { [weak self] in self?.takeLatest() }
        take.isEnabled = !saving
        let mine = KitButton.make(saving && forcing ? Words.Memory.saving : Words.Memory.saveMine, variant: .outline, height: .sm) { [weak self] in
            guard let self else { return }
            Task { _ = await self.write(expectedHash: conflict.hash) }
        }
        mine.configuration?.showsActivityIndicator = saving && forcing
        let acts = UIStackView(arrangedSubviews: [take, mine, UIView()])
        acts.spacing = 8
        conflictBox.addArrangedSubview(acts)
    }

    // MARK: Save and Delete

    override func save() async -> Bool {
        await write(expectedHash: base)
    }

    private func write(expectedHash: String?) async -> Bool {
        guard dirty else { return false }
        forcing = conflict != nil && expectedHash == conflict?.hash
        saveProblem = nil
        draw()
        defer {
            forcing = false
            draw()
        }
        do {
            switch try await FleetMemory.save(path, content: text, expectedHash: expectedHash, scope: isMain ? nil : scope, hub: hub) {
            case .written:
                // Where it lands is the rollout chip's to say, beside Save.
                conflict = nil
                text = saved?.content ?? text
                ConfigDrafts.shared.drop(ConfigDrafts.path("memory", path))
                return true
            case let .conflict(latest):
                conflict = latest
                return false
            }
        } catch {
            saveProblem = CawStore.failureWords(error)
            return false
        }
    }

    private func takeLatest() {
        guard let conflict else { return }
        text = conflict.content
        base = conflict.hash
        editor.show(text)
        self.conflict = nil
        keepDraft()
        draw()
    }

    /// Delete: at once, with Undo in the toast, and the list comes back.
    override func deleteNow() {
        deleteProblem = nil
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let deleted = try await FleetMemory.remove(path, hub: hub)
                ConfigDrafts.shared.drop(ConfigDrafts.path("memory", path))
                let back = navigationController?.viewControllers.dropLast().last?.view
                navigationController?.popViewController(animated: true)
                ConfigUndo.offer(Words.Configure.deleted(what: path), mark: path, deleted: deleted, hub: hub, in: back) { [hub] in
                    await hub.configuration.load()
                }
            } catch {
                deleteProblem = CawStore.failureWords(error)
                draw()
            }
        }
    }

    // MARK: History

    private func loadHistory() {
        historyError = nil
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                versions = try await FleetMemory.history(path, hub: hub)
            } catch {
                historyError = CawStore.failureWords(error)
            }
            draw()
        }
    }

    private func sourceLabel(_ source: String) -> String {
        guard source.hasPrefix("machine:") else { return Words.Memory.theFleet }
        let id = String(source.dropFirst("machine:".count))
        return hub.fleet.machines.first { $0.machineId == id }?.name ?? id
    }

    private func drawHistory() {
        historyBody.arrangedSubviews.forEach { $0.removeFromSuperview() }
        if let historyError { return historyBody.addArrangedSubview(metaLine(historyError, ink: Palette.statusAttnInk)) }
        guard let versions else { return historyBody.addArrangedSubview(metaLine(Words.Memory.loading)) }
        guard !versions.isEmpty else { return historyBody.addArrangedSubview(metaLine(Words.Memory.nothingReplaced)) }
        for version in allVersions ? versions : Array(versions.prefix(Self.latest)) {
            historyBody.addArrangedSubview(versionRow(version))
        }
        if versions.count > Self.latest {
            let more = KitButton.make(allVersions ? Words.Memory.showLatest : Words.Memory.showAll(count: versions.count), variant: .ghost, height: .sm) { [weak self] in
                self?.allVersions.toggle()
                self?.draw()
            }
            historyBody.addArrangedSubview(UIStackView(arrangedSubviews: [more, UIView()]))
        }
    }

    private func versionRow(_ version: MemoryVersion) -> UIView {
        let when = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        when.text = FleetMemory.ago(version.createdAt)
        let hash = KitLabel(TypeScale.typeCode.with(points: TypeScale.typeMeta.points), ink: Palette.inkMuted)
        hash.text = String(version.hash.prefix(8))
        let open = shown == version.id
        let compare = KitButton.make(open ? Words.Memory.hide : Words.Memory.compare, variant: open ? .secondary : .outline, height: .sm) { [weak self] in
            self?.openVersion(version)
        }
        compare.setContentHuggingPriority(.required, for: .horizontal)
        let words = WrapLayout([when, metaLine(Words.Memory.from(source: sourceLabel(version.source))), hash, metaLine(FleetSkills.bytes(version.bytes))],
                               gap: 8, rowGap: 2, centred: true)
        let line = UIStackView(arrangedSubviews: [words, compare])
        line.spacing = 8
        line.alignment = .center
        let entry = UIStackView(arrangedSubviews: [line])
        entry.axis = .vertical
        entry.spacing = 6
        if open {
            if reading.contains(version.id) {
                let busy = UIStackView(arrangedSubviews: [KitSpinner(side: 16), metaLine(Words.Memory.readingVersion)])
                busy.spacing = 8
                entry.addArrangedSubview(busy)
            } else if let content = contents[version.id] {
                entry.addArrangedSubview(DiffView(path: path, old: content, new: saved?.content ?? ""))
                let restore = KitButton.make(restoring == version.id ? Words.Memory.restoring : Words.Memory.restore, variant: .outline, height: .sm) { [weak self] in
                    self?.restore(version)
                }
                restore.configuration?.showsActivityIndicator = restoring == version.id
                if restoreFailed?.id == version.id { restore.configuration?.background.strokeColor = Palette.destructive }
                entry.addArrangedSubview(UIStackView(arrangedSubviews: [restore, UIView()]))
                if let failed = restoreFailed, failed.id == version.id { entry.addArrangedSubview(RowFault(failed.reason, again: nil)) }
            }
        }
        if let problem = versionProblem[version.id] { entry.addArrangedSubview(RowFault(problem) { [weak self] in self?.openVersion(version) }) }
        entry.isLayoutMarginsRelativeArrangement = true
        entry.directionalLayoutMargins = .init(top: 8, leading: 10, bottom: 8, trailing: 10)
        entry.backgroundColor = Palette.surfaceRecess
        entry.layer.cornerRadius = Radius.radiusSm
        return entry
    }

    private func openVersion(_ version: MemoryVersion) {
        guard shown != version.id else {
            shown = nil
            return draw()
        }
        shown = version.id
        draw()
        guard contents[version.id] == nil, !reading.contains(version.id) else { return }
        reading.insert(version.id)
        versionProblem[version.id] = nil
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                contents[version.id] = try await FleetMemory.version(version.id, hub: hub)
            } catch {
                shown = nil
                versionProblem[version.id] = CawStore.failureWords(error)
            }
            reading.remove(version.id)
            draw()
        }
    }

    private func restore(_ version: MemoryVersion) {
        restoring = version.id
        restoreFailed = nil
        draw()
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                // The contents are it now, and the rollout chip says where it lands.
                if let landed = try await FleetMemory.restore(version.id, path: path, hub: hub) {
                    text = landed.content
                    editor.show(text)
                }
                shown = nil
                loadHistory()
            } catch {
                restoreFailed = (version.id, CawStore.failureWords(error))
            }
            restoring = nil
            draw()
        }
    }

    // MARK: Per machine

    /// A machine's word on this file: in sync, kept its own copy, taken off, or not reported.
    private func said(_ state: String?) -> String {
        switch state {
        case "applied": Words.Memory.inSync
        case "failed": Words.Memory.keptOwn
        case "removed": Words.Memory.takenOff
        default: Words.Memory.notReported
        }
    }

    private func drawMachines() {
        // A machine holds a copy of the main file and of a linked document alone.
        machinesSection.isHidden = FleetMemory.scoped(savedScope)
        machinesBody.arrangedSubviews.forEach { $0.removeFromSuperview() }
        guard !FleetMemory.scoped(savedScope) else { return }
        let machines = hub.fleet.machines
        guard !machines.isEmpty else { return machinesBody.addArrangedSubview(metaLine(Words.Memory.noMachines + Words.Memory.landsFirst)) }
        let rollout = Rollout.of(isMain ? .memory : .memoryDocs, name: path, machines: machines)
        let applied = zip(machines, rollout.landings).filter { $0.1.state == "applied" }.map(\.0)
        if !applied.isEmpty {
            let asleep = applied.filter { $0.status != "online" }.map(\.name)
            machinesBody.addArrangedSubview(metaLine(Words.Memory.inSyncOn(count: applied.count)
                    + (asleep.isEmpty ? "" : " " + Words.Memory.offlineSync(names: asleep.joined(separator: ", ")))))
        }
        for (machine, landing) in zip(machines, rollout.landings) { machinesBody.addArrangedSubview(machineRow(machine, landing: landing)) }
    }

    private func machineRow(_ machine: MachineRow, landing: Rollout.Landing) -> UIView {
        let id = machine.machineId
        let online = machine.status == "online"
        let drifted = landing.state == "failed"
        let mark = GlyphView(Glyph.os(machine.os), size: 16, tint: online ? Palette.inkMuted : Palette.inkSubtle)
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        name.text = machine.name
        let meta = metaLine("\(said(landing.state)) · \(machineOsLabel(machine.os))\(online ? "" : Words.Memory.offlineWhenBack)")
        let words = UIStackView(arrangedSubviews: [name, meta])
        words.axis = .vertical
        words.spacing = 1
        var acts: [UIView] = []
        if drifted || saved == nil {
            let settle = settling[id]
            if drifted {
                let open = comparing == id
                let compare = KitButton.make(open ? Words.Memory.hide : Words.Memory.compare, variant: open ? .secondary : .outline, height: .sm) { [weak self] in
                    self?.compare(machine)
                }
                compare.isEnabled = online
                acts.append(compare)
            }
            let adopt = KitButton.make(settle == "adopt" ? Words.Memory.adopting : Words.Memory.adoptCopy, variant: .outline, height: .sm) { [weak self] in
                self?.settle(machine, adopt: true)
            }
            adopt.configuration?.showsActivityIndicator = settle == "adopt"
            adopt.isEnabled = online && settle != "push"
            acts.append(adopt)
            if drifted {
                let send = KitButton.make(settle == "push" ? Words.Memory.sending : Words.Memory.sendOurs, variant: .outline, height: .sm) { [weak self] in
                    self?.settle(machine, adopt: false)
                }
                send.configuration?.showsActivityIndicator = settle == "push"
                send.isEnabled = online && settle != "adopt"
                acts.append(send)
            }
            if settleFailed[id] != nil { acts.forEach { ($0 as? UIButton)?.configuration?.background.strokeColor = Palette.destructive } }
        }
        let head = UIStackView(arrangedSubviews: [mark, words, UIView()])
        head.spacing = 10
        head.alignment = .center
        let line = WrapLayout([head] + acts, gap: 8, rowGap: 6, centred: true)
        let entry = UIStackView(arrangedSubviews: [line])
        entry.axis = .vertical
        entry.spacing = 6
        entry.isLayoutMarginsRelativeArrangement = true
        entry.directionalLayoutMargins = .init(top: 6, leading: 8, bottom: 6, trailing: 8)
        if let failed = settleFailed[id] { entry.addArrangedSubview(RowFault(failed, again: nil)) }
        if drifted, let detail = landing.detail {
            let said = KitLabel(TypeScale.typeCode.with(points: TypeScale.typeMeta.points), ink: Palette.inkMuted, lines: 0)
            said.text = detail
            entry.addArrangedSubview(said)
        }
        if comparing == id {
            if peeking.contains(id) {
                let busy = UIStackView(arrangedSubviews: [KitSpinner(side: 16), metaLine(Words.Memory.readingCopy)])
                busy.spacing = 8
                entry.addArrangedSubview(busy)
            } else if let failure = unread[id] {
                entry.addArrangedSubview(metaLine(failure, ink: Palette.statusAttnInk))
            } else if let copy = copies[id] {
                if let copy {
                    entry.addArrangedSubview(DiffView(path: path, old: saved?.content ?? "", new: copy))
                } else {
                    entry.addArrangedSubview(metaLine(Words.Memory.noCopy))
                }
            }
        }
        return entry
    }

    private func compare(_ machine: MachineRow) {
        let id = machine.machineId
        guard comparing != id else {
            comparing = nil
            return draw()
        }
        comparing = id
        draw()
        guard copies[id] == nil, !peeking.contains(id) else { return }
        peeking.insert(id)
        unread[id] = nil
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                copies[id] = .some(try await FleetMemory.peek(id, path: path, hub: hub))
            } catch {
                unread[id] = CawStore.failureWords(error)
            }
            peeking.remove(id)
            draw()
        }
    }

    /// Adopt this copy, or send ours over it; its row turns In sync on the machine's next report.
    private func settle(_ machine: MachineRow, adopt: Bool) {
        let id = machine.machineId
        settling[id] = adopt ? "adopt" : "push"
        settleFailed[id] = nil
        draw()
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                if adopt {
                    if let landed = try await FleetMemory.adopt(id, path: path, hub: hub) {
                        text = landed.content
                        editor.show(text)
                    }
                    loadHistory()
                } else {
                    try await FleetMemory.push(id, path: path, hub: hub)
                }
                comparing = nil
                copies[id] = nil
            } catch {
                settleFailed[id] = CawStore.failureWords(error)
            }
            settling[id] = nil
            draw()
        }
    }
}
