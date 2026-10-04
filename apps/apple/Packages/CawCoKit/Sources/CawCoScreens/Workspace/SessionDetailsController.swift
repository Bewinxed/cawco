import CawCoAPI
public import CawCoCore
import CawCoDesign
public import UIKit

/// What a session answered when asked, kept for as long as the app runs
/// (client.svelte.ts `refreshContext`, `loadMcpServers`): a session that can
/// no longer answer keeps its last reading rather than dropping to nothing.
@MainActor
@Observable
final class SessionReadings {
    struct Context {
        var totalTokens: Double
        var maxTokens: Double
        var readAt: Date
    }

    static let shared = SessionReadings()

    private(set) var context: [String: Context] = [:]
    private(set) var contextPending: Set<String> = []
    private(set) var contextError: [String: String] = [:]
    private(set) var mcp: [String: Int] = [:]
    @ObservationIgnored private var mcpAsked: Set<String> = []

    /// How full the session's context window is, straight from its SDK.
    func refreshContext(_ hub: HubConnection, _ id: String, _ machineId: String) {
        guard !contextPending.contains(id) else { return }
        contextPending.insert(id)
        Task {
            do {
                let usage = try await hub.contextUsage(instanceId: id, machineId: machineId)
                context[id] = Context(totalTokens: usage.totalTokens, maxTokens: usage.maxTokens, readAt: Date())
                contextError[id] = nil
            } catch {
                // The last reading stays; the reason is kept beside it.
                contextError[id] = error.localizedDescription
            }
            contextPending.remove(id)
        }
    }

    /// Which MCP servers the session runs. A failed ask reads as none, and is not asked again.
    func loadMcp(_ hub: HubConnection, _ id: String, _ machineId: String) {
        guard !mcpAsked.contains(id) else { return }
        mcpAsked.insert(id)
        Task {
            mcp[id] = (try? await hub.mcpServerStatus(instanceId: id, machineId: machineId))?.count ?? 0
        }
    }
}

/// Session details (workspace/SessionDetails.svelte): who the session is,
/// where it runs, what it runs on and how full it is. Its model, effort and
/// permission mode change here while it runs; each change says where it was
/// made that it is applying, that it landed, or why it was refused. The host
/// (the tab strip) shows it as a popover or a sheet, and moves one card
/// between tabs with `show(sessionId:title:link:dir:)`.
public final class SessionDetailsController: ObservedViewController {
    /// The card's width on a pointer (`min(416px, 100vw - 24px)`).
    public static let width = 416.0

    private let hub: HubConnection
    private var sessionId: String
    private var titleText: String
    private var link: URL?
    private let readings = SessionReadings.shared

    /// The card asks to be closed (its Continue button leaves for the form).
    public var onClose: () -> Void = {}
    /// "Continue in new session…": the id goes to `PaneHost.continueHandler`.
    public var onContinue: (String) -> Void = { _ in }
    /// The MCP count leads to the fleet's MCP configuration.
    public var onOpenMcp: () -> Void = {}
    /// The content's scroll view, for a sheet that hands a pull down to itself.
    public let scroller = UIScrollView()

    // MARK: State (per session; cleared when the card moves to another)

    private var asked: String?
    private var relaunching = false
    private var relaunchFailure: String?
    private var permissionBeforeRelaunch: String?
    private enum Slot: CaseIterable { case model, effort, permission }
    private var done: [Slot: Bool] = [:]
    private var wasPending: [Slot: Bool] = [:]
    private var holds: [Slot: Task<Void, Never>] = [:]
    private var doneFor: String
    private var clock: Timer?

    // MARK: Views

