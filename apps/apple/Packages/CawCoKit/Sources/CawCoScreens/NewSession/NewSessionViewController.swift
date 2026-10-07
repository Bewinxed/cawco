public import CawCoCore
import CawCoAPI
import CawCoDesign
public import OSLog
import UIKit

/// The session a continuation starts from, as the form shows and sends it
/// (continue.svelte.ts `ContinueSource`).
public struct ContinueSource: Sendable, Equatable {
    /// The id the hub knows it by: a cawco instance id, or a stored session's own id.
    public var instanceId: String
    public var machineId: String
    public var cwd: String
    public var harness: String
    public var model: String?
    public var title: String

    public init(instanceId: String, machineId: String, cwd: String, harness: String, model: String?, title: String) {
        self.instanceId = instanceId
        self.machineId = machineId
        self.cwd = cwd
        self.harness = harness
        self.model = model
        self.title = title
    }
}

/// The form as it was submitted: what a failed continuation reopens with
/// (continue.svelte.ts `SessionDraft`).
public struct SessionDraft: Sendable {
    var machineIds: [String]
    var baseCwd: String
    var cwd: String
    var prompt: String
    var harness: String
    var permissionMode: String
    var model: String
    var effort: String?
    var sideQuest: Bool
    var repo: String?
    var projectId: String?
    var summarizerHarness: String
    var summarizerModel: String
    var usedModel: String
}

/// The New Session form (spawn/NewSessionDialog.svelte): what the agent
/// does first, where, on which machines, kept or not, and on which model. It
/// owns the form's logic (the location check, the submission guard, the exact
/// spawn payload) and composes the designed sections. Over the scrim: a card
/// in the middle on a regular width, the bottom sheet on a compact one.
public final class NewSessionViewController: ObservedViewController, UIViewControllerTransitioningDelegate, UIGestureRecognizerDelegate {
    private static let keptPrompt = "cawco:new-session-prompt"
    private static let effortLevels = ["low", "medium", "high", "xhigh", "max"]

    private let hub: HubConnection
    private let prefill: (machineId: String?, cwd: String?, projectId: String?)
    /// Continue in new session: the form starts a session seeded with a summary of this one.
    private var continuing: ContinueSource?
    private let restore: SessionDraft?

    /// The session the form started is ready to be shown.
    public var onOpen: (String) -> Void = { _ in }
    /// The form was closed while its continuation runs: the caller sees it through.
    public var onDetach: (_ continuationId: String, _ source: ContinueSource, _ draft: SessionDraft) -> Void = { _, _, _ in }

    // MARK: The form

    private var submission = 0
    private var prompt = ""
    private var machineIds: [String] = []
    /// Set once the operator picks machines themselves; stops the late-arrival adoption.
    private var machinesTouched = false
    private var cwd = ""
    private var repo: String?
    private var harness = "claude"
    private var model = ""
    private var effort: String?
    private var permissionMode = "bypassPermissions"
    /// Full Send came with the form (the last start's mode, or a failed
    /// continuation's) rather than from a pick in it: the warning says where
    /// it came from. A pick in the picker, confirmed there, clears it.
    private var fullSendCarried = false
    private var projectId: String?
    /// The reader set the place themselves (the web's `editing`): a seeded location is no longer locked.
    private var overridden = false
    private var sideQuest = false
    private var busy = false
    private var error = ""
    private var unreadable = false
    private var missingMachines: [String] = []
    private var verifiedLocation = ""
    private var skills: [String] = []
    private var plugins: [String] = []
    private var summarizerHarness = "claude"
    private var summarizerModel = ""
    private var estimate: ContinuationEstimate?
    /// The continuation this form started and follows. Closing the form hands
    /// it to the caller; only Cancel stops it.
    private var job: String?
    private var submitted: SessionDraft?
    private var lastMachine = ""
    private var scheduled = ""
    private var verifying: Task<Void, Never>?

    // MARK: Views

