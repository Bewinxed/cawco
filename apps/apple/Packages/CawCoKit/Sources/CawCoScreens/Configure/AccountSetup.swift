import CawCoCore
import CawCoDesign
import UIKit

/// Adding an account, in steps (AccountSetup.svelte). Provider first: the
/// picker's rows (a provider and how it signs in), and choosing one moves on.
/// Sign in follows the row's kind: Claude Code's own login with a pasted
/// code, a device code entered on any device, or a key sent to the machines.
/// Then Name it. A provider's second account goes on to how the two share
/// the work: your sessions, delegates, and, where CawCo reads the provider's
/// limits, what a session does at its limit.
///
/// The account itself is made by its first sign-in (a link, a code, a key),
/// so its email is known and becomes its name. Cancel takes back an account
/// no machine signed in. On a phone the steps are a row of marks with the
/// current one named, and Back and Continue stand at the foot, over the
/// keyboard when one is up.
final class AccountSetupController: ObservedViewController, UITextFieldDelegate {
    private let section: ConfigSection
    private let context: ShellContext
    private var hub: HubConnection { context.hub }

    // Provider
    private var choice: FleetAccounts.Choice?
    /// The provider's one account, when this is its second: the setup goes on to routing.
    private var existing: FleetAccounts.Account?
    private var query = ""

    // Sign in
    private var createdId: String?
    private var creating: Task<String, any Error>?
    private var hue = "orange"
    private var paste: [String: PasteSignin] = [:]
    private var device: [String: DeviceSignin] = [:]

    // Name it
    private var nickname = ""

    // Routing
    private var yours = FleetAccounts.StrategyChoice(strategy: "pinned")
    private var delegates = FleetAccounts.StrategyChoice(strategy: "fill-first")
    private var atLimit = FleetAccounts.AtLimit.standard
    private var dragged: [String]?

    private var step = 0
    private var busy = false
    private var refused: String?

    private let scroll = UIScrollView()
    private let steps = UIStackView()
    private let box = UIView()
    private let content = UIStackView()
    private let problem = metaLine(ink: Palette.statusFailInk)
    private lazy var back = KitButton.make("Back", variant: .outline) { [weak self] in self?.goBack() }
    private lazy var next = KitButton.make("Continue", variant: .action) { [weak self] in self?.goOn() }
    /// Continue while a key is not on any machine yet: Send key is the step's primary.
    private lazy var nextQuiet = KitButton.make("Continue", variant: .outline) { [weak self] in self?.goOn() }
    private var drawnStep: Int?
    private var drawnMachines: [String] = []
    private var signinRows: [String: SetupMachineRow] = [:]
    private var keyPanel: KeyPanel?
    private let signedAs = SignedInLine()
    private var preview: (tile: AccountTileView, name: KitLabel, email: KitLabel)?
    private var searchRows: UIStackView?

    init(section: ConfigSection, context: ShellContext) {
        self.section = section
        self.context = context
        super.init(nibName: nil, bundle: nil)
        navigationItem.title = "Add account"
        navigationItem.largeTitleDisplayMode = .never
        // Leaving is Cancel's: it takes back an account no machine signed in.
        navigationItem.hidesBackButton = true
        let cancel = UIBarButtonItem(title: "Cancel", primaryAction: UIAction { [weak self] _ in self?.cancel() })
        cancel.accessibilityIdentifier = "setup.cancel"
        navigationItem.leftBarButtonItem = cancel
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("AccountSetupController is built in code")
    }

    deinit {
        MainActor.assumeIsolated {
            for flow in device.values { flow.dispose() }
        }
    }

    // MARK: Steps

    private var provider: String? { choice?.provider }
    private var limits: Bool { provider.map(FleetAccounts.limits) ?? false }
    private var full: Bool { existing != nil }

    private var stepNames: [String] {
        ["Provider", "Sign in", "Name it"] + (full ? ["Your sessions", "Delegates"] + (limits ? ["At the limit"] : []) + ["Done"] : [])
    }

    private var at: String { stepNames[step] }
    private var last: Int { stepNames.count - 1 }

    private var machines: [MachineRow] {
        choice.map { FleetAccounts.machines(running: $0.harnesses, hub: hub) } ?? []
    }

    private func stateOn(_ machineId: String, _ view: FleetAccounts.View?) -> String {
        guard let createdId, let view else { return "signed-out" }
        return FleetAccounts.state(view.signins, account: createdId, machine: machineId)
    }

