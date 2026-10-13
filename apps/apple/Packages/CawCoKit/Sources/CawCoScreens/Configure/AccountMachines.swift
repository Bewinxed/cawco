import CawCoCore
import CawCoDesign
import UIKit

// MARK: Panels

/// Claude Code's sign-in on one machine (SigninPanel.svelte): the link to its
/// own login, the field the code it shows is pasted into, and what came of
/// it. A refusal from the hub stands under the field in its own words; signed
/// in, it says as whom.
final class PastePanel: UIStackView, UITextFieldDelegate {
    private let flow: PasteSignin
    private let machine: String
    private let expected: String?
    private let offline = metaLine()
    private lazy var link = KitButton.make("Open sign-in link", glyph: .external, variant: .outline, height: .sm) { [weak self] in self?.openLink() }
    private let then = metaLine("then paste the code")
    private let field = KitField(placeholder: "Code")
    private lazy var doneButton = KitButton.make("Done", variant: .action, height: .sm) { [weak self] in self?.submit() }
    private let problem = metaLine(ink: Palette.statusFailInk)
    private let warn = metaLine(ink: Palette.statusAttnInk)
    private let got = SignedInLine()
    private var drawnPhase: PasteSignin.Phase?

    init(flow: PasteSignin, machine: String, expected: String?) {
        self.flow = flow
        self.machine = machine
        self.expected = expected
        super.init(frame: .zero)
        axis = .vertical
        spacing = Space.space3
        let linkRow = UIStackView(arrangedSubviews: [link, then, UIView()])
        linkRow.spacing = Space.space2
        linkRow.alignment = .center
        field.accessibilityLabel = "Code from the sign-in page"
        field.accessibilityIdentifier = "signin.code.\(flow.machineId)"
        field.delegate = self
        field.returnKeyType = .done
        field.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            flow.code = field.text ?? ""
            paint()
        }, for: .editingChanged)
        doneButton.accessibilityIdentifier = "signin.done.\(flow.machineId)"
        link.accessibilityIdentifier = "signin.link.\(flow.machineId)"
        let codeRow = UIStackView(arrangedSubviews: [field, doneButton])
        codeRow.spacing = Space.space2
        codeRow.alignment = .center
        for part in [offline, linkRow, codeRow, problem, warn, got] { addArrangedSubview(part) }
        got.isHidden = true
        warn.isHidden = true
        problem.isHidden = true
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("PastePanel is built in code")
    }

    /// Reads the flow (an observed read: its owner draws again when it moves).
    func draw(online: Bool) {
        offline.text = online ? nil : "\(machine) is offline. Sign in there once it's back."
        offline.isHidden = online
        link.isEnabled = online || flow.url != nil
        _ = flow.phase
        _ = flow.problem
        _ = flow.url
        paint()
    }

    private func paint() {
        let phase = flow.phase
        KitButton.setTitle(phase == .opening ? "Opening…" : "Open sign-in link", of: link, variant: .outline, height: .sm)
        link.configuration?.showsActivityIndicator = phase == .opening
        field.isEnabled = flow.url != nil && phase != .signedIn
        if !field.isFirstResponder, field.text != flow.code { field.text = flow.code }
        KitButton.setTitle(phase == .checking ? "Checking…" : "Done", of: doneButton, variant: .action, height: .sm)
        doneButton.configuration?.showsActivityIndicator = phase == .checking
        doneButton.isEnabled = flow.url != nil && !flow.code.trimmingCharacters(in: .whitespaces).isEmpty && phase != .checking
        field.accessibilityValue = flow.problem == nil ? nil : "Invalid"
        problem.text = flow.problem
        fold(problem, open: flow.problem != nil)
        warn.text = phase == .mismatch
            ? "\(machine) signed in as \(flow.email ?? "another account"), so it signed out again. Sign in as \(expected ?? "this account") with a new link."
            : nil
        fold(warn, open: flow.problem == nil && phase == .mismatch)
        if phase == .signedIn, drawnPhase != .signedIn { got.say(flow.email ?? expected ?? "the account") }
        fold(got, open: flow.problem == nil && phase == .signedIn)
        drawnPhase = phase
    }

    private func openLink() {
        if let url = flow.url {
            SignInBrowser.open(url, from: self)
            return
        }
        Task { @MainActor [weak self] in
            guard let self, await flow.open(), let url = flow.url else { return }
            SignInBrowser.open(url, from: self)
        }
    }

    private func submit() {
        field.resignFirstResponder()
        Task { await flow.done() }
    }

    func textFieldShouldReturn(_: UITextField) -> Bool {
        submit()
        return false
    }

    #if DEBUG
    func probeOpenLink() { openLink() }
    func probeSubmit(_ code: String) {
        field.text = code
        field.sendActions(for: .editingChanged)
        submit()
    }
    #endif
}

