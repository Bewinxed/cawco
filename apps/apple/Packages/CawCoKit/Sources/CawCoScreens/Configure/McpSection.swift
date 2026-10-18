import AuthenticationServices
import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// Configure › MCP (routes/config/mcp/+page.svelte): the MCP servers every
/// supported harness can reach. New sessions pick them up; a running
/// session keeps the servers it started with. Each row opens its editor;
/// its switch turns it on or off everywhere, its chip says where it has
/// landed, a server that signs in with OAuth carries Sign in, and its ⋯
/// removes it at once with Undo. Sync all, over the rows, asks every
/// machine to sync again. Under the list, what each machine really has.
final class McpSectionController: ConfigSectionController {
    private lazy var add = KitButton.make(Words.Mcp.add, glyph: .plus, variant: .action) { [weak self] in self?.open(nil) }
    private lazy var sync = KitButton.make(Words.Mcp.syncAll, glyph: .refresh, variant: .outline, height: .sm) { [weak self] in self?.syncAll() }
    private let syncFault = metaLine(ink: Palette.statusFailInk)
    private let list = RowList(label: Words.Mcp.list)
    private let rows = KeyedRows()
    private var empty: KitEmptyState!
    private var inventory: MachineInventoryView!
    private var busy: Set<String> = []
    /// Why a server's switch did not take, by server.
    private var toggleFailed: [String: String] = [:]
    private var signIns: [String: McpSignInControl] = [:]
    private var chips: [String: RolloutChip] = [:]
    private var syncing = false

    override func viewDidLoad() {
        super.viewDidLoad()
        add.accessibilityIdentifier = "mcp.add"
        setActions([add])
        syncFault.isHidden = true
        toolbar.addArrangedSubview(sync)
        toolbar.addArrangedSubview(syncFault)
        empty = KitEmptyState(icon: section.glyph, title: Words.Mcp.emptyTitle, line: Words.Mcp.emptyLine)
        inventory = MachineInventoryView(hub: hub)
        setContent([empty, list, inventory])
    }

    override func viewIsAppearing(_ animated: Bool) {
        super.viewIsAppearing(animated)
        Task { await hub.configuration.load() }
    }

    override func refreshContent() {
        let config: FleetConfig = hub.configuration
        ready = config.snapshot != nil
        problem = config.snapshot == nil ? config.problem : nil
        let down = hub.writesBlocked
        add.isEnabled = down == nil
        add.accessibilityHint = down
        KitButton.setTitle(syncing ? Words.Mcp.syncing : Words.Mcp.syncAll, of: sync, variant: .outline, height: .sm)
        sync.configuration?.showsActivityIndicator = syncing
        sync.isEnabled = !syncing
        let servers = config.snapshot?.config.mcp ?? []
        empty.isHidden = !servers.isEmpty
        list.isHidden = servers.isEmpty
        let machines = hub.fleet.machines
        let shown = rows.keep(servers.map(\.name))
        for server in servers {
            let row = rows.row(server.name)
            let name = server.name
            let run = McpRun(server.config)
            row.opens = { [weak self] in self?.open(name) }
            row.onToggle = { [weak self] on in self?.toggle(server, on: on) }
            let meta = run.isRemote ? run.remoteMeta : run.described
            row.show(name: name, meta: meta, glyph: run.isRemote ? .globe : .toolMcp, hue: section.hue,
                     enabled: server.enabled, toggling: busy.contains(name),
                     actions: [RowAction(label: Words.Mcp.remove, glyph: .trash, destructive: true, disabled: busy.contains(name)) { [weak self] in
                         self?.remove(name)
                     }])
            row.accessibilityIdentifier = "mcp.row.\(name)"
            let chip = chips[name] ?? RolloutChip(hub: hub, scope: .mcp, name: name, what: name)
            chip.openFault = { [weak self] group in self?.openFault(group) }
            chips[name] = chip
            chip.draw()
            row.setRollout(chip)
            let signIn = signIns[name] ?? McpSignInControl(hub: hub)
            signIns[name] = signIn
            signIn.show(server)
            row.setTrailing(server.auth?.mode == .oauth ? [signIn] : [])
            var below: [UIView] = []
            if let failed = toggleFailed[name] {
                below.append(RowFault(failed) { [weak self] in self?.toggle(server, on: !server.enabled) })
            }
            let faults = RowFaults(hub: hub, scope: .mcp, key: name)
            if !faults.isHidden { below.append(faults) }
            if server.auth?.state == .failed, let detail = server.auth?.detail { below.append(metaLine(detail, ink: Palette.statusFailInk)) }
            row.setBelow(below)
        }
        chips = chips.filter { key, _ in servers.contains { $0.name == key } }
        signIns = signIns.filter { key, _ in servers.contains { $0.name == key } }
        list.set(shown)
        inventory.configure(machines: machines)
    }