    private func doneOn(_ machineId: String, _ view: FleetAccounts.View?) -> Bool {
        stateOn(machineId, view) == "signed-in" || paste[machineId]?.phase == .signedIn || device[machineId]?.phase == .signedIn
    }

    private func signedIn(_ view: FleetAccounts.View?) -> Int {
        machines.filter { doneOn($0.machineId, view) }.count
    }

    private func account(_ view: FleetAccounts.View?) -> FleetAccounts.Account? {
        view?.accounts.first { $0.id == createdId }
    }

    private func email(_ view: FleetAccounts.View?) -> String? {
        account(view)?.email ?? paste.values.first { $0.phase == .signedIn }?.email ?? device.values.first { $0.phase == .signedIn }?.email
    }

    /// Both accounts, the one there was first; the new one goes last.
    private func pair(_ view: FleetAccounts.View?) -> [FleetAccounts.Account]? {
        guard let existing, let made = account(view) else { return nil }
        return [existing, made]
    }

    private func order(_ view: FleetAccounts.View?) -> [String] {
        dragged ?? pair(view)?.map(\.id) ?? []
    }

    // MARK: Frame

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        view.accessibilityIdentifier = "setup"
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.alwaysBounceVertical = true
        scroll.keyboardDismissMode = .interactive
        view.addSubview(scroll)

        steps.spacing = Space.space1
        steps.alignment = .center
        steps.accessibilityLabel = "Steps"
        box.backgroundColor = Palette.surfaceWell
        box.layer.cornerRadius = Radius.radiusLg
        box.layer.cornerCurve = .continuous
        box.layer.borderWidth = 1
        box.clipsToBounds = true
        content.axis = .vertical
        content.spacing = Space.space4
        content.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(content)
        problem.isHidden = true
        let column = UIStackView(arrangedSubviews: [steps, box, problem])
        column.axis = .vertical
        column.spacing = Space.space4
        column.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(column)

        back.accessibilityIdentifier = "setup.back"
        next.accessibilityIdentifier = "setup.next"
        nextQuiet.accessibilityIdentifier = "setup.next"
        next.widthAnchor.constraint(greaterThanOrEqualToConstant: 96).isActive = true
        let foot = UIStackView(arrangedSubviews: [UIView(), back, nextQuiet, next])
        foot.spacing = Space.space3
        foot.alignment = .center
        foot.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(foot)

