import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// Configure › Updates (routes/config/updates/+page.svelte): the builds the
/// fleet runs and when machines install them. The channel is one choice for
/// the whole fleet; each machine's row says what it is doing from the update
/// state it reports on the socket.
///
/// The web's two channel cards are a two-segment control here (HIG
/// Segmented controls), the chosen channel's card under it. Every step
/// stays where it was asked for (The Stay In Context Rule): a switch of
/// channel names the machines it moves before it is pressed and shows the
/// fleet following it only once the hub has it; Install now and Cancel draw
/// their progress on the machine's row from the hub's state; "Update N
/// machines" names them first; and a refusal stays on its row or control
/// with Try again, never as a toast.
final class UpdatesSectionController: ConfigSectionController {
    private typealias Channel = Components.Schemas.BinaryUpdatePolicyChannel

    // Channel
    private let segments = KitSegmented(["Stable", "Nightly"], selected: 0)
    private lazy var switchButton = KitButton.make("Switch", variant: .action, height: .sm) { [weak self] in self?.switchChannel() }
    private let channelText = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private let releaseText = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let follows = UIStackView()
    private let followsText = KitLabel(TypeScale.typeMeta, ink: Palette.inkStrong)
    private let pending = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private let switchProblem = Problem()
    private let notesButton = UIButton(configuration: .plain())
    private let notes = ReleaseNotesView()
    private var notesOpen = false

    // Machines
    private lazy var checkButton = KitButton.make("Check for updates", variant: .outline, height: .sm) { [weak self] in self?.check() }
    private let checkProblem = Problem()
    private let auto = SwitchField(label: "Install updates automatically")
    private let autoProblem = Problem()
    private lazy var updateAll = KitButton.make("Update machines", glyph: .download, variant: .action, height: .sm) { [weak self] in self?.installAll() }
    private let updateAllNames = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private let matrix = UIStackView()
    private var rows: [String: MachineUpdateRow] = [:]
    private lazy var noMachines = KitEmptyState(
        icon: .laptop, title: "No machines yet",
        line: "Builds install on your own machines, and none has joined this hub. Add one and it reports what it runs.",
        action: KitButton.make("Add machine", glyph: .server, variant: .action) { [weak self] in
            guard let self else { return }
            present(AddMachineController(hub: hub), animated: true)
        }
    )

    /// The channel the person picked; the policy's own until they pick.
    private var chosen: Channel?
    private var switching = false
    /// The tick the switch holds after the hub took it, before it leaves.
    private var holding = false
    private var checking = false
    // Reset of a damaged policy record.
    private lazy var resetButton = KitButton.make("Reset", variant: .action, height: .sm) { [weak self] in self?.resetPolicy() }
    private var resetting = false
    private var resetShown = false
    /// What the hub said when it did not take the Reset.
    private var resetProblem: String?
    /// Auto-update on its way to the hub.
    private var autoSending: Bool?
    /// Cancels asked for whose machine still reports `ready`.
    private var cancelling: Set<String> = []
    /// Landings drawn on this page, acknowledged once it has drawn them.
    private var landings: [String] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        segments.accessibilityLabel = "Channel"
        segments.accessibilityIdentifier = "updates.channel"
        segments.addAction(UIAction { [weak self] _ in
            guard let self, let index = segments.selectedIndex else { return }
            chosen = index == 1 ? .nightly : .stable
            switchProblem.set(nil)
            requestRefresh()
        }, for: .valueChanged)
        switchButton.accessibilityIdentifier = "updates.switch"
        switchProblem.onRetry = { [weak self] in self?.switchChannel() }

