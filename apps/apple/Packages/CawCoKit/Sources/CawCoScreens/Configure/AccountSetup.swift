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
/// so its email is known and becomes its name. Cancel, at the top right of
/// the card as the web's section actions stand, takes back an account no
/// machine signed in.
///
/// As on the web (`@container setup (width < 640px)`): where the card's
/// content is 640pt or wider, the steps are a list at its left (184pt) and
/// Back and Continue stand under the step's box; narrower, the steps are a
/// row of marks with the current one named (each still read out by name),
/// and Back and Continue stand at the screen's foot, over the keyboard when
/// one is up.
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
    /// The section's card on the recess (SectionFrame.svelte `.body`).
    private let card = UIView()
    private let titleLabel = KitLabel(TypeScale.typeTitle, ink: Palette.inkStrong, lines: 0)
    private lazy var cancelButton = KitButton.make(Words.Configure.cancel, variant: .outline) { [weak self] in self?.cancel() }
    /// The steps beside the work (wide) or over it (narrow): `.setup`.
    private let setup = UIStackView()
    private let steps = UIStackView()
    /// The step's box, the problem under it, and (wide) the foot.
    private let work = UIStackView()
    private let box = UIView()
    private let content = UIStackView()
    private var contentInsets: [NSLayoutConstraint] = []
    private let problem = metaLine(ink: Palette.statusFailInk)
    /// Back and Continue (`.foot`): under the box when wide, pinned to the screen's foot when narrow.
    private let foot = UIStackView()
    /// The narrow foot's own ground, across the card's width (`.foot` under 640px).
    private let footBar = UIView()
    /// The wide foot's place in the work column.
    private let footWrap = UIStackView()
    private var scrollToFoot: NSLayoutConstraint!
    private var scrollToBottom: NSLayoutConstraint!
    /// Whether the card's content is 640pt or wider; nil until first laid out.
    private var wide: Bool?
    private lazy var back = KitButton.make(Words.Accounts.Setup.back, variant: .outline) { [weak self] in self?.goBack() }
    private lazy var forward = KitButton.make(Words.Accounts.Setup.next, variant: .action) { [weak self] in self?.goOn() }
    /// Continue while a key is not on any machine yet: Send key is the step's primary.
    private lazy var nextQuiet = KitButton.make(Words.Accounts.Setup.next, variant: .outline) { [weak self] in self?.goOn() }
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
        navigationItem.title = Words.Accounts.Setup.title
        navigationItem.largeTitleDisplayMode = .never
        // Leaving is Cancel's (in the card): it takes back an account no machine signed in.
        navigationItem.hidesBackButton = true
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("AccountSetupController is built in code")
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        // Gone from the stack: a device code still waited for stops being asked after.
        guard isMovingFromParent || navigationController == nil else { return }
        for flow in device.values { flow.dispose() }
    }

    // MARK: Steps

    private var provider: String? { choice?.provider }
    private var limits: Bool { provider.map(FleetAccounts.limits) ?? false }
    private var full: Bool { existing != nil }

    /// A step, by the key its name stands under (`Words.Accounts.Setup.Steps`).
    enum Step: String {
        case provider, signIn, nameIt, yourSessions, delegates, atLimit, done

        var name: String { Words.Accounts.Setup.Steps.byKey[rawValue] ?? rawValue }
    }

    private var stepList: [Step] {
        [.provider, .signIn, .nameIt] + (full ? [.yourSessions, .delegates] + (limits ? [.atLimit] : []) + [.done] : [])
    }

    private var at: Step { stepList[step] }
    private var last: Int { stepList.count - 1 }

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

        // `.body`: the raised card on the recess, `space6` by `space7` inside.
        card.backgroundColor = Palette.surfaceRaised
        card.layer.cornerRadius = Radius.radiusLg
        card.layer.cornerCurve = .continuous
        card.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(card)

        // `.head`: the title and the section's actions (Cancel) at its right.
        titleLabel.text = Words.Accounts.Setup.title
        titleLabel.tracking = -0.01
        titleLabel.accessibilityTraits = .header
        titleLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        cancelButton.accessibilityIdentifier = "setup.cancel"
        cancelButton.setContentHuggingPriority(.required, for: .horizontal)
        let head = UIStackView(arrangedSubviews: [titleLabel, UIView(), cancelButton])
        head.alignment = .top
        head.spacing = 12

        steps.accessibilityLabel = Words.Accounts.Setup.stepsLabel
        box.backgroundColor = Palette.surfaceWell
        box.layer.cornerRadius = Radius.radiusLg
        box.layer.cornerCurve = .continuous
        box.layer.borderWidth = 1
        box.clipsToBounds = true
        content.axis = .vertical
        content.spacing = Space.space4
        content.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(content)
        contentInsets = [
            content.topAnchor.constraint(equalTo: box.topAnchor),
            box.bottomAnchor.constraint(equalTo: content.bottomAnchor),
            content.leadingAnchor.constraint(equalTo: box.leadingAnchor),
            box.trailingAnchor.constraint(equalTo: content.trailingAnchor),
        ]
        problem.isHidden = true
        work.axis = .vertical
        work.addArrangedSubview(box)
        work.addArrangedSubview(problem)
        work.setCustomSpacing(Space.space3, after: box)

        back.accessibilityIdentifier = "setup.back"
        forward.accessibilityIdentifier = "setup.next"
        nextQuiet.accessibilityIdentifier = "setup.next"
        forward.widthAnchor.constraint(greaterThanOrEqualToConstant: 96).isActive = true
        foot.addArrangedSubview(UIView())
        foot.addArrangedSubview(back)
        foot.addArrangedSubview(nextQuiet)
        foot.addArrangedSubview(forward)
        foot.spacing = Space.space3
        foot.alignment = .center

        let body = UIStackView(arrangedSubviews: [head, setup])
        body.axis = .vertical
        body.spacing = Space.space6
        body.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(body)

        // Under 640pt the foot stands on its own ground at the screen's foot,
        // across the card's width, over the keyboard when one is up.
        footBar.backgroundColor = Palette.surfaceRaised
        footBar.translatesAutoresizingMaskIntoConstraints = false
        footBar.isHidden = true
        view.addSubview(footBar)

        let safe = view.safeAreaLayoutGuide
        let fits = card.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -Space.space5 * 2)
        fits.priority = .defaultHigh
        scrollToFoot = scroll.bottomAnchor.constraint(equalTo: footBar.topAnchor)
        scrollToBottom = scroll.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor)
        NSLayoutConstraint.activate(contentInsets + [
            scroll.topAnchor.constraint(equalTo: safe.topAnchor),
            scroll.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            scrollToBottom,
            // `.ground`: the pages' gutter, `space2` above and below and `space5` at the side.
            card.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: Space.space2),
            scroll.contentLayoutGuide.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: Space.space2),
            card.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: Space.space5),
            scroll.contentLayoutGuide.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
            // `.body`: 980pt at most, at the pane's leading edge.
            card.widthAnchor.constraint(lessThanOrEqualToConstant: 980),
            card.widthAnchor.constraint(lessThanOrEqualTo: scroll.frameLayoutGuide.widthAnchor, constant: -Space.space5 * 2),
            fits,
            body.topAnchor.constraint(equalTo: card.topAnchor, constant: Space.space6),
            body.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: Space.space7),
            body.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -Space.space7),
            card.bottomAnchor.constraint(equalTo: body.bottomAnchor, constant: Space.space6),
            footBar.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            footBar.trailingAnchor.constraint(equalTo: card.trailingAnchor),
            footBar.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
        ])
        // Hidden and empty on a wide page: no height of its own then.
        let empty = footBar.heightAnchor.constraint(equalToConstant: 0)
        empty.priority = .defaultLow
        empty.isActive = true
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (setup: AccountSetupController, _: UITraitCollection) in setup.paintBox() }
        registerForTraitChanges([UITraitHorizontalSizeClass.self]) { (setup: AccountSetupController, _: UITraitCollection) in setup.drawTitle() }
        paintBox()
        drawTitle()
    }

    private func paintBox() {
        box.layer.borderColor = Palette.borderWell.resolvedColor(with: traitCollection).cgColor
    }

    /// A compact width's navigation bar says the title; a wide card says it itself (SectionFrame).
    private func drawTitle() {
        titleLabel.isHidden = traitCollection.horizontalSizeClass == .compact
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        // The web's container query: the setup's own width, 640 or more.
        let now = card.bounds.width - Space.space7 * 2 >= 640
        guard now != wide, card.bounds.width > 0 else { return }
        wide = now
        arrangeSetup()
    }

    /// The steps and the work, and where the foot stands, for the setup's width.
    private func arrangeSetup() {
        let wide = wide ?? false
        setup.arrangedSubviews.forEach { $0.removeFromSuperview() }
        foot.removeFromSuperview()
        setup.axis = wide ? .horizontal : .vertical
        setup.alignment = wide ? .top : .fill
        setup.spacing = wide ? Space.space7 : Space.space4
        steps.axis = wide ? .vertical : .horizontal
        steps.spacing = wide ? 2 : Space.space1
        steps.alignment = wide ? .fill : .center
        setup.addArrangedSubview(steps)
        setup.addArrangedSubview(work)
        footWrap.removeFromSuperview()
        if wide {
            steps.widthAnchor.constraint(equalToConstant: 184).isActive = true
            // `.problem` stands `space3` under the box, `.foot` `space5` under whatever is last.
            work.setCustomSpacing(Space.space3, after: box)
            work.setCustomSpacing(Space.space3, after: problem)
            footWrap.isLayoutMarginsRelativeArrangement = true
            footWrap.directionalLayoutMargins = .init(top: Space.space5 - Space.space3, leading: 0, bottom: 0, trailing: 0)
            footWrap.addArrangedSubview(foot)
            work.addArrangedSubview(footWrap)
        } else {
            steps.constraints.filter { $0.firstAttribute == .width }.forEach { $0.isActive = false }
            foot.translatesAutoresizingMaskIntoConstraints = false
            footBar.addSubview(foot)
            NSLayoutConstraint.activate([
                foot.topAnchor.constraint(equalTo: footBar.topAnchor, constant: Space.space3),
                foot.leadingAnchor.constraint(equalTo: footBar.leadingAnchor, constant: Space.space7),
                foot.trailingAnchor.constraint(equalTo: footBar.trailingAnchor, constant: -Space.space7),
                footBar.bottomAnchor.constraint(equalTo: foot.bottomAnchor, constant: Space.space2),
            ])
        }
        footBar.isHidden = wide
        scrollToFoot.isActive = !wide
        scrollToBottom.isActive = wide
        // `.in`: `space6` inside the box, `space4` on a narrow page.
        let inset = wide ? Space.space6 : Space.space4
        for constraint in contentInsets { constraint.constant = inset }
        drawSteps()
        // The machine rows take the width's arrangement on the next draw.
        requestRefresh()
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
        if at == .signIn { drawSignin(view) }
        if at == .nameIt { drawPreview(view) }
        drawFoot(view)
    }

    /// The steps (`.steps`): a check for each done, a dot for the rest, the
    /// current one on the selected wash. Wide, a list naming each; narrow, a
    /// row of marks naming only the current one, every one read out by name
    /// (the web's visually hidden names).
    private func drawSteps() {
        steps.arrangedSubviews.forEach { $0.removeFromSuperview() }
        let compact = !(wide ?? false)
        for (place, name) in stepList.map(\.name).enumerated() {
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
            // `.step`: 34pt, `space3` between mark and name, `space3` in from its sides (`space2` narrow).
            let item = UIStackView(arrangedSubviews: [mark])
            item.spacing = Space.space3
            item.alignment = .center
            item.isLayoutMarginsRelativeArrangement = true
            let side = compact ? Space.space2 : Space.space3
            item.directionalLayoutMargins = .init(top: 0, leading: side, bottom: 0, trailing: side)
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
            item.accessibilityValue = place < step ? Words.Accounts.Setup.stepPassed : place == step ? Words.Accounts.Setup.stepCurrent : nil
            item.accessibilityIdentifier = place == step ? "setup.step.current" : nil
            if !compact { item.addArrangedSubview(UIView()) }
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
        case .provider: buildPick()
        case .signIn: buildSignin()
        case .nameIt: buildName(view)
        case .yourSessions, .delegates:
            content.addArrangedSubview(heading(at.name))
            if let pair = pair(view) {
                let mine = at == .yourSessions
                let picker = StrategyPickerView(provider: pair[0].provider, label: at.name, accounts: pair, choice: mine ? yours : delegates, order: order(view))
                picker.onChoice = { [weak self] choice in
                    if mine { self?.yours = choice } else { self?.delegates = choice }
                }
                picker.onOrder = { [weak self] ids in self?.dragged = ids }
                content.addArrangedSubview(picker)
            }
        case .atLimit:
            content.addArrangedSubview(heading(at.name))
            if let pair = pair(view) {
                let block = AtLimitView(accounts: (pair[1], pair[0]), terms: provider == FleetAccounts.claude, value: atLimit)
                block.onChange = { [weak self] next in self?.atLimit = next }
                content.addArrangedSubview(block)
            }
        case .done:
            if let pair = pair(view) {
                content.addArrangedSubview(heading(Words.Accounts.Setup.setUp(first: FleetAccounts.name(pair[0]), second: FleetAccounts.name(pair[1]))))
                let lead = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
                let line = FleetAccounts.routingLine(pair, yours: yours, delegates: delegates)
                lead.text = limits && atLimit.move ? Words.Accounts.Setup.withMoves(line: line) : line
                lead.wrap = .pretty
                content.addArrangedSubview(lead)
            }
        }
    }

    // MARK: Provider

    private func buildPick() {
        let choices = FleetAccounts.choices(hub) ?? []
        if choices.count > 8 {
            let search = KitField(placeholder: Words.Accounts.Setup.search)
            search.accessibilityLabel = Words.Accounts.Setup.search
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
        let groups = [(Words.Accounts.Setup.pickSignin, shown.filter { $0.signin != "api-key" }),
                      (Words.Accounts.Setup.pickKeys, shown.filter { $0.signin == "api-key" })].filter { !$0.1.isEmpty }
        guard !groups.isEmpty else {
            rows.addArrangedSubview(metaLine(Words.Accounts.Setup.noMatch(query: query.trimmingCharacters(in: .whitespaces))))
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
                let why = runners.isEmpty
                    ? Words.Accounts.Setup.noMachineRuns(harnesses: row.harnesses.compactMap { FleetAccounts.harnessWords[$0] })
                    : nil
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
        guard let row = choice else { throw HubSaid(Words.Accounts.Setup.chooseFirst) }
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
        if count > 0, choice.signin != "device-code", banner?.isHidden == true { signedAs.say(email(view) ?? Words.Accounts.Signin.theAccount) }
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
                let none = metaLine(Words.Accounts.Setup.none(harnesses: FleetAccounts.harnessWords(choice.provider, hub: hub)))
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
                    row = SetupMachineRow(name: machine.name, paste: flow)
                }
                row.addHairline()
                signinRows[id] = row
                rows.addArrangedSubview(row)
            }
        }
        for machine in machines {
            let id = machine.machineId
            signinRows[id]?.arrange(wide: wide ?? false)
            signinRows[id]?.draw(online: FleetAccounts.online(machine), state: stateOn(id, view), done: doneOn(id, view))
        }
    }

    // MARK: Name it

    private func buildName(_ view: FleetAccounts.View?) {
        content.addArrangedSubview(heading(Step.nameIt.name))
        let showsLabel = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        showsLabel.text = Words.Accounts.Setup.howItShows
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
        let field = KitField(placeholder: Words.Accounts.Setup.nicknamePlaceholder)
        field.text = nickname
        field.accessibilityLabel = Words.Accounts.Setup.nicknameSaid
        field.accessibilityIdentifier = "setup.nickname"
        field.delegate = self
        field.widthAnchor.constraint(lessThanOrEqualToConstant: 280).isActive = true
        field.addAction(UIAction { [weak self, weak field] _ in
            self?.nickname = field?.text ?? ""
            self?.requestRefresh()
        }, for: .editingChanged)
        let nicknameLabel = UILabel()
        // "Nickname" in the label's weight, then "optional" in the body's, muted, a space between.
        let words = NSMutableAttributedString(string: Words.Accounts.Setup.nickname, attributes: [.font: TypeScale.typeLabel.font, .foregroundColor: Palette.inkStrong])
        words.append(NSAttributedString(string: " ", attributes: [.font: TypeScale.typeLabel.font]))
        words.append(NSAttributedString(string: Words.Accounts.Setup.optional,
                                        attributes: [.font: TypeScale.typeLabel.withWeight(.regular).font, .foregroundColor: Palette.inkMuted]))
        nicknameLabel.attributedText = words
        let colourLabel = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        colourLabel.text = Words.Accounts.colour
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
        preview.name.text = !label.isEmpty || mail != nil
            ? FleetAccounts.name(label: label.isEmpty ? nil : label, email: mail, kind: choice?.kind)
            : Words.Accounts.notSignedInYet
        preview.email.text = !label.isEmpty ? mail : nil
        preview.email.isHidden = preview.email.text == nil
    }

    // MARK: Moving through

    private func drawFoot(_ view: FleetAccounts.View?) {
        let count = signedIn(view)
        let canGo = at == .provider ? false : at != .signIn || count > 0
        let keyFirst = at == .signIn && choice?.signin == "api-key" && count == 0
        let label = step == last ? (full ? Words.Accounts.Setup.openAccounts : Words.Accounts.Setup.save) : Words.Accounts.Setup.next
        for (button, variant) in [(forward, KitButton.Variant.action), (nextQuiet, .outline)] {
            button.isHidden = (variant == .outline) != keyFirst
            KitButton.setTitle(busy ? Words.Configure.saving : label, of: button, variant: variant, height: .standard)
            button.configuration?.showsActivityIndicator = busy
            button.isEnabled = canGo && !busy
        }
        back.isEnabled = step > 0 && !busy && !(step == 1 && count > 0)
        cancelButton.isEnabled = !busy
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
                if at == .nameIt, let made = createdId {
                    let label = nickname.trimmingCharacters(in: .whitespaces)
                    try await hub.patchAccount(made, label: .some(label.isEmpty ? nil : label), hue: hue)
                }
                if at == (limits ? .atLimit : .delegates), full, let provider {
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
    var probeStep: String { at.name }
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
        let shown = forward.isHidden ? nextQuiet : forward
        return "[Back\(back.isEnabled ? "" : " (disabled)")] [\(shown.configuration?.attributedTitle.map { String($0.characters) } ?? "")\(shown.isEnabled ? "" : " (disabled)")]"
            + (refused.map { " refused: \($0)" } ?? "")
    }

    var probeContent: [String] { AccountsProbe.texts(in: content) }
    /// The picker as drawn: each group's name, then its rows' names, in order
    /// (AccountSetup.svelte `pickGroups`). A row's name alone: a row no
    /// machine can use says why under it, and that is not its name.
    var probePicker: [String] {
        (searchRows?.arrangedSubviews ?? []).compactMap { part in
            (part as? ProviderChoiceRow)?.accessibilityLabel ?? AccountsProbe.texts(in: part).first
        }
    }

    /// The steps as drawn and as VoiceOver reads them: each one's name and state,
    /// the layout (a list or a row of marks), and where Cancel stands.
    var probeSteps: String {
        let read = steps.arrangedSubviews.compactMap { item in
            item.accessibilityLabel.map { [$0, item.accessibilityValue].compactMap(\.self).joined(separator: " — ") }
        }
        let drawn = AccountsProbe.texts(in: steps)
        return "\(wide == true ? "list" : "row of marks"): \(read.joined(separator: " / ")) | drawn: \(drawn.joined(separator: " / "))"
            + " | cancel \(cancelButton.window == nil ? "not drawn" : "in the card")"
    }
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

/// Claude's row once asked (AccountSetup.svelte `.mrow.paste .controls`):
/// the link, the field the code it shows is pasted into, and Done, on one
/// line where there is room and the field and Done under the link where
/// there isn't (the web's wrap: the field is 140pt at least).
final class SetupPasteControls: UIStackView, UITextFieldDelegate {
    private let flow: PasteSignin
    private lazy var link = KitButton.make(Words.Accounts.Signin.openLink, glyph: .external, variant: .outline, height: .sm) { [weak self] in
        self?.openLink()
    }
    private let field = KitField(placeholder: Words.Accounts.Setup.pasteCode)
    private lazy var doneButton = KitButton.make(Words.Accounts.Signin.done, variant: .action, height: .sm) { [weak self] in self?.submit() }
    private let linkLine = UIStackView()
    private let codeLine = UIStackView()
    /// One line where its parts fit (link, a 140pt field, Done); else two.
    private var oneLine: Bool?

    init(flow: PasteSignin, machine: String) {
        self.flow = flow
        super.init(frame: .zero)
        spacing = Space.space2
        field.accessibilityLabel = Words.Accounts.Setup.codeFor(machine: machine)
        field.accessibilityIdentifier = "setup.code.\(flow.machineId)"
        field.delegate = self
        field.returnKeyType = .done
        field.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            flow.code = field.text ?? ""
            draw()
        }, for: .editingChanged)
        field.widthAnchor.constraint(greaterThanOrEqualToConstant: 140).isActive = true
        link.accessibilityIdentifier = "setup.link.\(flow.machineId)"
        doneButton.accessibilityIdentifier = "setup.done.\(flow.machineId)"
        linkLine.addArrangedSubview(link)
        linkLine.addArrangedSubview(UIView())
        codeLine.spacing = Space.space2
        codeLine.alignment = .center
        codeLine.addArrangedSubview(field)
        codeLine.addArrangedSubview(doneButton)
        addArrangedSubview(linkLine)
        addArrangedSubview(codeLine)
        arrange(oneLine: true)
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("SetupPasteControls is built in code")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let room = link.intrinsicContentSize.width + 140 + doneButton.intrinsicContentSize.width + Space.space2 * 2
        let fits = bounds.width >= room
        if fits != oneLine { arrange(oneLine: fits) }
    }

    private func arrange(oneLine fits: Bool) {
        oneLine = fits
        axis = fits ? .horizontal : .vertical
        alignment = fits ? .center : .fill
        // On one line the link takes only its own width; on two it stands at the left of its own.
        linkLine.arrangedSubviews.last?.isHidden = fits
    }

    /// Reads the flow (an observed read: its owner draws again when it moves).
    func draw() {
        let phase = flow.phase
        let words = Words.Accounts.Signin.self
        KitButton.setTitle(phase == .opening ? words.opening : words.openLink, of: link, variant: .outline, height: .sm)
        link.configuration?.showsActivityIndicator = phase == .opening
        // The link is a link once the machine has answered one; until then, pending.
        link.isEnabled = flow.url != nil
        field.isEnabled = flow.url != nil
        if !field.isFirstResponder, field.text != flow.code { field.text = flow.code }
        field.accessibilityValue = flow.problem == nil ? nil : Words.Accounts.Editor.invalid
        KitButton.setTitle(phase == .checking ? words.checking : words.done, of: doneButton, variant: .action, height: .sm)
        doneButton.configuration?.showsActivityIndicator = phase == .checking
        doneButton.isEnabled = flow.url != nil && !flow.code.trimmingCharacters(in: .whitespaces).isEmpty && phase != .checking
    }

    private func openLink() {
        guard let url = flow.url else { return }
        SignInBrowser.open(url, from: self)
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
    func probeSubmit(_ code: String) {
        field.text = code
        field.sendActions(for: .editingChanged)
        submit()
    }
    #endif
}

