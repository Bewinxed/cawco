import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

// The pickers the new-session chips open (spawn/MachinesChip, ProjectChip,
// LocationChip + LocationSection, LifetimeChip, PermissionSection,
// EffortPips), each on the dialog's popover.

/// A machine as the chip, its popover and the `@` menu draw it (ns-types.ts `MachineItem`).
struct NsMachine {
    let id: String
    let name: String
    let os: String
    let online: Bool
    let load: String
    let glyph: Glyph
    let hue: UIColor
    /// With a project chosen, where it is on this machine: its folder there,
    /// or "will clone · 340 MB" when Start moves it there first.
    var place: String? = nil
}

/// A project as the chip, its popover and the `@` menu draw it (`ProjectItem`).
struct NsProject {
    let id: String
    let machineId: String
    let name: String
    let path: String
    let hue: UIColor
}

/// The five hues list rows cycle through (NewSessionDialog.svelte `HUES`).
let nsHues = [Palette.hueAmber500, Palette.hueGreen500, Palette.hueCyan400, Palette.hueBlue500, Palette.hueOrange500]

// MARK: Machines

/// Machines (MachinesChip.svelte): multi-select rows, a chosen run of rows
/// joined into one block, then "Connect a machine…", which swaps the list in
/// place for the pairing panel: the install command and a live wait for the
/// machine to check in. Closing the popover cancels pairing.
final class MachinesPopover: NsPopoverController {
    private let hub: HubConnection
    private var machines: [NsMachine]
    private var selected: [String]
    private let onToggle: (String) -> Void
    private var rowsById: [String: NsRow] = [:]
    private var pairing = false
    private var known: Set<String> = []
    private var watch: Timer?

    init(hub: HubConnection, machines: [NsMachine], selected: [String], onToggle: @escaping (String) -> Void) {
        self.hub = hub
        self.machines = machines
        self.selected = selected
        self.onToggle = onToggle
        super.init(width: 320)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        list()
        arrive(from: 0.08, step: 0.045)
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        watch?.invalidate()
    }

    private func clear() {
        rows.arrangedSubviews.forEach { $0.removeFromSuperview() }
        rowsById = [:]
    }

    private func list() {
        clear()
        for machine in machines {
            let content = MachineRowView()
            let presence: MachineRowView.Presence = !machine.online ? .off : (machine.load == "Idle" ? .online : .away)
            content.configure(glyph: machine.glyph, hue: machine.hue, name: machine.name,
                              meta: (machine.os.isEmpty ? "" : "\(machine.os) · ") + machine.load + (machine.place.map { " · \($0)" } ?? ""),
                              presence: presence)
            let row = NsRow(content, label: [machine.name, machine.load, machine.place].compactMap(\.self).joined(separator: ", "))
            // MachinesChip.svelte `.row { height: 44px }`.
            row.heightAnchor.constraint(equalToConstant: Size.cBtnHLg).isActive = true
            row.isEnabled = machine.online
            row.chosen = selected.contains(machine.id)
            row.addAction(UIAction { [weak self] _ in self?.toggle(machine.id) }, for: .touchUpInside)
            rowsById[machine.id] = row
            rows.addArrangedSubview(row)
        }
        if machines.isEmpty {
            rows.addArrangedSubview(Self.note("No machines have checked in.", pad: 14))
        }
        divider()
        let add = NsRow(tile: NsTile(GlyphView(.addCircle, size: 14, tint: Palette.inkMuted), look: .dashed), name: "Connect a machine…", meta: nil, height: 40, check: false)
        add.addAction(UIAction { [weak self] _ in self?.pair() }, for: .touchUpInside)
        rows.addArrangedSubview(add)
        join()
        fit()
    }

    /// A chosen row next to another chosen row squares the corners between them.
    private func join() {
        for (index, machine) in machines.enumerated() {
            guard let row = rowsById[machine.id] else { continue }
            let on = selected.contains(machine.id)
            let above = index > 0 && selected.contains(machines[index - 1].id)
            let below = index < machines.count - 1 && selected.contains(machines[index + 1].id)
            var corners: CACornerMask = []
            if !(on && above) { corners.formUnion([.layerMinXMinYCorner, .layerMaxXMinYCorner]) }
            if !(on && below) { corners.formUnion([.layerMinXMaxYCorner, .layerMaxXMaxYCorner]) }
            row.layer.maskedCorners = corners
        }
    }

