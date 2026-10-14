import CawCoAPI
import CawCoCore
import CawCoDesign
import Observation
import OSLog
import UIKit

// The machines, one tap away beside Jump (MachinesButton.svelte): the
// popover listing each machine with its menu, and what the shell says about
// a machine's health.

// MARK: Health

/// What is wrong with a machine, in a word or two (home-state.svelte.ts
/// `exceptionOf`): it is unreachable, pi or OpenCode cannot sign in (one of
/// the machine's own OpenCode sign-ins refused, with its fix), its build is
/// behind the hub's, or a fleet-sync row failed on it. Nil when nothing is.
enum MachineHealth {
    static func fault(_ machine: MachineRow, hubBuild: Components.Schemas.BuildInfo?) -> String? {
        if machine.status != "online" { return "unreachable" }
        // Every harness's sign-in words: one never hides another's.
        let signIns = [signIn(machine, .pi), signIn(machine, .opencode)].compactMap { $0 }
        if !signIns.isEmpty { return signIns.joined(separator: " ") }
        if let commit = machine.build?.commit, let hub = hubBuild?.commit, commit != hub { return "behind hub" }
        if syncFailed(machine.fleet) { return "sync failed" }
        return nil
    }

    /// A harness's own words on why it cannot sign in here (machine.ts
    /// `signInWarning`): its `authReason`, then each of the machine's own
    /// sign-ins its provider refused, in the report's words (core
    /// `opencodeSignInFaultWords`). Nil when there are none.
    static func signIn(_ machine: MachineRow, _ harness: Components.Schemas.HarnessKind) -> String? {
        guard let report = machine.harnesses?.first(where: { $0.harness == harness }) else { return nil }
        let said = [report.authReason].compactMap { $0 } + (report.signInFaults ?? []).map(\.words)
        return said.isEmpty ? nil : said.joined(separator: " ")
    }

    /// Every row one machine's fleet report says it could not apply
    /// (fleet-faults.ts `machineFaults`), as a yes or no.
    static func syncFailed(_ report: Components.Schemas.FleetSyncReport?) -> Bool {
        guard let report, let data = try? JSONEncoder().encode(report),
              let rows = try? JSONDecoder().decode(SyncRows.self, from: data) else { return false }
        let bad: Set = ["failed", "needs-auth", "unsupported"]
        let scan = { (record: [String: SyncRows.Item]?) in record?.values.contains { bad.contains($0.state) } ?? false }
        let mcp = rows.mcpByHarness.map { $0.values.contains { scan($0) } } ?? scan(rows.mcp)
        return mcp || scan(rows.marketplaces) || scan(rows.plugins) || scan(rows.skills) || scan(rows.memoryDocs) || scan(rows.hooks)
            || rows.memory?.state == "failed" || rows.memoryHook?.state == "failed"
    }

    private struct SyncRows: Decodable {
        struct Item: Decodable { let state: String }
        let mcp: [String: Item]?
        let mcpByHarness: [String: [String: Item]]?
        let marketplaces: [String: Item]?
        let plugins: [String: Item]?
        let skills: [String: Item]?
        let memoryDocs: [String: Item]?
        let hooks: [String: Item]?
        let memory: Item?
        let memoryHook: Item?
    }

    /// The bar's glyph: the fail ink while a machine is down, the attention
    /// ink while one is up but in trouble, else none.
    enum Tone { case fail, attn }

    static func tone(_ machines: [MachineRow], hubBuild: Components.Schemas.BuildInfo?) -> Tone? {
        if machines.contains(where: { $0.status != "online" }) { return .fail }
        return machines.contains { fault($0, hubBuild: hubBuild) != nil } ? .attn : nil
    }

    /// ui/machine-row `machineIcon`: a laptop for a Mac, a monitor for
    /// Windows, a server for Linux, a chip for anything else.
    static func icon(_ os: String) -> Glyph {
        let platform = os.trimmingCharacters(in: .whitespaces).lowercased()
        if platform.hasPrefix("darwin") || platform.hasPrefix("mac") { return .machineLaptop }
        if platform.hasPrefix("win") { return .monitor }
        return platform.hasPrefix("linux") ? .machineServer : .cpu
    }

