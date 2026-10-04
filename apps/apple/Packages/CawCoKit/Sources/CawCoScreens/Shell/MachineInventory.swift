import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// What each machine really has, whoever put it there (MachineInventory.svelte,
/// `kind="mcp"` as the project page uses it): read live, never stored, and
/// anything the fleet does not manage can be adopted into it. A hairline
/// above, then the amber laptop and "On each machine", the note, and a row
/// per machine: its chevron, OS mark and name, and "Show what it has",
/// "Hide" or "Offline" in meta. A machine keeps its row up or down, so
/// nothing under the list moves; it opens only while it is up.
final class MachineInventoryView: UIStackView {
    private let hub: HubConnection
    private let list = UIStackView()
    private var machines: [MachineRow] = []
    private var open: Set<String> = []
    private var found: [String: Components.Schemas.ConfigInspection] = [:]
    private var reading: Set<String> = []
    private var unread: [String: String] = [:]
    private var busy: Set<String> = []
    private var adoptFailed: Set<String> = []
    private let rule = UIView()
    /// Tells the page its height changed, so it can move what is under it.
    var onResize: () -> Void = {}

    init(hub: HubConnection) {
        self.hub = hub
        super.init(frame: .zero)
        axis = .vertical
        spacing = 8
        rule.backgroundColor = Palette.borderHairline
        rule.translatesAutoresizingMaskIntoConstraints = false
        rule.heightAnchor.constraint(equalToConstant: 1).isActive = true
        addArrangedSubview(rule)
        setCustomSpacing(18, after: rule)
        let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        label.text = "On each machine"
        label.accessibilityTraits = .header
        let head = UIStackView(arrangedSubviews: [GlyphView(.laptop, size: 16, tint: Palette.hueAmber500), label, UIView()])
        head.spacing = 8
        head.alignment = .center
        addArrangedSubview(head)
        addArrangedSubview(note("What each machine really has, whoever put it there — read live, never stored. Anything the fleet does not manage can be adopted into it."))
        list.axis = .vertical
        list.spacing = 2
        addArrangedSubview(list)
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("MachineInventoryView is built in code")
    }

    private func note(_ text: String) -> KitLabel {
        let label = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        label.text = text
        label.wrap = .pretty
        return label
    }

    func configure(machines next: [MachineRow]) {
        machines = next
        render()
    }

    private func render() {
        list.arrangedSubviews.forEach { $0.removeFromSuperview() }
        guard !machines.isEmpty else {
            list.addArrangedSubview(note("No machine is registered to ask."))
            return
        }
        for machine in machines {
            list.addArrangedSubview(row(machine))
        }
        onResize()
    }