    private let card = UIView()
    private let grip = UIView()
    private let handle = UIView()
    private let boltTile = UIView()
    private let crumb = KitLabel(TypeScale.typeLabel.with(weight: .medium, leading: 1), ink: Palette.inkMuted)
    private let scroll = UIScrollView()
    private let content = UIStackView()
    private var promptHeader = UIView()
    private let promptSection = UIStackView()
    private var editor: PromptEditorView!
    private let chips = NsFlow()
    private let machinesChip = NsChip()
    private let projectChip = NsChip()
    private let locationChip = NsChip()
    private let lifetimeChip = NsChip()
    private let reading = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk)
    /// Full Send chosen, however it got there: in view beside Start, outside the body's scroll.
    private let fullSendNote = KitAlert(tone: .warning, glyph: .shield)
    private let sizing = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let models = UIStackView()
    private var summarizerSection: ModelSectionView?
    private var modelSection: ModelSectionView?
    private var cancel: NsButton!
    private var start: NsButton!
    private var composer = UIView()
    private var footPad: NSLayoutConstraint!
    private var layoutCompact: Bool?
    private var entered = false
    private weak var popover: NsPopoverController?
    private weak var openChip: NsChip?
    private var dragging = false

    private var compact: Bool { traitCollection.horizontalSizeClass == .compact }

    public init(hub: HubConnection, machineId: String? = nil, cwd: String? = nil, projectId: String? = nil) {
        self.hub = hub
        prefill = (machineId, cwd, projectId)
        continuing = nil
        restore = nil
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .custom
        transitioningDelegate = self
    }

    /// Continue in new session; `restore` is the form a failed continuation was submitted with.
    public init(hub: HubConnection, continuing source: ContinueSource, restore: SessionDraft? = nil) {
        self.hub = hub
        prefill = (nil, nil, nil)
        continuing = source
        self.restore = restore
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .custom
        transitioningDelegate = self
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("NewSessionViewController is built in code") }

    override public func loadView() {
        view = Ground()
    }

    override public func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        accessibilityViewIsModal = true
        view.accessibilityLabel = "New Session"
        view.keyboardLayoutGuide.followsUndockedKeyboard = true
        view.keyboardLayoutGuide.usesBottomSafeArea = false
        for (chip, name) in [(machinesChip, "Machines"), (projectChip, "Project"), (locationChip, "Location"), (lifetimeChip, "Session lifetime")] {
            chip.accessibilityLabel = name
        }
        machinesChip.addAction(UIAction { [weak self] _ in self?.toggle(.machines) }, for: .touchUpInside)
        projectChip.addAction(UIAction { [weak self] _ in self?.toggle(.project) }, for: .touchUpInside)
        locationChip.addAction(UIAction { [weak self] _ in self?.toggle(.location) }, for: .touchUpInside)
        lifetimeChip.addAction(UIAction { [weak self] _ in self?.toggle(.lifetime) }, for: .touchUpInside)
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (form: NewSessionViewController, _: UITraitCollection) in form.tint() }
        fullSendNote.isHidden = true
        reset()
    }

    /// Where every open starts (the web's open-reset boundary).
    private func reset() {
        let fleet = hub.fleet
        // Only the harness and the permission mode are revived as a form opens;
        // the model and effort it was last set to are kept but start untouched.
        harness = hub.spawnPrefs.harness.rawValue
        permissionMode = hub.spawnPrefs.permissionMode.rawValue
        summarizerHarness = harness
        let seeded = prefill.projectId.flatMap { id in fleet.projects.first { $0.id == id } }
        projectId = seeded?.id
        let first = continuing?.machineId ?? prefill.machineId ?? seeded?.primaryPlace?.machineId ?? fleet.machines.first { $0.status == "online" }?.machineId ?? ""
        machineIds = first.isEmpty ? [] : [first]
        // A seeded project starts at its primary checkout; without one the form asks.
        cwd = continuing?.cwd ?? prefill.cwd ?? seeded?.primaryPlace?.path ?? ""
        prompt = UserDefaults.standard.string(forKey: Self.keptPrompt) ?? ""
        if continuing != nil, let restore {
            repo = restore.repo
            projectId = restore.projectId
            harness = restore.harness
            effort = restore.effort
            permissionMode = restore.permissionMode
            prompt = restore.prompt
            summarizerHarness = restore.summarizerHarness
            summarizerModel = restore.summarizerModel
            machineIds = restore.machineIds
            machinesTouched = true
            cwd = restore.baseCwd
            model = restore.usedModel
            sideQuest = restore.sideQuest
            overridden = restore.baseCwd != continuing?.cwd || restore.machineIds.first != continuing?.machineId
            lastMachine = restore.machineIds.first ?? ""
        }
        fullSendCarried = permissionMode == "fullSend"
        let request = submission
        if let source = continuing {
            Task { [weak self] in await self?.loadEstimate(source.instanceId, request) }
        }
        Task { [weak self] in
            guard let self else { return }
            let menu = await hub.spawnMenu()
            guard request == submission else { return }
            skills = menu.skills
            plugins = menu.plugins
        }
    }

    /// What continuing the source would carry, sized by the hub, and the
    /// claude windows the pickers size models by. The source is only read.
    private func loadEstimate(_ instanceId: String, _ request: Int) async {
        do {
            async let sized = hub.continuationEstimate(instanceId: instanceId)
            async let windows: Void = hub.readModelWindows()
            let (read, _) = try await (sized, windows)
            if request == submission { estimate = read }
        } catch {
            if request == submission { self.error = error.localizedDescription }
        }
        requestRefresh()
    }

    // MARK: Derived

    private var fleet: FleetStore { hub.fleet }
    private var connected: Bool { hub.state == .connected }
    private var machineId: String { machineIds.first ?? "" }
    private var path: String { cwd.trimmingCharacters(in: .whitespaces) }
    private var machine: MachineRow? { fleet.machines.first { $0.machineId == machineId } }
    private var offlineMachine: MachineRow? { fleet.machines.first { machineIds.contains($0.machineId) && $0.status != "online" } }
    private var report: Components.Schemas.HarnessReport? { machine?.harnesses?.first { $0.harness.rawValue == harness } }

    private var installed: [String] {
        ModelCatalog.harnesses.filter { kind in machine?.harnesses?.contains { $0.harness.rawValue == kind && $0.installed } ?? false }
    }

    private var locationKey: String { machineIds.joined(separator: "\u{1}") + "\u{2}" + path }
    private var locationUnverified: Bool { !machineIds.isEmpty && !path.isEmpty && verifiedLocation != locationKey }

    private func entries(_ harness: String) -> [ModelEntry] {
        ModelCatalog.entries(ModelCatalog.models(fleet, harness: harness, machineIds: machineIds), use: SpawnMemory.use(harness))
    }

    private func chosen(_ entries: [ModelEntry], _ model: String) -> ModelEntry? {
        entries.first { $0.id == model } ?? (model.isEmpty ? entries.first { $0.isDefault } : nil)
    }

    private var selected: ModelEntry? { chosen(entries(harness), model) }
    private var summarizerSelected: ModelEntry? { chosen(entries(summarizerHarness), summarizerModel) }

    private var efforts: [String] {
        guard report?.capabilities.effort == true, let levels = selected?.effort else { return [] }
        return Self.effortLevels.filter(levels.contains)
    }

    /// What the slider shows while `effort` is untouched (nil, left out of the payload).
    private var effortShown: String? {
        if let effort { return effort }
        if let measured = selected?.defaultEffort { return measured }
        let reachable = efforts
        return reachable.contains("high") ? "high" : reachable.first
    }

    /// A harness that reports no permission modes (pi) has none to pick, so no control shows and none is sent.
    private var modeless: Bool { report.map { $0.capabilities.permissionModes.isEmpty } ?? false }

    private var modes: [(value: String, disabled: Bool)] {
        guard !modeless else { return [] }
        let honoured = report?.capabilities.permissionModes.map(\.rawValue)
        return PermissionLook.modes(for: harness).map { mode in (mode, honoured.map { !$0.contains(mode) } ?? false) }
    }

    private var workdir: String {
        guard let repo else { return path }
        return path.replacing(/\/+$/, with: "") + "/" + (ModelCatalog.repoPath(repo).split(separator: "/").last.map(String.init) ?? "")
    }

    private var project: Components.Schemas.GetApiProjects200Payload? {
        fleet.projects.first { project in
            project.id == projectId || project.places.contains { $0.machineId == machineId && $0.path == workdir }
        }
    }

    private var locked: Bool {
        let seeded = prefill.machineId != nil || prefill.cwd != nil || prefill.projectId != nil || projectId != nil || continuing != nil
        return seeded && !overridden && repo == nil
    }

    private var machineItems: [NsMachine] {
        fleet.machines.enumerated().map { index, row in
            let online = row.status == "online"
            let running = fleet.rows.filter { $0.machineId == row.machineId && $0.isLive }.count
            let load = !online ? "Offline" : (running == 0 ? "Idle" : "\(running) session\(running == 1 ? "" : "s")")
            return NsMachine(id: row.machineId, name: row.hostname, os: row.os, online: online, load: load,
                             glyph: MachineHealth.icon(row.os), hue: MachineHealth.hue(index, online: online))
        }
    }

    private var projectItems: [NsProject] {
        // A project is offered on the machines it has a checkout on, at that checkout.
        fleet.projects.compactMap { row in machineIds.lazy.compactMap { row.checkout(on: $0) }.first.map { (row, $0) } }
            .enumerated().map { index, pair in
                NsProject(id: pair.0.id, machineId: pair.1.machineId, name: pair.0.name, path: pair.1.path, hue: nsHues[(index + 3) % 5])
            }
    }

    private var locationReading: String {
        if let offline = offlineMachine {
            return "\(offline.hostname) is offline. Pick another machine, or start when it returns."
        }
        if unreadable {
            return "That directory can't be read on \(machine?.hostname ?? machineId). Check the path and try again."
        }
        if !locationUnverified, !missingMachines.isEmpty {
            let names = missingMachines.map { id in fleet.machines.first { $0.machineId == id }?.hostname ?? id }
            return "Folder missing. Start creates it on \(names.joined(separator: ", "))."
        }
        return ""
    }

    /// The model a start names: the picked entry, or the machine's default by
    /// the model it resolves to. Unknown while the machine's models are still
    /// being read, and when it names its default no more precisely than
    /// "default"; a start then would name none, and the hub refuses that.
    private var startModel: String { selected?.id ?? model }
    private var modelUnknown: Bool { startModel.isEmpty || startModel == "default" }
    private var modelReading: String {
        guard modelUnknown, !machineIds.isEmpty else { return "" }
        return entries(harness).isEmpty
            ? "Reading the models on \(machine?.hostname ?? machineId)…"
            : "Choose a model for this session."
    }

    private var readingText: String {
        guard connected else { return "No spawn while the hub is unreachable. Reconnect to continue." }
        if !error.isEmpty { return error }
        let location = locationReading
        if !location.isEmpty { return location }
        return locationUnverified ? "Reading…" : modelReading
    }

    private var locationInformational: Bool {
        error.isEmpty && !locationUnverified && !unreadable && offlineMachine == nil && !missingMachines.isEmpty && connected
    }

    /// Why a model cannot summarise this session: it would not fit what it reads.
    private func summarizerRefusal(_ entry: ModelEntry) -> String? {
        guard let estimate, estimate.summariseInputTokens > 0 else { return nil }
        return ModelCatalog.contextFitRefusal(window: entry.contextWindow, needed: estimate.summariseInputTokens + ModelCatalog.summariserOutputReserve)
    }

    /// Why a model cannot continue this session: its opening would leave no room.
    private func targetRefusal(_ entry: ModelEntry) -> String? {
        guard let estimate else { return nil }
        return ModelCatalog.contextFitRefusal(window: entry.contextWindow, needed: estimate.openingTokens + ModelCatalog.targetHeadroom)
    }

    private var continueBlocked: Bool {
        guard continuing != nil else { return false }
        guard let estimate, let selected else { return true }
        if targetRefusal(selected) != nil { return true }
        guard estimate.summariseInputTokens > 0 else { return false }
        return summarizerSelected.map { summarizerRefusal($0) != nil } ?? true
    }

    private var repoValid: Bool {
        repo.map { $0.trimmingCharacters(in: .whitespaces).wholeMatch(of: /[\w.\-]+\/[\w.\-]+/) != nil } ?? true
    }

    private var cantStart: Bool {
        continueBlocked || !connected || machineIds.isEmpty || offlineMachine != nil || unreadable || locationUnverified || modelUnknown || !repoValid
    }

    private var startLabel: String {
        if continuing != nil { return "Continue" }
        return machineIds.count > 1 ? "Start \(machineIds.count) sessions" : "Start session"
    }

    private static func tokens(_ count: Double) -> String {
        count < 1000 ? String(Int(count)) : "\(Int((count / 1000).rounded()))k"
    }

    // MARK: Settling (the web's effects)

    private func chooseHarness(_ value: String) {
        harness = value
        model = ""
        effort = nil
    }

    private func settle() {
        // The fleet arrives over the socket, so the form can open before any
        // machine is known: adopt the first that shows up until the operator picks.
        if !machinesTouched, machineIds.isEmpty, let first = fleet.machines.first(where: { $0.status == "online" }) {
            machineIds = [first.machineId]
        }
        if machineId != lastMachine {
            lastMachine = machineId
            let has = installed
            if !has.contains(harness) { chooseHarness(has.first ?? "claude") }
        }
        if let effort, !efforts.contains(effort) { self.effort = nil }
        let honoured = modes.filter { !$0.disabled }.map(\.value)
        if !honoured.contains(permissionMode), let next = PermissionLook.fallback(permissionMode, honoured: honoured) {
            permissionMode = next
        }
        verify()
        follow()
    }

    /// The location is read 600ms after it stops changing, on every chosen machine.
    private func verify() {
        let key = locationKey
        guard verifiedLocation != key else { return }
        let stamp = key + "\u{3}" + (machine?.status ?? "")
        guard stamp != scheduled else { return }
        scheduled = stamp
        verifying?.cancel()
        unreadable = false
        missingMachines = []
        let ids = machineIds
        let where_ = path
        guard !ids.isEmpty, !where_.isEmpty, machine?.status == "online" else { return }
        verifying = Task { [weak self, hub] in
            try? await Task.sleep(for: .milliseconds(600))
            guard !Task.isCancelled else { return }
            do {
                var gone: [String] = []
                for id in ids where try await hub.inspectLocation(machineId: id, path: where_) { gone.append(id) }
                guard !Task.isCancelled, let self else { return }
                missingMachines = gone
                verifiedLocation = key
            } catch {
                guard !Task.isCancelled, let self else { return }
                unreadable = true
            }
            self?.requestRefresh()
        }
    }

    /// The continuation this form follows, stage by stage, as the hub publishes it.
    private func follow() {
        guard let id = job, let current = fleet.continuations.first(where: { $0.id == id }) else { return }
        switch current.stage {
        case .started:
            job = nil
            exit(to: current.targetInstanceId)
        case .failed:
            job = nil
            error = current.error ?? ""
            busy = false
        case .cancelled:
            job = nil
            busy = false
        case .starting, .summarising:
            break
        }
    }

    // MARK: Layout

    private func build() {
        let phone = compact
        layoutCompact = phone
        card.removeFromSuperview()
        card.subviews.forEach { $0.removeFromSuperview() }
        content.arrangedSubviews.forEach { $0.removeFromSuperview() }
        promptSection.arrangedSubviews.forEach { $0.removeFromSuperview() }
        models.arrangedSubviews.forEach { $0.removeFromSuperview() }
        summarizerSection = nil
        modelSection = nil

        card.translatesAutoresizingMaskIntoConstraints = false
        card.backgroundColor = Palette.surfaceRecess
        card.layer.cornerRadius = Radius.radiusLg
        card.layer.cornerCurve = .continuous
        card.layer.maskedCorners = phone ? [.layerMinXMinYCorner, .layerMaxXMinYCorner]
            : [.layerMinXMinYCorner, .layerMaxXMinYCorner, .layerMinXMaxYCorner, .layerMaxXMaxYCorner]
        card.boxShadow = phone ? Shadow.shadowDrawer : Shadow.shadowModal
        view.addSubview(card)

        // The head: the bolt, where this is, and the way out. On a phone the
        // sheet's grabber rides above it and the whole strip drags the sheet.
        handle.backgroundColor = Palette.muted
        handle.layer.cornerRadius = 3
        handle.isHidden = !phone
        handle.translatesAutoresizingMaskIntoConstraints = false
        boltTile.backgroundColor = Palette.inkSolid
        boltTile.layer.cornerRadius = Radius.radiusXs
        boltTile.layer.cornerCurve = .continuous
        boltTile.translatesAutoresizingMaskIntoConstraints = false
        boltTile.subviews.forEach { $0.removeFromSuperview() }
        let bolt = GlyphView(.bolt, size: 12, tint: Palette.onInk)
        boltTile.addSubview(bolt)
        crumb.lineBreakMode = .byTruncatingTail
        let close = KitGhostButton(.close, label: "Close")
        close.addAction(UIAction { [weak self] _ in self?.close() }, for: .primaryActionTriggered)
        let headRow = UIStackView(arrangedSubviews: [boltTile, crumb, UIView(), close])
        headRow.spacing = 10
        headRow.alignment = .center
        headRow.translatesAutoresizingMaskIntoConstraints = false
        grip.subviews.forEach { $0.removeFromSuperview() }
        grip.translatesAutoresizingMaskIntoConstraints = false
        grip.addSubview(handle)
        grip.addSubview(headRow)
        card.addSubview(grip)
        grip.gestureRecognizers?.forEach(grip.removeGestureRecognizer)
        if phone {
            let pan = UIPanGestureRecognizer(target: self, action: #selector(dragged(_:)))
            pan.maximumNumberOfTouches = 1
            grip.addGestureRecognizer(pan)
        }

        // The body: the raised sheet the form is written on.
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.backgroundColor = Palette.surfaceRaised
        scroll.layer.cornerRadius = Radius.radiusLg
        scroll.layer.cornerCurve = .continuous
        scroll.clipsToBounds = true
        scroll.alwaysBounceVertical = false
        scroll.keyboardDismissMode = .interactive
        card.addSubview(scroll)
        content.axis = .vertical
        content.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(content)

        let heading = KitLabel(TypeScale.typeTitle, ink: Palette.inkStrong)
        heading.text = "New Session"
        heading.accessibilityTraits = .header
        content.addArrangedSubview(heading)
        content.setCustomSpacing(16, after: heading)

        // The prompt, with where and how it runs as chips under it.
        editor = PromptEditorView(phone: phone)
        editor.menuHost = view
        editor.menuItems = { [weak self] type, query in self?.menuItems(type, query) ?? [] }
        editor.onChange = { [weak self] text in self?.typed(text) }
        editor.onSubmit = { [weak self] in self?.submit() }
        editor.onLeadRemove = { [weak self] in self?.exitContinue() }
        chips.gap = 6
        chips.rowGap = traitCollection.userInterfaceIdiom == .mac ? 6 : 14
        chips.set([machinesChip, projectChip, locationChip, lifetimeChip])
        let chipBox = UIView()
        chips.translatesAutoresizingMaskIntoConstraints = false
        chipBox.addSubview(chips)
        composer = UIView()
        composer.backgroundColor = Palette.surfaceRaised
        composer.layer.cornerRadius = Radius.radiusLg
        composer.layer.cornerCurve = .continuous
        composer.layer.borderWidth = 1
        composer.boxShadow = Shadow.shadowXs
        let composerColumn = UIStackView(arrangedSubviews: [editor, chipBox])
        composerColumn.axis = .vertical
        composerColumn.translatesAutoresizingMaskIntoConstraints = false
        composer.addSubview(composerColumn)
        reading.lineBreakMode = .byTruncatingTail
        promptHeader = UIView()
        promptSection.axis = .vertical
        promptSection.spacing = 8
        for part in [promptHeader, NsComb(), composer, reading] as [UIView] { promptSection.addArrangedSubview(part) }
        content.addArrangedSubview(promptSection)
        content.setCustomSpacing(18, after: promptSection)
        let comb = NsComb()
        content.addArrangedSubview(comb)
        content.setCustomSpacing(18, after: comb)
        sizing.tabular = true
        content.addArrangedSubview(sizing)
        content.setCustomSpacing(18, after: sizing)
        models.axis = phone ? .vertical : .horizontal
        models.spacing = 14
        models.distribution = phone ? .fill : .fillEqually
        models.alignment = .fill
        content.addArrangedSubview(models)

        // The footer, straight on the recess.
        cancel = NsButton("Cancel") { [weak self] in self?.cancelPressed() }
        start = NsButton(startLabel, primary: true) { [weak self] in self?.submit() }
        let footer = UIStackView(arrangedSubviews: [UIView(), cancel, start])
        footer.spacing = 8
        footer.alignment = .center
        footer.isLayoutMarginsRelativeArrangement = true
        footer.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 4, bottom: 0, trailing: 4)
        // The Full Send warning stands over the actions, on the recess, out of the scroll.
        let foot = UIStackView(arrangedSubviews: [fullSendNote, footer])
        foot.axis = .vertical
        foot.spacing = 10
        foot.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(foot)

        let side: Double = phone ? 7 : Space.space2
        let bodyPad: (top: Double, side: Double, bottom: Double) = phone ? (14, 12, 16) : (18, 18, 20)
        // As tall as what it holds, until the screen (or the keyboard) stops it.
        let fits = scroll.heightAnchor.constraint(equalTo: scroll.contentLayoutGuide.heightAnchor)
        fits.priority = .defaultHigh - 1
        footPad = foot.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -(phone ? 10 : Space.space2 + 2))
        var constraints = [
            grip.topAnchor.constraint(equalTo: card.topAnchor, constant: phone ? 0 : Space.space2),
            grip.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: side),
            grip.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -side),
            handle.topAnchor.constraint(equalTo: grip.topAnchor, constant: 16),
            handle.centerXAnchor.constraint(equalTo: grip.centerXAnchor),
            handle.widthAnchor.constraint(equalToConstant: 100),
            handle.heightAnchor.constraint(equalToConstant: 6),
            headRow.topAnchor.constraint(equalTo: phone ? handle.bottomAnchor : grip.topAnchor, constant: phone ? 8 : 3),
            headRow.leadingAnchor.constraint(equalTo: grip.leadingAnchor, constant: 4),
            headRow.trailingAnchor.constraint(equalTo: grip.trailingAnchor, constant: -4),
            headRow.bottomAnchor.constraint(equalTo: grip.bottomAnchor, constant: -8),
            boltTile.widthAnchor.constraint(equalToConstant: 22),
            boltTile.heightAnchor.constraint(equalToConstant: 22),
            bolt.centerXAnchor.constraint(equalTo: boltTile.centerXAnchor),
            bolt.centerYAnchor.constraint(equalTo: boltTile.centerYAnchor),
            scroll.topAnchor.constraint(equalTo: grip.bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: side),
            scroll.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -side),
            fits,
            content.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: bodyPad.top),
            content.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -bodyPad.bottom),
            content.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: bodyPad.side),
            content.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -bodyPad.side),
            foot.topAnchor.constraint(equalTo: scroll.bottomAnchor, constant: 10),
            foot.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: side),
            foot.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -side),
            footPad!,
            start.widthAnchor.constraint(greaterThanOrEqualToConstant: 96),
            composerColumn.topAnchor.constraint(equalTo: composer.topAnchor),
            composerColumn.bottomAnchor.constraint(equalTo: composer.bottomAnchor),
            composerColumn.leadingAnchor.constraint(equalTo: composer.leadingAnchor),
            composerColumn.trailingAnchor.constraint(equalTo: composer.trailingAnchor),
            chips.topAnchor.constraint(equalTo: chipBox.topAnchor, constant: 8),
            chips.bottomAnchor.constraint(equalTo: chipBox.bottomAnchor, constant: -10),
            chips.leadingAnchor.constraint(equalTo: chipBox.leadingAnchor, constant: 10),
            chips.trailingAnchor.constraint(equalTo: chipBox.trailingAnchor, constant: -10),
            reading.heightAnchor.constraint(greaterThanOrEqualToConstant: 16),
        ]
        if phone {
            // The sheet: flush to the bottom and the sides, rounded on top,
            // as tall as it needs up to the status bar's clearance.
            constraints += [
                card.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                card.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                card.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
                card.topAnchor.constraint(greaterThanOrEqualTo: view.safeAreaLayoutGuide.topAnchor, constant: 0),
                card.topAnchor.constraint(greaterThanOrEqualTo: view.topAnchor, constant: 24),
            ]
        } else {
            // `min(980px, 100vw - 48px)`, fit to its content, at most the screen less 48.
            let wanted = card.widthAnchor.constraint(equalToConstant: 980)
            wanted.priority = .defaultHigh
            let centred = card.centerYAnchor.constraint(equalTo: view.centerYAnchor)
            centred.priority = .defaultHigh
            constraints += [
                card.centerXAnchor.constraint(equalTo: view.centerXAnchor),
                wanted,
                card.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, constant: -48),
                centred,
                card.topAnchor.constraint(greaterThanOrEqualTo: view.safeAreaLayoutGuide.topAnchor, constant: 24),
                card.bottomAnchor.constraint(lessThanOrEqualTo: view.keyboardLayoutGuide.topAnchor, constant: -24),
                card.bottomAnchor.constraint(lessThanOrEqualTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),
            ]
        }
        NSLayoutConstraint.activate(constraints)

        buildMode()
        editor.set(prompt)
        tint()
    }

    /// The parts that differ between a new session and a continuation.
    private func buildMode() {
        let continues = continuing != nil
        crumb.text = continues ? "Sessions · Continue" : "Sessions · New"
        let header = nsSectionHeader(.chatRound, hue: Palette.hueBlue500, continues ? "Next step (optional)" : "First prompt")
        let at = promptSection.arrangedSubviews.firstIndex(of: promptHeader) ?? 0
        promptHeader.removeFromSuperview()
        promptHeader = header
        promptSection.insertArrangedSubview(header, at: at)
        editor.lead = continuing.map { source in
            let title = source.title
            // A session title is often its first prompt, so it is cut short.
            let label = title.count > 28 ? String(title.prefix(27)).trimmingCharacters(in: .whitespaces) + "…" : title
            return (source.harness, label, title)
        }
        sizing.isHidden = !continues
        models.arrangedSubviews.forEach { $0.removeFromSuperview() }
        summarizerSection = nil
        if continues {
            let section = ModelSectionView(hub: hub, label: "Summarise with", state: summarizerState, presenter: self)
            section.onHarness = { [weak self] value in
                self?.summarizerHarness = value
                self?.summarizerModel = ""
                self?.requestRefresh()
            }
            section.onModel = { [weak self] id in
                self?.summarizerModel = id
                self?.requestRefresh()
            }
            section.unavailable = { [weak self] entry in self?.summarizerRefusal(entry) }
            summarizerSection = section
            models.addArrangedSubview(section)
        }
        let section = ModelSectionView(hub: hub, label: continues ? "Continue on" : "Model", state: modelState, presenter: self)
        section.onHarness = { [weak self] value in
            self?.chooseHarness(value)
            self?.requestRefresh()
        }
        section.onModel = { [weak self] id in
            self?.model = id
            self?.effort = nil
            self?.requestRefresh()
        }
        section.unavailable = continues ? { [weak self] entry in self?.targetRefusal(entry) } : nil
        modelSection = section
        models.addArrangedSubview(section)
    }

    private var summarizerState: ModelSectionView.State {
        .init(harness: summarizerHarness, installed: installed, machineName: machine?.hostname ?? machineId, machineIds: machineIds,
              model: summarizerModel, tools: nil)
    }

    private var modelState: ModelSectionView.State {
        let tools = ModelTools(
            efforts: efforts, effort: effortShown,
            effortOff: report?.capabilities.effort == false ? ModelTools.effortNotExposed(harness) : nil,
            harness: harness, modes: modes, permission: permissionMode,
            onEffort: { [weak self] level in
                self?.effort = level
                self?.requestRefresh()
            },
            onPermission: { [weak self] mode in
                self?.permissionMode = mode
                self?.fullSendCarried = false
                self?.requestRefresh()
            }
        )
        return .init(harness: harness, installed: installed, machineName: machine?.hostname ?? machineId, machineIds: machineIds, model: model, tools: tools)
    }

    private func tint() {
        composer.layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
    }

    override public func viewWillLayoutSubviews() {
        // A width that crossed between a phone's and a desk's lays the form out again.
        if layoutCompact != compact { build() }
        super.viewWillLayoutSubviews()
    }

    override public func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        guard compact, footPad != nil else { return }
        // The foot clears the home indicator, unless the keyboard already holds the sheet above it.
        let keyboard = view.keyboardLayoutGuide.layoutFrame.height > view.safeAreaInsets.bottom + 1
        let foot = -(keyboard ? 10 : max(10, view.safeAreaInsets.bottom))
        if footPad.constant != foot { footPad.constant = foot }
    }

    override public func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        guard !entered else { return }
        entered = true
        view.layoutIfNeeded()
        guard !UIAccessibility.isReduceMotionEnabled else { return }
        // `.sec`: each section arrives from 8pt down over `durPop`, the model sections a beat after the prompt.
        var parts: [(UIView, Double)] = [(promptSection, 0)]
        if let summarizerSection { parts.append((summarizerSection, 0.06)) }
        if let modelSection { parts.append((modelSection, 0.08)) }
        for (part, delay) in parts {
            part.alpha = 0
            part.transform = CGAffineTransform(translationX: 0, y: 8)
            Motion.easeOut.animator(Motion.durPop) {
                part.alpha = 1
                part.transform = .identity
            }.startAnimation(afterDelay: delay)
        }
    }

    // MARK: Painting

    override public func refreshContent() {
        settle()
        paint()
    }

    private func paint() {
        guard layoutCompact != nil else { return }
        let picked = machineItems.filter { machineIds.contains($0.id) }
        machinesChip.show(Glyph.machineServer.image, tint: Palette.hueCyan500,
                          label: picked.isEmpty ? "Select machine" : (picked.count == 1 ? picked[0].name : "\(picked.count) machines"))
        machinesChip.warn = picked.isEmpty

        let listed = projectItems.first { $0.id == projectId }
        projectChip.show(Glyph.toolFiles.image, tint: Palette.hueAmber500, label: listed?.name ?? "No project")
        projectChip.empty = listed == nil
        if listed != nil, projectChip.trailing == nil {
            let clear = KitGhostButton(.closeSquare, label: "Clear project", side: 16, tint: Palette.inkSubtle)
            clear.addAction(UIAction { [weak self] _ in self?.clearProject() }, for: .primaryActionTriggered)
            projectChip.setTrailing(clear)
        } else if listed == nil, projectChip.trailing != nil {
            projectChip.setTrailing(nil)
        }

        if let repo {
            let named = repo.trimmingCharacters(in: .whitespaces)
            locationChip.show(BrandLogo.github.image, label: named.isEmpty ? "Clone from GitHub" : named, mono: !named.isEmpty)
            locationChip.empty = named.isEmpty
        } else {
            // The last two segments are what tells two checkouts apart.
            let parts = path.split(separator: "/")
            let short = parts.count > 2 ? "…/" + parts.suffix(2).joined(separator: "/") : path
            locationChip.show(Glyph.folderOpen.image, tint: Palette.hueAmber500, label: path.isEmpty ? "Choose folder" : short, mono: !path.isEmpty)
            locationChip.empty = path.isEmpty
        }

        let lifetime = LifetimePopover.options[sideQuest ? 1 : 0]
        lifetimeChip.show(lifetime.glyph.image, tint: lifetime.hue, label: lifetime.name)
        chips.setNeedsLayout()

        // Full Send is never started silently: while it is chosen, and offered
        // on this machine, the form says so.
        let offered = modes.contains { $0.value == "fullSend" && !$0.disabled }
        if permissionMode == "fullSend", offered, let copy = FullSendCopy.of(harness) {
            let lead = fullSendCarried ? "Full Send is on, from your last start" : "Full Send is on"
            fullSendNote.label.text = "\(lead). \(copy.warning)"
            fullSendNote.isHidden = false
        } else {
            fullSendNote.isHidden = true
        }

        let text = readingText
        reading.text = text.isEmpty ? "\u{a0}" : text
        reading.ink = locationInformational ? Palette.inkMuted : Palette.statusFailInk
        reading.accessibilityLabel = text

        if continuing != nil {
            sizing.text = estimate.map { "Current context \(Self.tokens($0.liveContextTokens)) → \(Self.tokens($0.summariseInputTokens)) to summarise" }
                ?? "Reading the session's context…"
        }
        summarizerSection?.update(summarizerState)
        modelSection?.update(modelState)

        // While a start runs the form takes no input; the footer stays live.
        grip.isUserInteractionEnabled = !busy
        scroll.isUserInteractionEnabled = !busy
        start.setLabel(startLabel)
        let stage = job.flatMap { id in fleet.continuations.first { $0.id == id }?.stage }
        start.setPending(busy, label: continuing != nil && stage != .starting ? "Summarising…" : "Starting…")
        start.isEnabled = !cantStart
        cancel.isEnabled = !busy || job != nil
    }

    // MARK: Changes

    private func typed(_ text: String) {
        prompt = text
        // The first prompt outlives a relaunch: kept as it is typed, gone once the form closes.
        if text.isEmpty {
            UserDefaults.standard.removeObject(forKey: Self.keptPrompt)
        } else {
            UserDefaults.standard.set(text, forKey: Self.keptPrompt)
        }
    }

    private func toggleMachine(_ id: String) {
        machinesTouched = true
        if let at = machineIds.firstIndex(of: id) { machineIds.remove(at: at) } else { machineIds.append(id) }
        if let project, !machineIds.contains(where: project.placed(on:)) { projectId = nil }
        overridden = true
        requestRefresh()
    }

    private func pickProject(_ row: NsProject) {
        projectId = row.id
        if !machineIds.contains(row.machineId) { machineIds.insert(row.machineId, at: 0) }
        cwd = row.path
        repo = nil
        overridden = false
        closePopover()
        requestRefresh()
    }

    private func clearProject() {
        projectId = nil
        cwd = ""
        overridden = true
        closePopover()
        requestRefresh()
    }

    /// The operator deleted the source chip: the form stays open as a plain New Session.
    private func exitContinue() {
        guard continuing != nil else { return }
        continuing = nil
        estimate = nil
        buildMode()
        requestRefresh()
    }

    private func menuItems(_ type: Character, _ query: String) -> [NsMenuItem] {
        let q = query.lowercased()
        let hit = { (text: String) in q.isEmpty || text.lowercased().contains(q) }
        if type == "@" {
            let machines = machineItems.filter { $0.online && hit($0.name) }.map { row in
                NsMenuItem(key: "machine:\(row.id)", label: row.name, kind: "Machine", glyph: row.glyph, hue: row.hue, serial: "@\(row.name)") { [weak self] in
                    guard let self, !machineIds.contains(row.id) else { return }
                    machineIds.append(row.id)
                    requestRefresh()
                }
            }
            let projects = projectItems.filter { hit($0.name) }.map { row in
                NsMenuItem(key: "project:\(row.id)", label: row.name, kind: "Project", glyph: .toolFiles, hue: row.hue, serial: "@\(row.name)") { [weak self] in
                    self?.pickProject(row)
                }
            }
            return machines + projects
        }
        // A skill or plugin chip only changes the prompt text.
        let skillRows = skills.filter(hit).enumerated().map { index, name in
            NsMenuItem(key: "skill:\(name)", label: "/\(name)", kind: "Skill", glyph: .stars, hue: nsHues[index % 5], serial: "/\(name)") {}
        }
        let pluginRows = plugins.filter(hit).enumerated().map { index, id in
            NsMenuItem(key: "plugin:\(id)", label: id, kind: "Plugin", glyph: .bookOpen, hue: nsHues[(index + 2) % 5], serial: "/\(id)") {}
        }
        return skillRows + pluginRows
    }

    // MARK: Popovers

    private enum Picker { case machines, project, location, lifetime }

    private func chip(_ picker: Picker) -> NsChip {
        switch picker {
        case .machines: machinesChip
        case .project: projectChip
        case .location: locationChip
        case .lifetime: lifetimeChip
        }
    }

    /// A chip's press opens its picker, closes it when it is the one open, and
    /// moves straight to it from a sibling's.
    private func toggle(_ picker: Picker) {
        let target = chip(picker)
        if let open = popover {
            let same = openChip === target
            open.onClose = {}
            openChip?.open = false
            openChip = nil
            open.dismiss(animated: same) { [weak self] in
                if !same { self?.present(picker) }
            }
            return
        }
        present(picker)
    }

    private func present(_ picker: Picker) {
        let made: NsPopoverController
        switch picker {
        case .machines:
            made = MachinesPopover(hub: hub, machines: machineItems, selected: machineIds) { [weak self] id in self?.toggleMachine(id) }
        case .project:
            made = ProjectPopover(projects: projectItems, projectId: projectId, onPick: { [weak self] row in self?.pickProject(row) },
                                  onCreate: { [weak self] name, path in try await self?.createProject(name: name, path: path) })
        case .location:
            let location = LocationPopover(hub: hub, seed: .init(mode: repo == nil ? .dir : .repo, dir: cwd, repo: repo ?? "", locked: locked,
                                                                 machineId: machineId, machineName: machine?.hostname ?? ""))
            location.onDir = { [weak self] value in
                self?.cwd = value
                self?.overridden = true
                self?.projectId = nil
                self?.requestRefresh()
            }
            location.onMode = { [weak self] mode in
                guard let self else { return }
                repo = mode == .repo ? (repo ?? "") : nil
                if mode == .repo {
                    projectId = nil
                    overridden = true
                    if cwd.isEmpty { cwd = "~" }
                }
                requestRefresh()
            }
            location.onOverride = { [weak self] in
                self?.overridden = true
                self?.requestRefresh()
            }
            location.onRepo = { [weak self] value in
                self?.repo = value
                self?.requestRefresh()
            }
            // The location is set: its popover closes and the prompt takes the keys again.
            location.onCommit = { [weak self] in
                self?.closePopover { self?.editor.focusAtEnd() }
            }
            made = location
        case .lifetime:
            made = LifetimePopover(ephemeral: sideQuest) { [weak self] value in
                self?.sideQuest = value
                self?.closePopover()
                self?.requestRefresh()
            }
        }
        let target = chip(picker)
        target.open = true
        openChip = target
        popover = made
        made.onClose = { [weak self, weak target] in
            target?.open = false
            if self?.openChip === target { self?.openChip = nil }
        }
        KitPopover.present(made, from: target, in: self, passthrough: [machinesChip, projectChip, locationChip, lifetimeChip])
    }

    private func closePopover(then: (() -> Void)? = nil) {
        guard let open = popover else {
            then?()
            return
        }
        open.dismiss(animated: true, completion: then)
    }

    private func createProject(name: String, path: String) async throws {
        let created = try await hub.createProject(name: name, cwd: path, machineId: machineId)
        // The place the hub made (or found) for the folder: the project as it starts here.
        pickProject(NsProject(id: created.id, machineId: created.place.machineId, name: created.name, path: created.place.path, hue: nsHues[0]))
    }

    // MARK: Start

    private func validate() -> String {
        if machineIds.isEmpty { return "Choose a machine to run this session on." }
        if !repoValid { return "Enter a repository as owner/repository." }
        if path.isEmpty { return "Enter the directory this session should work in." }
        if unreadable || offlineMachine != nil { return locationReading }
        return locationUnverified ? "Reading…" : modelReading
    }

    private func submit() {
        guard !busy, connected else { return }
        error = validate()
        guard error.isEmpty else {
            requestRefresh()
            return
        }
        submission += 1
        let id = submission
        let draft = SessionDraft(
            machineIds: machineIds, baseCwd: path, cwd: workdir, prompt: prompt, harness: harness, permissionMode: permissionMode, model: model,
            effort: effort, sideQuest: sideQuest, repo: repo?.trimmingCharacters(in: .whitespaces), projectId: projectId,
            summarizerHarness: summarizerHarness, summarizerModel: summarizerSelected?.id ?? summarizerModel, usedModel: selected?.id ?? model
        )
        let sendsMode = !modeless
        busy = true
        closePopover()
        view.endEditing(true)
        requestRefresh()
        Task { [weak self] in
            guard let self else { return }
            let current = { [weak self] in self?.submission == id }
            do {
                if let source = continuing {
                    try await startContinue(source, draft, sendsMode: sendsMode, current: current)
                    return
                }
                var first = ""
                // Each machine is verified, then spawned, in order: one failure stops the batch before the next spawn.
                for target in draft.machineIds {
                    guard await verifyBeforeSpawn(target, draft.baseCwd, current: current), current() else { return }
                    let spawned = try await spawnOne(target, draft, sendsMode: sendsMode)
                    if first.isEmpty { first = spawned }
                }
                SpawnMemory.recordUse(harness: draft.harness, model: draft.usedModel)
                try remember(draft)
                guard current() else { return }
                exit(to: first)
            } catch {
                guard current() else { return }
                self.error = error.localizedDescription
                busy = false
                requestRefresh()
            }
        }
    }

    private func verifyBeforeSpawn(_ id: String, _ path: String, current: () -> Bool) async -> Bool {
        do {
            _ = try await hub.inspectLocation(machineId: id, path: path)
            return current()
        } catch {
            guard current() else { return false }
            unreadable = true
            busy = false
            requestRefresh()
            return false
        }
    }

    /// The model the form shows as chosen, sent by name so the session never
    /// falls to its machine's default. Empty only when the machine names its
    /// default no more precisely than "default".
    private static func shown(_ draft: SessionDraft) -> String {
        draft.usedModel == "default" ? "" : draft.usedModel
    }

    /// Written only once a spawn has gone out, so an abandoned form teaches nothing (`rememberSpawn`).
    private func remember(_ draft: SessionDraft) throws {
        hub.spawnPrefs.remember(harness: try Self.wire(draft.harness), model: Self.shown(draft),
                                permissionMode: try Self.wire(draft.permissionMode), effort: try draft.effort.map(Self.wire))
    }

    private func attached(_ target: String, _ draft: SessionDraft) -> String? {
        guard let id = draft.projectId, fleet.projects.first(where: { $0.id == id })?.placed(on: target) == true else { return nil }
        return id
    }

    private func spawnOne(_ target: String, _ draft: SessionDraft, sendsMode: Bool) async throws -> String {
        var payload = Components.Schemas.SpawnPayload(cwd: draft.cwd, instanceId: UUID().uuidString.lowercased())
        payload.harness = try Self.wire(draft.harness)
        if sendsMode { payload.permissionMode = try Self.wire(draft.permissionMode) }
        let model = Self.shown(draft)
        if !model.isEmpty { payload.model = model }
        if let effort = draft.effort { payload.effort = try Self.wire(effort) }
        if draft.sideQuest { payload.scratch = .init(worktree: false, baseCwd: draft.cwd) }
        if let repo = draft.repo { payload.bootstrap = .init(repo: repo, baseDir: draft.baseCwd) }
        payload.projectId = attached(target, draft)
        // The form's own choices stand; `explicit` only names what a harness needs named.
        return try await hub.spawn(machineId: target, payload: hub.explicit(machineId: target, payload), prompt: draft.prompt.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    /// A form value as the wire's own enum; a value the wire does not know is a fault, never guessed around.
    private static func wire<Value: RawRepresentable>(_ raw: String) throws -> Value where Value.RawValue == String {
        guard let value = Value(rawValue: raw) else { throw FormFault(message: "The hub does not know \"\(raw)\".") }
        return value
    }

    private struct FormFault: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    /// Continue in new session: the hub summarises the source with the chosen
    /// summariser and starts the new session with this form's options, as a
    /// job it owns. The form follows the job's stages and leaves for the new
    /// session exactly as a spawn does once it has started.
    private func startContinue(_ source: ContinueSource, _ draft: SessionDraft, sendsMode: Bool, current: () -> Bool) async throws {
        guard let target = draft.machineIds.first else { return }
        guard await verifyBeforeSpawn(target, draft.baseCwd, current: current), current() else { return }
        let note = draft.prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        let request = HubConnection.ContinuationRequest(
            summarizer: .init(harness: try Self.wire(draft.summarizerHarness), model: draft.summarizerModel),
            target: .init(
                harness: try Self.wire(draft.harness), model: draft.usedModel, machineId: target, cwd: draft.cwd,
                effort: try draft.effort.map(Self.wire),
                permissionMode: sendsMode ? try Self.wire(draft.permissionMode) : nil,
                scratch: draft.sideQuest ? .init(worktree: false, baseCwd: draft.cwd) : nil,
                bootstrap: draft.repo.map { .init(repo: $0, baseDir: draft.baseCwd) },
                projectId: attached(target, draft)
            ),
            note: note.isEmpty ? nil : note
        )
        let id = try await hub.startContinuation(sourceId: source.instanceId, request: request)
        // Closed while the hub was starting it: the caller sees it through.
        if current() {
            job = id
            submitted = draft
        } else {
            onDetach(id, source, draft)
        }
        SpawnMemory.recordUse(harness: draft.summarizerHarness, model: draft.summarizerModel)
        SpawnMemory.recordUse(harness: draft.harness, model: draft.usedModel)
        try remember(draft)
        requestRefresh()
    }

    /// Leave for the new session as the form starts to close, not after.
    private func exit(to instanceId: String) {
        close()
        onOpen(instanceId)
    }

    private func cancelPressed() {
        guard let id = job else {
            close()
            return
        }
        // Cancel while a continuation runs: the hub stops it, and the form closes.
        Task { [weak self] in
            guard let self else { return }
            do {
                try await hub.cancelContinuation(id: id)
                job = nil
                busy = false
                close()
            } catch {
                self.error = error.localizedDescription
                requestRefresh()
            }
        }
    }

    private func close() {
        submission += 1
        verifying?.cancel()
        UserDefaults.standard.removeObject(forKey: Self.keptPrompt)
        // Dismissed while a continuation runs: it runs on, and the caller opens its new session when it starts.
        if let id = job, let source = continuing, let draft = submitted {
            job = nil
            onDetach(id, source, draft)
        }
        (presentingViewController ?? self).dismiss(animated: true)
    }

    // MARK: Keys

    override public var keyCommands: [UIKeyCommand]? {
        let escape = UIKeyCommand(input: UIKeyCommand.inputEscape, modifierFlags: [], action: #selector(escapePressed))
        escape.wantsPriorityOverSystemBehavior = true
        let go = UIKeyCommand(title: startLabel, action: #selector(submitKey), input: "\r", modifierFlags: .command)
        go.wantsPriorityOverSystemBehavior = true
        return [escape, go]
    }

    override public var canBecomeFirstResponder: Bool { true }

    @objc private func escapePressed() { close() }
    @objc private func submitKey() { submit() }

    override public func accessibilityPerformEscape() -> Bool {
        close()
        return true
    }

    // MARK: The sheet's drag

    /// From its head the sheet follows the finger down 1:1; let go past 30%
    /// of its height, or flicked faster than 0.3pt/ms, it leaves.
    @objc private func dragged(_ pan: UIPanGestureRecognizer) {
        let height = max(1, card.bounds.height)
        let dy = pan.translation(in: view).y
        switch pan.state {
        case .began:
            dragging = true
            view.endEditing(true)
        case .changed:
            guard dragging else { return }
            card.transform = CGAffineTransform(translationX: 0, y: dy >= 0 ? dy : -min(-dy * 0.35, height * 0.25))
        case .ended, .cancelled, .failed:
            guard dragging else { return }
            dragging = false
            let velocity = pan.velocity(in: view).y / 1000
            if pan.state == .ended, card.transform.ty > height * 0.3 || velocity > 0.3 {
                close()
            } else {
                UIViewPropertyAnimator(duration: Motion.durSettle, timingParameters: UISpringTimingParameters(duration: Motion.durSettle, bounce: 0)).run {
                    self.card.transform = .identity
                }
            }
        default:
            break
        }
    }

    // MARK: Presentation

    public func presentationController(forPresented presented: UIViewController, presenting: UIViewController?, source _: UIViewController) -> UIPresentationController? {
        ScrimPresentation(presentedViewController: presented, presenting: presenting) { [weak self] in self?.close() }
    }

    public func animationController(forPresented _: UIViewController, presenting _: UIViewController, source _: UIViewController) -> (any UIViewControllerAnimatedTransitioning)? {
        Passage(presenting: true)
    }

    public func animationController(forDismissed _: UIViewController) -> (any UIViewControllerAnimatedTransitioning)? {
        Passage(presenting: false)
    }

    /// The card in the middle rises 6pt as it fades in over `durPanel`
    /// (`ns-panel`) and leaves 6pt down at the press scale over `durExit`.
    /// The sheet slides its whole height in on the drawer curve and leaves
    /// over `durExit` on the out curve. With less motion both only fade.
    private final class Passage: NSObject, UIViewControllerAnimatedTransitioning {
        let presenting: Bool

        init(presenting: Bool) {
            self.presenting = presenting
        }

        /// The phone's sheet leaves as it came: the same duration, the same curve. The card in the middle leaves over `durExit`.
        func transitionDuration(using context: (any UIViewControllerContextTransitioning)?) -> TimeInterval {
            let sheet = (context?.viewController(forKey: .from) as? NewSessionViewController)?.compact == true
            return presenting || sheet ? Motion.durPanel : Motion.durExit
        }

        func animateTransition(using context: any UIViewControllerContextTransitioning) {
            guard let form = context.viewController(forKey: presenting ? .to : .from) as? NewSessionViewController else {
                context.completeTransition(true)
                return
            }
            let presenting = presenting
            if presenting {
                form.view.frame = context.finalFrame(for: form)
                context.containerView.addSubview(form.view)
                form.view.layoutIfNeeded()
            }
            let card = form.card
            let still = UIAccessibility.isReduceMotionEnabled
            let sheet = form.compact
            let away: CGAffineTransform = if still {
                .identity
            } else if sheet {
                CGAffineTransform(translationX: 0, y: card.bounds.height + Space.space2)
            } else if presenting {
                CGAffineTransform(translationX: 0, y: 6)
            } else {
                CGAffineTransform(translationX: 0, y: 6).scaledBy(x: Motion.pressScale, y: Motion.pressScale)
            }
            let fades = still || !sheet
            if presenting {
                card.transform = away
                if fades { card.alpha = 0 }
            }
            let curve = sheet && !still ? Motion.easeDrawer : Motion.easeOut
            let animator = curve.animator(transitionDuration(using: context)) {
                card.transform = presenting ? .identity : away
                if fades { card.alpha = presenting ? 1 : 0 }
            }
            animator.addCompletion { _ in context.completeTransition(!context.transitionWasCancelled) }
            animator.startAnimation()
        }
    }
}

/// The form's full-screen ground: a touch outside the card falls through to
/// the scrim under it, which closes the form.
private final class Ground: UIView {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        return hit === self ? nil : hit
    }
}

/// Chips that wrap (`.chips`): `gap` apart along a row, rows `rowGap` apart.
final class NsFlow: UIView {
    var gap = 6.0
    var rowGap = 6.0
    private var items: [UIView] = []
    private var tall: NSLayoutConstraint!

    override init(frame: CGRect) {
        super.init(frame: frame)
        tall = heightAnchor.constraint(equalToConstant: 30)
        tall.priority = .defaultHigh
        tall.isActive = true
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("NsFlow is built in code") }

    func set(_ views: [UIView]) {
        items.forEach { $0.removeFromSuperview() }
        items = views
        for view in views {
            view.translatesAutoresizingMaskIntoConstraints = true
            addSubview(view)
        }
        setNeedsLayout()
    }

    /// The item that takes what its line has spare, up to `stretchBy` more (`flex: auto`).
    weak var stretch: UIView?
    var stretchBy = 0.0
    /// The item held at its line's end (`margin-left: auto`).
    weak var end: UIView?

    override func layoutSubviews() {
        super.layoutSubviews()
        // Break into lines by each item's own width, then place each line.
        var lines: [[(view: UIView, size: CGSize)]] = [[]]
        var x = 0.0
        for item in items where !item.isHidden {
            // A view sized by its constraints answers with them; one that only has an intrinsic size answers with that.
            var size = item.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
            let own = item.intrinsicContentSize
            if own.width > 0 { size.width = max(size.width, own.width) }
            if own.height > 0 { size.height = max(size.height, own.height) }
            size.width = min(size.width, bounds.width)
            if x > 0, x + size.width > bounds.width {
                lines.append([])
                x = 0
            }
            lines[lines.count - 1].append((item, size))
            x += size.width + gap
        }
        var y = 0.0
        for line in lines where !line.isEmpty {
            let row = line.map(\.size.height).max() ?? 0
            let used = line.reduce(0) { $0 + $1.size.width } + gap * Double(line.count - 1)
            var spare = max(0, bounds.width - used)
            var at = 0.0
            for (view, size) in line {
                var width = size.width
                if view === stretch {
                    let more = min(spare, stretchBy)
                    width += more
                    spare -= more
                }
                if view === end { at += spare }
                view.frame = CGRect(x: at, y: y + (row - size.height) / 2, width: width, height: size.height)
                at += width + gap
            }
            y += row + rowGap
        }
        let height = max(0, y - rowGap)
        if abs(tall.constant - height) > 0.5 {
            tall.constant = height
            superview?.setNeedsLayout()
        }
    }
}

private extension UIViewPropertyAnimator {
    func run(_ animations: @escaping () -> Void) {
        addAnimations(animations)
        startAnimation()
    }
}