    private let phone: Bool
    private let titleWrap = KitLabel(TypeScale.typeTitle.with(weight: .medium, leading: TypeScale.leadingBody), ink: Palette.inkStrong, lines: 3)
    private let harnessBox = UIView()
    private var harnessShown: String?
    private let meta = NsFlow()
    private let status = SessionStatusView(.idle)
    private let hostDot = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let host = MorphLabel(TypeScale.typeMeta.with(leading: TypeScale.leadingBody), ink: Palette.inkMuted)
    private let cwdDot = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let cwdButton = UIControl()
    private let cwdLabel = MorphLabel(TypeScale.typeLabel.with(weight: .regular, leading: TypeScale.leadingBody, family: FontFamily.fontMono), ink: Palette.inkMuted)
    private let configuration = UIStackView()
    private let modelChip: NsChip
    private let chips: ToolChipsView
    private let feedback = CrossView()
    private var feedbackShown = ""
    private let stats = NsFlow()
    private let contextUnit = UIStackView()
    private let contextLabel = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let contextBar = LimitBar(height: 4)
    private let contextFigure = MorphLabel(TypeScale.typeMeta)
    private let contextNote = KitLabel(TypeScale.typeMeta, ink: Palette.inkStrong, lines: 0)
    private let limitUnit = UIStackView()
    private let limitLabel = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let limitBar = LimitBar(height: 4)
    private let limitFigure = KitLabel(TypeScale.typeMeta, ink: Palette.inkStrong)
    private let mcpButton = UIControl()
    private let mcpFigure = MorphLabel(TypeScale.typeMeta)
    private let costFigure = MorphLabel(TypeScale.typeMeta)
    private var continueButton: NsButton!
    private var bodyFits: NSLayoutConstraint!
    private weak var modelPopover: UIViewController?

    public init(hub: HubConnection, sessionId: String, title: String, link: URL?) {
        self.hub = hub
        self.sessionId = sessionId
        titleText = title
        self.link = link
        doneFor = sessionId
        // A phone's row is narrow: the three chips are 44pt tall, 6pt in, without chevrons.
        phone = UIDevice.current.userInterfaceIdiom == .phone
        modelChip = NsChip(height: phone ? 44 : 28, inset: phone ? 6 : 8, gap: 4, chevron: !phone)
        chips = ToolChipsView(height: phone ? 44 : 28, inset: phone ? 6 : 8, chevrons: !phone)
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("SessionDetailsController is built in code") }

    /// Moves the card to another session: what belonged to the last one is
    /// cleared, and the meta line and the stats are nudged in from the side the
    /// card moved toward (`dir`: 1 rightward, -1 leftward).
    public func show(sessionId next: String, title: String, link: URL?, dir: Int) {
        guard next != sessionId else {
            titleText = title
            self.link = link
            requestRefresh()
            return
        }
        sessionId = next
        titleText = title
        self.link = link
        relaunching = false
        relaunchFailure = nil
        permissionBeforeRelaunch = nil
        modelPopover?.dismiss(animated: true)
        requestRefresh()
        guard isViewLoaded, !UIAccessibility.isReduceMotionEnabled else { return }
        for view in [meta, stats] as [UIView] {
            view.transform = CGAffineTransform(translationX: 8 * Double(dir), y: 0)
            view.alpha = 0.6
            Motion.easeOut.animator(Motion.durMorph) {
                view.transform = .identity
                view.alpha = 1
            }.startAnimation()
        }
        harnessDir = dir
    }

    private var harnessDir = 1

    // MARK: Derived (SessionDetails.svelte)

    private var fleet: FleetStore { hub.fleet }
    private var row: InstanceRow? { fleet.byId[sessionId] }
    private var facts: Components.Schemas.TranscriptFacts? { hub.sessions.transcripts[sessionId]?.facts }
    private var machineId: String? { row?.machineId }
    private var machine: MachineRow? { machineId.flatMap { id in fleet.machines.first { $0.machineId == id } } }
    private var harness: String? { row?.harness ?? facts?.harness }
    private var report: Components.Schemas.HarnessReport? { harness.flatMap { kind in machine?.harnesses?.first { $0.harness.rawValue == kind } } }
    private var cwd: String { row?.cwd ?? "" }
    private var model: String? { (facts?.model ?? row?.model).flatMap { $0.isEmpty ? nil : $0 } }
    private var effort: String? { row?.effort?.rawValue }
    private var permissionMode: String? { facts?.permissionMode?.rawValue ?? row?.permissionMode }

    private var editable: Bool {
        hub.state == .connected && machineId != nil && row?.status == .running
    }

    /// The offered row that describes the model: its name and the effort scale it runs at (`describingRow`).
    private var modelInfo: Components.Schemas.ModelInfo? {
        guard let model, let harness else { return nil }
        let list = ModelCatalog.models(fleet, harness: harness, machineIds: [])
        for id in [model, model.replacing(/\[1m\]$/.ignoresCase(), with: "")] {
            let covers = { (row: Components.Schemas.ModelInfo) in row.value == id || row.resolvedModel == id }
            if let found = list.first(where: { $0.value != "default" && covers($0) }) ?? list.first(where: covers) { return found }
        }
        return nil
    }