        let channelHeader = nsSectionHeader(.download, hue: Palette.hueBlue500, "Channel")
        followsText.accessibilityIdentifier = "updates.follows"
        follows.spacing = 8
        follows.alignment = .center
        follows.addArrangedSubview(GlyphView(.passed, size: 16, tint: Palette.statusLiveGlyph))
        follows.addArrangedSubview(followsText)
        releaseText.font = TypeScale.typeCode.font
        let card = UIStackView(arrangedSubviews: [channelText, releaseText, follows])
        card.axis = .vertical
        card.spacing = Space.space2
        card.isLayoutMarginsRelativeArrangement = true
        card.directionalLayoutMargins = .init(top: Space.space4, leading: Space.space4, bottom: Space.space4, trailing: Space.space4)
        card.layer.borderWidth = 1
        card.layer.borderColor = Palette.borderControl.cgColor
        card.layer.cornerRadius = Radius.radiusMd
        card.layer.cornerCurve = .continuous
        pending.wrap = .pretty
        pending.accessibilityTraits = .updatesFrequently
        var notesConfig = UIButton.Configuration.plain()
        notesConfig.image = Glyph.chevronRight.image.resized(to: 12)
        notesConfig.imagePadding = Space.space1
        notesConfig.contentInsets = .init(top: 4, leading: 0, bottom: 4, trailing: 0)
        notesConfig.baseForegroundColor = Palette.inkMuted
        notesButton.configuration = notesConfig
        notesButton.contentHorizontalAlignment = .leading
        notesButton.addAction(UIAction { [weak self] _ in self?.toggleNotes() }, for: .primaryActionTriggered)
        notes.isHidden = true
        // The switch stands under what it will do, where the decision is read.
        let switchRow = row(switchButton)
        let channelGroup = UIStackView(arrangedSubviews: [channelHeader, row(segments), card, pending, switchRow, switchProblem, notesButton, notes])
        channelGroup.axis = .vertical
        channelGroup.spacing = 8

        let machinesHeader = nsSectionHeader(.monitor, hue: Palette.hueGreen500, "Machines") as! UIStackView
        machinesHeader.addArrangedSubview(checkButton)
        checkProblem.onRetry = { [weak self] in self?.check() }
        auto.toggle.accessibilityIdentifier = "updates.auto"
        auto.onChange = { [weak self] on in self?.setAuto(on) }
        autoProblem.onRetry = { [weak self] in
            guard let self, let next = autoSending ?? hub.fleet.updatePolicy.map({ !$0.autoUpdate }) else { return }
            setAuto(next)
        }
        updateAll.accessibilityIdentifier = "updates.updateAll"
        updateAllNames.wrap = .pretty
        let all = UIStackView(arrangedSubviews: [row(updateAll), updateAllNames])
        all.axis = .vertical
        all.spacing = 4
        matrix.axis = .vertical
        matrix.layer.cornerRadius = Radius.radiusMd
        matrix.layer.cornerCurve = .continuous
        matrix.layer.borderWidth = 1
        matrix.layer.borderColor = Palette.borderHairline.cgColor
        matrix.clipsToBounds = true
        matrix.accessibilityIdentifier = "updates.machines"
        let machinesGroup = UIStackView(arrangedSubviews: [machinesHeader, checkProblem, auto, autoProblem, all, matrix, noMachines])
        machinesGroup.axis = .vertical
        machinesGroup.spacing = 8
        machinesGroup.setCustomSpacing(Space.space4, after: autoProblem)