        let safe = view.safeAreaLayoutGuide
        let inset = Space.space5
        let wide = column.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -inset * 2)
        wide.priority = .defaultHigh
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: safe.topAnchor),
            scroll.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: foot.topAnchor, constant: -Space.space3),
            column.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: Space.space2),
            scroll.contentLayoutGuide.bottomAnchor.constraint(equalTo: column.bottomAnchor, constant: Space.space5),
            column.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: inset),
            scroll.contentLayoutGuide.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
            column.widthAnchor.constraint(lessThanOrEqualToConstant: 720),
            column.widthAnchor.constraint(lessThanOrEqualTo: scroll.frameLayoutGuide.widthAnchor, constant: -inset * 2),
            wide,
            content.topAnchor.constraint(equalTo: box.topAnchor, constant: Space.space4),
            content.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -Space.space4),
            content.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: Space.space4),
            content.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -Space.space4),
            foot.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: 21),
            foot.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -21),
            foot.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor, constant: -12),
            foot.bottomAnchor.constraint(lessThanOrEqualTo: safe.bottomAnchor, constant: -12),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (setup: AccountSetupController, _: UITraitCollection) in setup.paintBox() }
        paintBox()
    }

    private func paintBox() {
        box.layer.borderColor = Palette.borderWell.resolvedColor(with: traitCollection).cgColor
    }

    override func viewIsAppearing(_ animated: Bool) {
        super.viewIsAppearing(animated)
        Task { await hub.reloadAccounts() }
    }

    override func refreshContent() {
        let view = FleetAccounts.view(hub)
        if drawnStep != step {
            let toward: Double = (drawnStep ?? -1) < step ? 1 : -1
            let first = drawnStep == nil
            drawnStep = step
            buildStep(view)
            drawSteps()
            if !first, !UIAccessibility.isReduceMotionEnabled {
                // A step rises into its box as the box takes its height.
                content.alpha = 0
                content.transform = CGAffineTransform(translationX: 0, y: 6 * toward)
                Motion.easeOut.animator(Motion.durPanel) {
                    self.content.alpha = 1
                    self.content.transform = .identity
                    self.scroll.layoutIfNeeded()
                }.startAnimation()
            }
            scroll.setContentOffset(.zero, animated: false)
        }
        if at == "Sign in" { drawSignin(view) }
        if at == "Name it" { drawPreview(view) }
        drawFoot(view)
    }

    /// The steps as a row of marks: a check for each done, the current one named.
    private func drawSteps() {
        steps.arrangedSubviews.forEach { $0.removeFromSuperview() }
        let compact = traitCollection.horizontalSizeClass == .compact
        for (place, name) in stepNames.enumerated() {
            let mark: UIView
            if place < step {
                mark = GlyphView(.passed, size: 16, tint: Palette.statusDoneGlyph)
            } else {
                let dot = UIView()
                dot.backgroundColor = place == step ? Palette.selectedIcon : Palette.neutral8
                dot.layer.cornerRadius = 3
                dot.translatesAutoresizingMaskIntoConstraints = false
                let holder = UIView()
                holder.translatesAutoresizingMaskIntoConstraints = false
                holder.addSubview(dot)
                NSLayoutConstraint.activate([
                    holder.widthAnchor.constraint(equalToConstant: 16), holder.heightAnchor.constraint(equalToConstant: 16),
                    dot.widthAnchor.constraint(equalToConstant: 6), dot.heightAnchor.constraint(equalToConstant: 6),
                    dot.centerXAnchor.constraint(equalTo: holder.centerXAnchor), dot.centerYAnchor.constraint(equalTo: holder.centerYAnchor),
                ])
                mark = holder
            }
            let item = UIStackView(arrangedSubviews: [mark])
            item.spacing = Space.space2
            item.alignment = .center
            item.isLayoutMarginsRelativeArrangement = true
            item.directionalLayoutMargins = .init(top: 0, leading: Space.space2, bottom: 0, trailing: Space.space2)
            item.heightAnchor.constraint(equalToConstant: 34).isActive = true
            item.layer.cornerRadius = Radius.radiusSm
            if place == step || !compact {
                let label = KitLabel(TypeScale.typeLabel, ink: place == step ? Palette.selectedInk : place < step ? Palette.inkRow : Palette.inkMuted)
                label.text = name
                item.addArrangedSubview(label)
            }
            if place == step { item.backgroundColor = Palette.selectedBg }
            item.isAccessibilityElement = true
            item.accessibilityLabel = name
            item.accessibilityValue = place < step ? "Done" : place == step ? "Current step" : nil
            item.accessibilityIdentifier = place == step ? "setup.step.current" : nil
            steps.addArrangedSubview(item)
        }
        steps.addArrangedSubview(UIView())
    }

    private func heading(_ text: String) -> KitLabel {
        let label = KitLabel(TypeScale.typeTitle, ink: Palette.inkStrong, lines: 0)
        label.text = text
        label.tracking = -0.01
        label.wrap = .balance
        label.accessibilityTraits = .header
        return label
    }

    private func buildStep(_ view: FleetAccounts.View?) {
        content.arrangedSubviews.forEach { $0.removeFromSuperview() }
        signinRows = [:]
        drawnMachines = []
        keyPanel = nil
        preview = nil
        searchRows = nil
        switch at {
        case "Provider": buildPick()
        case "Sign in": buildSignin()
        case "Name it": buildName(view)
        case "Your sessions", "Delegates":
            content.addArrangedSubview(heading(at))
            if let pair = pair(view) {
                let mine = at == "Your sessions"
                let picker = StrategyPickerView(provider: pair[0].provider, label: at, accounts: pair, choice: mine ? yours : delegates, order: order(view))
                picker.onChoice = { [weak self] choice in
                    if mine { self?.yours = choice } else { self?.delegates = choice }
                }
                picker.onOrder = { [weak self] ids in self?.dragged = ids }
                content.addArrangedSubview(picker)
            }
        case "At the limit":
            content.addArrangedSubview(heading(at))
            if let pair = pair(view) {
                let block = AtLimitView(accounts: (pair[1], pair[0]), terms: provider == FleetAccounts.claude, value: atLimit)
                block.onChange = { [weak self] next in self?.atLimit = next }
                content.addArrangedSubview(block)
            }
        case "Done":
            if let pair = pair(view) {
                content.addArrangedSubview(heading("\(FleetAccounts.name(pair[0])) and \(FleetAccounts.name(pair[1])) are set up"))
                let lead = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
                lead.text = FleetAccounts.routingLine(pair, yours: yours, delegates: delegates) + (limits && atLimit.move ? " · Moves at the limit" : "")
                lead.wrap = .pretty
                content.addArrangedSubview(lead)
            }
        default: break
        }
    }

    // MARK: Provider

    private func buildPick() {
        let choices = FleetAccounts.choices(hub) ?? []
        if choices.count > 8 {
            let search = KitField(placeholder: "Search providers")
            search.accessibilityLabel = "Search providers"
            search.clearButtonMode = .whileEditing
            search.returnKeyType = .search
            search.delegate = self
            search.text = query
            search.addAction(UIAction { [weak self, weak search] _ in
                self?.query = search?.text ?? ""
                self?.drawPick()
            }, for: .editingChanged)
            content.addArrangedSubview(search)
        }
        let rows = UIStackView()
        rows.axis = .vertical
        content.addArrangedSubview(rows)
        searchRows = rows
        drawPick()
    }

    private func drawPick() {
        guard let rows = searchRows else { return }
        rows.arrangedSubviews.forEach { $0.removeFromSuperview() }
        let words = query.trimmingCharacters(in: .whitespaces).lowercased()
        let shown = (FleetAccounts.choices(hub) ?? []).filter { words.isEmpty || FleetAccounts.choiceLabel($0).lowercased().contains(words) }
        let groups = [("Sign in", shown.filter { $0.signin != "api-key" }), ("API keys", shown.filter { $0.signin == "api-key" })].filter { !$0.1.isEmpty }
        guard !groups.isEmpty else {
            rows.addArrangedSubview(metaLine("No provider matches “\(query.trimmingCharacters(in: .whitespaces))”"))
            return
        }
        for (index, (label, choices)) in groups.enumerated() {
            let head = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
            head.text = label
            head.accessibilityTraits = .header
            let pad = UIStackView(arrangedSubviews: [head])
            pad.isLayoutMarginsRelativeArrangement = true
            pad.directionalLayoutMargins = .init(top: index == 0 ? 0 : Space.space4, leading: Space.space3, bottom: Space.space1, trailing: Space.space3)
            rows.addArrangedSubview(pad)
            for (at, row) in choices.enumerated() {
                let runners = FleetAccounts.machines(running: row.harnesses, hub: hub)
                let why = runners.isEmpty ? "No machine runs \(row.harnesses.compactMap { FleetAccounts.harnessWords[$0] }.joined(separator: " or "))" : nil
                let control = ProviderChoiceRow(choice: row, why: why)
                control.accessibilityIdentifier = "setup.provider.\(row.key)"
                if at > 0 { control.addHairline() }
                control.addAction(UIAction { [weak self] _ in
                    guard why == nil else { return }
                    self?.choose(row)
                }, for: .primaryActionTriggered)
                rows.addArrangedSubview(control)
            }
        }
    }

    /// A row chosen: the setup moves on. Another row than the one an unsigned
    /// account was made for takes that account back first.
    private func choose(_ row: FleetAccounts.Choice) {
        guard !busy else { return }
        Task { @MainActor [weak self] in
            guard let self else { return }
            if let chosen = choice, chosen.key != row.key, let made = createdId {
                busy = true
                requestRefresh()
                do {
                    try await hub.deleteAccount(made)
                } catch {
                    refused = error.localizedDescription
                    busy = false
                    requestRefresh()
                    return
                }
                busy = false
                createdId = nil
                creating = nil
                paste = [:]
                for flow in device.values { flow.dispose() }
                device = [:]
            }
            let theirs = FleetAccounts.view(hub).map { FleetAccounts.accounts($0, provider: row.provider) }?.filter { $0.id != createdId } ?? []
            existing = theirs.count == 1 ? theirs[0] : nil
            // Its defaults: a pin goes to the account there was.
            let defaults = FleetAccounts.Routing.standard(row.provider)
            yours = defaults.yours.strategy == "pinned" ? .init(strategy: "pinned", pinnedAccountId: existing?.id) : defaults.yours
            delegates = defaults.delegates
            if createdId == nil { hue = FleetAccounts.nextHue(theirs) }
            choice = row
            refused = nil
            step = 1
            requestRefresh()
        }
    }

    // MARK: Sign in

    /// The account's id, making it first: it is made by its first sign-in.
    private func ensureAccount() async throws -> String {
        if let createdId { return createdId }
        guard let row = choice else { throw HubSaid("Choose a provider first.") }
        let task = creating ?? Task { @MainActor [hub, hue] in
            try await hub.createAccount(provider: row.provider, kind: row.kind, hue: hue)
        }
        creating = task
        do {
            let id = try await task.value
            createdId = id
            requestRefresh()
            return id
        } catch {
            creating = nil
            throw error
        }
    }

    private func buildSignin() {
        guard let choice else { return }
        let mark = TileView(radius: Radius.radiusSm)
        let logo = providerMark(choice.provider)
        mark.addSubview(logo)
        NSLayoutConstraint.activate([
            mark.widthAnchor.constraint(equalToConstant: 26), mark.heightAnchor.constraint(equalToConstant: 26),
            logo.centerXAnchor.constraint(equalTo: mark.centerXAnchor), logo.centerYAnchor.constraint(equalTo: mark.centerYAnchor),
        ])
        let title = UIStackView(arrangedSubviews: [mark, heading(FleetAccounts.choiceLabel(choice))])
        title.spacing = Space.space3
        title.alignment = .center
        content.addArrangedSubview(title)
        let banner = UIStackView(arrangedSubviews: [signedAs])
        banner.isLayoutMarginsRelativeArrangement = true
        banner.directionalLayoutMargins = .init(top: Space.space3, leading: Space.space4, bottom: Space.space3, trailing: Space.space4)
        banner.backgroundColor = Palette.surfaceRaised
        banner.layer.cornerRadius = Radius.radiusMd
        banner.isHidden = true
        content.addArrangedSubview(banner)
        if choice.signin == "api-key" {
            let panel = KeyPanel(hub: hub, machines: machines) { [weak self] in
                guard let self else { throw CancellationError() }
                return try await ensureAccount()
            }
            panel.onSent = { [weak self] in self?.requestRefresh() }
            content.addArrangedSubview(panel)
            keyPanel = panel
        } else {
            let rows = UIStackView()
            rows.axis = .vertical
            rows.accessibilityIdentifier = "setup.machines"
            content.addArrangedSubview(rows)
        }
    }

    private func drawSignin(_ view: FleetAccounts.View?) {
        guard let choice else { return }
        let count = signedIn(view)
        let banner = signedAs.superview
        if count > 0, choice.signin != "device-code", banner?.isHidden == true { signedAs.say(email(view) ?? "the account") }
        if let banner { fold(banner, open: count > 0 && choice.signin != "device-code") }
        if let keyPanel {
            keyPanel.set(machines: machines)
            keyPanel.primary = count == 0
            return
        }
        guard let rows = content.arrangedSubviews.last as? UIStackView, rows.accessibilityIdentifier == "setup.machines" else { return }
        let ids = machines.map(\.machineId)
        if ids != drawnMachines {
            drawnMachines = ids
            rows.arrangedSubviews.forEach { $0.removeFromSuperview() }
            signinRows = [:]
            if machines.isEmpty {
                let none = metaLine("No machine runs \(FleetAccounts.harnessWords(choice.provider, hub: hub)) yet. Install it on one, and it shows here.")
                rows.addArrangedSubview(none)
            }
            for machine in machines {
                let id = machine.machineId
                let own: () async throws -> String = { [weak self] in
                    guard let self else { throw CancellationError() }
                    return try await ensureAccount()
                }
                let row: SetupMachineRow
                if choice.signin == "device-code" {
                    let flow = device[id] ?? DeviceSignin(hub: hub, machineId: id, account: own)
                    device[id] = flow
                    row = SetupMachineRow(name: machine.name, device: DevicePanel(flow: flow, machine: machine.name))
                } else {
                    let flow = paste[id] ?? PasteSignin(hub: hub, machineId: id, account: own)
                    paste[id] = flow
                    row = SetupMachineRow(name: machine.name, paste: flow, panel: PastePanel(flow: flow, machine: machine.name, expected: nil))
                }
                row.addHairline()
                signinRows[id] = row
                rows.addArrangedSubview(row)
            }
        }
        for machine in machines {
            let id = machine.machineId
            signinRows[id]?.draw(online: FleetAccounts.online(machine), state: stateOn(id, view), done: doneOn(id, view))
        }
    }

    // MARK: Name it

    private func buildName(_ view: FleetAccounts.View?) {
        content.addArrangedSubview(heading("Name it"))
        let showsLabel = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        showsLabel.text = "How it shows"
        let tile = AccountTileView(provider: choice?.provider ?? "", hue: hue, side: 28)
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        let email = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        let names = UIStackView(arrangedSubviews: [name, email])
        names.axis = .vertical
        let card = UIStackView(arrangedSubviews: [tile, names, UIView()])
        card.spacing = Space.space3
        card.alignment = .center
        card.isLayoutMarginsRelativeArrangement = true
        card.directionalLayoutMargins = .init(top: Space.space3, leading: Space.space4, bottom: Space.space3, trailing: Space.space4)
        card.backgroundColor = Palette.surfaceRaised
        card.layer.cornerRadius = Radius.radiusMd
        card.accessibilityIdentifier = "setup.preview"
        card.widthAnchor.constraint(lessThanOrEqualToConstant: 360).isActive = true
        preview = (tile, name, email)
        let field = KitField(placeholder: "Leave empty to use the email")
        field.text = nickname
        field.accessibilityLabel = "Nickname, optional"
        field.accessibilityIdentifier = "setup.nickname"
        field.delegate = self
        field.widthAnchor.constraint(lessThanOrEqualToConstant: 280).isActive = true
        field.addAction(UIAction { [weak self, weak field] _ in
            self?.nickname = field?.text ?? ""
            self?.requestRefresh()
        }, for: .editingChanged)
        let nicknameLabel = UILabel()
        let words = NSMutableAttributedString(string: "Nickname ", attributes: [.font: TypeScale.typeLabel.font, .foregroundColor: Palette.inkStrong])
        words.append(NSAttributedString(string: "optional", attributes: [.font: TypeScale.typeLabel.withWeight(.regular).font, .foregroundColor: Palette.inkMuted]))
        nicknameLabel.attributedText = words
        let colourLabel = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        colourLabel.text = "Colour"
        let swatches = SwatchesView(value: hue)
        swatches.onPick = { [weak self] picked in
            self?.hue = picked
            self?.requestRefresh()
        }
        for (label, control) in [(showsLabel as UIView, card as UIView), (nicknameLabel, field), (colourLabel, swatches)] {
            let fieldStack = UIStackView(arrangedSubviews: [label, control])
            fieldStack.axis = .vertical
            fieldStack.alignment = control === swatches ? .fill : .leading
            fieldStack.spacing = Space.space2
            content.addArrangedSubview(fieldStack)
        }
        drawPreview(view)
    }

    private func drawPreview(_ view: FleetAccounts.View?) {
        guard let preview else { return }
        preview.tile.set(provider: choice?.provider ?? "", hue: hue)
        let label = nickname.trimmingCharacters(in: .whitespaces)
        let mail = email(view)
        preview.name.text = !label.isEmpty || mail != nil ? FleetAccounts.name(label: label.isEmpty ? nil : label, email: mail, kind: choice?.kind) : "Not signed in yet"
        preview.email.text = !label.isEmpty ? mail : nil
        preview.email.isHidden = preview.email.text == nil
    }

    // MARK: Moving through

    private func drawFoot(_ view: FleetAccounts.View?) {
        let count = signedIn(view)
        let canGo = at == "Provider" ? false : at != "Sign in" || count > 0
        let keyFirst = at == "Sign in" && choice?.signin == "api-key" && count == 0
        let label = step == last ? (full ? "Open Accounts" : "Save account") : "Continue"
        for (button, variant) in [(next, KitButton.Variant.action), (nextQuiet, .outline)] {
            button.isHidden = (variant == .outline) != keyFirst
            KitButton.setTitle(busy ? "Saving…" : label, of: button, variant: variant, height: .standard)
            button.configuration?.showsActivityIndicator = busy
            button.isEnabled = canGo && !busy
        }
        back.isEnabled = step > 0 && !busy && !(step == 1 && count > 0)
        navigationItem.leftBarButtonItem?.isEnabled = !busy
        problem.text = refused
        fold(problem, open: refused != nil)
    }

    private func goOn() {
        let view = FleetAccounts.view(hub)
        guard !busy else { return }
        refused = nil
        busy = true
        requestRefresh()
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                if at == "Name it", let made = createdId {
                    let label = nickname.trimmingCharacters(in: .whitespaces)
                    try await hub.patchAccount(made, label: .some(label.isEmpty ? nil : label), hue: hue)
                }
                if at == (limits ? "At the limit" : "Delegates"), full, let provider {
                    try await hub.putRouting(provider, yours: yours, delegates: delegates, atLimit: atLimit)
                    // Each account whose place the drag changed takes it, from 0.
                    let latest = FleetAccounts.view(hub) ?? view
                    for (place, id) in order(latest).enumerated() {
                        if let one = latest?.accounts.first(where: { $0.id == id }), Int(one.order) != place {
                            try await hub.patchAccount(id, order: place)
                        }
                    }
                }
            } catch {
                refused = error.localizedDescription
                busy = false
                requestRefresh()
                return
            }
            busy = false
            if step == last {
                navigationController?.popViewController(animated: true)
                return
            }
            step += 1
            requestRefresh()
        }
    }

    private func goBack() {
        guard step > 0, !busy else { return }
        refused = nil
        step -= 1
        requestRefresh()
    }

    /// Cancel takes back an account no machine signed in; one signed in stays.
    private func cancel() {
        guard !busy else { return }
        let view = FleetAccounts.view(hub)
        guard let made = createdId, signedIn(view) == 0 else {
            SignInBrowser.close()
            navigationController?.popViewController(animated: true)
            return
        }
        busy = true
        requestRefresh()
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try await hub.deleteAccount(made)
            } catch {
                refused = error.localizedDescription
                busy = false
                requestRefresh()
                return
            }
            busy = false
            SignInBrowser.close()
            navigationController?.popViewController(animated: true)
        }
    }

    func textFieldShouldReturn(_ field: UITextField) -> Bool {
        field.resignFirstResponder()
        return true
    }

    #if DEBUG
    var probeStep: String { at }
    var probeCreated: String? { createdId }
    func probeChoose(_ key: String) {
        guard let row = FleetAccounts.choices(hub)?.first(where: { $0.key == key }) else { return }
        choose(row)
    }

    func probeNext() { goOn() }
    func probeCancel() { cancel() }
    func probeName(_ text: String) {
        nickname = text
        requestRefresh()
    }

    var probeKeyPanel: KeyPanel? { keyPanel }
    var probeRows: [SetupMachineRow] { Array(signinRows.values) }
    var probeFoot: String {
        let shown = next.isHidden ? nextQuiet : next
        return "[Back\(back.isEnabled ? "" : " (disabled)")] [\(shown.configuration?.attributedTitle.map { String($0.characters) } ?? "")\(shown.isEnabled ? "" : " (disabled)")]"
            + (refused.map { " refused: \($0)" } ?? "")
    }

    var probeContent: [String] { AccountsProbe.texts(in: content) }
    #endif
}