/// A device-code sign-in on one machine (DevicePanel.svelte). Before: Start
/// sign-in, which mints the one code. Waiting: the code in a well, Copy code,
/// Open sign-in link, and how long is left to enter it. Expired: the well
/// dims and Start again mints a new one. Signed in: the check beside who.
final class DevicePanel: UIStackView {
    private let flow: DeviceSignin
    private let machine: String
    private let well = UIView()
    private let codeLabel = KitLabel(TypeScale.typeCode, ink: Palette.inkStrong)
    private lazy var copy = KitButton.make("Copy code", glyph: .copy, variant: .outline, height: .sm) { [weak self] in self?.copyCode() }
    private lazy var link = KitButton.make("Open sign-in link", glyph: .external, variant: .outline, height: .sm) { [weak self] in self?.openLink() }
    private lazy var start = KitButton.make("Start sign-in", variant: .outline, height: .sm) { [weak self] in self?.begin() }
    private let line = metaLine()
    private let warn = metaLine(ink: Palette.statusAttnInk)
    private let problem = metaLine(ink: Palette.statusFailInk)
    private let got = SignedInLine()
    private let buttons = UIStackView()
    private var drawnPhase: DeviceSignin.Phase?
    private var copied = false
    private var online = true

    init(flow: DeviceSignin, machine: String) {
        self.flow = flow
        self.machine = machine
        super.init(frame: .zero)
        axis = .vertical
        spacing = Space.space2
        well.backgroundColor = Palette.codeBg
        well.layer.cornerRadius = Radius.radiusSm
        well.layer.cornerCurve = .continuous
        codeLabel.translatesAutoresizingMaskIntoConstraints = false
        codeLabel.tracking = 0.08
        codeLabel.isAccessibilityElement = true
        well.addSubview(codeLabel)
        NSLayoutConstraint.activate([
            codeLabel.topAnchor.constraint(equalTo: well.topAnchor, constant: Space.space3),
            codeLabel.bottomAnchor.constraint(equalTo: well.bottomAnchor, constant: -Space.space3),
            codeLabel.leadingAnchor.constraint(equalTo: well.leadingAnchor, constant: Space.space4),
            codeLabel.trailingAnchor.constraint(lessThanOrEqualTo: well.trailingAnchor, constant: -Space.space4),
        ])
        start.accessibilityIdentifier = "device.start.\(flow.machineId)"
        for part in [copy, link, start, UIView()] { buttons.addArrangedSubview(part) }
        buttons.spacing = Space.space2
        buttons.alignment = .center
        for part in [well, buttons, line, warn, problem, got] { addArrangedSubview(part) }
        for part in [well, line, warn, problem, got] { part.isHidden = true }
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("DevicePanel is built in code")
    }