        // `.group + .group`: 18pt under a hairline.
        let rule = UIView()
        rule.backgroundColor = Palette.borderHairline
        rule.heightAnchor.constraint(equalToConstant: 1).isActive = true
        let page = UIStackView(arrangedSubviews: [channelGroup, rule, machinesGroup])
        page.axis = .vertical
        page.spacing = 18
        setContent([page])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (controller: UpdatesSectionController, _: UITraitCollection) in
            card.layer.borderColor = Palette.borderControl.resolvedColor(with: controller.traitCollection).cgColor
            controller.matrix.layer.borderColor = Palette.borderHairline.resolvedColor(with: controller.traitCollection).cgColor
        }
    }

    private func row(_ view: UIView) -> UIStackView {
        let row = UIStackView(arrangedSubviews: [view, UIView()])
        row.alignment = .center
        return row
    }

    override func viewIsAppearing(_ animated: Bool) {
        super.viewIsAppearing(animated)
        Task { await hub.readUpdateChannels() }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let wide = view.bounds.width >= 640
        for row in rows.values { row.wide = wide }
    }

    // MARK: Drawing

    override func refreshContent() {
        let fleet = hub.fleet
        ready = fleet.updatePolicy != nil
        problem = fleet.updatePolicy == nil ? (resetProblem ?? fleet.updatePolicyProblem) : nil
        // A damaged policy record: the hub's words above, Reset in the header.
        resetButton.configuration?.showsActivityIndicator = resetting
        resetButton.isEnabled = !resetting
        if fleet.updatePolicyDamaged != resetShown {
            resetShown = fleet.updatePolicyDamaged
            setActions(resetShown ? [resetButton] : [])
        }
        guard let policy = fleet.updatePolicy else { return }
        let machines = UpdateRows.ordered(fleet.machines)
        drawChannel(policy, channels: fleet.updateChannels, machines: machines)
        drawMachines(policy, machines: machines, commanded: fleet.commanded)
        landings = fleet.noticesKnown ? UpdateRows.landingIds(machines).filter { !fleet.noticesSeen.contains($0) } : []
    }

    override func drawContent() {
        // A person on this page has seen what landed: acknowledged for every device.
        if view.window != nil, !landings.isEmpty { hub.acknowledge(notices: landings) }
    }

    private static func name(_ channel: Channel) -> String { channel == .nightly ? "Nightly" : "Stable" }

    private func drawChannel(_ policy: Components.Schemas.BinaryUpdatePolicy, channels: Components.Schemas.BinaryUpdateChannels?, machines: [MachineRow]) {
        let current = policy.channel
        let chosen = chosen ?? current
        segments.select(chosen == .nightly ? 1 : 0, animated: view.window != nil)
        channelText.text = chosen == .nightly
            ? "Every build of main. The newest work, less tested."
            : "Tagged releases. Each one ran as a Nightly build first."
        let release = chosen == .nightly ? channels?.channels.nightly : channels?.channels.stable
        releaseText.text = channels == nil ? "—" : release.map { UpdateRows.displayVersion($0.version) } ?? "No release yet"
        releaseText.ink = release == nil ? Palette.inkMuted : Palette.inkStrong
        // The fleet follows a channel once the hub has it, never at the press.
        followsText.text = "The fleet follows \(Self.name(current))"
        follows.isHidden = chosen != current

        let differs = chosen != current
        KitButton.setTitle(switching ? "Switching…" : holding ? "Switched" : "Switch to \(Self.name(chosen))", of: switchButton, variant: .action, height: .sm)
        switchButton.configuration?.showsActivityIndicator = switching
        switchButton.configuration?.image = holding ? Glyph.check.image.resized(to: 16) : nil
        switchButton.superview?.isHidden = !(differs || switching || holding)
        switchButton.isEnabled = hub.writesBlocked == nil && !switching
        switchButton.accessibilityHint = hub.writesBlocked

        // What the switch will do, and to which machines, said before it is pressed.
        var said = ""
        if differs {
            let online = machines.filter { $0.status == "online" && $0.binaryUpdate != nil }.map(\.name)
            if channels != nil, release == nil {
                said = "\(Self.name(chosen)) has no release yet. Machines keep the build they run."
            } else if chosen == .nightly {
                said = policy.autoUpdate
                    ? "Switching moves each machine to Nightly's latest build once its work in flight ends."
                    : "Switching moves each machine to Nightly's latest build when you install it."
            } else {
                said = "Switching keeps each machine on the build it runs until Stable has a newer one."
            }
            if !online.isEmpty { said += " Machines: \(online.joined(separator: ", "))." }
        }
        pending.text = said
        pending.isHidden = said.isEmpty

        let lines = UpdateRows.notes(release?.notes)
        notesButton.isHidden = lines.isEmpty
        if let release, !lines.isEmpty {
            notesButton.configuration?.attributedTitle = AttributedString("What's new in \(UpdateRows.displayVersion(release.version))",
                                                                          attributes: TypeScale.typeLabel.container(color: Palette.inkMuted))
            notes.set(lines)
        }
        if lines.isEmpty, notesOpen { toggleNotes() }
    }

    private func drawMachines(_ policy: Components.Schemas.BinaryUpdatePolicy, machines: [MachineRow], commanded: Set<String>) {
        KitButton.setTitle(checking ? "Checking…" : "Check for updates", of: checkButton, variant: .outline, height: .sm)
        checkButton.configuration?.showsActivityIndicator = checking
        checkButton.isEnabled = !checking

        let on = autoSending ?? policy.autoUpdate
        auto.set(on: on, hint: on
            ? "Each machine installs a new build once its work in flight ends, within 30 minutes. Turns keep running through it."
            : "Off — a new build waits until you install it.", enabled: autoSending == nil && hub.writesBlocked == nil)

        // What "Update N machines" touches, named before it is pressed.
        let waiting = UpdateRows.installable(machines, policy: policy).filter { !commanded.contains($0.machineId) }
        updateAll.superview?.superview?.isHidden = waiting.count < 2
        KitButton.setTitle("Update \(waiting.count) machines", of: updateAll, variant: .action, height: .sm)
        updateAll.isEnabled = hub.writesBlocked == nil
        updateAllNames.text = "Installs on \(waiting.map(\.name).joined(separator: ", ")), the hub's own machine last."

        noMachines.isHidden = !machines.isEmpty
        matrix.isHidden = machines.isEmpty
        let ids = Set(machines.map(\.machineId))
        for (id, row) in rows where !ids.contains(id) {
            rows[id] = nil
            row.removeFromSuperview()
        }
        cancelling = cancelling.filter { id in machines.first { $0.machineId == id }.map { UpdateRows.cell($0, policy: policy).row == 7 } ?? false }
        for (index, machine) in machines.enumerated() {
            let row = rows[machine.machineId] ?? makeRow(machine.machineId)
            rows[machine.machineId] = row
            if matrix.arrangedSubviews.firstIndex(of: row) != index {
                row.removeFromSuperview()
                matrix.insertArrangedSubview(row, at: min(index, matrix.arrangedSubviews.count))
            }
            let cell = UpdateRows.cell(machine, policy: policy)
            // Asked and not yet moving: the row says so until the machine reports.
            let asking = commanded.contains(machine.machineId) && (cell.row == 11 || cell.row == 3)
            row.draw(machine, cell: cell, current: UpdateRows.isCurrent(machine), running: UpdateRows.running(machine),
                     asking: asking, cancelling: cancelling.contains(machine.machineId), refusal: hub.updateRefused[machine.machineId], first: index == 0)
            row.wide = view.bounds.width >= 640
        }
    }

    private func makeRow(_ id: String) -> MachineUpdateRow {
        let row = MachineUpdateRow()
        row.onInstall = { [weak self] in self?.install([id]) }
        row.onCancel = { [weak self] in
            guard let self else { return }
            cancelling.insert(id)
            hub.cancelUpdate(machineId: id)
            requestRefresh()
        }
        return row
    }

    // MARK: Steps

    private func switchChannel() {
        guard let policy = hub.fleet.updatePolicy, let chosen, chosen != policy.channel, !switching else { return }
        switching = true
        switchProblem.set(nil)
        requestRefresh()
        Task { @MainActor [weak self, hub] in
            let ok = await hub.saveUpdatePolicy(channel: chosen, autoUpdate: policy.autoUpdate)
            guard let self else { return }
            switching = false
            if ok {
                self.chosen = nil
                holding = true
                requestRefresh()
                try? await Task.sleep(for: .seconds(Motion.durHold))
                holding = false
            } else {
                switchProblem.set("Couldn't switch to \(Self.name(chosen)). Nothing changed.")
            }
            requestRefresh()
        }
    }

    private func setAuto(_ next: Bool) {
        guard let policy = hub.fleet.updatePolicy, autoSending == nil else { return }
        autoSending = next
        autoProblem.set(nil)
        requestRefresh()
        Task { @MainActor [weak self, hub] in
            let ok = await hub.saveUpdatePolicy(channel: policy.channel, autoUpdate: next)
            guard let self else { return }
            autoSending = nil
            // A refused save shows the stored value again, and says so where it was asked.
            if !ok { autoProblem.set("Couldn't turn automatic updates \(next ? "on" : "off"). Nothing changed.") }
            requestRefresh()
        }
    }

    /// Reset of a damaged policy record: the hub writes a fresh one and the
    /// section reads it; a refusal stays above the rows, in the hub's words.
    private func resetPolicy() {
        guard !resetting else { return }
        resetting = true
        resetProblem = nil
        requestRefresh()
        Task { @MainActor [weak self, hub] in
            let refused = await hub.resetUpdatePolicy()
            guard let self else { return }
            resetting = false
            resetProblem = refused
            requestRefresh()
        }
    }

    private func check() {
        guard !checking else { return }
        checking = true
        checkProblem.set(nil)
        requestRefresh()
        Task { @MainActor [weak self, hub] in
            let ok = await hub.checkUpdateChannels()
            guard let self else { return }
            checking = false
            if !ok { checkProblem.set("Couldn't reach the release server. Machines keep the build they run.") }
            requestRefresh()
        }
    }

    /// Installs on each machine; a refusal stays on the row of the machine that refused.
    private func install(_ ids: [String]) {
        let hosts = { (id: String) in self.hub.fleet.machines.first { $0.machineId == id }?.binaryUpdate?.hostsHub == true }
        // The hub's own machine last: its restart takes the hub with it.
        for id in ids.filter({ !hosts($0) }) + ids.filter(hosts) {
            hub.installUpdate(machineId: id)
        }
        requestRefresh()
    }

    private func installAll() {
        guard let policy = hub.fleet.updatePolicy else { return }
        let waiting = UpdateRows.installable(hub.fleet.machines, policy: policy).filter { !hub.fleet.commanded.contains($0.machineId) }
        install(waiting.map(\.machineId))
    }

    private func toggleNotes() {
        notesOpen.toggle()
        let open = notesOpen
        Motion.easeOut.animator(UIAccessibility.isReduceMotionEnabled ? 0 : (open ? Motion.durPop : Motion.durExit)) {
            self.notesButton.imageView?.transform = open ? CGAffineTransform(rotationAngle: .pi / 2) : .identity
            self.notes.isHidden = !open
            self.notes.alpha = open ? 1 : 0
            self.view.layoutIfNeeded()
        }.startAnimation()
        notesButton.accessibilityValue = open ? "Expanded" : "Collapsed"
    }
}