/// One provider row of the picker (`.choice`): its 26pt raised tile with the
/// provider's mark, its name, the chevron; a row no machine can use stands
/// at half strength and says why under its name.
final class ProviderChoiceRow: UIControl {
    init(choice: FleetAccounts.Choice, why: String?) {
        super.init(frame: .zero)
        let tile = TileView(radius: Radius.radiusSm)
        tile.backgroundColor = Palette.surfaceRaised
        let mark = providerMark(choice.provider)
        tile.addSubview(mark)
        let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkRow)
        label.text = FleetAccounts.choiceLabel(choice)
        label.lineBreakMode = .byTruncatingTail
        let words = UIStackView(arrangedSubviews: [label])
        words.axis = .vertical
        if let why { words.addArrangedSubview(metaLine(why)) }
        let chevron = GlyphView(.chevronRight, size: 16, tint: Palette.inkSubtle)
        let row = UIStackView(arrangedSubviews: [tile, words, chevron])
        row.spacing = Space.space3
        row.alignment = .center
        row.isUserInteractionEnabled = false
        row.translatesAutoresizingMaskIntoConstraints = false
        words.setContentHuggingPriority(.defaultLow, for: .horizontal)
        addSubview(row)
        NSLayoutConstraint.activate([
            tile.widthAnchor.constraint(equalToConstant: 26), tile.heightAnchor.constraint(equalToConstant: 26),
            mark.centerXAnchor.constraint(equalTo: tile.centerXAnchor), mark.centerYAnchor.constraint(equalTo: tile.centerYAnchor),
            heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHLg),
            row.topAnchor.constraint(greaterThanOrEqualTo: topAnchor, constant: Space.space2),
            row.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor, constant: -Space.space2),
            row.centerYAnchor.constraint(equalTo: centerYAnchor),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space3),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space4),
        ])
        alpha = why == nil ? 1 : 0.5
        isAccessibilityElement = true
        accessibilityLabel = label.text
        accessibilityHint = why
        accessibilityTraits = why == nil ? .button : [.button, .notEnabled]
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ProviderChoiceRow is built in code")
    }

    override var isHighlighted: Bool {
        didSet { backgroundColor = isHighlighted && alpha == 1 ? Palette.surfaceFill : .clear }
    }
}