    /// ui/machine-row `machineHue`: one of three identity hues, by place, while online.
    static func hue(_ index: Int, online: Bool) -> UIColor {
        guard online else { return Palette.machineOffline }
        return [Palette.hueAmber500, Palette.hueGreen500, Palette.hueCyan400][index % 3]
    }

    static func isMac(_ machine: MachineRow) -> Bool {
        machine.os.range(of: "darwin|mac", options: [.regularExpression, .caseInsensitive]) != nil
    }
}

// MARK: Row

/// One machine as a row (ui/machine-row): a 26pt raised tile at
/// `--radius-sm` carrying the machine's kind in its hue, the name in label
/// type, and a meta line in subtle meta type led by a 6pt presence dot
/// (green up, orange up but in trouble, neutral down).
final class MachineRowView: UIStackView {
    enum Presence { case online, away, off }

    private let tile = TileView(radius: Radius.radiusSm)
    private let glyph = GlyphView(.cpu, size: 16)
    private let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let dot = UIView()
    private let meta = KitLabel(TypeScale.typeMeta, ink: Palette.inkSubtle)

    init() {
        super.init(frame: .zero)
        spacing = Space.space2
        alignment = .center
        isUserInteractionEnabled = false
        glyph.translatesAutoresizingMaskIntoConstraints = false
        tile.addSubview(glyph)
        dot.layer.cornerRadius = 3
        dot.translatesAutoresizingMaskIntoConstraints = false
        let metaRow = UIStackView(arrangedSubviews: [dot, meta])
        metaRow.spacing = 6
        metaRow.alignment = .center
        let text = UIStackView(arrangedSubviews: [name, metaRow])
        text.axis = .vertical
        name.lineBreakMode = .byTruncatingTail
        meta.lineBreakMode = .byTruncatingTail
        addArrangedSubview(tile)
        addArrangedSubview(text)
        NSLayoutConstraint.activate([
            tile.widthAnchor.constraint(equalToConstant: 26),
            tile.heightAnchor.constraint(equalToConstant: 26),
            glyph.centerXAnchor.constraint(equalTo: tile.centerXAnchor),
            glyph.centerYAnchor.constraint(equalTo: tile.centerYAnchor),
            dot.widthAnchor.constraint(equalToConstant: 6),
            dot.heightAnchor.constraint(equalToConstant: 6),
        ])
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("MachineRowView is built in code")
    }

    func configure(glyph kind: Glyph, hue: UIColor, name text: String, meta line: String, presence: Presence) {
        glyph.glyph = kind
        glyph.tintColor = hue
        name.text = text
        meta.text = line
        dot.backgroundColor = switch presence {
        case .online: Palette.hueGreen500
        case .away: Palette.hueOrange500
        case .off: Palette.neutral8
        }
    }
}

/// The popover's row (`.row`): `--radius-sm`, 32pt at a desk and 44 under a
/// finger, 4pt by 8pt in; it tints while pressed and lifts under a pointer.
final class MachinesListRow: TapControl {
    let content = MachineRowView()
    private var hovering = false

    override init(frame: CGRect) {
        super.init(frame: frame)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        content.translatesAutoresizingMaskIntoConstraints = false
        addSubview(content)
        let coarse = traitCollection.userInterfaceIdiom != .mac
        NSLayoutConstraint.activate([
            heightAnchor.constraint(greaterThanOrEqualToConstant: coarse ? 44 : Space.space8),
            content.topAnchor.constraint(greaterThanOrEqualTo: topAnchor, constant: Space.space1),
            content.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor, constant: -Space.space1),
            content.centerYAnchor.constraint(equalTo: centerYAnchor),
            content.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space2),
            content.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space2),
        ])
        addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
        isAccessibilityElement = true
        accessibilityTraits = .button
    }

    override var isHighlighted: Bool {
        didSet { paint() }
    }

    @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
        hovering = hover.state == .began || hover.state == .changed
        Motion.easeOut.animator(Motion.durControl) { self.paint() }.startAnimation()
    }

    private func paint() {
        backgroundColor = isHighlighted ? Palette.surfaceFill : (hovering ? Palette.surfaceHover : .clear)
    }
}