/// A refusal kept where it was asked for, with Try again beside it.
private final class Problem: UIStackView {
    private let words = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)
    private lazy var retry = KitButton.make("Try again", variant: .ghost, height: .xs) { [weak self] in self?.onRetry?() }
    var onRetry: (() -> Void)?

    init() {
        super.init(frame: .zero)
        spacing = Space.space2
        alignment = .center
        addArrangedSubview(words)
        addArrangedSubview(retry)
        addArrangedSubview(UIView())
        isHidden = true
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("Problem is built in code")
    }

    func set(_ text: String?) {
        words.text = text
        isHidden = text == nil
        if let text { UIAccessibility.post(notification: .announcement, argument: text) }
    }
}

/// One machine's row of the Updates matrix (UpdateTable.svelte): Machine,
/// Running and Update side by side; under 640pt the board's two-line card,
/// name and version, then the Update cell. An offline machine stands at half
/// opacity.
private final class MachineUpdateRow: UIView {
    var onInstall: (() -> Void)?
    var onCancel: (() -> Void)?
    var wide = true { didSet { if wide != oldValue { place() } } }

    private let os = GlyphView(.server, size: 16, tint: Palette.inkMuted)
    private let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let dot = UIView()
    private let osLine = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
    private let currentMark = GlyphView(.check, size: 16, tint: Palette.success)
    private let version = KitLabel(TypeScale.typeCode, ink: Palette.inkStrong)
    private let cell = UpdateCellView()
    private let machineColumn = UIStackView()
    private let runningColumn = UIStackView()
    private let grid = UIStackView()
    private let topLine = UIStackView()
    private let hairline = UIView()

