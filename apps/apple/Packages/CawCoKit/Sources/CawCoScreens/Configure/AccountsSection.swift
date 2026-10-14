import CawCoCore
import CawCoDesign
import UIKit

/// Configure › Accounts (routes/config/accounts/+page.svelte): one group per
/// provider that has an account, in the picker's order. A group's head is
/// the provider's mark and name, and Routing once it has two accounts to
/// route between; under it the accounts in fill-first order, each row one
/// press to the account. Add account opens the stepped setup.
final class AccountsSectionController: ConfigSectionController {
    private lazy var add = KitButton.make("Add account", glyph: .plus, variant: .outline, height: .sm) { [weak self] in self?.openSetup() }
    private let groups = UIStackView()
    private var empty: UIView?
    /// What the groups draw now, so a read that changed nothing redraws nothing.
    private var drawn: [String] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        add.accessibilityIdentifier = "accounts.add"
        setActions([add])
        groups.axis = .vertical
        groups.spacing = Space.space6
        groups.accessibilityIdentifier = "accounts.groups"
        setContent([groups])
    }

    override func viewIsAppearing(_ animated: Bool) {
        super.viewIsAppearing(animated)
        Task { await hub.reloadAccounts() }
    }

    override func refreshContent() {
        let view = FleetAccounts.view(hub)
        ready = view != nil
        let down = hub.writesBlocked
        add.isEnabled = down == nil
        add.accessibilityHint = down
        guard let view else { return }
        let groupsNow = FleetAccounts.groups(view, hub: hub)
        let lines = groupsNow.flatMap { group in
            ["group \(group.provider) \(group.name)"] + group.accounts.map { account in
                "\(account.id) \(account.hue) \(rowName(account)) \(FleetAccounts.problem(account, view: view, hub: hub) ?? "")"
            }
        }
        guard lines != drawn else { return }
        drawn = lines
        draw(groupsNow, view: view)
    }

    private func rowName(_ account: FleetAccounts.Account) -> String {
        account.label != nil || account.email != nil ? FleetAccounts.name(account) : "Not signed in yet"
    }

    private func draw(_ list: [FleetAccounts.Group], view: FleetAccounts.View) {
        groups.arrangedSubviews.forEach { $0.removeFromSuperview() }
        guard !list.isEmpty else {
            let action = KitButton.make("Add account", glyph: .plus, variant: .outline, height: .sm) { [weak self] in self?.openSetup() }
            groups.addArrangedSubview(KitEmptyState(icon: section.glyph, title: "Add your first account", line: "", action: action))
            return
        }
        for group in list {
            let mark = providerMark(group.provider)
            let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
            name.text = group.name
            name.accessibilityTraits = .header
            let head = UIStackView(arrangedSubviews: [mark, name, UIView()])
            head.spacing = Space.space2
            head.alignment = .center
            head.isLayoutMarginsRelativeArrangement = true
            head.directionalLayoutMargins = .init(top: 0, leading: Space.space2, bottom: 0, trailing: Space.space2)
            head.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHXs).isActive = true
            if group.accounts.count > 1 {
                let provider = group.provider
                var config = UIButton.Configuration.plain()
                config.attributedTitle = AttributedString("Routing", attributes: TypeScale.typeLabel.container(color: Palette.linkInk))
                config.image = Glyph.chevronRight.image.resized(to: 12)
                config.imagePlacement = .trailing
                config.imagePadding = 2
                config.contentInsets = .zero
                config.imageColorTransformer = UIConfigurationColorTransformer { _ in Palette.linkInk }
                let routing = UIButton(configuration: config, primaryAction: UIAction { [weak self] _ in self?.openRouting(provider) })
                routing.houseStyle()
                routing.accessibilityLabel = "\(group.name) routing"
                routing.accessibilityIdentifier = "accounts.routing.\(provider)"
                head.addArrangedSubview(routing)
            }
            let rows = UIStackView()
            rows.axis = .vertical
            rows.accessibilityLabel = group.name
            rows.accessibilityContainerType = .list
            for account in group.accounts {
                let row = AccountRow(name: rowName(account), hue: account.hue, problem: FleetAccounts.problem(account, view: view, hub: hub))
                row.accessibilityIdentifier = "accounts.row.\(account.id)"
                let id = account.id
                row.addAction(UIAction { [weak self] _ in self?.openAccount(id) }, for: .primaryActionTriggered)
                rows.addArrangedSubview(row)
            }
            let box = UIStackView(arrangedSubviews: [head, rows])
            box.axis = .vertical
            box.spacing = Space.space2
            groups.addArrangedSubview(box)
        }
    }

    // MARK: Pages

    private func openAccount(_ id: String) {
        navigationController?.pushViewController(AccountEditorController(section: section, context: context, accountId: id), animated: true)
    }

    private func openRouting(_ provider: String) {
        navigationController?.pushViewController(RoutingEditorController(section: section, context: context, provider: provider), animated: true)
    }

    private func openSetup() {
        navigationController?.pushViewController(AccountSetupController(section: section, context: context), animated: true)
    }

    #if DEBUG
    func probeOpen(_ id: String) { openAccount(id) }
    func probeRouting(_ provider: String) { openRouting(provider) }
    func probeSetup() { openSetup() }
    /// Every group's head and row as drawn now.
    var probeLines: [String] { AccountsProbe.texts(in: groups) }
    #endif
}