// MARK: Popover

/// What the shell lends the machines surfaces: where to start a session and
/// what to present over.
@MainActor
protocol MachinesHost: AnyObject {
    var hub: HubConnection { get }
    func startSession(machineId: String?, cwd: String?, projectId: String?)
    func addMachine()
    /// Native only: point this window at another hub.
    func changeHub()
    /// What the machine dialogs present over.
    var dialogPresenter: UIViewController { get }
    /// A session's mark, as every row draws it.
    func markStatus(_ row: InstanceRow) -> MarkStatus
    /// Goes to Configure, at the section of this slug.
    func openConfigure(_ slug: String)
}

/// The machines card (MachinesButton.svelte): the machines' list
/// (`MachinesListView`) on the glass's card (`GlassContent`; DESIGN.md,
/// "The glass's cards"), 320pt wide at most (`w-[min(20rem,…)]`), as tall
/// as the list, its content 7pt inside the card's drawn edge. A row's dialog
/// opens as the card goes back into the glass.
final class MachinesCard: GlassContent {
    private let listView: MachinesListView
    private static let inset = 7.0
    private static let log = Logger(subsystem: "dev.cawco.app", category: "GlassCard")

    init(host: MachinesHost) {
        listView = MachinesListView(host: host)
        super.init(name: "machines", widest: 320, log: Self.log, label: "Machines", identifier: "machines-card")
        listView.leave = { [weak self] then in
            self?.close(refocus: false)
            then()
        }
        listView.onChange = { [weak self] in self?.place(animated: true) }
        listView.translatesAutoresizingMaskIntoConstraints = true
        addSubview(listView)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("MachinesCard is built in code")
    }

    override func measure(width: CGFloat) -> CGFloat {
        listView.systemLayoutSizeFitting(CGSize(width: width - Self.inset * 2, height: 0),
                                         withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height + Self.inset * 2
    }

    override func layContent(width: CGFloat, fit: CGFloat) {
        listView.frame = CGRect(x: Self.inset, y: Self.inset, width: width - Self.inset * 2, height: fit - Self.inset * 2)
    }

    override var landing: Any? { listView }
}

/// The machines as a list: each machine (its menu on a long-press or a
/// right-click), then Add machine under a seam and Change hub. Shown in the
/// wide bar's Machines popover and in the phone sidebar's Machines section;
/// `leave` runs before a foot row's dialog, so the place it stands in can go first.
final class MachinesListView: UIView {
    private weak var host: MachinesHost?
    private let hub: HubConnection
    private let list = UIStackView()
    private let stack = UIStackView()
    private var rows: [String: MachinesListRow] = [:]
    private var menus: [String: MachineMenu] = [:]
    /// What did not go on each machine's update, under its row.
    private var faults: [String: MachineFaultLine] = [:]
    /// Whatever stands the list on screen steps aside, then `then` runs.
    var leave: (@escaping () -> Void) -> Void = { then in then() }
    /// The list's rows changed: a popover sizes itself again.
    var onChange: () -> Void = {}

    init(host: MachinesHost) {
        self.host = host
        hub = host.hub
        super.init(frame: .zero)
        list.axis = .vertical
        list.spacing = 2
        let add = MachinesFootRow(glyph: .plus, title: "Add machine", seam: true)
        add.addAction(UIAction { [weak self] _ in
            guard let self, let host = self.host else { return }
            leave { host.addMachine() }
        }, for: .primaryActionTriggered)
        let changeHub = MachinesFootRow(glyph: .globe, title: "Change hub", seam: false)
        changeHub.addAction(UIAction { [weak self] _ in
            guard let self, let host = self.host else { return }
            leave { host.changeHub() }
        }, for: .primaryActionTriggered)
        stack.axis = .vertical
        for part in [list, add, changeHub] { stack.addArrangedSubview(part) }
        stack.setCustomSpacing(Space.space1, after: list)
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        follow()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("MachinesListView is built in code")
    }