    init() {
        super.init(frame: .zero)
        backgroundColor = Palette.surfaceRaised
        dot.translatesAutoresizingMaskIntoConstraints = false
        dot.layer.cornerRadius = 4
        NSLayoutConstraint.activate([dot.widthAnchor.constraint(equalToConstant: 8), dot.heightAnchor.constraint(equalToConstant: 8)])
        let nameLine = UIStackView(arrangedSubviews: [name, dot])
        nameLine.spacing = Space.space2
        nameLine.alignment = .center
        let words = UIStackView(arrangedSubviews: [nameLine, osLine])
        words.axis = .vertical
        machineColumn.addArrangedSubview(os)
        machineColumn.addArrangedSubview(words)
        machineColumn.spacing = Space.space2
        machineColumn.alignment = .center
        runningColumn.addArrangedSubview(currentMark)
        runningColumn.addArrangedSubview(version)
        runningColumn.spacing = Space.space1
        runningColumn.alignment = .center
        runningColumn.setContentHuggingPriority(.required, for: .horizontal)
        cell.onInstall = { [weak self] in self?.onInstall?() }
        cell.onCancel = { [weak self] in self?.onCancel?() }
        grid.translatesAutoresizingMaskIntoConstraints = false
        grid.isLayoutMarginsRelativeArrangement = true
        grid.directionalLayoutMargins = .init(top: Space.space2, leading: Space.space4, bottom: Space.space2, trailing: Space.space4)
        addSubview(grid)
        hairline.backgroundColor = Palette.borderHairline
        hairline.translatesAutoresizingMaskIntoConstraints = false
        addSubview(hairline)
        NSLayoutConstraint.activate([
            grid.topAnchor.constraint(equalTo: topAnchor),
            grid.bottomAnchor.constraint(equalTo: bottomAnchor),
            grid.leadingAnchor.constraint(equalTo: leadingAnchor),
            grid.trailingAnchor.constraint(equalTo: trailingAnchor),
            hairline.topAnchor.constraint(equalTo: topAnchor),
            hairline.leadingAnchor.constraint(equalTo: leadingAnchor),
            hairline.trailingAnchor.constraint(equalTo: trailingAnchor),
            hairline.heightAnchor.constraint(equalToConstant: 1),
        ])
        place()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("MachineUpdateRow is built in code")
    }