/// One account in its provider's group (AccountListRow.svelte): a flat row
/// under a hairline, its colour as a 10pt dot, its name, and the chevron in
/// one fixed trailing column, the whole row one press to the account. A
/// second line only when something is wrong, in the attention ink behind the
/// warning glyph. A press tints the row and moves nothing.
final class AccountRow: UIControl {
    private let problemLabel = KitLabel(TypeScale.typeMeta, ink: Palette.statusAttnInk, lines: 0)

    init(name: String, hue: String, problem: String?) {
        super.init(frame: .zero)
        let dot = UIView()
        dot.backgroundColor = AccountInk.color(hue)
        dot.layer.cornerRadius = 5
        dot.translatesAutoresizingMaskIntoConstraints = false
        let label = KitLabel(TypeScale.typeLabel, ink: Palette.inkRow)
        label.text = name
        label.lineBreakMode = .byTruncatingTail
        let chevron = GlyphView(.chevronRight, size: 16, tint: Palette.inkSubtle)
        let top = UIStackView(arrangedSubviews: [dot, label, chevron])
        top.spacing = Space.space4
        top.alignment = .center
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        label.setContentHuggingPriority(.defaultLow, for: .horizontal)
        problemLabel.text = problem
        let warn = GlyphView(.warning, size: 12, tint: Palette.statusAttnInk)
        let line = UIStackView(arrangedSubviews: [warn, problemLabel])
        line.spacing = Space.space1
        line.alignment = .center
        line.isHidden = problem == nil
        line.isLayoutMarginsRelativeArrangement = true
        line.directionalLayoutMargins = .init(top: 0, leading: 10 + Space.space4, bottom: 0, trailing: 16 + Space.space4)
        let column = UIStackView(arrangedSubviews: [top, line])
        column.axis = .vertical
        column.spacing = 2
        column.isUserInteractionEnabled = false
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        addHairline()
        NSLayoutConstraint.activate([
            dot.widthAnchor.constraint(equalToConstant: 10),
            dot.heightAnchor.constraint(equalToConstant: 10),
            heightAnchor.constraint(greaterThanOrEqualToConstant: 56),
            column.topAnchor.constraint(greaterThanOrEqualTo: topAnchor, constant: Space.space3),
            column.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor, constant: -Space.space3),
            column.centerYAnchor.constraint(equalTo: centerYAnchor),
            column.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space2),
            column.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space2),
        ])
        isAccessibilityElement = true
        accessibilityTraits = .button
        accessibilityLabel = name
        accessibilityValue = problem
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("AccountRow is built in code")
    }

    override var isHighlighted: Bool {
        didSet { backgroundColor = isHighlighted ? Palette.surfaceFill : .clear }
    }

    #if DEBUG
    var probeState: String { [accessibilityLabel, accessibilityValue].compactMap(\.self).joined(separator: " — ") }
    #endif
}

// MARK: The account

/// One account (AccountEditor.svelte): its provider's tile and nickname
/// (empty, it goes by its email), where it is signed in, its colour, and,
/// where CawCo reads its provider's limits, whether a strategy may fall back
/// to it and the share of its week past which no new work is placed on it.
/// Save writes what changed; Remove says what it reaches before a second
/// press, and a refusal (a session still on it, a machine away) is the hub's
/// sentence, under the question.
final class AccountEditorController: ConfigEditorController, UITextFieldDelegate {
    private struct Fields: Equatable {
        var nickname: String
        var hue: String
        var neverBackup: Bool
        /// The field's text: empty is no reserve.
        var reserve: String