/// One machine of the setup's Sign in step (AccountSetup.svelte `.mrow`):
/// its name and where it stands, and its one control. Claude's row: Sign
/// in opens Claude Code's link and opens the row onto the link, the paste
/// field and Done; a refusal or a sign-in as someone else stands under them.
/// A device-code row holds its panel from the start: beside the name on a
/// wide page (`name controls st`), under it on a narrow one. Continue is how
/// a machine is skipped.
final class SetupMachineRow: UIStackView {
    private let state = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let stateGlyph = GlyphView(.passed, size: 14, tint: Palette.statusDoneGlyph)
    private let nameLabel = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
    private var signIn: UIButton?
    private let flow: PasteSignin?
    private let controls: UIView
    private let status = UIStackView()
    private let top = UIStackView()
    /// The row's refusal (`.row-problem`) and its sign-in as someone else (`.row-warn`).
    private let problem = metaLine(ink: Palette.statusFailInk)
    private let warn = metaLine(ink: Palette.statusAttnInk)
    private let name: String
    private var wide: Bool?

    init(name: String, paste flow: PasteSignin) {
        self.flow = flow
        controls = SetupPasteControls(flow: flow, machine: name)
        self.name = name
        super.init(frame: .zero)
        signIn = KitButton.make(Words.Accounts.Setup.signIn, variant: .outline, height: .sm) { [weak self] in
            guard let self else { return }
            Task { @MainActor [weak self] in
                guard await flow.open(), let url = flow.url, let self else { return }
                SignInBrowser.open(url, from: self)
            }
        }
        signIn?.accessibilityLabel = Words.Accounts.Setup.signInOn(machine: name)
        signIn?.accessibilityIdentifier = "setup.signin.\(name)"
        build(name)
        controls.isHidden = true
    }