    private func place() {
        for part in [machineColumn, runningColumn, cell, topLine] { part.removeFromSuperview() }
        grid.arrangedSubviews.forEach { $0.removeFromSuperview() }
        if wide {
            grid.axis = .horizontal
            grid.alignment = .center
            grid.spacing = Space.space4
            for part in [machineColumn, runningColumn, cell] { grid.addArrangedSubview(part) }
            machineColumn.widthAnchor.constraint(equalTo: grid.widthAnchor, multiplier: 0.34).isActive = true
        } else {
            grid.axis = .vertical
            grid.alignment = .fill
            grid.spacing = Space.space1
            topLine.spacing = Space.space2
            topLine.alignment = .center
            topLine.addArrangedSubview(machineColumn)
            topLine.addArrangedSubview(runningColumn)
            grid.addArrangedSubview(topLine)
            grid.addArrangedSubview(cell)
        }
    }

    func draw(_ machine: MachineRow, cell model: UpdateCell, current: Bool, running: String, asking: Bool, cancelling: Bool, refusal: String?, first: Bool) {
        let online = machine.status == "online"
        accessibilityIdentifier = "updates.machine.\(machine.name)"
        hairline.isHidden = first
        alpha = online ? 1 : 0.5
        os.glyph = .os(machine.os)
        name.text = machine.name
        dot.backgroundColor = online ? Palette.success : Palette.machineOffline
        osLine.text = machineOsLabel(machine.os) + (online ? "" : " · offline")
        currentMark.isHidden = !current
        version.text = running
        version.accessibilityLabel = "Running \(running)"
        cell.draw(model, name: machine.name, asking: asking, cancelling: cancelling, refusal: refusal,
                  error: UpdateRows.error(machine) ?? "The machine did not say why.")
    }
}

/// One machine's Update cell (UpdateCell.svelte): the words `cell` gives,
/// with their glyph or badge, a second line, and the buttons that go with
/// them; while an ask is on its way, a spinner and what it waits for; a
/// refusal, why, with Try again. "Read the error" unfolds the machine's own
/// words in a well under the cell, in place.
private final class UpdateCellView: UIStackView {
    var onInstall: (() -> Void)?
    var onCancel: (() -> Void)?

    /// The machine's whole error, unfolded under the cell.
    private var reading = false
    private var said: KitPre?
    private var error = ""
    private var machineName = ""