        init(_ account: FleetAccounts.Account) {
            nickname = account.label ?? ""
            hue = account.hue
            neverBackup = account.neverBackup
            reserve = account.reservePct.map { String(Int($0)) } ?? ""
        }
    }

    private let accountId: String
    private var account: FleetAccounts.Account?
    private var base: Fields?
    private var fields: Fields?
    private var refused: String?

    private var nickname: TitleInput!
    private let refusal = metaLine(ink: Palette.statusFailInk)
    private var machines: AccountMachinesView!
    private var looksHead: UIView!
    private var swatches: SwatchesView!
    private var limitsPart: UIView!
    private let neverBackup = SwitchField(label: "Never use as a backup")
    private let reserveField = KitField()
    private let reserveLine = metaLine("A reserve is a whole number from 0 to 100. Empty it for none.", ink: Palette.statusFailInk)
    private var missing: UIView?

    init(section: ConfigSection, context: ShellContext, accountId: String) {
        self.accountId = accountId
        let now = FleetAccounts.view(context.hub)?.accounts.first { $0.id == accountId }
        super.init(section: section, context: context, title: now.map(FleetAccounts.name) ?? "Account", saveLabel: "Save changes", deleteLabel: "Remove account")
        if let now { tile = providerMark(now.provider) }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.accessibilityIdentifier = "account.editor"
        nickname = TitleInput(label: "Nickname", placeholder: "Nickname")
        nickname.accessibilityIdentifier = "account.nickname"
        nickname.delegate = self
        nickname.addAction(UIAction { [weak self] _ in
            self?.fields?.nickname = self?.nickname.text ?? ""
            self?.drawFields()
        }, for: .editingChanged)
        refusal.isHidden = true
        lead.addArrangedSubview(nickname)
        lead.addArrangedSubview(refusal)

        machines = AccountMachinesView(hub: hub, accountId: accountId)
        machines.onChange = { [weak self] in self?.requestRefresh() }
        parts.addArrangedSubview(editorSection(.server, hue: Palette.hueCyan500, "Machines", [machines]))

        swatches = SwatchesView(value: "orange")
        swatches.onPick = { [weak self] hue in
            self?.fields?.hue = hue
            self?.drawFields()
        }
        let looks = editorSection(.palette, hue: Palette.hueCyan500, "Looks", [swatches])
        looksHead = looks.arrangedSubviews.first
        parts.addArrangedSubview(looks)

        neverBackup.onChange = { [weak self] on in
            self?.fields?.neverBackup = on
            self?.drawFields()
        }
        neverBackup.toggle.accessibilityIdentifier = "account.neverBackup"
        let label = KitLabel(TypeScale.typeBody, ink: Palette.inkRow, lines: 0)
        label.text = "Stop placing new work past"
        reserveField.keyboardType = .numberPad
        reserveField.textAlignment = .center
        reserveField.tabular()
        reserveField.accessibilityLabel = "Stop placing new work past, percent of the week"
        reserveField.accessibilityIdentifier = "account.reserve"
        reserveField.widthAnchor.constraint(equalToConstant: 64).isActive = true
        reserveField.addAction(UIAction { [weak self] _ in
            self?.fields?.reserve = self?.reserveField.text ?? ""
            self?.drawFields()
        }, for: .editingChanged)
        let unit = KitLabel(TypeScale.typeBody, ink: Palette.inkRow)
        unit.text = "% of the week"
        // The figure and its unit hold together on one line.
        let amount = UIStackView(arrangedSubviews: [reserveField, unit])
        amount.spacing = Space.space3
        amount.alignment = .center
        let reserve = UIStackView(arrangedSubviews: [label, amount])
        reserve.axis = .vertical
        reserve.spacing = Space.space2
        reserveLine.isHidden = true
        limitsPart = editorSection(.usage, hue: Palette.hueAmber500, "Limits", [neverBackup, reserve, reserveLine])
        limitsPart.isHidden = true
        parts.addArrangedSubview(limitsPart)
    }

    override func viewIsAppearing(_ animated: Bool) {
        super.viewIsAppearing(animated)
        Task { await hub.reloadAccounts() }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isMovingFromParent || navigationController == nil { machines.dispose() }
    }

    override func refreshContent() {
        guard let view = FleetAccounts.view(hub) else { return }
        guard let now = view.accounts.first(where: { $0.id == accountId }) else {
            showMissing()
            return
        }
        account = now
        let saved = Fields(now)
        // A field nobody touched follows the hub; one being edited keeps its draft.
        if fields == nil || fields == base { fields = saved }
        base = saved
        navigationItem.title = FleetAccounts.name(now)
        nickname.attributedPlaceholder = NSAttributedString(string: now.label != nil ? "Nickname" : FleetAccounts.name(now),
                                                            attributes: [.foregroundColor: Palette.inkSubtle, .font: nickname.font as Any])
        limitsPart.isHidden = !FleetAccounts.limits(now.provider)
        machines.draw(now, view: view)
        drawFields()
    }