    func draw(online: Bool) {
        self.online = online
        let phase = flow.phase
        let waiting = phase == .waiting
        if phase == .signedIn {
            if drawnPhase != .signedIn { got.say(flow.email ?? "the account") }
            for part in [well, buttons, line, warn, problem] { fold(part, open: false) }
            fold(got, open: true)
            drawnPhase = phase
            return
        }
        fold(got, open: false)
        // The code as it is read out: in fours.
        let bare = (flow.code ?? "").filter { $0.isLetter || $0.isNumber }
        codeLabel.text = stride(from: 0, to: bare.count, by: 4).map { at in
            String(bare.dropFirst(at).prefix(4))
        }.joined(separator: "  ")
        codeLabel.accessibilityLabel = "Code \(flow.code ?? "")"
        fold(well, open: waiting || phase == .expired)
        Motion.easeOut.animator(Motion.durFade) { self.well.alpha = phase == .expired ? 0.5 : 1 }.startAnimation()
        copy.isHidden = !waiting
        link.isHidden = !waiting
        start.isHidden = waiting || !online
        KitButton.setTitle(phase == .starting ? "Starting…" : phase == .idle ? "Start sign-in" : "Start again", of: start, variant: .outline, height: .sm)
        start.configuration?.showsActivityIndicator = phase == .starting
        KitButton.setTitle(copied ? "Copied" : "Copy code", of: copy, variant: .outline, height: .sm)
        buttons.isHidden = buttons.arrangedSubviews.dropLast().allSatisfy(\.isHidden)
        let left = max(0, flow.expiresAt - flow.now)
        let clock = "\(Int(left / 60000)):\(String(format: "%02d", Int(left.truncatingRemainder(dividingBy: 60000) / 1000)))"
        line.text = waiting ? "Enter it within \(clock)" : phase == .expired ? "Code expired." : nil
        line.tabular = true
        fold(line, open: line.text != nil)
        warn.text = phase == .mismatch ? "\(machine) signed in as \(flow.email ?? "another account"), so it signed out again." : nil
        fold(warn, open: warn.text != nil)
        problem.text = flow.problem
        fold(problem, open: flow.problem != nil)
        // The page is the provider's: once the machine has its answer, it closes.
        if drawnPhase == .waiting, phase != .waiting { SignInBrowser.close() }
        drawnPhase = phase
    }

    private func begin() {
        Task { await flow.start() }
    }

    private func copyCode() {
        UIPasteboard.general.string = flow.code
        copied = true
        draw(online: online)
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(Motion.durHold))
            guard let self else { return }
            copied = false
            draw(online: online)
        }
    }

    private func openLink() {
        guard let url = flow.url else { return }
        SignInBrowser.open(url, from: self)
    }
}

/// A key account's key, typed once and relayed by the hub to the machines
/// ticked (KeyPanel.svelte; the hub never keeps it): one secure field with a
/// reveal toggle, a box per machine (an offline one can't take it), and Send
/// key. What each machine made of it stands on its row; the field empties
/// once it is sent. With one machine (the account page's row) there is
/// nothing to tick.
final class KeyPanel: UIStackView {
    private weak var hub: HubConnection?
    private let account: () async throws -> String
    private var machines: [MachineRow]
    private let field = KitField(placeholder: "Paste the key")
    private lazy var reveal = KitGhostButton(.eye, label: "Show key")
    private lazy var send = KitButton.make("Send key", variant: .action, height: .sm) { [weak self] in self?.sendKey() }
    /// Send key once Continue is the step's primary.
    private lazy var sendSecondary = KitButton.make("Send key", variant: .outline, height: .sm) { [weak self] in self?.sendKey() }
    private let sendOutcome = metaLine()
    private let problem = metaLine(ink: Palette.statusFailInk)
    private let list = UIStackView()
    private var ticked: Set<String>
    private var outcomes: [String: (ok: Bool, why: String)] = [:]
    private var sending = false
    /// The key landed on at least one machine.
    var onSent: (() -> Void)?
    /// Send key is the step's primary; once a key is on a machine, Continue is.
    var primary = true { didSet { paint() } }

