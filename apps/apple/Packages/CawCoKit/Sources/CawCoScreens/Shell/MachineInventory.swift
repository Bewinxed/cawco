import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// What each machine really has, whoever put it there (MachineInventory.svelte):
/// its MCP servers or its skills, read live, never stored, and anything the
/// fleet does not manage can be adopted into it. A hairline above, then the
/// amber laptop and "On each machine", the note, and a row per machine: its
/// chevron, OS mark and name, and "Show what it has", "Hide" or "Offline" in
/// meta. A machine keeps its row up or down, so nothing under the list
/// moves; it opens only while it is up.
final class MachineInventoryView: UIStackView {
    enum Kind { case mcp, skills }

    private let hub: HubConnection
    private let kind: Kind
    private let list = UIStackView()
    private var machines: [MachineRow] = []
    /// The fleet's own names: one a machine has too is "In the fleet".
    private var taken: [String] = []
    /// Why an adopt was refused, by row.
    private var adoptReason: [String: String] = [:]
    private var open: Set<String> = []
    private var found: [String: Components.Schemas.ConfigInspection] = [:]
    private var reading: Set<String> = []
    private var unread: [String: String] = [:]
    private var busy: Set<String> = []
    private var adoptFailed: Set<String> = []
    private let rule = UIView()
    /// Tells the page its height changed, so it can move what is under it.
    var onResize: () -> Void = {}

