import CawCoCore
import CawCoDesign
import UIKit

/// What an operating system is called (machine.ts `machineOs`).
func machineOsLabel(_ os: String) -> String {
    switch os.trimmingCharacters(in: .whitespaces).lowercased().split(separator: "-").first {
    case "darwin": "macOS"
    case "linux": "Linux"
    case "win32", "windows": "Windows"
    default: "Unknown"
    }
}

/// The list a section's rows sit in (RowList.svelte): 2pt apart, no hairlines.
final class RowList: UIStackView {
    init(label: String) {
        super.init(frame: .zero)
        axis = .vertical
        spacing = 2
        accessibilityLabel = label
        accessibilityContainerType = .list
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("RowList is built in code")
    }

    func set(_ rows: [UIView]) {
        arrangedSubviews.forEach { $0.removeFromSuperview() }
        rows.forEach(addArrangedSubview)
    }
}

/// One action of a row's ⋯ menu (RowMenu.svelte `RowAction`).
struct RowAction {
    var label: String
    var glyph: Glyph?
    var destructive = false
    var disabled = false
    var run: () -> Void
}

/// A row's ⋯ menu: every action a row has beyond opening it and its switch,
/// as a pull-down from the ghost icon button.
func rowMenu(_ label: String, actions: [RowAction]) -> UIButton {
    let button = KitGhostButton(.more, label: Words.Configure.moreFor(label: label))
    button.menu = UIMenu(children: actions.map { action in
        var attributes: UIMenuElement.Attributes = []
        if action.destructive { attributes.insert(.destructive) }
        if action.disabled { attributes.insert(.disabled) }
        return UIAction(title: action.label, image: action.glyph?.image.resized(to: 16), attributes: attributes) { _ in action.run() }
    })
    button.showsMenuAsPrimaryAction = true
    return button
}

/// Where one fleet row has landed (RolloutChip.svelte): "2/2 machines" on
/// the row, with a glyph for refused, landed everywhere, or a sync on its
/// way, and machine by machine in its menu. A machine that refused it opens
/// the whole fault; one that has not reported can be synced from there.
final class RolloutChip: UIButton {
    private let hub: HubConnection
    private let scope: FaultScope
    private let name: String
    private let what: String
    /// Opens a refused machine's fault in full.
    var openFault: ((FaultGroup) -> Void)?
    /// A sync of the whole fleet was asked for and has not answered yet.
    var syncing = false { didSet { draw() } }

    init(hub: HubConnection, scope: FaultScope, name: String, what: String) {
        self.hub = hub
        self.scope = scope
        self.name = name
        self.what = what
        super.init(frame: .zero)
        houseStyle()
        translatesAutoresizingMaskIntoConstraints = false
        heightAnchor.constraint(equalToConstant: 26).isActive = true
        showsMenuAsPrimaryAction = true
        menu = UIMenu(children: [UIDeferredMenuElement.uncached { [weak self] done in done(self?.machineItems() ?? []) }])
        draw()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("RolloutChip is built in code")
    }

    /// Draws the chip from the machines' reports now.
    func draw() {
        let rollout = Rollout.of(scope, name: name, machines: hub.fleet.machines)
        let total = rollout.landings.count
        let refused = rollout.refused
        let glyph: Glyph? = syncing ? .working : refused > 0 ? .warning : (total > 0 && rollout.applied == total ? .check : nil)
        let ink = refused > 0 ? Palette.statusFailInk : Palette.inkMuted
        var config = UIButton.Configuration.plain()
        config.contentInsets = .init(top: 0, leading: 8, bottom: 0, trailing: 8)
        config.imagePadding = 5
        config.image = glyph?.image.resized(to: 12)
        config.baseForegroundColor = ink
        config.attributedTitle = AttributedString("\(rollout.applied)/\(total) machines", attributes: TypeScale.typeMeta.container(color: ink))
        config.background.backgroundColor = refused > 0 ? Palette.statusFailBg : Palette.surfaceRecess
        config.background.cornerRadius = Radius.radiusSm
        configuration = config
        accessibilityLabel = "\(what): on \(rollout.applied) of \(total) machines" + (refused > 0 ? ", \(refused) refused" : "")
    }