    /// Re-reads the fleet whenever what it shows changes.
    private func follow() {
        withObservationTracking {
            refresh()
        } onChange: { [weak self] in
            Task { @MainActor in self?.follow() }
        }
    }

    private func refresh() {
        let machines = hub.fleet.machines
        let running = hub.fleet.rows.filter(\.isLive)
        let ids = Set(machines.map(\.machineId))
        for (id, row) in rows where !ids.contains(id) {
            row.removeFromSuperview()
            rows[id] = nil
            menus[id] = nil
            faults.removeValue(forKey: id)?.removeFromSuperview()
        }
        // The question about a machine stands under its row (AskHere); what
        // it names is read here, so a session that ends while it stands shows it.
        var asked = askedMachine.flatMap { id in machines.first { $0.machineId == id } }
        if asked?.status == "online" {
            // Back online, it would register straight back: the question goes.
            asked = nil
            Task { @MainActor [askView] in askView.dismiss() }
        } else {
            askView.refresh()
        }
        // The unlock goes with its machine; its answer stays until Done.
        if let unlock = unlockView, !machines.contains(where: { $0.machineId == unlock.machineId }) {
            putAwayUnlock()
        }
        let policy = hub.fleet.updatePolicy
        var at = 0
        for (index, machine) in machines.enumerated() {
            let id = machine.machineId
            let row = rows[id] ?? makeRow(id)
            let up = machine.status == "online"
            let fault = MachineHealth.fault(machine, hubBuild: hub.fleet.hubBuild)
            let live = running.filter { $0.machineId == id }.count
            let presence: MachineRowView.Presence = !up ? .off : (fault == nil ? .online : .away)
            // An update under way says where it stands on the row; one that failed says why under it (MachinesList.svelte).
            let update = UpdateRows.underWay(machine, policy: policy)
            let said = ["\(live) live", fault, update.flatMap { $0.fail ? nil : $0.text }].compactMap(\.self).filter { !$0.isEmpty }
            row.content.configure(glyph: MachineHealth.icon(machine.os), hue: MachineHealth.hue(index, online: up),
                                  name: machine.name, meta: said.joined(separator: " · "), presence: presence)
            row.accessibilityLabel = machine.name
            row.accessibilityValue = said.joined(separator: ", ")
            list.insertArrangedSubview(row, at: at)
            at += 1
            if asked?.machineId == id {
                list.insertArrangedSubview(askView, at: at)
                at += 1
            }
            if let unlock = unlockView, unlock.machineId == id {
                list.insertArrangedSubview(unlock, at: at)
                at += 1
            }
            if let failed = updateFault(machine, update: update) {
                let line = faults[id] ?? MachineFaultLine()
                faults[id] = line
                line.show(failed.reason, again: failed.again)
                list.insertArrangedSubview(line, at: at)
                at += 1
            } else if let line = faults.removeValue(forKey: id) {
                line.removeFromSuperview()
            }
        }
        #if DEBUG
        let shown = list.arrangedSubviews.compactMap { view -> String? in
            if let unlock = view as? UnlockKeychainView { return "unlock:\(unlock.machineId)" }
            if let line = view as? MachineFaultLine { return "fault:\(faults.first { $0.value === line }?.key ?? "")" }
            return nil
        }
        if !shown.isEmpty, shown != probeShown {
            UnlockKeychainView.probe("rows under: \(shown.joined(separator: ", ")), presented over the window: \(window?.rootViewController?.presentedViewController.map { String(describing: type(of: $0)) } ?? "none")")
        }
        probeShown = shown
        #endif
        onChange()
    }

    #if DEBUG
    private var probeShown: [String] = []
    #endif

    /// What did not go on a machine's update, under its row (MachinesList.svelte
    /// `updateFault`): the hub's refusal of an install asked here, else a
    /// failed update in the Update cell's words with the machine's own, and
    /// Try again where a retry is the person's to make.
    private func updateFault(_ machine: MachineRow, update: UpdateCell?) -> (reason: String, again: (() -> Void)?)? {
        let id = machine.machineId
        let install = { [hub] in hub.installUpdate(machineId: id) }
        if let refused = hub.updateRefused[id] { return (refused, install) }
        guard let update, update.fail else { return nil }
        let reason = UpdateRows.error(machine).map { "\(update.text) \($0)" } ?? update.text
        return (reason, update.buttons.contains(.retry) ? install : nil)
    }