    private func row(_ machine: MachineRow) -> UIView {
        let id = machine.machineId
        let isOpen = open.contains(id)
        let up = machine.status == "online"
        let head = InventoryHead()
        head.configure(open: isOpen, os: machine.os, host: Naming.machineLabel(machine.hostname),
                       note: isOpen ? "Hide" : (up ? "Show what it has" : "Offline"))
        head.isEnabled = up || isOpen
        head.addAction(UIAction { [weak self] _ in self?.expand(machine) }, for: .primaryActionTriggered)
        let column = UIStackView(arrangedSubviews: [head])
        column.axis = .vertical
        column.spacing = 6
        guard isOpen else { return column }
        let body = UIStackView()
        body.axis = .vertical
        body.spacing = 2
        body.isLayoutMarginsRelativeArrangement = true
        body.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 8, bottom: 6, trailing: 8)
        if reading.contains(id) {
            let busyRow = UIStackView(arrangedSubviews: [KitSpinner(side: 16), note("Asking this machine…")])
            busyRow.spacing = 8
            busyRow.alignment = .center
            busyRow.accessibilityTraits = .updatesFrequently
            body.addArrangedSubview(busyRow)
        } else if let failure = unread[id] {
            body.addArrangedSubview(KitAlert(failure, tone: .warning))
        } else if let inspection = found[id], inspection.mcp.isEmpty {
            body.addArrangedSubview(note("This machine has no MCP servers at all."))
        } else if let inspection = found[id] {
            for entry in inspection.mcp { body.addArrangedSubview(self.entry(entry, machine: machine)) }
        }
        column.addArrangedSubview(body)
        return column
    }

    /// One server it has: the name in mono meta, its scope, "fleet" when the fleet manages it,
    /// "shadowed by …" when another scope hides it; Adopt for one the fleet does not have.
    private func entry(_ row: Components.Schemas.DiscoveredMcp, machine: MachineRow) -> UIView {
        let key = "\(machine.machineId):\(row.scope.rawValue):\(row.name)"
        let name = KitLabel(TypeScale.typeCode.with(points: TypeScale.typeMeta.points), ink: Palette.inkStrong)
        name.text = row.name
        var badges: [UIView] = [name, KitBadge(row.scope.rawValue, variant: .outline)]
        if row.managed { badges.append(KitBadge("fleet", variant: .secondary)) }
        if let shadow = row.shadowedBy?.rawValue { badges.append(KitBadge("shadowed by \(shadow)", variant: .attn)) }
        let line = UIStackView(arrangedSubviews: badges + [UIView()])
        line.spacing = 6
        line.alignment = .center
        let stack = UIStackView(arrangedSubviews: [line])
        stack.spacing = 8
        stack.alignment = .center
        if !row.managed {
            let adopting = busy.contains(key)
            let adopt = KitButton.make(adopting ? "Adopting…" : "Adopt", variant: .outline, height: .sm) { [weak self] in
                self?.adopt(row, key: key)
            }
            adopt.configuration?.showsActivityIndicator = adopting
            adopt.isEnabled = !adopting
            if adoptFailed.contains(key) { adopt.configuration?.background.strokeColor = Palette.destructive }
            stack.addArrangedSubview(adopt)
        }
        stack.isLayoutMarginsRelativeArrangement = true
        stack.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 8, leading: 10, bottom: 8, trailing: 10)
        stack.backgroundColor = Palette.surfaceRecess
        stack.layer.cornerRadius = Radius.radiusSm
        stack.layer.cornerCurve = .continuous
        return stack
    }

    private func expand(_ machine: MachineRow) {
        let id = machine.machineId
        if open.contains(id) { open.remove(id) } else { open.insert(id) }
        guard open.contains(id), found[id] == nil, !reading.contains(id) else { return render() }
        reading.insert(id)
        unread[id] = nil
        render()
        Task { @MainActor [weak self, hub] in
            defer {
                self?.reading.remove(id)
                self?.render()
            }
            do {
                let response = try await hub.api.machines.inspect(.init(path: .init(machineId: id), body: .json(.init())))
                switch response {
                case let .ok(ok): self?.found[id] = try ok.body.json
                default: self?.unread[id] = "Could not read what this machine has — the hub answered \(Self.status(response))."
                }
            } catch {
                self?.unread[id] = "Could not read what this machine has — \(error.localizedDescription)."
            }
        }
    }

    private static func status(_ response: Operations.PostApiAgentsByMachineIdInspect.Output) -> Int {
        switch response {
        case .ok: 200
        case .notFound: 404
        case .unprocessableContent: 422
        case .internalServerError: 500
        case .gatewayTimeout: 504
        case let .undocumented(code, _): code
        }
    }

    /// Takes a server into the fleet, so every machine gets it (`saveMcpServer(name, config, true)`).
    private func adopt(_ row: Components.Schemas.DiscoveredMcp, key: String) {
        busy.insert(key)
        adoptFailed.remove(key)
        render()
        Task { @MainActor [weak self, hub] in
            do {
                let config = try JSONDecoder().decode(Operations.PutApiFleetMcpByName.Input.Body.JsonPayload.self,
                                                      from: JSONEncoder().encode(Adoption(config: row.config, enabled: true)))
                let response = try await hub.api.fleet.putMCP(.init(path: .init(name: row.name), body: .json(config)))
                switch response {
                case .ok:
                    break
                case let .undocumented(code, _):
                    throw AdoptError(message: "Could not save \(row.name) — the hub answered \(code).")
                case .badRequest:
                    throw AdoptError(message: "Could not save \(row.name) — the hub answered 400.")
                case .notFound:
                    throw AdoptError(message: "Could not save \(row.name) — the hub answered 404.")
                case .unprocessableContent:
                    throw AdoptError(message: "Could not save \(row.name) — the hub answered 422.")
                }
                Toast.success("\(row.name) is the fleet's now — every machine gets it.", in: self)
            } catch {
                self?.adoptFailed.insert(key)
                Toast.error(error.localizedDescription, in: self)
            }
            self?.busy.remove(key)
            self?.render()
        }
    }

    private struct Adoption: Encodable {
        let config: Components.Schemas.FleetMcpConfig
        let enabled: Bool
    }

    private struct AdoptError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }
}

/// A machine's row in the inventory (`.head`): 44pt, 6pt by 8pt in,
/// `--radius-sm`, the chevron, the OS mark and the name in label type, and
/// what a tap does in muted meta; it tints while pressed.
private final class InventoryHead: TapControl {
    private let chevron = GlyphView(.chevronRight, size: 16, tint: Palette.inkMuted)
    private let mark = GlyphView(.server, size: 16, tint: Palette.inkMuted)
    private let host = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let said = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)

    override init(frame: CGRect) {
        super.init(frame: frame)
        layer.cornerRadius = Radius.radiusSm
        let row = UIStackView(arrangedSubviews: [chevron, mark, host, said, UIView()])
        row.spacing = 8
        row.alignment = .center
        row.isUserInteractionEnabled = false
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
            row.topAnchor.constraint(equalTo: topAnchor, constant: 6),
            row.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -6),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
        ])
        isAccessibilityElement = true
        accessibilityTraits = .button
    }

    func configure(open: Bool, os: String, host name: String, note: String) {
        chevron.glyph = open ? .chevronDown : .chevronRight
        mark.glyph = Glyph.os(os)
        host.text = name
        said.text = note
        accessibilityLabel = name
        accessibilityValue = note
        accessibilityTraits = open ? [.button, .selected] : .button
    }

    override var isEnabled: Bool {
        didSet { alpha = isEnabled ? 1 : 0.5 }
    }

    override var isHighlighted: Bool {
        didSet { backgroundColor = isHighlighted ? Palette.surfaceFill : .clear }
    }
}