    init(hub: HubConnection, kind: Kind = .mcp) {
        self.hub = hub
        self.kind = kind
        super.init(frame: .zero)
        axis = .vertical
        spacing = 8
        rule.backgroundColor = Palette.borderHairline
        rule.translatesAutoresizingMaskIntoConstraints = false
        rule.heightAnchor.constraint(equalToConstant: 1).isActive = true
        addArrangedSubview(rule)
        setCustomSpacing(18, after: rule)
        let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        label.text = Words.Skills.onEachMachine
        label.accessibilityTraits = .header
        let head = UIStackView(arrangedSubviews: [GlyphView(.laptop, size: 16, tint: Palette.hueAmber500), label, UIView()])
        head.spacing = 8
        head.alignment = .center
        addArrangedSubview(head)
        addArrangedSubview(note(Words.Skills.inventoryNote))
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

    func configure(machines next: [MachineRow], taken names: [String] = []) {
        guard next != machines || names != taken else { return }
        machines = next
        taken = names
        render()
    }

    private func render() {
        list.arrangedSubviews.forEach { $0.removeFromSuperview() }
        guard !machines.isEmpty else {
            list.addArrangedSubview(note(Words.Skills.noMachines + Words.Skills.noMachinesAfter))
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
        head.configure(open: isOpen, os: machine.os, host: machine.name,
                       note: isOpen ? Words.Skills.hide : (up ? Words.Skills.showWhatItHas : Words.Skills.offline))
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
            let busyRow = UIStackView(arrangedSubviews: [KitSpinner(side: 16), note(Words.Skills.asking)])
            busyRow.spacing = 8
            busyRow.alignment = .center
            busyRow.accessibilityTraits = .updatesFrequently
            body.addArrangedSubview(busyRow)
        } else if let failure = unread[id] {
            body.addArrangedSubview(KitAlert(failure, tone: .warning))
        } else if let inspection = found[id] {
            switch kind {
            case .mcp where inspection.mcp.isEmpty:
                body.addArrangedSubview(note(Words.Skills.noMcpAtAll))
            case .mcp:
                for row in inspection.mcp {
                    body.addArrangedSubview(entry(name: row.name, scope: row.scope.rawValue, managed: row.managed, shadowedBy: row.shadowedBy?.rawValue,
                                                  description: nil, machine: machine) { [weak self] key in self?.adopt(row, key: key) })
                }
            case .skills where (inspection.skills ?? []).isEmpty:
                body.addArrangedSubview(note(Words.Skills.noSkillsAtAll))
            case .skills:
                for row in inspection.skills ?? [] {
                    body.addArrangedSubview(entry(name: row.name, scope: row.scope.rawValue, managed: row.managed, shadowedBy: nil,
                                                  description: row.description, machine: machine) { [weak self] key in
                        self?.adoptSkill(row.name, machine: machine, key: key)
                    })
                }
            }
        }
        column.addArrangedSubview(body)
        return column
    }

    /// One thing it has: the name in mono meta, its scope, "fleet" when the fleet manages it,
    /// "shadowed by …" when another scope hides it, its description (two lines);
    /// Adopt for one the fleet does not have, "In the fleet" for one it has by that name.
    private func entry(name words: String, scope: String, managed: Bool, shadowedBy: String?, description: String?, machine: MachineRow,
                       adopt: @escaping (String) -> Void) -> UIView {
        let key = "\(machine.machineId):\(scope):\(words)"
        let name = KitLabel(TypeScale.typeCode.with(points: TypeScale.typeMeta.points), ink: Palette.inkStrong)
        name.text = words
        var badges: [UIView] = [name, KitBadge(scope, variant: .outline)]
        if managed { badges.append(KitBadge(Words.Skills.fleetBadge, variant: .secondary)) }
        if let shadowedBy { badges.append(KitBadge(Words.Skills.shadowedBy(scope: shadowedBy), variant: .attn)) }
        let line = UIStackView(arrangedSubviews: badges + [UIView()])
        line.spacing = 6
        line.alignment = .center
        let text = UIStackView(arrangedSubviews: [line])
        text.axis = .vertical
        text.spacing = 2
        if let description, !description.isEmpty {
            let said = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 2)
            said.text = description
            text.addArrangedSubview(said)
        }
        let stack = UIStackView(arrangedSubviews: [text])
        stack.spacing = 8
        stack.alignment = .center
        if !(managed || taken.contains(words)) {
            let adopting = busy.contains(key)
            let button = KitButton.make(adopting ? Words.Skills.adopting : Words.Skills.adopt, variant: .outline, height: .sm) { adopt(key) }
            button.configuration?.showsActivityIndicator = adopting
            button.isEnabled = !adopting
            if adoptFailed.contains(key) { button.configuration?.background.strokeColor = Palette.destructive }
            button.setContentHuggingPriority(.required, for: .horizontal)
            stack.addArrangedSubview(button)
        } else if taken.contains(words), !managed {
            let note = note(Words.Skills.inTheFleet)
            note.setContentHuggingPriority(.required, for: .horizontal)
            stack.addArrangedSubview(note)
        }
        let box = UIStackView(arrangedSubviews: [stack])
        box.axis = .vertical
        box.spacing = 4
        // A refused adopt, on a line of its own under the entry's words.
        if let reason = adoptReason[key] { box.addArrangedSubview(RowFault(reason, again: nil)) }
        box.isLayoutMarginsRelativeArrangement = true
        box.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 8, leading: 10, bottom: 8, trailing: 10)
        box.backgroundColor = Palette.surfaceRecess
        box.layer.cornerRadius = Radius.radiusSm
        box.layer.cornerCurve = .continuous
        return box
    }

    #if DEBUG
    /// The machine's row opened, what it has read, and the skill's Adopt run as its button runs it.
    func probeAdopt(_ name: String, machine: MachineRow) async {
        if !open.contains(machine.machineId) { expand(machine) }
        let end = ContinuousClock.now + .seconds(30)
        while found[machine.machineId] == nil, unread[machine.machineId] == nil, ContinuousClock.now < end {
            try? await Task.sleep(for: .milliseconds(200))
        }
        guard let row = found[machine.machineId]?.skills.first(where: { $0.name == name }) else { return }
        adoptSkill(row.name, machine: machine, key: "\(machine.machineId):\(row.scope.rawValue):\(row.name)")
    }
    #endif

    /// Takes a skill somebody wrote on one machine into the fleet: the hub reads its files off that machine.
    private func adoptSkill(_ name: String, machine: MachineRow, key: String) {
        busy.insert(key)
        adoptFailed.remove(key)
        adoptReason[key] = nil
        render()
        Task { @MainActor [weak self, hub] in
            do {
                try await FleetSkills.adopt(name, machineId: machine.machineId, hub: hub)
            } catch {
                self?.adoptFailed.insert(key)
                self?.adoptReason[key] = CawStore.failureWords(error)
            }
            self?.busy.remove(key)
            self?.render()
        }
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
                case let .undocumented(code, payload):
                    let said = await Wire.words(payload.body)
                    self?.unread[id] = said.map { "Could not read what this machine has — \($0)" }
                        ?? "Could not read what this machine has — the hub answered \(code)."
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
        case .unprocessableContent: 422
        case .internalServerError: 500
        case .serviceUnavailable: 503
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
                case let .undocumented(code, payload):
                    let said = await Wire.words(payload.body)
                    throw AdoptError(message: "Could not save \(row.name) — \(said ?? "the hub answered \(code).")")
                case .badRequest:
                    throw AdoptError(message: "Could not save \(row.name) — the hub answered 400.")
                case .notFound:
                    throw AdoptError(message: "Could not save \(row.name) — the hub answered 404.")
                case let .unprocessableContent(refused):
                    let said = (try? refused.body.applicationProblemJson).flatMap { Wire.words(problem: $0) }
                    throw AdoptError(message: "Could not save \(row.name) — \(said ?? "the hub answered 422.")")
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