    private let lead = UIStackView()
    private let glyph = GlyphView(.clock, size: 16, tint: Palette.inkStrong)
    private let spinner = KitSpinner(side: 16)
    private let failDot = UIView()
    private let words = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
    private let meta = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private let buttons = UIStackView()
    private let refusalLine = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)
    private var drawn: (UpdateCell, Bool, Bool, String?)?

    init() {
        super.init(frame: .zero)
        axis = .vertical
        spacing = 4
        failDot.translatesAutoresizingMaskIntoConstraints = false
        failDot.layer.cornerRadius = 4
        failDot.backgroundColor = Palette.statusFailGlyph
        NSLayoutConstraint.activate([failDot.widthAnchor.constraint(equalToConstant: 8), failDot.heightAnchor.constraint(equalToConstant: 8)])
        lead.spacing = Space.space2
        lead.alignment = .center
        lead.isLayoutMarginsRelativeArrangement = true
        lead.layer.cornerRadius = Radius.radiusXs
        for part in [failDot, glyph, spinner, words] { lead.addArrangedSubview(part) }
        words.accessibilityTraits = .updatesFrequently
        buttons.spacing = Space.space1
        buttons.alignment = .center
        let row = UIStackView(arrangedSubviews: [lead, UIView()])
        row.alignment = .center
        for part in [row, meta, buttons, refusalLine] { addArrangedSubview(part) }
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("UpdateCellView is built in code")
    }

    func draw(_ cell: UpdateCell, name: String, asking: Bool, cancelling: Bool, refusal: String?, error: String) {
        if let drawn, drawn.0 == cell, drawn.1 == asking, drawn.2 == cancelling, drawn.3 == refusal, self.error == error { return }
        let changed = drawn.map { $0.0.row != cell.row || $0.1 != asking || $0.2 != cancelling } ?? false
        drawn = (cell, asking, cancelling, refusal)
        self.error = error
        machineName = name
        let text: String
        var icon = cell.icon
        if asking {
            text = "Asking \(name)…"
            icon = .spinner
        } else if cancelling {
            text = "Cancelling…"
            icon = .spinner
        } else {
            text = cell.text
        }
        words.text = text
        words.role = cell.plain && !asking && !cancelling ? TypeScale.typeMeta : TypeScale.typeLabel
        words.ink = cell.fail ? Palette.statusFailInk : cell.plain ? Palette.inkMuted : Palette.inkStrong
        lead.backgroundColor = cell.fail && !asking ? Palette.statusFailBg : .clear
        lead.directionalLayoutMargins = cell.fail && !asking ? .init(top: 4, leading: 8, bottom: 4, trailing: 8) : .zero
        failDot.isHidden = !cell.fail || asking
        spinner.isHidden = icon != .spinner
        glyph.isHidden = icon != .clock && icon != .download
        glyph.glyph = icon == .download ? .download : .clock
        lead.isHidden = text.isEmpty
        meta.text = asking || cancelling ? nil : cell.meta
        meta.isHidden = meta.text == nil

        buttons.arrangedSubviews.forEach { $0.removeFromSuperview() }
        if !asking, !cancelling {
            for button in cell.buttons {
                let made = switch button {
                case .retry: KitButton.make("Retry", variant: .ghost, height: .xs) { [weak self] in self?.onInstall?() }
                case .error: errorButton()
                case .cancel: KitButton.make("Cancel", variant: .ghost, height: .xs) { [weak self] in self?.onCancel?() }
                case .install: KitButton.make("Install now", variant: .outline, height: .xs) { [weak self] in self?.onInstall?() }
                }
                made.accessibilityIdentifier = "updates.\(button).\(name)"
                buttons.addArrangedSubview(made)
            }
        }
        if refusal != nil {
            buttons.addArrangedSubview(KitButton.make("Try again", variant: .ghost, height: .xs) { [weak self] in self?.onInstall?() })
        }
        buttons.addArrangedSubview(UIView())
        buttons.isHidden = buttons.arrangedSubviews.count == 1
        refusalLine.text = refusal
        refusalLine.isHidden = refusal == nil
        showError(cell.buttons.contains(.error) && !asking && !cancelling)
        // A change of row cross-fades in from the pop scale; nothing around it moves.
        guard changed, !UIAccessibility.isReduceMotionEnabled else { return }
        lead.alpha = 0
        lead.transform = CGAffineTransform(scaleX: Motion.popScale, y: Motion.popScale)
        Motion.easeOut.animator(Motion.durControl) {
            self.lead.alpha = 1
            self.lead.transform = .identity
        }.startAnimation()
    }

    /// "Read the error" / "Hide the error": the well under the cell, unfolding in place.
    private func errorButton() -> UIButton {
        let button = KitButton.make(reading ? "Hide the error" : "Read the error", variant: .ghost, height: .xs) { [weak self] in
            guard let self, let last = drawn else { return }
            reading.toggle()
            let shown = reading
            drawn = nil
            draw(last.0, name: machineName, asking: last.1, cancelling: last.2, refusal: last.3, error: error)
            if UIAccessibility.isReduceMotionEnabled { return }
            said?.alpha = shown ? 0 : 1
            Motion.easeOut.animator(shown ? Motion.durPanel : Motion.durExit) {
                self.said?.alpha = shown ? 1 : 0
                self.superview?.layoutIfNeeded()
            }.startAnimation()
        }
        button.accessibilityValue = reading ? "Expanded" : "Collapsed"
        return button
    }

    /// The machine's own words in a well (UpdateCell.svelte `.said`): `space-2`
    /// in, at most 160pt tall and scrolling past it, selectable.
    private func showError(_ allowed: Bool) {
        if !allowed { reading = false }
        guard reading else {
            said?.isHidden = true
            return
        }
        if let said, said.text == error {
            said.isHidden = false
            return
        }
        said?.removeFromSuperview()
        let well = KitPre(error, fill: Palette.surfaceWell, border: Palette.borderWell, radius: Radius.radiusXs,
                          inset: NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space2, bottom: Space.space2, trailing: Space.space2),
                          leading: 1.55, maxHeight: 160)
        well.accessibilityIdentifier = "updates.error"
        // Under the cell's words and buttons, above a refusal (UpdateCell.svelte's order).
        insertArrangedSubview(well, at: arrangedSubviews.firstIndex(of: refusalLine) ?? arrangedSubviews.count)
        setCustomSpacing(Space.space2, after: buttons)
        said = well
    }
}