    private func toggle(_ id: String) {
        if let at = selected.firstIndex(of: id) { selected.remove(at: at) } else { selected.append(id) }
        rowsById[id]?.chosen = selected.contains(id)
        join()
        onToggle(id)
    }

    static func note(_ text: String, pad: Double, ink: UIColor = Palette.inkSubtle, centred: Bool = true) -> UIView {
        let label = KitLabel(TypeScale.typeMeta, ink: ink, lines: 0)
        label.text = text
        label.textAlignment = centred ? .center : .natural
        label.translatesAutoresizingMaskIntoConstraints = false
        let box = UIView()
        box.addSubview(label)
        NSLayoutConstraint.activate([
            label.topAnchor.constraint(equalTo: box.topAnchor, constant: pad),
            label.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -pad),
            label.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: 8),
            label.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -8),
        ])
        return box
    }

    // The pairing panel (`.pair`): 4pt in, its parts 10pt apart.

    private func pair() {
        pairing = true
        known = Set(hub.fleet.machines.map(\.machineId))
        Task { [weak self] in
            guard let self else { return }
            await JoinState.shared.refresh(hub)
            if pairing { panel() }
        }
        panel()
        watch?.invalidate()
        watch = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.checkIn() }
        }
    }

    private func panel() {
        clear()
        let column = UIStackView()
        column.axis = .vertical
        column.spacing = 10
        column.isLayoutMarginsRelativeArrangement = true
        column.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 4, leading: 4, bottom: 4, trailing: 4)
        let lead = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        lead.text = "Run this on the machine. It appears here as soon as the agent checks in."
        column.addArrangedSubview(lead)
        let state = JoinState.shared
        if let url = state.info?.addresses.first?.url {
            column.addArrangedSubview(CopyBox(text: JoinState.installCommand(url), label: "Install command"))
        } else {
            let line = KitLabel(TypeScale.typeMeta, ink: state.infoError == nil ? Palette.inkMuted : Palette.statusFailInk, lines: 0)
            line.text = state.infoError ?? "Reading this hub's addresses…"
            column.addArrangedSubview(line)
        }
        let waiting = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        waiting.text = "Waiting for check-in…"
        let back = NsButton("Back", size: .sm) { [weak self] in
            self?.pairing = false
            self?.watch?.invalidate()
            self?.list()
        }
        let foot = UIStackView(arrangedSubviews: [waiting, UIView(), back])
        foot.alignment = .center
        column.addArrangedSubview(foot)
        rows.addArrangedSubview(column)
        fit()
    }

    /// A machine checking in ends pairing; its row is then in the list.
    private func checkIn() {
        guard pairing, let joined = hub.fleet.machines.first(where: { !known.contains($0.machineId) }) else { return }
        pairing = false
        watch?.invalidate()
        let at = machines.count
        machines.append(NsMachine(id: joined.machineId, name: joined.hostname, os: joined.os, online: joined.status == "online",
                                  load: "Idle", glyph: MachineHealth.icon(joined.os), hue: MachineHealth.hue(at, online: joined.status == "online")))
        list()
    }
}

// MARK: Project