    private var efforts: [String] {
        report?.capabilities.effort == true ? (modelInfo?.supportedEffortLevels ?? []).map(\.rawValue) : []
    }

    /// Why the effort chip shows no level, when it shows none.
    private var effortOff: (label: String, reason: String)? {
        if let harness, report?.capabilities.effort == false { return ModelTools.effortNotExposed(harness) }
        if effort == "none" {
            return ("No effort", efforts.isEmpty ? "This model has no effort setting" : "Effort is off for this session")
        }
        if effort == nil {
            return editable ? ("Effort…", "Reading the session's effort") : ("Not read", "Effort is read while the session runs")
        }
        return nil
    }

    private var modes: [String] {
        let honoured = report?.capabilities.permissionModes.map(\.rawValue) ?? []
        return PermissionLook.modes.filter(honoured.contains)
    }

    private var shownPermission: String? { relaunching ? permissionBeforeRelaunch : permissionMode }

    /// This session's provider limit: the window that stops its provider first.
    private var providerLimit: Usage.Row? {
        let now = Date().timeIntervalSince1970 * 1000
        let cells = Usage.strip(claude: fleet.claudeLimits, go: fleet.openCodeGoLimits, read: fleet.limitsRead, now: now).cells
        if harness == "claude" { return Usage.firstToStop(cells.first { $0.id == "Claude" }?.rows ?? []) }
        if harness == "opencode", model?.hasPrefix("opencode-go/") == true {
            return Usage.firstToStop(cells.first { $0.id == "opencode" }?.rows ?? [])
        }
        return nil
    }

    private var face: SessionStatusView.Face {
        guard let row else { return .stored }
        if row.isFailed { return .failed }
        if row.isStale { return .unreachable }
        if row.status == .sleeping { return .sleeping }
        if row.status == .stopped { return .stopped }
        if hub.needs.blocked(sessionId) || fleet.activityPulse(sessionId)?.activity == .blocked { return .needsYou }
        if fleet.activityPulse(sessionId)?.activity == .working { return .working }
        return .idle
    }

    private static func tokens(_ value: Double) -> String {
        if value >= 1_000_000 {
            let millions = (value / 1_000_000 * 10).rounded() / 10
            return (millions == millions.rounded() ? String(Int(millions)) : String(millions)) + "M"
        }
        return value >= 1000 ? "\(Int((value / 1000).rounded()))k" : "\(Int(value))"
    }

    // MARK: Commands

    private static let kinds: [Slot: Components.Schemas.CommandKind] = [.model: .setModel, .effort: .setEffort, .permission: .setPermissionMode]

    private func pending(_ slot: Slot) -> Bool {
        if slot == .permission, relaunching { return true }
        guard let kind = Self.kinds[slot], let record = hub.ledger.latest(kind, on: sessionId) else { return false }
        return record.stage == .submitted || record.stage == .accepted
    }

    private func failure(_ slot: Slot) -> String? {
        if slot == .permission, let relaunchFailure { return relaunchFailure }
        guard let kind = Self.kinds[slot], let record = hub.ledger.latest(kind, on: sessionId), record.stage == .failed else { return nil }
        return record.reason.flatMap { $0.isEmpty ? nil : $0 } ?? "Change refused. Try again."
    }

    private func changeModel(_ next: String) {
        guard editable, let machineId, !pending(.model), next != model else { return }
        let id = sessionId
        Task { [hub] in _ = try? await hub.setModel(instanceId: id, machineId: machineId, model: next) }
        requestRefresh()
    }

    private func changeEffort(_ next: String) {
        guard editable, let machineId, !pending(.effort), next != effort, let level = Components.Schemas.SpawnPayload.EffortPayload(rawValue: next) else { return }
        let id = sessionId
        Task { [hub] in _ = try? await hub.setEffort(instanceId: id, machineId: machineId, effort: level) }
        requestRefresh()
    }