    init(hub: HubConnection, machines: [MachineRow], account: @escaping () async throws -> String) {
        self.hub = hub
        self.machines = machines
        self.account = account
        ticked = Set(machines.filter(FleetAccounts.online).map(\.machineId))
        super.init(frame: .zero)
        axis = .vertical
        spacing = Space.space3
        field.isSecureTextEntry = true
        field.textContentType = .password
        field.accessibilityLabel = "API key"
        field.accessibilityIdentifier = "key.field"
        field.rightView = reveal
        field.rightViewMode = .always
        field.addAction(UIAction { [weak self] _ in self?.paint() }, for: .editingChanged)
        reveal.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            field.isSecureTextEntry.toggle()
            let hidden = field.isSecureTextEntry
            reveal.configuration?.image = (hidden ? Glyph.eye : Glyph.eyeClosed).image.resized(to: Size.iconMd)
            reveal.accessibilityLabel = hidden ? "Show key" : "Hide key"
            reveal.accessibilityValue = hidden ? nil : "Shown"
        }, for: .primaryActionTriggered)
        list.axis = .vertical
        send.accessibilityIdentifier = "key.send"
        sendSecondary.accessibilityIdentifier = "key.send"
        let sendRow = UIStackView(arrangedSubviews: [send, sendSecondary, sendOutcome, UIView()])
        sendRow.spacing = Space.space3
        sendRow.alignment = .center
        for part in [field, list, sendRow, problem] { addArrangedSubview(part) }
        problem.isHidden = true
        drawMachines()
        paint()
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("KeyPanel is built in code")
    }

    /// The machines as the fleet reports them now.
    func set(machines next: [MachineRow]) {
        machines = next
        drawMachines()
        paint()
    }

    private var one: Bool { machines.count == 1 }

    private var targets: [MachineRow] {
        machines.filter { FleetAccounts.online($0) && (one || ticked.contains($0.machineId)) }
    }

    private func outcome(_ machineId: String) -> (String, UIColor)? {
        guard let result = outcomes[machineId] else { return nil }
        return result.ok ? ("Key sent", Palette.inkRow) : (result.why, Palette.statusFailInk)
    }

    private func drawMachines() {
        list.arrangedSubviews.forEach { $0.removeFromSuperview() }
        list.isHidden = one
        guard !one else { return }
        for (index, machine) in machines.enumerated() {
            let online = FleetAccounts.online(machine)
            let box = TaskCheckbox(checked: online && ticked.contains(machine.machineId))
            box.isEnabled = online
            box.accessibilityLabel = machine.name
            box.accessibilityIdentifier = "key.machine.\(machine.machineId)"
            let id = machine.machineId
            box.addAction(UIAction { [weak self, weak box] _ in
                guard let self, let box else { return }
                if ticked.contains(id) { ticked.remove(id) } else { ticked.insert(id) }
                box.checked = ticked.contains(id)
                paint()
            }, for: .primaryActionTriggered)
            let name = KitLabel(TypeScale.typeLabel, ink: online ? Palette.inkStrong : Palette.inkMuted)
            name.text = machine.name
            name.lineBreakMode = .byTruncatingTail
            let said = online ? outcome(id) : ("Offline", Palette.inkMuted)
            let result = metaLine(said?.0, ink: said?.1 ?? Palette.inkMuted)
            result.textAlignment = .right
            let row = UIStackView(arrangedSubviews: [box, name, UIView(), result])
            row.spacing = Space.space3
            row.alignment = .center
            row.isLayoutMarginsRelativeArrangement = true
            row.directionalLayoutMargins = .init(top: 6, leading: 0, bottom: 6, trailing: 0)
            row.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnH).isActive = true
            if index > 0 { row.addHairline() }
            list.addArrangedSubview(row)
        }
    }

    private func paint() {
        let key = (field.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        for (button, variant) in [(send, KitButton.Variant.action), (sendSecondary, .outline)] {
            button.isHidden = (variant == .action) != primary
            KitButton.setTitle(sending ? "Sending…" : "Send key", of: button, variant: variant, height: .sm)
            button.configuration?.showsActivityIndicator = sending
            button.isEnabled = !key.isEmpty && !targets.isEmpty && !sending
        }
        let said = one ? machines.first.flatMap { outcome($0.machineId) } : nil
        sendOutcome.text = said?.0
        sendOutcome.ink = said?.1 ?? Palette.inkMuted
        sendOutcome.isHidden = said == nil
    }

    #if DEBUG
    func probeSend(_ key: String) {
        field.text = key
        paint()
        sendKey()
    }
    #endif

    private func sendKey() {
        let key = (field.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !sending, !key.isEmpty, !targets.isEmpty, let hub else { return }
        sending = true
        problem.text = nil
        fold(problem, open: false)
        paint()
        let ids = targets.map(\.machineId)
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let id = try await account()
                let answers = try await hub.sendAccountKey(id, key: key, machineIds: ids)
                field.text = ""
                var landed = false
                for answer in answers.machines {
                    if let error = answer.error {
                        outcomes[answer.machineId] = (false, error)
                    } else if answer.result?.state == "signed-in" {
                        outcomes[answer.machineId] = (true, "")
                        landed = true
                    } else {
                        outcomes[answer.machineId] = (false, answer.result?.state == "mismatch"
                            ? "That's a different key from this account's; it was taken back off."
                            : "The machine didn't take the key.")
                    }
                }
                sending = false
                drawMachines()
                paint()
                if landed { onSent?() }
            } catch {
                sending = false
                problem.text = error.localizedDescription
                fold(problem, open: true)
                paint()
            }
        }
    }
}