/// A release's notes (ReleaseNotes.svelte): each section's heading as a small
/// tinted label (New green, Improved cyan, Fixed amber, each with its Solar
/// glyph), then its bullets, at the size of the text around them.
private final class ReleaseNotesView: UIStackView {
    init() {
        super.init(frame: .zero)
        axis = .vertical
        spacing = Space.spaceRow
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("ReleaseNotesView is built in code")
    }

    func set(_ sections: [ReleaseNoteSection]) {
        arrangedSubviews.forEach { $0.removeFromSuperview() }
        for (index, section) in sections.enumerated() {
            if let heading = section.heading {
                let (glyph, ground, ink): (Glyph?, UIColor, UIColor) = switch heading {
                case "New": (.stars, Palette.noteNewBg, Palette.noteNewInk)
                case "Improved": (.graphUp, Palette.noteImprovedBg, Palette.noteImprovedInk)
                case "Fixed": (.bug, Palette.noteFixedBg, Palette.noteFixedInk)
                default: (nil, Palette.surfaceRecess, Palette.inkStrong)
                }
                let label = KitLabel(TypeScale.typeLabel, ink: ink)
                label.text = heading
                let chip = UIStackView(arrangedSubviews: [glyph.map { GlyphView($0, size: 12, tint: ink) }, label].compactMap(\.self))
                chip.spacing = 4
                chip.alignment = .center
                chip.isLayoutMarginsRelativeArrangement = true
                chip.directionalLayoutMargins = .init(top: 2, leading: 6, bottom: 2, trailing: 6)
                chip.backgroundColor = ground
                chip.layer.cornerRadius = Radius.radiusXs
                chip.accessibilityTraits = .header
                let row = UIStackView(arrangedSubviews: [chip, UIView()])
                addArrangedSubview(row)
                if index > 0 { setCustomSpacing(Space.space3, after: arrangedSubviews[arrangedSubviews.count - 2]) }
                setCustomSpacing(Space.space2, after: row)
            }
            for item in section.items {
                let bullet = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong, lines: 0)
                let parsed = (try? AttributedString(markdown: item, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))).map { String($0.characters) } ?? item
                bullet.text = "•  \(parsed)"
                addArrangedSubview(bullet)
            }
        }
    }
}