    private func changePermission(_ next: String) {
        guard editable, let machineId, !pending(.permission), next != permissionMode,
              let mode = Components.Schemas.SpawnPayload.PermissionModePayload(rawValue: next) else { return }
        relaunchFailure = nil
        let id = sessionId
        guard mode == .bypassPermissions else {
            Task { [hub] in _ = try? await hub.setPermissionMode(instanceId: id, machineId: machineId, mode: mode) }
            requestRefresh()
            return
        }
        // Full access is a launch-time decision for the harness: the session is relaunched on it.
        guard let row, let sessionKey = row.sessionId else {
            relaunchFailure = "no session key on record for \(id); cannot resume"
            requestRefresh()
            return
        }
        permissionBeforeRelaunch = permissionMode
        relaunching = true
        requestRefresh()
        // Only the mode changes: the model it was answering on and the level it was thinking at carry over.
        var payload = Components.Schemas.SpawnPayload(cwd: row.cwd, instanceId: id)
        payload.harness = harness.flatMap(Components.Schemas.SpawnPayload.HarnessPayload.init(rawValue:))
        payload.permissionMode = mode
        payload.model = model
        payload.effort = effort.flatMap(Components.Schemas.SpawnPayload.EffortPayload.init(rawValue:))
        payload.scratch = row.kind == "scratch" ? .init() : nil
        Task { [weak self, hub] in
            do {
                try await hub.relaunch(machineId: machineId, payload: hub.explicit(machineId: machineId, payload), sessionKey: sessionKey)
            } catch {
                if self?.sessionId == id { self?.relaunchFailure = error.localizedDescription }
            }
            if self?.sessionId == id { self?.relaunching = false }
            self?.requestRefresh()
        }
    }

    // MARK: Layout

    override public func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRaised
        let pad = Space.space5

