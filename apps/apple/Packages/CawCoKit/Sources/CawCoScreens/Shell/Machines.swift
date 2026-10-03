import CawCoAPI
import CawCoCore
import CawCoDesign
import Observation
import UIKit

// The machines, one tap away beside Jump (MachinesButton.svelte): the
// popover listing each machine with its menu, and what the shell says about
// a machine's health.

// MARK: Health

/// What is wrong with a machine, in a word or two (home-state.svelte.ts
/// `exceptionOf`): it is unreachable, pi cannot sign in, its build is behind
/// the hub's, a fleet-sync row failed on it, or its deploy clone refuses to
/// deploy. Nil when nothing is.
enum MachineHealth {
    static func fault(_ machine: MachineRow, hubBuild: Components.Schemas.BuildInfo?) -> String? {
        if machine.status != "online" { return "unreachable" }
        if let reason = machine.harnesses?.first(where: { $0.harness == .pi })?.authReason { return reason }
        if let commit = machine.build?.commit, let hub = hubBuild?.commit, commit != hub { return "behind hub" }
        if syncFailed(machine.fleet) { return "sync failed" }
        if machine.deploy?.kind == .diverged { return "deploy diverged" }
        return nil
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
        (machine.os ?? "").range(of: "darwin|mac", options: [.regularExpression, .caseInsensitive]) != nil
    }
}

// MARK: Updates

/// An update this app started on a machine (MachineMenu.svelte
/// `machineUpdates`), which a machine's build chip reads: until the agent
/// reports a new start it is "Updating…"; `said` is what the update did.
@MainActor
@Observable
final class MachineUpdates {
    struct Update {
        var since: Double?
        /// The update ran and restarted nothing: there is no new build to wait for.
        var settled: Bool
        var said: String?
    }

    static let shared = MachineUpdates()
    var updates: [String: Update] = [:]
    /// Why the last update on a machine failed, whole.
    var failures: [String: String] = [:]

    func isUpdating(_ machine: MachineRow) -> Bool {
        guard let update = updates[machine.machineId] else { return false }
        return !update.settled && machine.build?.startedAt == update.since
    }

    /// Pull, install, rebuild and restart, the agent once it is idle
    /// (MachineMenu.svelte `updateMachine`).
    func update(_ machine: MachineRow, hub: HubConnection) async throws {
        failures[machine.machineId] = nil
        let host = machine.hostname
        updates[machine.machineId] = Update(since: machine.build?.startedAt, settled: false)
        do {
            let report = try await hub.updateMachine(machineId: machine.machineId)
            let moved = report.to == report.from ? "\(host) was already on \(report.from ?? "")" : "\(host): \(report.from ?? "") → \(report.to ?? "")"
            let restarted = report.restarted.isEmpty ? "" : ", restarted \(report.restarted.joined(separator: ", "))"
            let said = report.skipped.map { "\(moved)\(restarted) — \($0)" } ?? "\(moved)\(restarted)"
            updates[machine.machineId] = Update(since: updates[machine.machineId]?.since, settled: !report.restarted.contains("agent"), said: said)
        } catch {
            updates[machine.machineId] = nil
            failures[machine.machineId] = error.localizedDescription
            throw error
        }
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
    /// What the machine dialogs present over.
    var dialogPresenter: UIViewController { get }
}

/// The machines popover (MachinesButton.svelte): each machine, its menu on a
/// long-press or a right-click, then Add machine under a seam. 320pt wide at
/// most, hung from the button's end; it opens from 0.97 with no rise over
/// `durMenu` on the out curve (`.machines-pop`).
final class MachinesPopoverController: KitPopoverController {
    private weak var host: MachinesHost?
    private let hub: HubConnection
    private let list = UIStackView()
    private let stack = UIStackView()
    private var rows: [String: MachinesListRow] = [:]
    private var menus: [String: MachineMenu] = [:]

    static let entrance = KitPopover.Entrance(scale: 0.97, rise: 0, duration: Motion.durMenu, curve: Motion.easeOut)