    /// The keychain unlock standing under a machine's row (UnlockKeychain.svelte), if one is open.
    private var unlockView: UnlockKeychainView?

    /// Opens the unlock under `machineId`'s row, from its form.
    private func unlock(_ machineId: String) {
        guard let machine = hub.fleet.machines.first(where: { $0.machineId == machineId }) else { return }
        putAwayUnlock()
        let view = UnlockKeychainView(hub: hub, machine: machine)
        view.onClose = { [weak self] in self?.putAwayUnlock() }
        view.onResize = { [weak self] in self?.onChange() }
        unlockView = view
        #if DEBUG
        UnlockKeychainView.probe("unlock \(machineId) opened under its row")
        #endif
        refresh()
    }

    private func putAwayUnlock() {
        unlockView?.removeFromSuperview()
        unlockView = nil
        onChange()
    }

    /// The question standing under a machine's row (MachineMenu.svelte
    /// `machineAsks`), and which machine's.
    private lazy var askView: AskHere = {
        let ask = AskHere()
        ask.onResize = { [weak self, weak ask] in
            guard let self else { return }
            if ask?.asked == nil {
                askedMachine = nil
                ask?.removeFromSuperview()
            }
            onChange()
        }
        return ask
    }()

    private var askedMachine: String?

    /// Asks `request` under `machineId`'s row, in place of any question standing.
    private func ask(_ request: AskHere.Request, about machineId: String) {
        guard let row = rows[machineId], let at = list.arrangedSubviews.firstIndex(of: row) else { return }
        askedMachine = machineId
        if askView.superview != nil { askView.removeFromSuperview() }
        list.insertArrangedSubview(askView, at: at + 1)
        askView.ask(request)
        onChange()
    }

    #if DEBUG
    /// The question on screen in this list, and whether it is the line right under `machineId`'s row.
    func probeAsk(_ machineId: String) -> (view: AskHere, under: Bool)? {
        guard askView.asked != nil, let at = list.arrangedSubviews.firstIndex(of: askView) else { return nil }
        let row = rows[machineId].flatMap { list.arrangedSubviews.firstIndex(of: $0) }
        return (askView, row.map { $0 + 1 == at } ?? false)
    }

    /// Remove machine…, as `machineId`'s menu item asks it.
    func probeAskRemove(_ machineId: String) { menus[machineId]?.probeAskRemove() }
    /// Unlock keychain…, as `machineId`'s menu item opens it.
    func probeUnlock(_ machineId: String) { menus[machineId]?.probeUnlock() }

    /// What stands in the lines right under `machineId`'s row, up to the next row.
    func probeUnder(_ machineId: String) -> [String] {
        guard let row = rows[machineId], let at = list.arrangedSubviews.firstIndex(of: row) else { return ["no row"] }
        return list.arrangedSubviews[(at + 1)...].prefix { !($0 is MachinesListRow) }.map { view in
            switch view {
            case let unlock as UnlockKeychainView: "unlock(\(unlock.probeState))"
            case let line as MachineFaultLine: "fault(\(line.probeState))"
            case let ask as AskHere: "ask(\(ask.probeState))"
            default: String(describing: type(of: view))
            }
        }
    }

    /// The unlock standing in this list, if any.
    var probeUnlockView: UnlockKeychainView? { unlockView }
    var probeRunning: Bool { askView.running }

    /// Whether `machineId` has a row in this list.
    func probeHasRow(_ machineId: String) -> Bool { rows[machineId] != nil }
    #endif