/// Project (ProjectChip.svelte): pick one, or "New project…", which swaps
/// the list for a name and a path; the path follows the name as
/// `~/code/<slug>` until it is edited.
final class ProjectPopover: NsPopoverController, UITextFieldDelegate {
    private let projects: [NsProject]
    private let projectId: String?
    private let onPick: (NsProject) -> Void
    private let onCreate: (_ name: String, _ path: String) async throws -> Void
    private let name = NsField(glyph: .toolFiles, placeholder: "Project name", mono: false)
    private let path = NsField(glyph: .folder, placeholder: "~/code/project", mono: true)
    private let failure = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk)
    private var create: NsButton!
    private var lastName = ""

    init(projects: [NsProject], projectId: String?, onPick: @escaping (NsProject) -> Void,
         onCreate: @escaping (_ name: String, _ path: String) async throws -> Void) {
        self.projects = projects
        self.projectId = projectId
        self.onPick = onPick
        self.onCreate = onCreate
        super.init(width: 320, gap: 2)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        list()
        arrive()
    }

    private func list() {
        rows.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for project in projects {
            let row = NsRow(tile: NsTile(GlyphView(.toolFiles, size: 16, tint: project.hue), side: 24), name: project.name, meta: project.path)
            // ProjectChip.svelte `.row { height: 44px }`.
            row.heightAnchor.constraint(equalToConstant: Size.cBtnHLg).isActive = true
            row.chosen = project.id == projectId
            row.addAction(UIAction { [weak self] _ in self?.onPick(project) }, for: .touchUpInside)
            rows.addArrangedSubview(row)
        }
        divider()
        let add = NsRow(tile: NsTile(GlyphView(.addCircleSolid, size: 16, tint: Palette.inkMuted), side: 24, look: .dashed), name: "New project…", meta: nil, height: 40, check: false)
        add.addAction(UIAction { [weak self] _ in self?.form() }, for: .touchUpInside)
        rows.addArrangedSubview(add)
        fit()
    }

    private static func slug(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespaces).lowercased().replacing(/\s+/, with: "-")
    }

    private func form() {
        rows.arrangedSubviews.forEach { $0.removeFromSuperview() }
        let column = UIStackView()
        column.axis = .vertical
        column.spacing = 8
        column.isLayoutMarginsRelativeArrangement = true
        column.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 4, leading: 4, bottom: 4, trailing: 4)
        name.field.accessibilityLabel = "Project name"
        path.field.accessibilityLabel = "Project path"
        name.field.addAction(UIAction { [weak self] _ in self?.named() }, for: .editingChanged)
        path.field.addAction(UIAction { [weak self] _ in self?.gate() }, for: .editingChanged)
        failure.lineBreakMode = .byTruncatingTail
        failure.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let back = NsButton("Back", size: .sm) { [weak self] in self?.list() }
        create = NsButton("Create", primary: true, size: .sm) { [weak self] in self?.submit() }
        let actions = UIStackView(arrangedSubviews: [failure, back, create])
        actions.spacing = 6
        actions.alignment = .center
        for view in [name, path, actions] as [UIView] { column.addArrangedSubview(view) }
        column.setCustomSpacing(10, after: path)
        rows.addArrangedSubview(column)
        gate()
        fit()
        name.field.becomeFirstResponder()
    }

    /// The path follows the name until the reader writes one of their own.
    private func named() {
        let typed = name.field.text ?? ""
        let current = path.field.text ?? ""
        if current.isEmpty || current == "~/code/\(Self.slug(lastName))" {
            path.field.text = "~/code/\(Self.slug(typed))"
        }
        lastName = typed
        gate()
    }

    private func gate() {
        let filled = !(name.field.text ?? "").trimmingCharacters(in: .whitespaces).isEmpty && !(path.field.text ?? "").trimmingCharacters(in: .whitespaces).isEmpty
        create?.isEnabled = filled
    }

    private func submit() {
        let named = (name.field.text ?? "").trimmingCharacters(in: .whitespaces)
        let where_ = (path.field.text ?? "").trimmingCharacters(in: .whitespaces)
        create.setPending(true, label: "Creating…")
        failure.text = nil
        Task { [weak self] in
            guard let self else { return }
            do {
                try await onCreate(named, where_)
            } catch {
                failure.text = error.localizedDescription
                create.setPending(false, label: "Creating…")
            }
        }
    }
}

/// `.field` inside a popover: 36pt (44 under a finger), 10pt in, a 16pt
/// subtle glyph, then the input in body type (mono for a path), on the
/// raised surface with the control border, `--radius-md`, the xs shadow.
final class NsField: UIView {
    let field = UITextField()

    init(glyph: Glyph?, placeholder: String, mono: Bool, lead: UIView? = nil) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        boxShadow = Shadow.shadowXs
        let coarse = traitCollection.userInterfaceIdiom != .mac
        let role = TypeScale.typeBody.with(weight: .regular, points: coarse ? 16 : nil, leading: 1.4, family: mono ? FontFamily.fontMono : nil)
        field.font = role.font
        field.textColor = Palette.inkStrong
        field.autocapitalizationType = .none
        field.autocorrectionType = .no
        field.spellCheckingType = .no
        field.attributedPlaceholder = NSAttributedString(string: placeholder, attributes: [.foregroundColor: Palette.inkSubtle, .font: role.font])
        let mark: UIView? = lead ?? glyph.map { GlyphView($0, size: 16, tint: Palette.inkSubtle) }
        let row = UIStackView(arrangedSubviews: [mark, field].compactMap { $0 })
        row.spacing = 8
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: coarse ? 44 : 36),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10),
            row.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: NsField, _: UITraitCollection) in view.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("NsField is built in code") }

    private func paint() {
        layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
    }
}