    init(host: MachinesHost) {
        self.host = host
        hub = host.hub
        super.init()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("MachinesPopoverController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.accessibilityLabel = "Machines"
        list.axis = .vertical
        list.spacing = 2
        let add = AddMachineRow()
        add.addAction(UIAction { [weak self] _ in
            guard let host = self?.host else { return }
            self?.dismiss(animated: true) { host.addMachine() }
        }, for: .primaryActionTriggered)
        stack.axis = .vertical
        stack.addArrangedSubview(list)
        stack.addArrangedSubview(add)
        stack.setCustomSpacing(Space.space1, after: list)
        stack.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: card.topAnchor, constant: 6),
            stack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 6),
            stack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -6),
        ])
        follow()
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
        }
        for (index, machine) in machines.enumerated() {
            let row = rows[machine.machineId] ?? makeRow(machine.machineId)
            let up = machine.status == "online"
            let fault = MachineHealth.fault(machine, hubBuild: hub.fleet.hubBuild)
            let live = running.filter { $0.machineId == machine.machineId }.count
            let presence: MachineRowView.Presence = !up ? .off : (fault == nil ? .online : .away)
            row.content.configure(glyph: MachineHealth.icon(machine.os ?? ""), hue: MachineHealth.hue(index, online: up),
                                  name: Naming.machineLabel(machine.hostname),
                                  meta: ["\(live) live", fault].compactMap(\.self).joined(separator: " · "), presence: presence)
            row.accessibilityLabel = Naming.machineLabel(machine.hostname)
            row.accessibilityValue = ["\(live) live", fault].compactMap(\.self).joined(separator: ", ")
            list.insertArrangedSubview(row, at: index)
        }
        resize()
    }

    private func makeRow(_ machineId: String) -> MachinesListRow {
        let row = MachinesListRow()
        rows[machineId] = row
        if let host {
            let menu = MachineMenu(machineId: machineId, host: host)
            menus[machineId] = menu
            menu.attach(to: row)
        }
        return row
    }

    /// `w-[min(20rem,calc(100vw-16px))]`, as tall as the list.
    private func resize() {
        let width = min(320, (view.window?.bounds.width ?? UIScreen.main.bounds.width) - 16)
        stack.layoutIfNeeded()
        let height = stack.systemLayoutSizeFitting(CGSize(width: width - 12, height: 0), withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height + 12
        preferredContentSize = CGSize(width: width, height: height)
    }
}

/// "Add machine" (`.row.add`): the row's shape under a seam, its plus and
/// label in muted label type.
private final class AddMachineRow: TapControl {
    private let seam = UIView()

    override init(frame: CGRect) {
        super.init(frame: frame)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusSm
        layer.maskedCorners = [.layerMinXMaxYCorner, .layerMaxXMaxYCorner]
        seam.backgroundColor = Palette.seam
        seam.translatesAutoresizingMaskIntoConstraints = false
        addSubview(seam)
        let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
        label.text = "Add machine"
        let row = UIStackView(arrangedSubviews: [GlyphView(.plus, size: 16, tint: Palette.inkMuted), label])
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
        accessibilityLabel = "Add machine"
        accessibilityTraits = .button
        addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
    }

    override var isHighlighted: Bool {
        didSet { backgroundColor = isHighlighted ? Palette.surfaceFill : .clear }
    }

    @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
        let on = hover.state == .began || hover.state == .changed
        Motion.easeOut.animator(Motion.durControl) { self.backgroundColor = on ? Palette.surfaceHover : .clear }.startAnimation()
    }
}

// MARK: Menu