/// One machine of the setup's Sign in step: its name and where it stands, and
/// its one control. Claude's row: Sign in opens Claude Code's link and opens
/// the row onto the link, the paste field and Done. A device-code row holds
/// its panel from the start. Continue is how a machine is skipped.
final class SetupMachineRow: UIStackView {
    private let state = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let stateGlyph = GlyphView(.passed, size: 14, tint: Palette.statusDoneGlyph)
    private var signIn: UIButton?
    private let flow: PasteSignin?
    private let panel: UIView
    private let name: String

    init(name: String, paste flow: PasteSignin, panel: PastePanel) {
        self.flow = flow
        self.panel = panel
        self.name = name
        super.init(frame: .zero)
        signIn = KitButton.make("Sign in", variant: .outline, height: .sm) { [weak self, weak panel] in
            guard let self, let panel else { return }
            Task { @MainActor in
                guard await flow.open(), let url = flow.url else { return }
                SignInBrowser.open(url, from: panel)
                _ = self
            }
        }
        signIn?.accessibilityLabel = "Sign in on \(name)"
        signIn?.accessibilityIdentifier = "setup.signin.\(name)"
        build(name)
        panel.isHidden = true
    }

    init(name: String, device panel: DevicePanel) {
        flow = nil
        self.panel = panel
        self.name = name
        super.init(frame: .zero)
        build(name)
    }