// MARK: Lifetime

/// Session lifetime (LifetimeChip.svelte): Persistent or Ephemeral, each
/// with what it means; the chip opens both rather than flipping on a tap.
final class LifetimePopover: NsPopoverController {
    static let options: [(ephemeral: Bool, name: String, desc: String, glyph: Glyph, hue: UIColor)] = [
        (false, "Persistent", "Stays on the board after its task, to pick up again.", .database, Palette.hueBlue500),
        (true, "Ephemeral", "A spin-off: ends and clears itself when the task is done.", .fire, Palette.hueOrange500),
    ]

    private let ephemeral: Bool
    private let onPick: (Bool) -> Void

    init(ephemeral: Bool, onPick: @escaping (Bool) -> Void) {
        self.ephemeral = ephemeral
        self.onPick = onPick
        super.init(width: 300, gap: 2)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        for option in Self.options {
            // `.row { min-height: 48px }`, which the phone's `.ns-pop button { min-height: 44px }` outranks.
            let row = NsRow(tile: NsTile(GlyphView(option.glyph, size: 16, tint: option.hue)), name: option.name, meta: option.desc,
                            height: UIScreen.main.bounds.width <= 640 ? Size.cBtnHLg : 48, wraps: true)
            row.chosen = option.ephemeral == ephemeral
            row.addAction(UIAction { [weak self] _ in self?.onPick(option.ephemeral) }, for: .touchUpInside)
            rows.addArrangedSubview(row)
        }
        fit()
        arrive()
    }
}

// MARK: Permission

/// How each permission mode is named, drawn and described
/// (permission-modes.ts, permission-look.ts). The name is the product's;
/// what it does is its harness's, so every description is for one harness.
struct PermissionLook {
    let name: String
    let desc: String
    let glyph: Glyph
    let hue: UIColor

    /// The modes in the order they are offered: from the one that asks the
    /// most to the one that asks the least.
    static let order = ["default", "plan", "acceptEdits", "bypassPermissions", "fullSend"]

    private static let names = [
        "default": "Ask first", "plan": "Plan first", "acceptEdits": "Accept edits",
        "bypassPermissions": "Bypass", "fullSend": "Full Send",
    ]

    /// What each mode does on each harness that has modes (permission-modes.ts `DESCRIPTIONS`).
    private static let descriptions: [String: [String: String]] = [
        "claude": [
            "default": "Reads and allow-listed tools run; others ask.",
            "plan": "Read-only until you approve a plan.",
            "acceptEdits": "File edits run without asking.",
            "bypassPermissions": "Tools run unasked; safety checks still ask.",
            "fullSend": "Bypass, and safety checks are allowed too.",
        ],
        "opencode": [
            "default": "OpenCode's permission asks come to you.",
            "plan": "Runs OpenCode's plan agent.",
            "acceptEdits": "Edit asks are allowed; the rest come to you.",
            "bypassPermissions": "Every permission ask is allowed.",
            "fullSend": "The same as Bypass on OpenCode.",
        ],
    ]

    /// Modes a harness can be in but is not offered, because there they
    /// change nothing: OpenCode's Bypass already allows every ask.
    private static let notOffered = ["opencode": ["fullSend"]]

    static func of(_ mode: String, harness: String?) -> PermissionLook {
        let desc = harness.flatMap { descriptions[$0]?[mode] } ?? ""
        let name = names[mode] ?? mode
        switch mode {
        case "default": return PermissionLook(name: name, desc: desc, glyph: .rules, hue: Palette.hueGreen500)
        case "plan": return PermissionLook(name: name, desc: desc, glyph: .notes, hue: Palette.hueCyan500)
        case "acceptEdits": return PermissionLook(name: name, desc: desc, glyph: .toolWrite, hue: Palette.hueBlue500)
        case "bypassPermissions": return PermissionLook(name: name, desc: desc, glyph: .warning, hue: Palette.hueOrange500)
        // The consequential grant's shield in its warning ink: a wider grant than Bypass.
        case "fullSend": return PermissionLook(name: name, desc: desc, glyph: .shield, hue: Palette.statusAttnInk)
        default: return PermissionLook(name: name, desc: desc, glyph: .rules, hue: Palette.inkSubtle)
        }
    }