extension UIView {
    /// A 1pt hairline along the top edge (`.row + .row`'s rule).
    func addHairline() {
        let rule = UIView()
        rule.backgroundColor = Palette.borderHairline
        rule.translatesAutoresizingMaskIntoConstraints = false
        rule.isUserInteractionEnabled = false
        addSubview(rule)
        NSLayoutConstraint.activate([
            rule.topAnchor.constraint(equalTo: topAnchor),
            rule.leadingAnchor.constraint(equalTo: leadingAnchor),
            rule.trailingAnchor.constraint(equalTo: trailingAnchor),
            rule.heightAnchor.constraint(equalToConstant: 1),
        ])
    }
}

// MARK: The account's machines

/// Where an account stands on each machine that runs its provider's
/// harnesses (AccountMachines.svelte). A machine it is signed in on is its
/// name and its ⋯ (Sign out on this machine): a healthy row says nothing.
/// Any other row says what is wrong and carries its one action, Sign in
/// (Send key, for a key account), which opens that sign-in's panel on the
/// row itself; an offline machine only says so. Signed in, the check draws,
/// holds for `durHold`, and the panel folds away. A sign-out runs on its row
/// and a refusal stays there in the hub's words.
final class AccountMachinesView: UIStackView {
    private let hub: HubConnection
    private let accountId: String
    private var rows: [String: MachineRowView] = [:]
    private let none = metaLine("No machine runs this account's agents yet.")
    private var open: String?
    private var paste: [String: PasteSignin] = [:]
    private var device: [String: DeviceSignin] = [:]
    private var keySent: Set<String> = []
    private var signingOut: Set<String> = []
    /// Why a sign-out was refused, by machine, in the hub's words.
    private var refusals: [String: String] = [:]
    private var closing: Task<Void, Never>?
    /// Something on a row changed that the observed reads don't cover.
    var onChange: (() -> Void)?

    init(hub: HubConnection, accountId: String) {
        self.hub = hub
        self.accountId = accountId
        super.init(frame: .zero)
        axis = .vertical
        accessibilityLabel = "Machines"
        addArrangedSubview(none)
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("AccountMachinesView is built in code")
    }

    deinit {
        MainActor.assumeIsolated {
            for flow in device.values { flow.dispose() }
        }
    }