    private var devicePanel: DevicePanel? { panel as? DevicePanel }
    private var pastePanel: PastePanel? { panel as? PastePanel }

    private func build(_ text: String) {
        axis = .vertical
        spacing = Space.space2
        isLayoutMarginsRelativeArrangement = true
        directionalLayoutMargins = .init(top: Space.space3, leading: 0, bottom: Space.space3, trailing: 0)
        let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        label.text = text
        label.lineBreakMode = .byTruncatingTail
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let status = UIStackView(arrangedSubviews: [stateGlyph, state] + [signIn].compactMap(\.self))
        status.spacing = Space.space2
        status.alignment = .center
        let top = UIStackView(arrangedSubviews: [label, UIView(), status])
        top.alignment = .center
        top.spacing = Space.space3
        top.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHSm).isActive = true
        addArrangedSubview(top)
        addArrangedSubview(panel)
        accessibilityIdentifier = "setup.machine.\(text)"
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("SetupMachineRow is built in code")
    }

    func draw(online: Bool, state signin: String, done: Bool) {
        let mismatch = signin == "mismatch" || flow?.phase == .mismatch
        let asked = flow.map { $0.phase != .idle || $0.url != nil } ?? true
        let words: String? = done && flow != nil ? "Signed in" : mismatch && !done ? "Someone else" : !online && !done ? "Offline" : nil
        state.text = words
        state.isHidden = words == nil
        state.ink = done ? Palette.statusDoneInk : mismatch ? Palette.statusAttnInk : Palette.inkMuted
        stateGlyph.glyph = done ? .passed : .warning
        stateGlyph.tintColor = done ? Palette.statusDoneGlyph : Palette.statusAttnInk
        stateGlyph.isHidden = !(done && flow != nil) && !(mismatch && !done)
        signIn?.isHidden = done || mismatch || !online || asked
        if let pastePanel {
            fold(pastePanel, open: asked && !done)
            pastePanel.draw(online: online)
        }
        devicePanel?.draw(online: online)
    }

    #if DEBUG
    var probeState: String { "\(name): " + AccountsProbe.texts(in: self).joined(separator: " / ") }
    func probePress() { signIn?.sendActions(for: .primaryActionTriggered) }
    #endif
}