    private func makeRow(_ machineId: String) -> MachinesListRow {
        let row = MachinesListRow()
        rows[machineId] = row
        if let host {
            let menu = MachineMenu(machineId: machineId, host: host)
            menu.ask = { [weak self] request in self?.ask(request, about: machineId) }
            menu.unlock = { [weak self] in self?.unlock(machineId) }
            menus[machineId] = menu
            menu.attach(to: row)
        }
        return row
    }
}

/// A row at the list's foot (`.row.add`): "Add machine" under a seam, and
/// "Change hub" under it, each its glyph and label in muted label type.
private final class MachinesFootRow: TapControl {
    private let seam = UIView()

    init(glyph: Glyph, title: String, seam showsSeam: Bool) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusSm
        if showsSeam { layer.maskedCorners = [.layerMinXMaxYCorner, .layerMaxXMaxYCorner] }
        seam.backgroundColor = Palette.seam
        seam.isHidden = !showsSeam
        seam.translatesAutoresizingMaskIntoConstraints = false
        addSubview(seam)
        let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
        label.text = title
        let row = UIStackView(arrangedSubviews: [GlyphView(glyph, size: 16, tint: Palette.inkMuted), label])
        row.spacing = Space.space2
        row.alignment = .center
        row.isUserInteractionEnabled = false
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        let coarse = traitCollection.userInterfaceIdiom != .mac
        NSLayoutConstraint.activate([
            seam.topAnchor.constraint(equalTo: topAnchor),
            seam.leadingAnchor.constraint(equalTo: leadingAnchor),
            seam.trailingAnchor.constraint(equalTo: trailingAnchor),
            seam.heightAnchor.constraint(equalToConstant: 1),
            heightAnchor.constraint(equalToConstant: coarse ? 44 : Space.space8),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space2),
            row.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        isAccessibilityElement = true
        accessibilityLabel = title
        accessibilityTraits = .button
        addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("MachinesFootRow is built in code")
    }

    override var isHighlighted: Bool {
        didSet { backgroundColor = isHighlighted ? Palette.surfaceFill : .clear }
    }

    @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
        let on = hover.state == .began || hover.state == .changed
        Motion.easeOut.animator(Motion.durControl) { self.backgroundColor = on ? Palette.surfaceHover : .clear }.startAnimation()
    }
}

/// What did not go on a machine's update, under its row (RowFault.svelte in
/// MachinesList.svelte `.machine-fault`): the reason in the fail status's
/// meta ink from where the row's name starts (its padding, its 16pt glyph
/// and gap), and Try again beside it when there is a way on, wrapping under
/// it when narrow.
final class MachineFaultLine: UIStackView {
    private let reason = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)
    private var again: UIButton?
    private var onAgain: (() -> Void)?

    init() {
        super.init(frame: .zero)
        axis = .vertical
        alignment = .leading
        spacing = Space.space1
        isLayoutMarginsRelativeArrangement = true
        directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space1, leading: Space.space2 * 2 + 16, bottom: Space.space1, trailing: Space.space2)
        reason.wrap = .pretty
        reason.accessibilityTraits = .staticText
        addArrangedSubview(reason)
        accessibilityIdentifier = "machine-fault"
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("MachineFaultLine is built in code")
    }

    func show(_ text: String, again way: (() -> Void)?) {
        if reason.text != text {
            reason.text = text
            UIAccessibility.post(notification: .announcement, argument: text)
        }
        onAgain = way
        if way == nil {
            again?.removeFromSuperview()
            again = nil
        } else if again == nil {
            let button = KitButton.make("Try again", glyph: .refresh, variant: .ghost, height: .xs) { [weak self] in self?.onAgain?() }
            addArrangedSubview(button)
            again = button
        }
    }

    #if DEBUG
    var probeState: String { "'\(reason.text ?? "")'\(again == nil ? "" : " + Try again")" }
    #endif
}

// MARK: Menu