/// A machine's menu (MachineMenu.svelte): what you can do to the box, not
/// to a session. New session here, Log in…, Unlock keychain… (a Mac whose
/// credentials sit behind a locked keychain), Update this machine (the item
/// spins while it runs and the menu stays up; a failure adds "Update
/// failed", which opens the whole error), the two copies (the item's glyph
/// turns to a check and holds it for `durHold` before the menu closes) and,
/// while it is offline, Remove machine….
@MainActor
final class MachineMenu: NSObject, UIContextMenuInteractionDelegate {
    private let machineId: String
    private weak var host: MachinesHost?
    private var interaction: UIContextMenuInteraction?
    private var updating = false
    private var reloading = false
    private var copied: String?

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
        var first: [UIMenuElement] = [
            UIAction(title: reloading ? "Reloading…" : "Reload sessions", image: Glyph.refresh.image,
                     attributes: reloading ? [.keepsMenuPresented, .disabled] : .keepsMenuPresented) { [weak self] _ in
                self?.runReload()
            },
            UIAction(title: "New session here", image: Glyph.plus.image) { _ in
                host.startSession(machineId: id, cwd: nil, projectId: nil)
            },
            UIAction(title: "Log in…", image: Glyph.key.image) { [weak self] _ in self?.logIn() },
        ]
        if MachineHealth.isMac(machine), machine.auth == .unreadableCredentials {
            first.append(UIAction(title: "Unlock keychain…", image: Glyph.key.image) { [weak self] _ in self?.unlock() })
        }
        let update = UIAction(title: updating ? "Updating…" : "Update this machine", image: Glyph.download.image,
                              attributes: updating ? [.keepsMenuPresented, .disabled] : .keepsMenuPresented) { [weak self] _ in
            self?.runUpdate()
        }
        first.append(update)
        if let failure = MachineUpdates.shared.failures[id] {
            first.append(UIAction(title: "Update failed", image: Glyph.alert.image, attributes: .destructive) { [weak self] _ in
                self?.showFailure(failure)
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
        refreshMenu()
        Task { @MainActor [weak self, machineId] in
            do {
                try await hub.reloadCatalog(machineId)
                self?.reloading = false
                self?.interaction?.dismissMenu()
            } catch {
                self?.reloading = false
                self?.refreshMenu()
            }
        }
    }

    /// PendingSelect: the menu stays up while it runs and closes when it is done.
    private func runUpdate() {
        guard let machine, let hub = host?.hub, !updating else { return }
        updating = true
        refreshMenu()
        Task { @MainActor [weak self] in
            do {
                try await MachineUpdates.shared.update(machine, hub: hub)
                self?.updating = false
                self?.interaction?.dismissMenu()
            } catch {
                self?.updating = false
                self?.refreshMenu()
            }
        }
    }

    private func logIn() {
        guard let machine, let host else { return }
        host.dialogPresenter.present(MachineLoginController(hub: host.hub, machine: machine), animated: true)
    }

    private func unlock() {
        guard let machine, let host else { return }
        host.dialogPresenter.present(UnlockKeychainController(hub: host.hub, machine: machine), animated: true)
    }

    private func showFailure(_ message: String) {
        guard let machine, let host else { return }
        host.dialogPresenter.present(ErrorDialogController(title: "Update failed on \(machine.hostname)", message: message), animated: true)
    }

    /// Forgets a machine the fleet no longer has: only while it is offline,
    /// since a connected agent would register straight back.
    private func askRemove() {
        guard let machine, let host else { return }
        let hub = host.hub
        let count = { (n: Int, noun: String) in "\(n) \(noun)\(n == 1 ? "" : "s")" }
        let sessions = hub.fleet.rows.filter { $0.machineId == machine.machineId }.count
        let projects = hub.fleet.projects.filter { $0.machineId == machine.machineId }.count
        let id = machine.machineId
        let dialog = ConfirmDialog(
            title: "Remove \(Naming.machineLabel(machine.hostname))?",
            body: "Its \(count(sessions, "session")) and \(count(projects, "project")) are removed from the fleet. Its spend history stays. If its agent starts again, it rejoins the fleet.",
            confirmLabel: "Remove machine",
            pendingLabel: "Removing…",
            destructive: true
        ) {
            try await hub.removeMachine(id: id)
        }
        host.dialogPresenter.present(dialog, animated: true)
    }
}