    init(name: String, device panel: DevicePanel) {
        flow = nil
        controls = panel
        self.name = name
        super.init(frame: .zero)
        build(name)
    }

    private var devicePanel: DevicePanel? { controls as? DevicePanel }
    private var pasteControls: SetupPasteControls? { controls as? SetupPasteControls }

    private func build(_ text: String) {
        axis = .vertical
        spacing = Space.space2
        isLayoutMarginsRelativeArrangement = true
        directionalLayoutMargins = .init(top: Space.space3, leading: 0, bottom: Space.space3, trailing: 0)
        nameLabel.text = text
        nameLabel.lineBreakMode = .byTruncatingTail
        nameLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        for part in [stateGlyph, state] + [signIn].compactMap(\.self) { status.addArrangedSubview(part) }
        status.spacing = Space.space2
        status.alignment = .center
        status.setContentHuggingPriority(.required, for: .horizontal)
        top.alignment = .center
        top.spacing = Space.space3
        top.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHSm).isActive = true
        problem.isHidden = true
        warn.isHidden = true
        arrange(wide: false)
        accessibilityIdentifier = "setup.machine.\(text)"
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("SetupMachineRow is built in code")
    }

    /// A device row's `name controls st` on one line when the setup is wide; every row's name and state over its controls otherwise.
    func arrange(wide now: Bool) {
        let oneLine = now && devicePanel != nil
        guard oneLine != wide else { return }
        wide = oneLine
        arrangedSubviews.forEach { $0.removeFromSuperview() }
        top.arrangedSubviews.forEach { $0.removeFromSuperview() }
        top.alignment = oneLine ? .top : .center
        if oneLine {
            // `.mrow`'s columns: the name at 150pt, the panel taking the rest, the state at the end.
            nameLabel.widthAnchor.constraint(equalToConstant: 150).isActive = true
            for part in [nameLabel, controls, status] { top.addArrangedSubview(part) }
            addArrangedSubview(top)
        } else {
            nameLabel.constraints.filter { $0.firstAttribute == .width }.forEach { $0.isActive = false }
            for part in [nameLabel, UIView(), status] { top.addArrangedSubview(part) }
            addArrangedSubview(top)
            addArrangedSubview(controls)
        }
        addArrangedSubview(problem)
        addArrangedSubview(warn)
    }

    func draw(online: Bool, state signin: String, done: Bool) {
        let mismatch = signin == "mismatch" || flow?.phase == .mismatch
        let asked = flow.map { $0.phase != .idle || $0.url != nil } ?? true
        let words: String? = done && flow != nil ? Words.Accounts.Setup.signedIn
            : mismatch && !done ? Words.Accounts.Setup.someoneElse
            : !online && !done ? Words.Accounts.Setup.offline : nil
        state.text = words
        state.isHidden = words == nil
        state.ink = done ? Palette.statusDoneInk : mismatch ? Palette.statusAttnInk : Palette.inkMuted
        stateGlyph.glyph = done ? .passed : .warning
        stateGlyph.tintColor = done ? Palette.statusDoneGlyph : Palette.statusAttnInk
        stateGlyph.isHidden = !(done && flow != nil) && !(mismatch && !done)
        signIn?.isHidden = done || mismatch || !online || asked
        if let flow, let pasteControls {
            fold(pasteControls, open: asked && !done)
            pasteControls.draw()
            problem.text = flow.problem
            fold(problem, open: flow.problem != nil)
            warn.text = flow.phase == .mismatch ? Words.Accounts.Setup.mismatch(machine: name, who: flow.email) : nil
            fold(warn, open: flow.problem == nil && flow.phase == .mismatch)
        }
        devicePanel?.draw(online: online)
    }

    #if DEBUG
    var probeState: String { "\(name): " + AccountsProbe.texts(in: self).joined(separator: " / ") }
    func probePress() { signIn?.sendActions(for: .primaryActionTriggered) }
    #endif
}