    /// The reserve as the hub takes it: nil for none, `.none` when it isn't a whole 0 to 100.
    private var reservePct: Int?? {
        let text = (fields?.reserve ?? "").trimmingCharacters(in: .whitespaces)
        if text.isEmpty { return .some(nil) }
        guard let n = Int(text), (0 ... 100).contains(n) else { return .none }
        return .some(n)
    }

    private func drawFields() {
        guard let fields else { return }
        if !nickname.isFirstResponder, nickname.text != fields.nickname { nickname.text = fields.nickname }
        swatches.set(fields.hue)
        (looksHead as? UIStackView)?.arrangedSubviews.first?.tintColor = AccountInk.color(fields.hue)
        neverBackup.set(on: fields.neverBackup, hint: nil)
        if !reserveField.isFirstResponder, reserveField.text != fields.reserve { reserveField.text = fields.reserve }
        let valid = reservePct != nil
        fold(reserveLine, open: !valid)
        reserveField.accessibilityValue = valid ? nil : "Invalid"
        refusal.text = refused
        fold(refusal, open: refused != nil)
        canSave = fields != base && valid
    }

    private func showMissing() {
        guard missing == nil else { return }
        let gone = section.missing("account") { [weak self] in self?.navigationController?.popViewController(animated: true) }
        parts.arrangedSubviews.forEach { $0.isHidden = true }
        lead.isHidden = true
        parts.addArrangedSubview(gone)
        missing = gone
        canSave = false
    }

    override func save() async -> Bool {
        guard let account, let fields, case let .some(reserve) = reservePct else { return false }
        refused = nil
        drawFields()
        let label = fields.nickname.trimmingCharacters(in: .whitespaces)
        let limits = FleetAccounts.limits(account.provider)
        do {
            try await hub.patchAccount(account.id, label: .some(label.isEmpty ? nil : label), hue: fields.hue,
                                       neverBackup: limits ? fields.neverBackup : nil, reservePct: limits ? .some(reserve) : .none)
            self.fields = nil
            requestRefresh()
            return true
        } catch {
            refused = error.localizedDescription
            drawFields()
            return false
        }
    }

    override func deleteQuestion() -> Question? {
        guard let account, let view = FleetAccounts.view(hub) else { return nil }
        // The machines signed in to it are what the removal reaches: named.
        let on = FleetAccounts.machines(for: account.provider, hub: hub)
            .filter { FleetAccounts.state(view.signins, account: account.id, machine: $0.machineId) == "signed-in" }
            .map(\.name)
        let reach = on.isEmpty
            ? "No machine is signed in to it."
            : "\(FleetAccounts.list(on)) \(on.count == 1 ? "is" : "are") signed in to it: \(on.count == 1 ? "it signs" : "each signs") it out of \(FleetAccounts.harnessWords(account.provider, hub: hub)) and forgets it."
        return Question(title: "Remove \(FleetAccounts.name(account))?", body: "\(reach) New sessions stop being placed on it.",
                        confirm: "Remove account", pending: "Removing…")
    }

    override func delete() async throws {
        try await hub.deleteAccount(accountId)
        navigationController?.popViewController(animated: true)
    }

    func textFieldShouldReturn(_ field: UITextField) -> Bool {
        field.resignFirstResponder()
        return true
    }

    #if DEBUG
    var probeMachines: AccountMachinesView { machines }
    func probeType(nickname text: String) {
        nickname.text = text
        nickname.sendActions(for: .editingChanged)
    }

    func probePick(hue: String) {
        fields?.hue = hue
        drawFields()
    }

    func probeSave() async -> Bool { await save() }
    var probeRefusal: String? { refused }
    #endif
}

private extension KitField {
    /// `font-variant-numeric: tabular-nums`: the figures line up as they change.
    func tabular() {
        let body = TypeScale.typeBody.font
        font = UIFont(descriptor: body.fontDescriptor.addingAttributes([
            .featureSettings: [[UIFontDescriptor.FeatureKey.type: kNumberSpacingType, UIFontDescriptor.FeatureKey.selector: kMonospacedNumbersSelector]],
        ]), size: body.pointSize)
    }
}