    /// Draws every row from the hub's view and the flows (observed reads).
    func draw(_ account: FleetAccounts.Account, view: FleetAccounts.View) {
        let machines = FleetAccounts.machines(for: account.provider, hub: hub)
        let ids = machines.map(\.machineId)
        for (id, row) in rows where !ids.contains(id) {
            row.removeFromSuperview()
            rows[id] = nil
        }
        none.isHidden = !machines.isEmpty
        for (index, machine) in machines.enumerated() {
            let id = machine.machineId
            let row = rows[id] ?? MachineRowView()
            if rows[id] == nil {
                rows[id] = row
                row.onAction = { [weak self] in self?.toggle(id) }
                row.onSignOut = { [weak self] in self?.signOut(id) }
            }
            if arrangedSubviews.firstIndex(of: row) != index + 1 { insertArrangedSubview(row, at: index + 1) }
            let online = FleetAccounts.online(machine)
            let state = FleetAccounts.state(view.signins, account: account.id, machine: id)
            let key = account.kind == "api_key"
            let landed = key ? keySent.contains(id) : (paste[id]?.phase == .signedIn || device[id]?.phase == .signedIn)
            row.draw(name: machine.name, account: FleetAccounts.name(account), online: online, state: state, key: key,
                     open: open == id, signingOut: signingOut.contains(id), refused: refusals[id], first: index == 0)
            if open == id {
                row.panel(make: { panel(for: account, machine: machine) })
                if let pastePanel = row.current as? PastePanel { pastePanel.draw(online: online) }
                if let devicePanel = row.current as? DevicePanel { devicePanel.draw(online: online) }
                if let keyPanel = row.current as? KeyPanel { keyPanel.set(machines: [machine]) }
                if landed { holdThenClose(id) }
            } else {
                row.panel(make: nil)
            }
        }
    }

    private func panel(for account: FleetAccounts.Account, machine: MachineRow) -> UIView {
        let id = machine.machineId
        let own: () async throws -> String = { [accountId] in accountId }
        if account.provider == FleetAccounts.claude {
            let flow = paste[id] ?? PasteSignin(hub: hub, machineId: id, account: own)
            paste[id] = flow
            return PastePanel(flow: flow, machine: machine.name, expected: account.email)
        }
        if account.kind == "api_key" {
            let panel = KeyPanel(hub: hub, machines: [machine], account: own)
            panel.onSent = { [weak self] in
                self?.keySent.insert(id)
                self?.onChange?()
            }
            return panel
        }
        let flow = device[id] ?? DeviceSignin(hub: hub, machineId: id, account: own)
        device[id] = flow
        return DevicePanel(flow: flow, machine: machine.name)
    }

    /// Opens the row's sign-in fresh, or puts it away.
    private func toggle(_ id: String) {
        closing?.cancel()
        if open == id {
            close(id)
        } else {
            if let was = open { close(was) }
            paste[id] = nil
            device[id]?.dispose()
            device[id] = nil
            keySent.remove(id)
            open = id
        }
        onChange?()
    }

    private func close(_ id: String) {
        device[id]?.dispose()
        if open == id { open = nil }
    }

    /// Signed in: the check holds, then the panel goes.
    private func holdThenClose(_ id: String) {
        guard closing == nil else { return }
        closing = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(Motion.durHold))
            guard let self, !Task.isCancelled else { return }
            closing = nil
            close(id)
            onChange?()
        }
    }

    private func signOut(_ id: String) {
        guard !signingOut.contains(id) else { return }
        refusals[id] = nil
        signingOut.insert(id)
        onChange?()
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try await hub.signOut(accountId, machineId: id)
            } catch {
                refusals[id] = error.localizedDescription
            }
            signingOut.remove(id)
            onChange?()
        }
    }

    #if DEBUG
    /// The probe's reads and presses, by machine.
    func probeRow(_ machineId: String) -> MachineRowView? { rows[machineId] }
    func probeToggle(_ machineId: String) { toggle(machineId) }
    func probeSignOut(_ machineId: String) { signOut(machineId) }
    #endif
}

/// One machine of an account (AccountMachines.svelte `.mrow`): its name, and
/// one trailing column with what is wrong and its action, at one x on every
/// row; under it, the open sign-in, and a refusal in the fail ink.
final class MachineRowView: UIStackView {
    var onAction: (() -> Void)?
    var onSignOut: (() -> Void)?
    private let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private let state = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let stateGlyph = GlyphView(.warning, size: 12, tint: Palette.statusAttnInk)
    private let spinner = KitSpinner(side: 12)
    private lazy var action = KitButton.make("Sign in", variant: .outline, height: .sm) { [weak self] in self?.onAction?() }
    private var menu: UIButton?
    private let trail = UIStackView()
    private let slot = UIStackView()
    private let refused = metaLine(ink: Palette.statusFailInk)
    private(set) var current: UIView?
    private let top = UIStackView()