    #if DEBUG
    func probeOpenNew() { open(nil) }

    func probeToggle(_ name: String, on: Bool) {
        guard let server = hub.configuration.snapshot?.config.mcp.first(where: { $0.name == name }) else { return }
        toggle(server, on: on)
    }
    #endif

    private func open(_ name: String?) {
        let server = name.flatMap { name in hub.configuration.snapshot?.config.mcp.first { $0.name == name } }
        navigationController?.pushViewController(McpEditorController(section: section, context: context, server: server), animated: true)
    }

    private func openFault(_ group: FaultGroup) {
        navigationController?.pushViewController(FleetFaultController(group: group, hub: hub), animated: true)
    }

    /// On or off, the rest as stored; a refusal is said under its row with Try again.
    private func toggle(_ server: FleetMcpServer, on: Bool) {
        busy.insert(server.name)
        toggleFailed[server.name] = nil
        requestRefresh()
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try await FleetMcp.save(server.name, run: McpRun(server.config), enabled: on, projectId: server.projectId, hub: hub)
            } catch {
                toggleFailed[server.name] = ThreadsStore.failureWords(error)
            }
            busy.remove(server.name)
            requestRefresh()
        }
    }

    /// Remove: at once, from every machine, with Undo in the toast for as long as the hub keeps it.
    private func remove(_ name: String) {
        busy.insert(name)
        requestRefresh()
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let deleted = try await FleetMcp.remove(name, hub: hub)
                ConfigUndo.offer(Words.Configure.removed(what: name), mark: name, deleted: deleted, hub: hub, in: view) { [hub] in
                    await hub.configuration.load()
                }
            } catch {
                Toast.error(ThreadsStore.failureWords(error), in: view.window)
            }
            busy.remove(name)
            requestRefresh()
        }
    }

    private func syncAll() {
        syncing = true
        syncFault.isHidden = true
        requestRefresh()
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                // Each row's rollout chip says its sync, machine by machine.
                try await FleetMcp.syncAll(hub: hub)
            } catch {
                syncFault.text = ThreadsStore.failureWords(error)
                syncFault.isHidden = false
            }
            syncing = false
            requestRefresh()
        }
    }
}

extension McpRun {
    /// A remote server's meta line: its transport, then its endpoint.
    var remoteMeta: String {
        guard case let .remote(transport, url, _) = self else { return described }
        return Words.Mcp.transportOf(transport: transport.uppercased(), url: url)
    }
}

/// What a row's last action came to when the hub refused it (RowFault.svelte):
/// the reason in fail ink, then Try again.
final class RowFault: UIStackView {
    init(_ reason: String, again: (() -> Void)?) {
        super.init(frame: .zero)
        spacing = Space.space2
        alignment = .firstBaseline
        let words = metaLine(reason, ink: Palette.statusFailInk)
        words.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        addArrangedSubview(words)
        if let again {
            let retry = KitButton.make(Words.Configure.tryAgain, variant: .ghost, height: .xs, action: again)
            retry.setContentHuggingPriority(.required, for: .horizontal)
            addArrangedSubview(retry)
        }
        accessibilityTraits = .staticText
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("RowFault is built in code")
    }
}

/// A fleet MCP server's sign-in, on its row (McpSignIn.svelte). Sign in
/// opens the provider in the platform's sign-in browser and the page stays
/// here: the button waits until the hub reports the server signed in, and
/// the browser closes. A sign-in closed before it finished, or a start the
/// hub refused, is said under the button, which tries again.
final class McpSignInControl: UIStackView, ASWebAuthenticationPresentationContextProviding {
    private let hub: HubConnection
    private var button: UIButton!
    private let state = metaLine()
    private let fault = metaLine(ink: Palette.statusFailInk)
    private var server: FleetMcpServer?
    private var waiting = false
    private var session: ASWebAuthenticationSession?

    init(hub: HubConnection) {
        self.hub = hub
        super.init(frame: .zero)
        axis = .vertical
        spacing = 4
        alignment = .trailing
        button = KitButton.make(Words.Mcp.signIn, glyph: .key, variant: .outline, height: .sm) { [weak self] in self?.signIn() }
        fault.isHidden = true
        addArrangedSubview(button)
        addArrangedSubview(state)
        addArrangedSubview(fault)
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("McpSignInControl is built in code")
    }