    /// The modes a person picks between on `harness`, plus `current` where a
    /// session is already in one that is not offered.
    static func modes(for harness: String, current: String? = nil) -> [String] {
        let described = descriptions[harness] ?? [:]
        let hidden = notOffered[harness] ?? []
        return order.filter { described[$0] != nil && (!hidden.contains($0) || $0 == current) }
    }

    /// Whether the CLI runs in its bypass mode: Bypass, and Full Send on top of it.
    static func bypasses(_ mode: String?) -> Bool {
        mode == "bypassPermissions" || mode == "fullSend"
    }

    /// Where a form's mode goes when the machine cannot honour it: Full Send
    /// to Bypass, anything else to the first mode the machine can.
    static func fallback(_ mode: String, honoured: [String]) -> String? {
        mode == "fullSend" && honoured.contains("bypassPermissions") ? "bypassPermissions" : honoured.first
    }
}

/// Full Send's words, for the harnesses it is offered on (permission-modes.ts `FULL_SEND`).
struct FullSendCopy {
    let confirm: [String]
    let restarts: String
    let warning: String

    static func of(_ harness: String?) -> FullSendCopy? {
        guard harness == "claude" else { return nil }
        return FullSendCopy(
            confirm: [
                "In Bypass, tools run without asking, but Claude Code still stops for its own safety checks and brings them to you: a shell -c script it cannot check, cd combined with git, a write to a protected path. Full Send answers those checks “allow” for you, so such a command runs without anyone seeing it first.",
                "Still comes to you: questions Claude asks, plan approval, and ask rules you set in Claude Code's settings (permissions.ask). Tools your fleet denies still never run.",
                "Use it where changed or lost files can be recovered: committed or backed-up work, or a throwaway workspace.",
            ],
            restarts: "Switching restarts this session in place; its conversation carries over.",
            warning: "Claude Code's safety checks are answered “allow” for you, so a command they would stop runs unseen. Pick Bypass to have them ask you again."
        )
    }
}

/// Permission mode (PermissionSection.svelte, embedded): one row a mode,
/// the chosen one filled and checked; a mode the harness cannot honour is
/// listed, faded and inert. Every pick of Full Send is confirmed first, in
/// the app's one confirm, which says what it allows beyond Bypass and what
/// still stops; only its own button applies it.
final class PermissionPopover: NsPopoverController {
    private let modes: [(value: String, disabled: Bool)]
    private let value: String
    private let harness: String?
    private let restarts: Bool
    private let onPick: (String) -> Void

    init(modes: [(value: String, disabled: Bool)], value: String, harness: String?, restarts: Bool = false,
         onPick: @escaping (String) -> Void) {
        self.modes = modes
        self.value = value
        self.harness = harness
        self.restarts = restarts
        self.onPick = onPick
        super.init(width: 340, gap: 2)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        for mode in modes {
            let look = PermissionLook.of(mode.value, harness: harness)
            let row = NsRow(tile: NsTile(GlyphView(look.glyph, size: 16, tint: look.hue)), name: look.name, meta: look.desc)
            row.chosen = mode.value == value
            row.isEnabled = !mode.disabled
            if mode.disabled { row.accessibilityHint = "This agent cannot honor this permission mode." }
            row.addAction(UIAction { [weak self] _ in self?.pick(mode.value) }, for: .touchUpInside)
            rows.addArrangedSubview(row)
        }
        fit()
        arrive()
    }

    private func pick(_ mode: String) {
        guard mode == "fullSend", value != "fullSend" else {
            onPick(mode)
            return
        }
        // Offered only where it has words: never applied unread.
        guard let copy = FullSendCopy.of(harness) else { return }
        let body = (restarts ? copy.confirm + [copy.restarts] : copy.confirm).joined(separator: "\n\n")
        present(ConfirmDialog(title: "Switch to Full Send?", body: body, confirmLabel: "Switch to Full Send",
                              pendingLabel: "Switching…", grant: true) { [weak self] in
            self?.onPick("fullSend")
        }, animated: true)
    }
}

// MARK: Effort