    init() {
        super.init(frame: .zero)
        axis = .vertical
        spacing = Space.space2
        isLayoutMarginsRelativeArrangement = true
        directionalLayoutMargins = .init(top: Space.space1, leading: Space.space2, bottom: Space.space1, trailing: Space.space2)
        name.lineBreakMode = .byTruncatingTail
        name.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        state.setContentCompressionResistancePriority(.required, for: .horizontal)
        trail.spacing = Space.space3
        trail.alignment = .center
        let word = UIStackView(arrangedSubviews: [stateGlyph, spinner, state])
        word.spacing = Space.space1
        word.alignment = .center
        trail.addArrangedSubview(word)
        trail.addArrangedSubview(action)
        top.addArrangedSubview(name)
        top.addArrangedSubview(UIView())
        top.addArrangedSubview(trail)
        top.spacing = Space.space4
        top.alignment = .center
        top.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHLg).isActive = true
        slot.axis = .vertical
        slot.isLayoutMarginsRelativeArrangement = true
        slot.directionalLayoutMargins = .init(top: 0, leading: 0, bottom: Space.space2, trailing: 0)
        refused.isHidden = true
        for part in [top, slot, refused] { addArrangedSubview(part) }
        slot.isHidden = true
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("MachineRowView is built in code")
    }

    private var hairline: UIView?

    func draw(name text: String, account: String, online: Bool, state signin: String, key: Bool, open: Bool,
              signingOut: Bool, refused why: String?, first: Bool) {
        if hairline == nil, !first {
            addHairline()
            hairline = subviews.last
        }
        hairline?.isHidden = first
        name.text = text
        accessibilityIdentifier = "account.machine.\(text)"
        let shown = online ? signin : "offline"
        let words: String? = signingOut ? "Signing out…" : switch shown {
        case "signed-out": "Not signed in"
        case "mismatch": "Signed in as someone else"
        case "offline": "Offline"
        default: nil
        }
        state.text = words
        state.ink = shown == "mismatch" && !signingOut ? Palette.statusAttnInk : Palette.inkMuted
        state.isHidden = words == nil
        stateGlyph.isHidden = shown != "mismatch" || signingOut
        spinner.isHidden = !signingOut
        let asks = online && (signin != "signed-in" || open)
        action.isHidden = !asks
        let verb = key ? "Send key" : "Sign in"
        KitButton.setTitle(open ? "Close" : verb, of: action, variant: .outline, height: .sm)
        action.accessibilityLabel = open ? "Close the sign-in on \(text)" : "\(verb) \(account) on \(text)"
        action.accessibilityIdentifier = "account.signin.\(text)"
        menu?.removeFromSuperview()
        menu = nil
        if online, signin == "signed-in", !open {
            let more = rowMenu("\(account) on \(text)", actions: [
                RowAction(label: "Sign out on this machine", glyph: .logout, destructive: true, disabled: signingOut) { [weak self] in self?.onSignOut?() },
            ])
            more.accessibilityIdentifier = "account.more.\(text)"
            trail.addArrangedSubview(more)
            menu = more
        }
        refused.text = why
        fold(refused, open: why != nil)
    }

    /// The open sign-in under the row: made once when it opens, gone when it closes.
    func panel(make: (() -> UIView)?) {
        if let make {
            guard current == nil else { return }
            let made = make()
            current = made
            slot.addArrangedSubview(made)
            fold(slot, open: true)
        } else if let current {
            self.current = nil
            fold(slot, open: false)
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(Motion.durControl))
                current.removeFromSuperview()
            }
        }
    }

    #if DEBUG
    /// What the row draws now, as one line.
    var probeState: String {
        let words = [name.text, state.isHidden ? nil : state.text, action.isHidden ? nil : "[\(action.configuration?.attributedTitle.map { String($0.characters) } ?? "")]",
                     menu == nil ? nil : "[⋯]", refused.isHidden ? nil : "refused: \(refused.text ?? "")"]
        var panel = ""
        if let current {
            let labels = AccountsProbe.texts(in: current)
            panel = " | panel: " + labels.joined(separator: " / ")
        }
        return words.compactMap(\.self).joined(separator: " · ") + panel
    }
    #endif
}