        // Identity: the title, the link, the harness's mark level with the first line.
        titleWrap.accessibilityTraits = .header
        titleWrap.lineBreakMode = .byTruncatingTail
        titleWrap.wrap = .pretty
        let copyLink = KitGhostButton(.link, label: "Copy link")
        copyLink.addAction(UIAction { [weak self] _ in
            guard let self, let link else { return }
            UIPasteboard.general.string = link.absoluteString
            Toast.success("Link copied", in: view)
        }, for: .primaryActionTriggered)
        harnessBox.translatesAutoresizingMaskIntoConstraints = false
        // `.title` takes the row's room; inside it the title is as wide as its
        // words and the link stands a step after them, not at the row's end.
        titleWrap.setContentHuggingPriority(.required, for: .horizontal)
        titleWrap.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let room = UIView()
        room.setContentHuggingPriority(.init(1), for: .horizontal)
        let identity = UIStackView(arrangedSubviews: [titleWrap, copyLink, room, harnessBox])
        identity.alignment = .top
        identity.spacing = Space.space1
        identity.setCustomSpacing(0, after: copyLink)
        identity.setCustomSpacing(Space.space3, after: room)
        identity.isLayoutMarginsRelativeArrangement = true
        identity.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space4, leading: pad, bottom: Space.space1, trailing: pad)

        // Meta: the status, the host, the working directory; a part that does not fit moves to the next line.
        for dot in [hostDot, cwdDot] {
            dot.text = "·"
            dot.isAccessibilityElement = false
        }
        cwdLabel.translatesAutoresizingMaskIntoConstraints = false
        cwdButton.addSubview(cwdLabel)
        cwdButton.isAccessibilityElement = true
        cwdButton.accessibilityTraits = .button
        cwdButton.addAction(UIAction { [weak self] _ in
            guard let self, !cwd.isEmpty else { return }
            UIPasteboard.general.string = cwd
            Toast.success("Working directory copied", in: view)
        }, for: .touchUpInside)
        NSLayoutConstraint.activate([
            cwdLabel.topAnchor.constraint(equalTo: cwdButton.topAnchor),
            cwdLabel.bottomAnchor.constraint(equalTo: cwdButton.bottomAnchor),
            cwdLabel.leadingAnchor.constraint(equalTo: cwdButton.leadingAnchor),
            cwdLabel.trailingAnchor.constraint(equalTo: cwdButton.trailingAnchor),
        ])
        meta.gap = Space.space2
        meta.rowGap = 0
        meta.set([status, hostDot, host, cwdDot, cwdButton])
        let metaBox = Self.inset(meta, NSDirectionalEdgeInsets(top: 0, leading: pad, bottom: Space.space3, trailing: pad))

        // Configuration: model, effort and permission on one line, then the line a change speaks on.
        modelChip.accessibilityLabel = "Model"
        modelChip.addAction(UIAction { [weak self] _ in self?.openModels() }, for: .touchUpInside)
        modelChip.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        chips.presenter = self
        chips.closeOnCommit = true
        let settings = UIStackView(arrangedSubviews: [modelChip, chips, UIView()])
        settings.spacing = 4
        settings.alignment = .center
        // One line is always held for what a change says, so its lines arriving or leaving never resize the card.
        let line = TypeScale.typeBody.with(leading: TypeScale.leadingBody).lineHeight
        feedback.heightAnchor.constraint(greaterThanOrEqualToConstant: Space.space2 + line).isActive = true
        configuration.axis = .vertical
        configuration.addArrangedSubview(settings)
        configuration.addArrangedSubview(feedback)
        configuration.isLayoutMarginsRelativeArrangement = true
        configuration.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space3, leading: pad, bottom: Space.space3, trailing: pad)
        let configurationBox = UIStackView(arrangedSubviews: [Self.hairline(), configuration])
        configurationBox.axis = .vertical
        self.configurationBox = configurationBox

        let body = UIStackView(arrangedSubviews: [identity, metaBox, configurationBox])
        body.axis = .vertical
        body.translatesAutoresizingMaskIntoConstraints = false
        scroller.translatesAutoresizingMaskIntoConstraints = false
        scroller.alwaysBounceVertical = false
        scroller.addSubview(body)

        // Stats: context, the provider's limit, MCP, cost; each one unit that wraps whole.
        contextLabel.text = "Context"
        contextFigure.tabular = true
        mcpFigure.tabular = true
        costFigure.tabular = true
        limitFigure.tabular = true
        // The context bar takes the unit's spare room, 48 to 96pt; its words keep their own width.
        let narrow = contextBar.widthAnchor.constraint(equalToConstant: 48)
        narrow.priority = .defaultLow
        NSLayoutConstraint.activate([
            narrow,
            contextBar.widthAnchor.constraint(greaterThanOrEqualToConstant: 48),
            contextBar.widthAnchor.constraint(lessThanOrEqualToConstant: 96),
        ])
        for label in [contextLabel, limitLabel, limitFigure] as [UIView] {
            label.setContentHuggingPriority(.required, for: .horizontal)
            label.setContentCompressionResistancePriority(.required, for: .horizontal)
        }
        limitBar.widthAnchor.constraint(equalToConstant: 64).isActive = true
        for (unit, parts) in [(contextUnit, [contextLabel, contextBar, contextFigure, contextNote] as [UIView]), (limitUnit, [limitLabel, limitBar, limitFigure])] {
            unit.spacing = Space.space2
            unit.alignment = .center
            parts.forEach(unit.addArrangedSubview)
        }
        mcpFigure.translatesAutoresizingMaskIntoConstraints = false
        mcpButton.addSubview(mcpFigure)
        mcpButton.isAccessibilityElement = true
        mcpButton.accessibilityTraits = .link
        mcpButton.addAction(UIAction { [weak self] _ in self?.onOpenMcp() }, for: .touchUpInside)
        NSLayoutConstraint.activate([
            mcpFigure.topAnchor.constraint(equalTo: mcpButton.topAnchor),
            mcpFigure.bottomAnchor.constraint(equalTo: mcpButton.bottomAnchor),
            mcpFigure.leadingAnchor.constraint(equalTo: mcpButton.leadingAnchor),
            mcpFigure.trailingAnchor.constraint(equalTo: mcpButton.trailingAnchor),
        ])
        stats.gap = Space.space4
        stats.rowGap = Space.space2
        stats.set([contextUnit, limitUnit, mcpButton, costFigure])
        // Context takes whatever its line has spare, its bar first (48 to 96pt).
        stats.stretch = contextUnit
        stats.stretchBy = 48
        stats.end = costFigure
        let statsBox = Self.inset(stats, NSDirectionalEdgeInsets(top: Space.space3, leading: pad, bottom: Space.space3, trailing: pad))
        statsBox.backgroundColor = Palette.surfaceRecess

        // The footer: the modal's action row.
        continueButton = NsButton("Continue in new session…", primary: true, size: .xs, height: phone ? 44 : nil) { [weak self] in
            guard let self else { return }
            let id = sessionId
            onClose()
            onContinue(id)
        }
        let footer = UIStackView(arrangedSubviews: phone ? [continueButton] : [UIView(), continueButton])
        footer.isLayoutMarginsRelativeArrangement = true
        footer.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space4, leading: pad, bottom: Space.space4, trailing: pad)

        let column = UIStackView(arrangedSubviews: [scroller, Self.hairline(), statsBox, Self.hairline(), footer])
        column.axis = .vertical
        column.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(column)
        bodyFits = scroller.heightAnchor.constraint(equalTo: body.heightAnchor)
        bodyFits.priority = .defaultHigh - 1
        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: view.topAnchor),
            column.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            column.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            column.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            body.topAnchor.constraint(equalTo: scroller.contentLayoutGuide.topAnchor),
            body.bottomAnchor.constraint(equalTo: scroller.contentLayoutGuide.bottomAnchor),
            body.leadingAnchor.constraint(equalTo: scroller.frameLayoutGuide.leadingAnchor),
            body.trailingAnchor.constraint(equalTo: scroller.frameLayoutGuide.trailingAnchor),
            bodyFits,
            harnessBox.widthAnchor.constraint(equalToConstant: 16),
            harnessBox.heightAnchor.constraint(equalToConstant: 28),
        ])
        self.column = column
    }

    private var column: UIStackView!
    private var configurationBox: UIView!

    private static func hairline() -> UIView {
        let line = UIView()
        line.backgroundColor = Palette.borderHairline
        line.heightAnchor.constraint(equalToConstant: 1).isActive = true
        return line
    }

    private static func inset(_ content: UIView, _ margins: NSDirectionalEdgeInsets) -> UIView {
        let box = UIView()
        content.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(content)
        NSLayoutConstraint.activate([
            content.topAnchor.constraint(equalTo: box.topAnchor, constant: margins.top),
            content.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -margins.bottom),
            content.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: margins.leading),
            content.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -margins.trailing),
        ])
        return box
    }

    override public func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        // The provider's limit is read against a minute clock.
        clock = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.requestRefresh() }
        }
    }

    override public func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        clock?.invalidate()
        holds.values.forEach { $0.cancel() }
    }

    override public func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let width = view.bounds.width > 0 ? view.bounds.width : Self.width
        let height = column.systemLayoutSizeFitting(CGSize(width: width, height: UIView.layoutFittingCompressedSize.height),
                                                    withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height
        let size = CGSize(width: Self.width, height: height)
        if abs(preferredContentSize.height - size.height) > 0.5 { preferredContentSize = size }
    }

    // MARK: Painting

    override public func refreshContent() {
        ask()
        settle()
        paint()
    }

    /// The reading only arrives when something asks for it: opening the
    /// details asks, once per session shown, as soon as the session can answer.
    private func ask() {
        guard editable, let machineId, asked != sessionId else { return }
        asked = sessionId
        readings.refreshContext(hub, sessionId, machineId)
        readings.loadMcp(hub, sessionId, machineId)
        if let harness {
            Task { [weak self, hub] in
                if await ModelCatalog.ensure(hub, harness: harness) { self?.requestRefresh() }
            }
        }
    }

    /// A change that lands says so where it was made: a check on its line for
    /// the hold. Only a change seen going from pending to settled while the
    /// card is on this session counts; opening the card shows no old news.
    private func settle() {
        let moved = sessionId != doneFor
        for slot in Slot.allCases {
            let now = pending(slot)
            let landed = !moved && wasPending[slot] == true && !now && failure(slot) == nil
            if landed || moved || now {
                holds[slot]?.cancel()
                done[slot] = landed
            }
            if landed {
                holds[slot] = Task { [weak self] in
                    try? await Task.sleep(for: .seconds(Motion.durHold))
                    guard !Task.isCancelled else { return }
                    self?.done[slot] = false
                    self?.requestRefresh()
                }
            }
            wasPending[slot] = now
        }
        doneFor = sessionId
    }

    private func paint() {
        guard isViewLoaded else { return }
        if titleWrap.text != titleText {
            // A title wraps, so it changes as a whole: the old one out as the new one comes in, over `durMorph`.
            if view.window != nil, !UIAccessibility.isReduceMotionEnabled, !(titleWrap.text ?? "").isEmpty {
                UIView.transition(with: titleWrap, duration: Motion.durMorph, options: [.transitionCrossDissolve, .allowUserInteraction]) {
                    self.titleWrap.text = self.titleText
                }
            } else {
                titleWrap.text = titleText
            }
        }
        if harnessShown != harness {
            harnessShown = harness
            harnessBox.subviews.forEach { $0.removeFromSuperview() }
            harnessBox.isHidden = harness == nil
            if let harness {
                let mark = BrandLogo.harnessView(harness)
                harnessBox.addSubview(mark)
                NSLayoutConstraint.activate([
                    mark.centerXAnchor.constraint(equalTo: harnessBox.centerXAnchor),
                    mark.centerYAnchor.constraint(equalTo: harnessBox.centerYAnchor),
                ])
                harnessBox.isAccessibilityElement = true
                harnessBox.accessibilityTraits = .image
                harnessBox.accessibilityLabel = ModelCatalog.harnessName(harness)
                // The mark arrives from the side the card moved toward.
                if view.window != nil, !UIAccessibility.isReduceMotionEnabled {
                    mark.alpha = 0
                    mark.transform = CGAffineTransform(translationX: 8 * Double(harnessDir), y: 0)
                    Motion.easeOut.animator(Motion.durMorph) {
                        mark.alpha = 1
                        mark.transform = .identity
                    }.startAnimation()
                }
            }
        }

        status.configure(face)
        let hostName = machine?.hostname ?? machineId ?? ""
        hostDot.isHidden = hostName.isEmpty
        host.isHidden = hostName.isEmpty
        host.text = hostName
        cwdDot.isHidden = cwd.isEmpty
        cwdButton.isHidden = cwd.isEmpty
        cwdLabel.text = SessionIdentity.shortPath(cwd)
        cwdButton.accessibilityLabel = "Copy working directory \(cwd)"
        meta.setNeedsLayout()

        configurationBox.isHidden = harness == nil
        let named = model.map { ModelCatalog.modelName($0, displayName: modelInfo?.displayName).name } ?? "Model not reported"
        if let mark = BrandLogo.provider(ModelCatalog.providerOf(model ?? "")) {
            modelChip.show(nsSized(mark.image, 15, template: false), label: named)
        } else {
            modelChip.show(nsSized(Glyph.cpu.image, 15, template: true), tint: Palette.inkMuted, label: named)
        }
        modelChip.plain = !editable
        modelChip.isUserInteractionEnabled = editable
        modelChip.accessibilityValue = named
        chips.readonly = !editable
        let lockPermission = !editable || pending(.permission)
        chips.show(ModelTools(
            efforts: efforts,
            effort: effort.flatMap { $0 == "none" ? nil : $0 },
            effortOff: effortOff,
            modes: modes.map { ($0, lockPermission) },
            permission: shownPermission,
            onEffort: { [weak self] level in self?.changeEffort(level) },
            onPermission: { [weak self] mode in self?.changePermission(mode) }
        ))
        paintFeedback()

        // Stats.
        let reading = readings.context[sessionId]
        let percent = reading.flatMap { $0.maxTokens > 0 ? min(100, ($0.totalTokens / $0.maxTokens * 100).rounded()) : nil }
        if let reading, let percent {
            contextLabel.isHidden = false
            contextBar.isHidden = false
            contextFigure.isHidden = false
            contextNote.isHidden = true
            contextBar.configure(used: percent, elapsed: nil, tone: UsageCell.tone(Usage.fill(percent)), reached: false,
                                 paint: Palette.surfaceRecess, label: "Context")
            contextFigure.text = "\(Int(percent))% · \(Self.tokens(reading.totalTokens))/\(Self.tokens(reading.maxTokens))"
            // When a session that can no longer answer was last read.
            contextBar.accessibilityHint = editable ? nil : "Read at \(reading.readAt.formatted(date: .omitted, time: .shortened))"
        } else {
            contextLabel.isHidden = true
            contextBar.isHidden = true
            contextFigure.isHidden = true
            contextNote.isHidden = false
            if readings.contextPending.contains(sessionId) {
                contextNote.text = "Reading…"
            } else if let error = readings.contextError[sessionId] {
                // Custody: the agent restarted under a running turn and holds the session until that turn hands it back.
                contextNote.text = error.contains("(custody)") ? "Unavailable until this turn ends" : "Couldn't read: \(error)"
            } else {
                contextNote.text = "Context not reported"
            }
        }
        if let limit = providerLimit {
            limitUnit.isHidden = false
            limitLabel.text = limit.label
            limitBar.configure(used: limit.meter.used, elapsed: limit.meter.elapsed, tone: UsageCell.tone(limit.meter.state),
                               reached: limit.meter.state == .reached, paint: Palette.surfaceRecess, label: limit.label)
            limitFigure.text = "\(Int(limit.meter.used.rounded()))%"
        } else {
            limitUnit.isHidden = true
        }
        if let count = readings.mcp[sessionId] {
            mcpButton.isHidden = false
            mcpFigure.text = "\(count) MCP"
            mcpButton.accessibilityLabel = "\(count) MCP servers"
        } else {
            mcpButton.isHidden = true
        }
        if let cost = facts?.totalCost {
            costFigure.isHidden = false
            costFigure.text = String(format: "$%.2f", cost)
        } else {
            costFigure.isHidden = true
        }
        stats.setNeedsLayout()
        view.setNeedsLayout()
    }

    /// One line per field, whatever it is saying; the lines cross-fade in place.
    private func paintFeedback() {
        var text = ""
        var ink = Palette.inkMuted
        var check = false
        for slot in [Slot.model, .effort, .permission] where text.isEmpty {
            if let failed = failure(slot) {
                text = failed
                ink = Palette.statusFailInk
            } else if pending(slot) {
                text = "Applying change…"
            } else if done[slot] == true {
                text = [.model: "Model changed", .effort: "Effort changed", .permission: "Permission changed"][slot] ?? ""
                check = true
            }
        }
        if text.isEmpty, !editable { text = "Controls unlock while the session is running." }
        let key = "\(text)|\(check)"
        guard key != feedbackShown else { return }
        feedbackShown = key
        let label = KitLabel(TypeScale.typeBody.with(leading: TypeScale.leadingBody), ink: ink, lines: 0)
        label.text = text
        label.wrap = .pretty
        var parts: [UIView] = [label]
        if check { parts.insert(GlyphView(.answer, size: 16, tint: Palette.statusDoneGlyph), at: 0) }
        let row = UIStackView(arrangedSubviews: parts)
        row.spacing = Space.space1
        row.alignment = .center
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space2, leading: 0, bottom: 0, trailing: 0)
        if ink == Palette.statusFailInk { UIAccessibility.post(notification: .announcement, argument: text) }
        feedback.show(row)
    }

    // MARK: Models

    private func openModels() {
        guard editable, let harness, modelPopover == nil else { return }
        let state = ModelSectionView.State(harness: harness, installed: [harness], machineName: machine?.hostname ?? "",
                                           machineIds: machineId.map { [$0] } ?? [], model: model ?? "", tools: nil)
        let picker = ModelPopover(hub: hub, state: state) { [weak self] id in
            self?.changeModel(id)
            self?.modelPopover?.dismiss(animated: true)
        }
        modelChip.open = true
        picker.onClose = { [weak self] in self?.modelChip.open = false }
        modelPopover = picker
        KitPopover.present(picker, from: modelChip, in: self)
    }
}