/// The effort slider (EffortPips.svelte): a 30pt track (38 under a finger)
/// on the raised surface; the fill runs from its start to the level and
/// carries the chip at its end, so the level and its filled track read as
/// one object. The chip is as wide as its longest label and holds one bar a
/// level, lit up to the one it sits on, and the level's word. It snaps to
/// the level nearest the finger; a stop shows as a dot only where it lands
/// in the empty track, clear of the chip.
final class EffortPips: UIControl {
    private let efforts: [String]
    private(set) var index: Int
    private let fill = UIView()
    private let knob = UIView()
    private let word = KitLabel(TypeScale.typeLabel.with(weight: .medium), ink: Palette.inkMuted)
    private var bars: [(rest: UIView, lit: UIView)] = []
    private var pips: [UIView] = []
    private var knobWidth = 0.0
    private var grab = 0.0
    /// The level changed under the finger.
    var onChange: (String) -> Void = { _ in }
    /// The finger let go on a level.
    var onCommit: (String) -> Void = { _ in }

    init(efforts: [String], value: String?) {
        self.efforts = efforts
        index = max(0, value.flatMap { efforts.firstIndex(of: $0) } ?? 0)
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        let coarse = traitCollection.userInterfaceIdiom != .mac
        heightAnchor.constraint(equalToConstant: coarse ? 38 : 30).isActive = true
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        clipsToBounds = true
        fill.backgroundColor = Palette.surfaceRecessDeep
        fill.layer.cornerRadius = Radius.radiusMd - 1
        fill.layer.cornerCurve = .continuous
        fill.isUserInteractionEnabled = false
        addSubview(fill)
        for _ in efforts {
            let pip = UIView()
            pip.backgroundColor = Palette.inkStrong
            pip.layer.cornerRadius = 2.5
            pip.isUserInteractionEnabled = false
            pips.append(pip)
            addSubview(pip)
        }
        knob.backgroundColor = Palette.surfaceLift
        knob.layer.cornerRadius = Radius.radiusSm
        knob.layer.cornerCurve = .continuous
        knob.boxShadow = Shadow.shadowRaised
        knob.layer.borderWidth = 1
        knob.isUserInteractionEnabled = false
        addSubview(knob)
        // One 2pt bar a level, 10pt tall, 4pt on centres.
        let ladder = UIView()
        ladder.translatesAutoresizingMaskIntoConstraints = false
        for i in efforts.indices {
            let rest = UIView(frame: CGRect(x: Double(i) * 4, y: 0, width: 2, height: 10))
            rest.backgroundColor = Palette.inkStrong
            rest.alpha = 0.22
            rest.layer.cornerRadius = 1
            let lit = UIView(frame: rest.frame)
            lit.backgroundColor = Palette.inkStrong
            lit.layer.cornerRadius = 1
            lit.layer.anchorPoint = CGPoint(x: 0.5, y: 1)
            lit.frame = rest.frame
            ladder.addSubview(rest)
            ladder.addSubview(lit)
            bars.append((rest, lit))
        }
        let content = UIStackView(arrangedSubviews: [ladder, word])
        content.spacing = 5
        content.alignment = .center
        content.translatesAutoresizingMaskIntoConstraints = false
        knob.addSubview(content)
        NSLayoutConstraint.activate([
            ladder.widthAnchor.constraint(equalToConstant: Double(efforts.count) * 4 - 2),
            ladder.heightAnchor.constraint(equalToConstant: 10),
            content.centerXAnchor.constraint(equalTo: knob.centerXAnchor),
            content.centerYAnchor.constraint(equalTo: knob.centerYAnchor),
        ])
        // As wide as its longest label, so the rail never moves.
        let widest = efforts.map { ($0.capitalized as NSString).size(withAttributes: [.font: word.role.font]).width }.max() ?? 0
        knobWidth = 16 + Double(efforts.count) * 4 - 2 + 5 + widest.rounded(.up)
        isAccessibilityElement = true
        accessibilityLabel = "Effort"
        accessibilityTraits = .adjustable
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (control: EffortPips, _: UITraitCollection) in control.paint() }
        paint()
        render(animated: false, from: index)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("EffortPips is built in code") }

    private func paint() {
        layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
        knob.layer.borderColor = Palette.neutral8.resolvedColor(with: traitCollection).cgColor
    }

    private var steps: Double { Double(max(1, efforts.count - 1)) }
    /// The chip's width with the fill's 2pt of pad each side.
    private var kw: Double { knobWidth + 4 }
    private var rail: Double { max(1, bounds.width - kw) }

    override func layoutSubviews() {
        super.layoutSubviews()
        place()
    }

    private func place() {
        let f = efforts.count > 1 ? Double(index) / steps : 0
        fill.frame = CGRect(x: 0, y: 0, width: kw + f * rail, height: bounds.height)
        knob.frame = CGRect(x: fill.frame.maxX - 2 - knobWidth, y: 2, width: knobWidth, height: bounds.height - 4)
        for (i, pip) in pips.enumerated() {
            let at = efforts.count > 1 ? Double(i) / steps : 0
            pip.frame = CGRect(x: kw / 2 - 2.5 + at * rail, y: bounds.midY - 2.5, width: 5, height: 5)
            // Only in the empty track, 10pt clear of the chip.
            pip.alpha = Double(i - index) * rail / steps >= kw / 2 + 10 ? 0.3 : 0
        }
    }

    /// Bars fill in order between the level left and the one arrived at, 40ms
    /// apart (a rise climbs, a fall drains from the top), each over `durMorph`.
    private func render(animated: Bool, from: Int) {
        word.text = efforts.indices.contains(index) ? efforts[index].capitalized : "Default"
        accessibilityValue = word.text
        let still = !animated || UIAccessibility.isReduceMotionEnabled || window == nil
        for (i, bar) in bars.enumerated() {
            let lit = i <= index
            var delay = 0.0
            if index > from, i > from, i <= index { delay = Double(i - from - 1) * 0.04 }
            if index < from, i > index, i <= from { delay = Double(from - i) * 0.04 }
            let glow = bar.lit
            let set: @MainActor () -> Void = { glow.transform = lit ? .identity : CGAffineTransform(scaleX: 1, y: 0.001) }
            if still { set() } else { Motion.easeOut.animator(Motion.durMorph, animations: set).startAnimation(afterDelay: delay) }
        }
        if still {
            place()
        } else {
            Motion.easeInOut.animator(Motion.durToggle) { self.place() }.startAnimation()
        }
    }

    private func level(at x: Double) -> Int {
        let f = min(1, max(0, (x - kw / 2) / rail))
        return Int((f * steps).rounded())
    }

    private func move(to next: Int) {
        guard next != index, efforts.indices.contains(next) else { return }
        let from = index
        index = next
        UISelectionFeedbackGenerator().selectionChanged()
        render(animated: true, from: from)
        onChange(efforts[index])
    }

    private func active(_ on: Bool) {
        Motion.easeOut.animator(Motion.durControl) { self.word.ink = on ? Palette.inkStrong : Palette.inkMuted }.startAnimation()
    }

    override func beginTracking(_ touch: UITouch, with _: UIEvent?) -> Bool {
        guard !efforts.isEmpty else { return false }
        let x = touch.location(in: self).x
        // Grabbed by the chip, it moves from where it was held; elsewhere it jumps to the finger.
        grab = knob.frame.contains(CGPoint(x: x, y: knob.frame.midY)) ? knob.frame.midX - x : 0
        active(true)
        move(to: level(at: x + grab))
        return true
    }

    override func continueTracking(_ touch: UITouch, with _: UIEvent?) -> Bool {
        move(to: level(at: touch.location(in: self).x + grab))
        return true
    }

    override func endTracking(_: UITouch?, with _: UIEvent?) {
        active(false)
        if efforts.indices.contains(index) { onCommit(efforts[index]) }
    }

    override func cancelTracking(with _: UIEvent?) {
        active(false)
    }

    override func accessibilityIncrement() { move(to: index + 1); if efforts.indices.contains(index) { onCommit(efforts[index]) } }
    override func accessibilityDecrement() { move(to: index - 1); if efforts.indices.contains(index) { onCommit(efforts[index]) } }
}

/// Effort (ToolChips.svelte `.effort-pop`): the slider alone, 8pt above and 6pt round it.
final class EffortPopover: NsPopoverController {
    private let pips: EffortPips

    init(efforts: [String], value: String?, onChange: @escaping (String) -> Void) {
        pips = EffortPips(efforts: efforts, value: value)
        super.init(width: 300)
        pips.onChange = onChange
        pips.onCommit = { [weak self] level in self?.onCommit(level) }
    }

    /// The finger let go on a level.
    var onCommit: (String) -> Void = { _ in }

    override func viewDidLoad() {
        super.viewDidLoad()
        let box = UIView()
        box.addSubview(pips)
        NSLayoutConstraint.activate([
            pips.topAnchor.constraint(equalTo: box.topAnchor, constant: 8),
            pips.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -6),
            pips.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: 6),
            pips.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -6),
        ])
        rows.addArrangedSubview(box)
        fit()
    }
}