    func show(_ next: FleetMcpServer) {
        server = next
        let signedIn = next.auth?.state == .signedIn
        // Signed in on the hub's word: the wait is over.
        if signedIn, waiting {
            waiting = false
            session?.cancel()
            session = nil
            fault.isHidden = true
        }
        state.text = Words.Mcp.signedIn
        state.isHidden = !signedIn
        button.isHidden = signedIn
        KitButton.setTitle(waiting ? Words.Mcp.signingIn(name: next.name) : Words.Mcp.signIn, of: button, variant: .outline, height: .sm)
        button.configuration?.showsActivityIndicator = waiting
        button.isEnabled = next.enabled && !waiting
    }

    private func signIn() {
        guard let server else { return }
        waiting = true
        fault.isHidden = true
        show(server)
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let start = try await FleetMcp.signIn(server.name, hub: hub)
                let session = ASWebAuthenticationSession(url: start, callback: .customScheme("cawco-signin")) { [weak self] _, _ in
                    MainActor.assumeIsolated { self?.closed() }
                }
                session.presentationContextProvider = self
                session.prefersEphemeralWebBrowserSession = false
                self.session = session
                session.start()
            } catch {
                waiting = false
                fault.text = ThreadsStore.failureWords(error)
                fault.isHidden = false
                show(server)
            }
        }
    }

    /// The browser closed: unless the hub has said signed in, it did not finish.
    private func closed() {
        session = nil
        guard waiting, let server else { return }
        // The hand-back answers the hub as the browser closes: a beat for its word to arrive.
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(2))
            guard let self, waiting, self.server?.auth?.state != .signedIn else { return }
            waiting = false
            fault.text = Words.Mcp.signInClosed
            fault.isHidden = false
            show(self.server ?? server)
        }
    }

    nonisolated func presentationAnchor(for _: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated { window ?? ASPresentationAnchor() }
    }
}

/// One MCP server's editor (McpEditor.svelte): how every machine starts it,
/// what sessions call it, and where it applies. A new name makes a new
/// server; the old one stays until it is removed.
final class McpEditorController: ConfigEditorController, UITextFieldDelegate {
    private enum Mode: String { case bunx, command, remote }

    private let original: FleetMcpServer?
    private var mode: Mode
    private var named: Bool
    private var transport: String
    private var projectId: String
    private var created = false
    private var refusal: String?

    private let nameInput = TitleInput(label: Words.Mcp.nameLabel, placeholder: Words.Mcp.namePlaceholder, mono: true)
    private let nameLine = metaLine()
    private let failure = metaLine(ink: Palette.statusFailInk)
    private let kindChoice = ChoiceField(label: Words.Mcp.kind)
    private let howNote = metaLine()
    private let package = KitField(placeholder: Words.Mcp.packagePlaceholder, mono: true)
    private let packageArgs = KitField(placeholder: Words.Mcp.packageArgsPlaceholder, mono: true)
    private let command = KitField(placeholder: Words.Mcp.commandPlaceholder, mono: true)
    private let args = KitField(placeholder: Words.Mcp.argsPlaceholder, mono: true)
    private let url = KitField(placeholder: Words.Mcp.urlPlaceholder, mono: true)
    private let transportChoice = ChoiceField(label: Words.Mcp.transport)
    private var bunxFields: UIStackView!
    private var commandFields: UIStackView!
    private var remoteFields: UIStackView!
    private let pairs = KeyValueRows()
    private var pairsSection: UIStackView!
    private var pairsHead: KitLabel?
    private let scope = KitSelect()

    /// The server Save would write: an edit that comes back to what is saved is no edit.
    private struct Written: Equatable {
        let name: String
        let run: McpRun
        let projectId: String
    }

    /// The form as it stands: what a draft keeps and puts back.
    private struct Fields {
        let mode: Mode
        let name: String
        let named: Bool
        let package: String
        let packageArgs: String
        let command: String
        let args: String
        let url: String
        let pairs: [(key: String, value: String)]
        let transport: String
        let projectId: String
    }

    /// What is saved, as this form writes it; set once the form holds it.
    private var baseline: Written?