/// The running session's model list on the form's popover, 360pt wide
/// (the screen less 24pt on a phone), sized to its rows.
private final class ModelPopover: KitPopoverController {
    private let section: ModelSectionView
    var onClose: () -> Void = {}

    init(hub: HubConnection, state: ModelSectionView.State, onModel: @escaping (String) -> Void) {
        section = ModelSectionView(hub: hub, label: "Models", state: state, presenter: nil, runtime: true)
        super.init()
        section.onModel = onModel
        section.onResize = { [weak self] in self?.fit() }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        card.addSubview(section)
        NSLayoutConstraint.activate([
            section.topAnchor.constraint(equalTo: card.topAnchor, constant: 6),
            section.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -6),
            section.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 6),
            section.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -6),
        ])
        fit()
    }

    private func fit() {
        guard isViewLoaded else { return }
        let screen = view.window?.windowScene?.screen.bounds.width ?? UIScreen.main.bounds.width
        let width = min(360, screen - 24)
        let height = section.systemLayoutSizeFitting(CGSize(width: width - 12, height: UIView.layoutFittingCompressedSize.height),
                                                     withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height + 12
        preferredContentSize = CGSize(width: width, height: height)
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isBeingDismissed { onClose() }
    }
}

/// How a session's place is written short (SessionDetails.svelte `shortPath`).
enum SessionIdentity {
    /// The home folder as `~`, and a deep path as its first part and its leaf:
    /// the folder name is what tells sessions apart.
    static func shortPath(_ path: String) -> String {
        let parts = path.replacing(/^\/(home|Users)\/[^\/]+/, with: "~").split(separator: "/", omittingEmptySubsequences: false)
        guard parts.count > 3, let first = parts.first, let last = parts.last else { return parts.joined(separator: "/") }
        return "\(first)/…/\(last)"
    }
}