    private func machineItems() -> [UIMenuElement] {
        let machines = hub.fleet.machines
        guard !machines.isEmpty else {
            return [UIAction(title: "No machines yet", subtitle: "This lands on the first one that registers.", attributes: .disabled) { _ in }]
        }
        let rollout = Rollout.of(scope, name: name, machines: machines)
        return zip(machines, rollout.landings).map { machine, landing in
            let online = machine.status == "online"
            var subtitle = "\(Rollout.said(landing.state)) · \(machineOsLabel(machine.os))\(online ? "" : " · offline")"
            for harness in landing.harnesses {
                subtitle += "\n\(harness.harness): \(Rollout.said(harness.state))\(harness.detail.map { " · \($0)" } ?? "")"
            }
            if landing.state != "failed", let detail = landing.detail { subtitle += "\n\(detail)" }
            switch landing.state {
            case "failed":
                let fault = FleetFault(origin: .machine, scope: scope, key: scope == .memory ? "" : name, machineId: machine.machineId,
                                       harness: nil, detail: landing.detail, cause: .of(landing.detail))
                return UIAction(title: machine.name, subtitle: subtitle, image: Glyph.warning.image.resized(to: 16)) { [weak self] _ in
                    self?.openFault?(FaultGroup([fault]))
                }
            case "applied":
                return UIAction(title: machine.name, subtitle: subtitle, image: Glyph.check.image.resized(to: 16), attributes: .disabled) { _ in }
            default:
                return UIAction(title: "Sync \(machine.name)", subtitle: subtitle, image: Glyph.refresh.image.resized(to: 16),
                                attributes: online ? [] : .disabled) { [weak self] _ in self?.sync(machine) }
            }
        }
    }

    private func sync(_ machine: MachineRow) {
        Task { @MainActor [weak self, hub] in
            do {
                try await hub.configuration.resync(machineId: machine.machineId)
            } catch {
                Toast.error(error.localizedDescription, in: self?.window)
            }
        }
    }
}

/// The faults that belong to one row, as compact alert lines under it
/// (RowFaults.svelte): what broke and where, the rest a tap away.
final class RowFaults: UIStackView {
    init(hub: HubConnection, scope: FaultScope, key: String, onResolved: (() -> Void)? = nil) {
        super.init(frame: .zero)
        axis = .vertical
        spacing = 2
        for group in hub.configuration.faults(scope: scope, key: key, machines: hub.fleet.machines) {
            addArrangedSubview(FleetFaultView(group: group, hub: hub, compact: true, onResolved: onResolved))
        }
        isHidden = arrangedSubviews.isEmpty
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("RowFaults is built in code")
    }
}

/// One fault read in full, pushed over the section it came from: the
/// RolloutChip's popover's fault, on a page of its own.
final class FleetFaultController: UIViewController {
    private let group: FaultGroup
    private let hub: HubConnection

    init(group: FaultGroup, hub: HubConnection) {
        self.group = group
        self.hub = hub
        super.init(nibName: nil, bundle: nil)
        navigationItem.title = group.cause.copy.title
        navigationItem.largeTitleDisplayMode = .never
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("FleetFaultController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        let scroll = UIScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scroll)
        let fault = FleetFaultView(group: group, hub: hub, compact: false)
        scroll.addSubview(fault)
        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: safe.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            fault.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: Space.space2),
            scroll.contentLayoutGuide.bottomAnchor.constraint(equalTo: fault.bottomAnchor, constant: Space.space5),
            fault.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: Space.space5),
            fault.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -Space.space5),
        ])
    }
}