    init(section: ConfigSection, context: ShellContext, server: FleetMcpServer?) {
        original = server
        let run = server.map { McpRun($0.config) }
        mode = run == nil ? .bunx : run!.isRemote ? .remote : .command
        named = server != nil
        if case let .remote(transport, _, _) = run { self.transport = transport } else { transport = "http" }
        projectId = server?.projectId ?? ""
        super.init(section: section, context: context, title: server?.name ?? Words.Mcp.newTitle,
                   saveLabel: server == nil ? Words.Mcp.add : Words.Mcp.save, deleteLabel: server == nil ? nil : Words.Mcp.remove)
        draftPath = ConfigDrafts.path("mcp", server?.name)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("McpEditorController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.accessibilityIdentifier = "config.editor.mcp"
        nameInput.text = original?.name
        nameInput.delegate = self
        nameInput.addAction(UIAction { [weak self] _ in
            self?.named = true
            self?.draw()
        }, for: .editingChanged)
        failure.isHidden = true
        var head: [UIView] = [nameInput, nameLine, failure]
        if let original {
            let chip = RolloutChip(hub: hub, scope: .mcp, name: original.name, what: original.name)
            chip.openFault = { [weak self] group in
                guard let self else { return }
                navigationController?.pushViewController(FleetFaultController(group: group, hub: hub), animated: true)
            }
            let signIn = McpSignInControl(hub: hub)
            signIn.alignment = .leading
            signIn.show(original)
            let row = UIStackView(arrangedSubviews: [chip, UIView()])
            row.alignment = .center
            head.append(row)
            if original.auth?.mode == .oauth { head.append(signIn) }
        }
        head.forEach(lead.addArrangedSubview)

        // How machines run it: the kind, its note, and its fields.
        if let original, case let .command(cmd, list, env) = McpRun(original.config) {
            command.text = cmd
            args.text = list.joined(separator: " ")
            pairs.set(env)
        } else if let original, case let .remote(_, address, headers) = McpRun(original.config) {
            url.text = address
            pairs.set(headers)
        }
        for field in [package, packageArgs, command, args, url] {
            field.addAction(UIAction { [weak self] _ in self?.typed(field) }, for: .editingChanged)
        }
        kindChoice.onChange = { [weak self] next in
            self?.mode = Mode(rawValue: next) ?? .bunx
            self?.draw()
        }
        transportChoice.onChange = { [weak self] next in
            self?.transport = next
            self?.draw()
        }
        bunxFields = stack([ConfigField(label: Words.Mcp.package, control: package), ConfigField(label: Words.Mcp.packageArgs, control: packageArgs)])
        let argsField = ConfigField(label: Words.Mcp.args, control: args)
        argsField.say(hint: Words.Mcp.argsHint)
        commandFields = stack([ConfigField(label: Words.Mcp.command, control: command), argsField])
        remoteFields = stack([ConfigField(label: Words.Mcp.url, control: url), transportChoice])
        // IconPlay.
        parts.addArrangedSubview(editorSection(.loopOn, hue: section.hue, Words.Mcp.howItRuns, [kindChoice, howNote, bunxFields, commandFields, remoteFields]))

        pairs.onChange = { [weak self] in self?.draw() }
        let expanded = metaLine()
        expanded.attributedText = TypeScale.typeMeta.coded(Words.Mcp.expanded, color: Palette.inkMuted)
        pairsSection = editorSection(.key, hue: section.hue, Words.Mcp.environment, [expanded, pairs])
        pairsHead = pairsSection.arrangedSubviews.first?.subviews.compactMap { $0 as? KitLabel }.first
        parts.addArrangedSubview(pairsSection)

        // Where it applies: every machine, or one project's checkouts and workspaces.
        scope.accessibilityLabel = Words.Mcp.scope
        scope.menuOnOpen { [weak self] in self?.scopeItems() ?? [] }
        let scopeRow = UIStackView(arrangedSubviews: [scope, UIView()])
        parts.addArrangedSubview(editorSection(.mapPoint, hue: section.hue, Words.Mcp.where, [metaLine(Words.Mcp.whereNote), scopeRow]))
        // What is saved, then the edits left here unsaved last time over it.
        baseline = written
        if let draftPath, let kept = ConfigDrafts.shared.kept(draftPath, as: Fields.self) { restore(kept) }
        draw()
    }

    private var written: Written { Written(name: serverName, run: run, projectId: projectId) }

    private var fields: Fields {
        Fields(mode: mode, name: nameInput.text ?? "", named: named, package: package.text ?? "", packageArgs: packageArgs.text ?? "",
               command: command.text ?? "", args: args.text ?? "", url: url.text ?? "", pairs: pairs.rows, transport: transport,
               projectId: projectId)
    }

    private func restore(_ kept: Fields) {
        mode = kept.mode
        nameInput.text = kept.name
        named = kept.named
        package.text = kept.package
        packageArgs.text = kept.packageArgs
        command.text = kept.command
        args.text = kept.args
        url.text = kept.url
        pairs.set(kept.pairs)
        transport = kept.transport
        projectId = kept.projectId
    }

    private func stack(_ views: [UIView]) -> UIStackView {
        let made = UIStackView(arrangedSubviews: views)
        made.axis = .vertical
        made.spacing = 8
        return made
    }

    #if DEBUG
    /// A command server, its name and where it applies, as a person fills them.
    func probeFill(name: String, command words: String, args line: String, projectId id: String) {
        mode = .command
        nameInput.text = name
        named = true
        command.text = words
        args.text = line
        projectId = id
        draw()
    }
    #endif

    /// A package typed before the name was: the name follows it (`suggestMcpName`).
    private func typed(_ field: UITextField) {
        if field === package, !named { nameInput.text = FleetMcp.suggestName(package.text ?? "") }
        draw()
    }

    override func refreshContent() {
        draw()
    }

    private var taken: [String] {
        (hub.configuration.snapshot?.config.mcp ?? []).map(\.name).filter { $0 != original?.name }
    }

    private var serverName: String { (nameInput.text ?? "").trimmingCharacters(in: .whitespaces) }

    /// The server Save would write (`build`).
    private var run: McpRun {
        switch mode {
        case .remote:
            return .remote(transport: transport, url: (url.text ?? "").trimmingCharacters(in: .whitespaces), headers: pairs.rows)
        case .bunx:
            return .command(command: "bunx", args: [(package.text ?? "").trimmingCharacters(in: .whitespaces)] + FleetMcp.splitArgs(packageArgs.text ?? ""), env: [])
        case .command:
            return .command(command: (command.text ?? "").trimmingCharacters(in: .whitespaces), args: FleetMcp.splitArgs(args.text ?? ""), env: pairs.rows)
        }
    }

    private var filled: Bool {
        switch mode {
        case .bunx: !(package.text ?? "").trimmingCharacters(in: .whitespaces).isEmpty
        case .command: !(command.text ?? "").trimmingCharacters(in: .whitespaces).isEmpty
        case .remote: !(url.text ?? "").trimmingCharacters(in: .whitespaces).isEmpty
        }
    }

    private func draw() {
        guard isViewLoaded else { return }
        // A new server (or a new name) made ends its draft: a second Save would add it again.
        if !created, let baseline, let draftPath { ConfigDrafts.shared.keep(draftPath, written == baseline ? nil : fields) }
        let problem = FleetMcp.nameProblem(serverName, taken: taken)
        nameInput.invalid = !(nameInput.text ?? "").isEmpty && problem != nil
        if !(nameInput.text ?? "").isEmpty, let problem {
            nameLine.text = problem
            nameLine.ink = Palette.statusFailInk
        } else if let original, !serverName.isEmpty, serverName != original.name {
            // Said before Save, where the name is changed: that is its consequence.
            nameLine.text = Words.Mcp.renamed(name: original.name)
            nameLine.ink = Palette.inkMuted
        } else {
            nameLine.attributedText = TypeScale.typeMeta.coded(Words.Mcp.callsAs(name: serverName.isEmpty ? "name" : serverName), color: Palette.inkMuted)
        }
        failure.text = refusal
        failure.isHidden = refusal == nil
        kindChoice.set([(Mode.bunx.rawValue, Words.Mcp.kindBunx), (Mode.command.rawValue, Words.Mcp.kindCommand), (Mode.remote.rawValue, Words.Mcp.kindRemote)],
                       value: mode.rawValue)
        transportChoice.set([("http", Words.Mcp.transportHttp), ("sse", Words.Mcp.transportSse)], value: transport)
        howNote.text = switch mode {
        case .bunx: Words.Mcp.howBunx
        case .command: Words.Mcp.howCommand
        case .remote: Words.Mcp.howRemote
        }
        bunxFields.isHidden = mode != .bunx
        commandFields.isHidden = mode != .command
        remoteFields.isHidden = mode != .remote
        // A bunx package takes neither headers nor an environment.
        pairsSection.isHidden = mode == .bunx
        pairsHead?.text = mode == .remote ? Words.Mcp.headers : Words.Mcp.environment
        pairs.placeholders(key: mode == .remote ? Words.Mcp.headerKey : Words.Mcp.envKey, value: mode == .remote ? Words.Mcp.headerValue : Words.Mcp.envValue)
        let projects = hub.fleet.projects
        scope.setValue(projects.first { $0.id == projectId }?.name ?? Words.Mcp.everyMachine)
        canSave = filled && problem == nil && !created
    }

    /// Where it applies, as the select lists it when it opens.
    private func scopeItems() -> [UIMenuElement] {
        [UIAction(title: Words.Mcp.everyMachine, state: projectId.isEmpty ? .on : .off) { [weak self] _ in
            self?.projectId = ""
            self?.draw()
        }] + hub.fleet.projects.map { project in
            UIAction(title: project.name, state: project.id == projectId ? .on : .off) { [weak self] _ in
                self?.projectId = project.id
                self?.draw()
            }
        }
    }

    /// Saving keeps the editor open on the server; a new one (or a new name, which makes one) shows Saved, then the list comes back.
    override func save() async -> Bool {
        guard filled, FleetMcp.nameProblem(serverName, taken: taken) == nil, !created else { return false }
        refusal = nil
        do {
            try await FleetMcp.save(serverName, run: run, enabled: original?.enabled ?? true, projectId: projectId.isEmpty ? nil : projectId, hub: hub)
            if original?.name == serverName {
                baseline = written
            } else {
                created = true
                if let draftPath { ConfigDrafts.shared.drop(draftPath) }
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

    /// Remove: at once, with Undo in the toast, and the list comes back.
    override func deleteNow() {
        guard let name = original?.name else { return }
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let deleted = try await FleetMcp.remove(name, hub: hub)
                if let draftPath { ConfigDrafts.shared.drop(draftPath) }
                let back = navigationController?.viewControllers.dropLast().last?.view
                navigationController?.popViewController(animated: true)
                ConfigUndo.offer(Words.Configure.removed(what: name), mark: name, deleted: deleted, hub: hub, in: back) { [hub] in
                    await hub.configuration.load()
                }
            } catch {
                refusal = ThreadsStore.failureWords(error)
                draw()
            }
        }
    }
}

/// Key and value pairs (KeyValueRows.svelte): each pair two code-face
/// fields and its remove, then Add; blank pairs are dropped when saved.
final class KeyValueRows: UIStackView {
    var onChange: () -> Void = {}
    private let list = UIStackView()
    private var keyHint = ""
    private var valueHint = ""
    private(set) var rows: [(key: String, value: String)] = []

    init() {
        super.init(frame: .zero)
        axis = .vertical
        spacing = 8
        alignment = .leading
        list.axis = .vertical
        list.spacing = 8
        addArrangedSubview(list)
        list.widthAnchor.constraint(equalTo: widthAnchor).isActive = true
        let add = KitButton.make(Words.Mcp.addPair, glyph: .plus, variant: .outline, height: .sm) { [weak self] in
            guard let self else { return }
            rows.append(("", ""))
            draw()
            onChange()
        }
        addArrangedSubview(add)
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("KeyValueRows is built in code")
    }

    func set(_ next: [(key: String, value: String)]) {
        rows = next
        draw()
    }

    func placeholders(key: String, value: String) {
        guard key != keyHint || value != valueHint else { return }
        keyHint = key
        valueHint = value
        draw()
    }

    private func draw() {
        list.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for (index, row) in rows.enumerated() {
            let key = KitField(placeholder: keyHint, mono: true)
            key.text = row.key
            let value = KitField(placeholder: valueHint, mono: true)
            value.text = row.value
            key.addAction(UIAction { [weak self, weak key] _ in
                self?.rows[index].key = key?.text ?? ""
                self?.onChange()
            }, for: .editingChanged)
            value.addAction(UIAction { [weak self, weak value] _ in
                self?.rows[index].value = value?.text ?? ""
                self?.onChange()
            }, for: .editingChanged)
            let remove = KitGhostButton(.trash, label: Words.Mcp.removePair(key: row.key.isEmpty ? keyHint : row.key))
            remove.addAction(UIAction { [weak self] _ in
                guard let self else { return }
                rows.remove(at: index)
                draw()
                onChange()
            }, for: .primaryActionTriggered)
            let line = UIStackView(arrangedSubviews: [key, value, remove])
            line.spacing = 8
            line.alignment = .center
            key.widthAnchor.constraint(equalTo: value.widthAnchor, multiplier: 0.6).isActive = true
            list.addArrangedSubview(line)
        }
    }
}