/// A machine's menu (MachineMenu.svelte): what you can do to the box, not
/// to a session. Reload sessions (it runs in the menu, and says there why
/// it failed), New session here, Sign in an account… (a machine nobody is
/// signed in on: it opens Configure → Accounts), Unlock keychain… (a Mac
/// whose credentials sit behind a locked keychain; it opens under the row),
/// Install update now (while a build waits; everything after the press, a
/// failure included, is said on the machine's row), the two copies (the
/// item's glyph turns to a check and holds it for `durHold` before the menu
/// closes) and, while it is offline, Remove machine….
@MainActor
final class MachineMenu: NSObject, UIContextMenuInteractionDelegate {
    private let machineId: String
    private weak var host: MachinesHost?
    private var interaction: UIContextMenuInteraction?
    private var reloading = false
    /// Why the last reload failed, said under its item until it is asked again.
    private var reloadFailed: String?
    private var copied: String?
    /// Asks under this machine's row, in the list the menu stands in.
    var ask: (AskHere.Request) -> Void = { _ in }
    /// Opens the keychain unlock under this machine's row.
    var unlock: () -> Void = {}

    init(machineId: String, host: MachinesHost) {
        self.machineId = machineId
        self.host = host
    }

    func attach(to view: UIView) {
        let interaction = UIContextMenuInteraction(delegate: self)
        view.addInteraction(interaction)
        self.interaction = interaction
        objc_setAssociatedObject(view, &MachineMenu.key, self, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    }

    nonisolated(unsafe) private static var key = 0

    private var machine: MachineRow? { host?.hub.fleet.machines.first { $0.machineId == machineId } }

    func contextMenuInteraction(_: UIContextMenuInteraction, configurationForMenuAtLocation _: CGPoint) -> UIContextMenuConfiguration? {
        guard machine != nil else { return nil }
        return UIContextMenuConfiguration(identifier: machineId as NSString, previewProvider: nil) { [weak self] _ in self?.menu() }
    }

    func contextMenuInteraction(_: UIContextMenuInteraction, previewForHighlightingMenuWithConfiguration _: UIContextMenuConfiguration) -> UITargetedPreview? {
        guard let view = interaction?.view else { return nil }
        let parameters = UIPreviewParameters()
        parameters.visiblePath = UIBezierPath(roundedRect: view.bounds, cornerRadius: Radius.radiusSm)
        parameters.backgroundColor = Palette.surfaceRaised
        return UITargetedPreview(view: view, parameters: parameters)
    }

    private func menu() -> UIMenu {
        guard let machine, let host else { return UIMenu() }
        let id = machine.machineId
        let reload = UIAction(title: reloading ? "Reloading…" : "Reload sessions", image: Glyph.refresh.image,
                              attributes: reloading ? [.keepsMenuPresented, .disabled] : .keepsMenuPresented) { [weak self] _ in
            self?.runReload()
        }
        reload.subtitle = reloading ? nil : reloadFailed.map { "Not reloaded: \($0)" }
        var first: [UIMenuElement] = [
            reload,
            UIAction(title: "New session here", image: Glyph.plus.image) { _ in
                host.startSession(machineId: id, cwd: nil, projectId: nil)
            },
        ]
        if machine.auth == .unauthenticated {
            let signIn = UIAction(title: "Sign in an account…", image: Glyph.key.image) { [weak self] _ in self?.openAccounts() }
            signIn.subtitle = "Nobody is signed in on \(machine.name)."
            first.append(signIn)
        }
        if MachineHealth.isMac(machine), machine.auth == .unreadableCredentials {
            first.append(UIAction(title: "Unlock keychain…", image: Glyph.key.image) { [weak self] _ in self?.unlock() })
        }
        if UpdateRows.installableNow(machine) {
            first.append(UIAction(title: "Install update now", image: Glyph.download.image) { _ in
                host.hub.installUpdate(machineId: id)
            })
        }
        var sections = [UIMenu(options: .displayInline, children: first)]
        sections.append(UIMenu(options: .displayInline, children: [
            copyItem("Copy machine id", what: "Machine id", text: machine.machineId),
            copyItem("Copy hostname", what: "Hostname", text: machine.hostname),
        ]))
        if machine.status != "online" {
            sections.append(UIMenu(options: .displayInline, children: [
                UIAction(title: "Remove machine…", image: Glyph.trash.image, attributes: .destructive) { [weak self] _ in self?.askRemove() },
            ]))
        }
        return UIMenu(children: sections)
    }

    /// ContextMenu.CopyItem: copies, says so in a toast, and holds a check before the menu closes.
    private func copyItem(_ title: String, what: String, text: String) -> UIAction {
        UIAction(title: title, image: (copied == title ? Glyph.check : Glyph.copy).image, attributes: .keepsMenuPresented) { [weak self] _ in
            guard let self else { return }
            UIPasteboard.general.string = text
            guard UIPasteboard.general.string == text else {
                Toast.error("Could not copy the \(what.lowercased()).", in: interaction?.view)
                interaction?.dismissMenu()
                return
            }
            Toast.success("\(what) copied", in: interaction?.view)
            copied = title
            refreshMenu()
            Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(Motion.durHold))
                self?.copied = nil
                self?.interaction?.dismissMenu()
            }
        }
    }

    private func refreshMenu() {
        interaction?.updateVisibleMenu { [weak self] current in
            guard let self else { return current }
            return menu()
        }
    }

    /// Reads the machine's stored sessions again (`loadCatalog`), pending in place.
    private func runReload() {
        guard let hub = host?.hub, !reloading else { return }
        reloading = true
        reloadFailed = nil
        refreshMenu()
        Task { @MainActor [weak self, machineId] in
            do {
                try await hub.reloadCatalog(machineId)
                self?.reloading = false
                self?.interaction?.dismissMenu()
            } catch {
                self?.reloading = false
                self?.reloadFailed = error.localizedDescription
                self?.refreshMenu()
            }
        }
    }

    #if DEBUG
    func probeReload() { runReload() }
    func probeAccounts() { openAccounts() }
    /// Remove machine…, as its item asks it.
    func probeAskRemove() { askRemove() }
    /// The menu's first section as it would draw now: each item's title and the words under it.
    var probeItems: [String] {
        (menu().children.first as? UIMenu)?.children.compactMap { element in
            (element as? UIAction).map { "\($0.title)\($0.subtitle.map { " — \($0)" } ?? "")" }
        } ?? []
    }
    #endif

    /// Signing an account in is Configure → Accounts' work (MachineMenu.svelte): it opens there.
    private func openAccounts() {
        host?.openConfigure("accounts")
    }

    #if DEBUG
    /// Unlock keychain…, as its item opens it.
    func probeUnlock() { unlock() }
    #endif

    /// Forgets a machine the fleet no longer has: only while it is offline,
    /// since a connected agent would register straight back. The question
    /// stands under the machine's row, in the page (MachineMenu.svelte
    /// `askRemove`): its sessions are what the removal reaches, named and
    /// read live; what stays is said too.
    private func askRemove() {
        guard let machine, let host else { return }
        let hub = host.hub
        let count = { (n: Int, noun: String) in "\(n) \(noun)\(n == 1 ? "" : "s")" }
        let id = machine.machineId
        let sessions = hub.fleet.rows.filter { $0.machineId == id }.count
        // Every project keeps its folder on the hub: only its places here go.
        let projects = hub.fleet.projects.filter { $0.placed(on: id) }.count
        let removed = sessions > 0
            ? "\(sessions == 1 ? "Its session is" : "Its sessions are") removed from the fleet"
            : "It has no sessions to remove"
        let places = projects > 0
            ? ", and \(count(projects, "project")) \(projects == 1 ? "loses its folders" : "lose their folders") on it; the projects stay"
            : ""
        ask(AskHere.Request(
            title: "Remove \(machine.name)?",
            body: ["\(removed)\(places). Its spend history stays. If its agent starts again, it rejoins the fleet."],
            confirmLabel: "Remove machine",
            pendingLabel: "Removing…",
            destructive: true,
            items: { [weak host] in
                guard let host else { return [] }
                return host.hub.fleet.rows.filter { $0.machineId == id }.map { row in
                    let mark = host.markStatus(row)
                    return AskItem(id: row.id, parentId: row.parentInstanceId, title: host.hub.fleet.title(row),
                                   place: row.cwd.isEmpty ? row.machineId : row.cwd, mark: mark,
                                   status: row.endWord ?? mark.word)
                }
            }
        ) {
            try await hub.removeMachine(id: id)
        })
    }
}
