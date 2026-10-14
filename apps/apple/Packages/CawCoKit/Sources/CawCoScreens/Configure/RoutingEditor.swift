import CawCoCore
import CawCoDesign
import UIKit

/// A provider's routing (RoutingEditor.svelte): how a person's sessions and a
/// session's delegates each choose among its accounts, the order Fill first
/// fills them in, and, where CawCo reads the provider's limits, what a
/// running session does at its limit. Two tabs share one picker's place;
/// switching slides the one out and the other in from the side it stands on.
/// Save writes the routing, then the order of every account whose place
/// changed. It exists only with two accounts or more; with fewer it goes back.
final class RoutingEditorController: ConfigEditorController {
    private let provider: String
    private var accounts: [FleetAccounts.Account] = []
    private var routing: FleetAccounts.Routing?
    private var yours = FleetAccounts.StrategyChoice(strategy: "pinned")
    private var delegates = FleetAccounts.StrategyChoice(strategy: "fill-first")
    private var atLimit = FleetAccounts.AtLimit.standard
    private var order: [String] = []
    private var loaded = false
    private var refused: String?
    /// The tab shown: 0 your sessions, 1 delegates.
    private var shownTab = 0

    private let refusal = metaLine(ink: Palette.statusFailInk)
    private let tabs = KitSegmented([Words.Accounts.RoutingEditor.yours, Words.Accounts.RoutingEditor.delegates], selected: 0)
    private let pane = UIView()
    private var picker: StrategyPickerView?
    private var limit: AtLimitView?

    init(section: ConfigSection, context: ShellContext, provider: String) {
        self.provider = provider
        let title = Words.Accounts.RoutingEditor.title(provider: FleetAccounts.providerName(provider, hub: context.hub))
        super.init(section: section, context: context, title: title, saveLabel: Words.Accounts.RoutingEditor.save)
        tile = providerMark(provider)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.accessibilityIdentifier = "routing.editor"
        let title = KitLabel(TypeScale.typeTitle, ink: Palette.inkStrong, lines: 0)
        title.text = navigationItem.title
        title.tracking = -0.01
        title.accessibilityTraits = .header
        refusal.isHidden = true
        lead.addArrangedSubview(title)
        lead.addArrangedSubview(refusal)
        tabs.accessibilityLabel = Words.Accounts.RoutingEditor.whichSessions
        tabs.accessibilityIdentifier = "routing.tabs"
        tabs.addAction(UIAction { [weak self] _ in
            guard let self, let index = tabs.selectedIndex else { return }
            switchTab(index)
        }, for: .valueChanged)
        pane.clipsToBounds = false
        let kinds = UIStackView(arrangedSubviews: [UIStackView(arrangedSubviews: [tabs, UIView()]), pane])
        kinds.axis = .vertical
        kinds.spacing = Space.space4
        parts.addArrangedSubview(kinds)
    }

    override func refreshContent() {
        guard let view = FleetAccounts.view(hub) else { return }
        let mine = FleetAccounts.accounts(view, provider: provider)
        guard FleetAccounts.hasRouting(mine.count), let held = FleetAccounts.routing(view, provider: provider) else {
            // A choice among its accounts exists only with two or more.
            navigationController?.popViewController(animated: true)
            return
        }
        accounts = mine
        routing = held
        if !loaded {
            loaded = true
            yours = held.yours
            delegates = held.delegates
            atLimit = held.atLimit
            order = mine.map(\.id)
            showPicker(animatedFrom: nil)
            if FleetAccounts.limits(provider) {
                let block = AtLimitView(accounts: (mine[0], mine[1]), terms: provider == FleetAccounts.claude, value: atLimit)
                block.onChange = { [weak self] next in
                    self?.atLimit = next
                    self?.drawState()
                }
                let well = UIView()
                well.backgroundColor = Palette.surfaceWell
                well.layer.cornerRadius = Radius.radiusLg
                well.layer.cornerCurve = .continuous
                well.layer.borderWidth = 1
                well.layer.borderColor = Palette.borderWell.resolvedColor(with: traitCollection).cgColor
                block.translatesAutoresizingMaskIntoConstraints = false
                well.addSubview(block)
                let inset = traitCollection.horizontalSizeClass == .compact ? Space.space4 : Space.space5
                NSLayoutConstraint.activate([
                    block.topAnchor.constraint(equalTo: well.topAnchor, constant: inset),
                    block.bottomAnchor.constraint(equalTo: well.bottomAnchor, constant: -inset),
                    block.leadingAnchor.constraint(equalTo: well.leadingAnchor, constant: inset),
                    block.trailingAnchor.constraint(equalTo: well.trailingAnchor, constant: -inset),
                ])
                parts.addArrangedSubview(well)
                limit = block
            }
        }
        drawState()
    }

    private var choice: FleetAccounts.StrategyChoice { shownTab == 0 ? yours : delegates }

    private func switchTab(_ index: Int) {
        guard index != shownTab else { return }
        let toward: Double = index > shownTab ? 1 : -1
        shownTab = index
        showPicker(animatedFrom: toward)
    }

    /// The picker for the tab chosen; arriving from the side its tab stands on.
    private func showPicker(animatedFrom toward: Double?) {
        let leaving = picker
        let next = StrategyPickerView(provider: provider,
                                      label: shownTab == 0 ? Words.Accounts.RoutingEditor.yours : Words.Accounts.RoutingEditor.delegates,
                                      accounts: accounts, choice: choice, order: order)
        next.onChoice = { [weak self] choice in
            guard let self else { return }
            if shownTab == 0 { yours = choice } else { delegates = choice }
            drawState()
        }
        next.onOrder = { [weak self] ids in
            self?.order = ids
            self?.drawState()
        }
        next.translatesAutoresizingMaskIntoConstraints = false
        pane.addSubview(next)
        NSLayoutConstraint.activate([
            next.topAnchor.constraint(equalTo: pane.topAnchor),
            next.bottomAnchor.constraint(equalTo: pane.bottomAnchor),
            next.leadingAnchor.constraint(equalTo: pane.leadingAnchor),
            next.trailingAnchor.constraint(equalTo: pane.trailingAnchor),
        ])
        picker = next
        guard let leaving else { return }
        guard let toward, !UIAccessibility.isReduceMotionEnabled else {
            leaving.removeFromSuperview()
            return
        }
        // The leaving picker is let go of its place and slides away; the new one rises in from its tab's side.
        let frame = leaving.frame
        NSLayoutConstraint.deactivate(leaving.constraints.filter { $0.firstItem === leaving || $0.secondItem === leaving })
        pane.constraints.filter { $0.firstItem === leaving || $0.secondItem === leaving }.forEach { $0.isActive = false }
        leaving.translatesAutoresizingMaskIntoConstraints = true
        leaving.frame = frame
        leaving.isUserInteractionEnabled = false
        next.alpha = 0
        next.transform = CGAffineTransform(translationX: 32 * toward, y: 0)
        Motion.easeOut.animator(Motion.durExit) {
            leaving.alpha = 0
            leaving.transform = CGAffineTransform(translationX: -32 * toward, y: 0)
        }.addingCompletion { leaving.removeFromSuperview() }.startAnimation()
        Motion.easeDrawer.animator(Motion.durPanel) {
            next.alpha = 1
            next.transform = .identity
            self.view.layoutIfNeeded()
        }.startAnimation(afterDelay: 0.04)
    }

    private func drawState() {
        guard let routing else { return }
        let dirty = yours != routing.yours || delegates != routing.delegates || atLimit != routing.atLimit || order != accounts.map(\.id)
        canSave = dirty
        refusal.text = refused
        fold(refusal, open: refused != nil)
    }

    override func save() async -> Bool {
        refused = nil
        drawState()
        do {
            try await hub.putRouting(provider, yours: yours, delegates: delegates, atLimit: atLimit)
            // Every account takes its place in the order, from 0, where it differs.
            for (at, id) in order.enumerated() {
                if let account = accounts.first(where: { $0.id == id }), Int(account.order) != at {
                    try await hub.patchAccount(id, order: at)
                }
            }
        } catch {
            refused = error.localizedDescription
            drawState()
            return false
        }
        Task { @MainActor [weak self] in
            // "Saved" is seen where the press was, then the list comes back.
            try? await Task.sleep(for: .seconds(Motion.durHold))
            self?.navigationController?.popViewController(animated: true)
        }
        return true
    }

    #if DEBUG
    var probePicker: StrategyPickerView? { picker }
    var probeLimit: AtLimitView? { limit }
    func probeTab(_ index: Int) {
        tabs.select(index, animated: false)
        switchTab(index)
    }

    func probeSave() async -> Bool { await save() }
    var probeRefusal: String? { refused }
    #endif
}

extension UIViewPropertyAnimator {
    /// Runs `done` on the main actor once the animation ends.
    func addingCompletion(_ done: @escaping @MainActor () -> Void) -> UIViewPropertyAnimator {
        addCompletion { _ in MainActor.assumeIsolated { done() } }
        return self
    }
}

// MARK: Strategies

/// How a kind of session chooses its account (StrategyPicker.svelte): a card
/// per strategy the provider offers, two by two where there is room, one
/// above another on a phone. Pinned's chosen card carries the account it
/// pins; choosing Fill first unfolds the order the accounts fill in.
final class StrategyPickerView: UIStackView {
    var onChoice: ((FleetAccounts.StrategyChoice) -> Void)?
    var onOrder: (([String]) -> Void)?
    private let provider: String
    private let accounts: [FleetAccounts.Account]
    private var choice: FleetAccounts.StrategyChoice
    private var order: [String]
    private var cards: [StrategyCard] = []
    private let grid = UIStackView()

    init(provider: String, label: String, accounts: [FleetAccounts.Account], choice: FleetAccounts.StrategyChoice, order: [String]) {
        self.provider = provider
        self.accounts = accounts
        self.choice = choice
        self.order = order
        super.init(frame: .zero)
        axis = .vertical
        spacing = Space.space3
        grid.axis = .vertical
        grid.spacing = Space.space3
        grid.accessibilityLabel = label
        grid.accessibilityContainerType = .semanticGroup
        for strategy in FleetAccounts.strategies(for: provider) {
            let card = StrategyCard(strategy: strategy, accounts: accounts, limits: FleetAccounts.limits(provider))
            card.onChoose = { [weak self] in self?.choose(strategy.id) }
            card.onPin = { [weak self] id in
                self?.choice = .init(strategy: "pinned", pinnedAccountId: id)
                self?.draw()
                self?.onChoice?(.init(strategy: "pinned", pinnedAccountId: id))
            }
            card.onOrder = { [weak self] ids in
                self?.order = ids
                self?.onOrder?(ids)
            }
            cards.append(card)
        }
        let forks = UIStackView(arrangedSubviews: [GlyphView(.subagent, size: 14, tint: Palette.inkMuted), metaLine(Words.Accounts.RoutingEditor.forks)])
        forks.spacing = Space.space2
        forks.alignment = .center
        addArrangedSubview(grid)
        addArrangedSubview(forks)
        draw()
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("StrategyPickerView is built in code")
    }

    private var columns = 0

    override func layoutSubviews() {
        super.layoutSubviews()
        // Two by two from 520pt; one above another under it.
        let next = bounds.width >= 520 ? 2 : 1
        guard next != columns else { return }
        columns = next
        grid.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for start in stride(from: 0, to: cards.count, by: next) {
            let row = UIStackView(arrangedSubviews: Array(cards[start ..< min(start + next, cards.count)]))
            row.spacing = Space.space3
            row.distribution = .fillEqually
            row.alignment = .top
            if row.arrangedSubviews.count < next { row.addArrangedSubview(UIView()) }
            grid.addArrangedSubview(row)
        }
    }

    private func choose(_ id: String) {
        guard choice.strategy != id else { return }
        choice = id == "pinned"
            ? .init(strategy: "pinned", pinnedAccountId: FleetAccounts.pinned(accounts, choice.pinnedAccountId)?.id)
            : .init(strategy: id)
        draw()
        onChoice?(choice)
    }

    private func draw() {
        for card in cards {
            card.draw(chosen: card.strategy.id == choice.strategy, pinned: FleetAccounts.pinned(accounts, choice.pinnedAccountId), order: order)
        }
    }

    #if DEBUG
    func probeChoose(_ id: String) { choose(id) }
    func probeOrder(_ ids: [String]) { cards.first { $0.strategy.id == "fill-first" }?.probeOrder(ids) }
    var probeState: String {
        cards.map { "\($0.strategy.label)\($0.strategy.id == choice.strategy ? " (chosen)" : "")" }.joined(separator: " · ")
            + (choice.strategy == "pinned" ? " · pinned \(FleetAccounts.pinned(accounts, choice.pinnedAccountId).map(FleetAccounts.name) ?? "-")" : "")
            + " · order \(order.compactMap { id in accounts.first { $0.id == id }.map(FleetAccounts.name) }.joined(separator: ", "))"
            + " · figures \(cards.map(\.probeFigure).joined(separator: ", "))"
    }
    #endif
}

/// One strategy's card: the radio, its name and line, and, chosen, what
/// it holds (Pinned's account, Fill first's order), then its strategy's
/// figure, which plays while the card is chosen or under the pointer.
final class StrategyCard: UIControl {
    let strategy: FleetAccounts.Strategy
    var onChoose: (() -> Void)?
    var onPin: ((String) -> Void)?
    var onOrder: (([String]) -> Void)?
    private let accounts: [FleetAccounts.Account]
    private let radio = UIView()
    private let dot = UIView()
    private let pin = KitSelect(small: true)
    private var orderList: OrderListView?
    private let column = UIStackView()
    private let figure: StrategyFigureView
    private var chosen = false
    private var hovered = false

    /// At most four lanes: a figure is an illustration, not a ledger.
    private var shown: [FleetAccounts.Account] { Array(accounts.prefix(4)) }

    private static func lanes(_ accounts: [FleetAccounts.Account]) -> [FigureLane] {
        accounts.map { FigureLane(name: FleetAccounts.name($0), hue: $0.hue) }
    }

    init(strategy: FleetAccounts.Strategy, accounts: [FleetAccounts.Account], limits: Bool) {
        self.strategy = strategy
        self.accounts = accounts
        figure = StrategyFigureView(board: FigureBoard(strategy: strategy.id), lanes: Self.lanes(Array(accounts.prefix(4))), limits: limits)
        super.init(frame: .zero)
        layer.cornerRadius = Radius.radiusLg
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        backgroundColor = Palette.surfaceRaised
        radio.layer.cornerRadius = 8
        radio.layer.borderWidth = 1.5
        radio.isUserInteractionEnabled = false
        radio.translatesAutoresizingMaskIntoConstraints = false
        dot.layer.cornerRadius = 4
        dot.translatesAutoresizingMaskIntoConstraints = false
        radio.addSubview(dot)
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
        name.text = strategy.label
        let line = metaLine(strategy.line)
        let words = UIStackView(arrangedSubviews: [name, line])
        words.axis = .vertical
        words.spacing = 1
        words.isUserInteractionEnabled = false
        pin.accessibilityLabel = Words.Accounts.RoutingEditor.pinnedAccount
        pin.accessibilityIdentifier = "routing.pin"
        pin.isHidden = true
        let top = UIStackView(arrangedSubviews: [radio, words])
        top.spacing = Space.space3
        top.alignment = .center
        column.axis = .vertical
        column.spacing = Space.space3
        column.addArrangedSubview(top)
        column.addArrangedSubview(pin)
        column.addArrangedSubview(figure)
        column.translatesAutoresizingMaskIntoConstraints = false
        figure.accessibilityIdentifier = "routing.figure.\(strategy.id)"
        // The pointer over a card plays its figure, as on the web.
        addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hover)))
        addSubview(column)
        NSLayoutConstraint.activate([
            radio.widthAnchor.constraint(equalToConstant: 16),
            radio.heightAnchor.constraint(equalToConstant: 16),
            dot.widthAnchor.constraint(equalToConstant: 8),
            dot.heightAnchor.constraint(equalToConstant: 8),
            dot.centerXAnchor.constraint(equalTo: radio.centerXAnchor),
            dot.centerYAnchor.constraint(equalTo: radio.centerYAnchor),
            column.topAnchor.constraint(equalTo: topAnchor, constant: Space.space3),
            column.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space3),
            column.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space3),
            column.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space3),
        ])
        // `.top`'s own inline padding; the figure spans the card's padding box.
        top.isLayoutMarginsRelativeArrangement = true
        top.directionalLayoutMargins = .init(top: 0, leading: Space.space1, bottom: 0, trailing: Space.space1)
        addAction(UIAction { [weak self] _ in self?.onChoose?() }, for: .primaryActionTriggered)
        isAccessibilityElement = false
        accessibilityIdentifier = "routing.card.\(strategy.id)"
        top.isAccessibilityElement = true
        top.accessibilityLabel = Words.Accounts.RoutingEditor.card(label: strategy.label, line: strategy.line)
        top.accessibilityTraits = .button
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (card: StrategyCard, _: UITraitCollection) in card.paint() }
        self.top = top
    }

    private var top: UIStackView?

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("StrategyCard is built in code")
    }

    func draw(chosen now: Bool, pinned: FleetAccounts.Account?, order: [String]) {
        chosen = now
        top?.accessibilityTraits = now ? [.button, .selected] : .button
        // Only the chosen Pinned card names its account: an unchosen one keeps no room for it.
        if strategy.id == "pinned" {
            pin.setValue(pinned.map(FleetAccounts.name) ?? "")
            pin.menu = UIMenu(children: accounts.map { account in
                UIAction(title: FleetAccounts.name(account), state: account.id == pinned?.id ? .on : .off) { [weak self] _ in self?.onPin?(account.id) }
            })
            fold(pin, open: now)
        }
        if strategy.id == "fill-first" {
            if now, orderList == nil {
                let list = OrderListView(accounts: accounts, order: order)
                list.onChange = { [weak self] ids in
                    self?.drawFigure(order: ids, pinned: nil)
                    self?.onOrder?(ids)
                }
                list.isHidden = true
                column.insertArrangedSubview(list, at: column.arrangedSubviews.count - 1)
                orderList = list
                fold(list, open: true)
            } else if !now, let list = orderList {
                orderList = nil
                fold(list, open: false)
                Task { @MainActor in
                    try? await Task.sleep(for: .seconds(Motion.durControl))
                    list.removeFromSuperview()
                }
            }
        }
        drawFigure(order: order, pinned: pinned)
        paint()
    }

    /// The figure's lanes: Fill first's in the order, the others as the
    /// accounts stand; Pinned's pin on the pinned account's lane.
    private func drawFigure(order: [String], pinned: FleetAccounts.Account?) {
        let shown = shown
        let lanes = strategy.id == "fill-first" ? order.compactMap { id in shown.first { $0.id == id } } : shown
        let pin = strategy.id == "pinned" ? max(0, shown.firstIndex { $0.id == pinned?.id } ?? 0) : 0
        figure.update(lanes: Self.lanes(lanes), pin: pin)
        figure.playing = chosen || hovered
    }

    @objc private func hover(_ recognizer: UIHoverGestureRecognizer) {
        hovered = recognizer.state == .began || recognizer.state == .changed
        figure.playing = chosen || hovered
    }

    private func paint() {
        Motion.easeOut.animator(window == nil ? 0 : Motion.durFade) { [self] in
            layer.borderColor = (chosen ? Palette.focusRing : Palette.borderWell).resolvedColor(with: traitCollection).cgColor
            backgroundColor = chosen ? Palette.selectedBg.withAlphaComponent(0.45) : Palette.surfaceRaised
            radio.layer.borderColor = (chosen ? Palette.selectedIcon : Palette.neutral8).resolvedColor(with: traitCollection).cgColor
            dot.backgroundColor = Palette.selectedIcon
            dot.transform = chosen ? .identity : CGAffineTransform(scaleX: 0.01, y: 0.01)
        }.startAnimation()
    }

    override var isHighlighted: Bool {
        didSet {
            guard !UIAccessibility.isReduceMotionEnabled else { return }
            Motion.easeOut.animator(Motion.durControl) { self.transform = self.isHighlighted ? CGAffineTransform(scaleX: 0.995, y: 0.995) : .identity }.startAnimation()
        }
    }

    #if DEBUG
    func probeOrder(_ ids: [String]) { orderList?.set(ids) }
    var probeFigure: String { figure.probeState }
    #endif
}

/// Fill-first order (OrderList.svelte): the accounts as rows, dragged into
/// the order new sessions fill them in. The row under the finger follows it;
/// the others make room, and the row drops into its place. VoiceOver moves a
/// row a place with its Move up and Move down actions.
final class OrderListView: UIStackView {
    var onChange: (([String]) -> Void)?
    private let accounts: [FleetAccounts.Account]
    private(set) var order: [String]
    private let list = UIStackView()
    private var rows: [String: UIView] = [:]

    init(accounts: [FleetAccounts.Account], order: [String]) {
        self.accounts = accounts
        self.order = order
        super.init(frame: .zero)
        axis = .vertical
        spacing = Space.space2
        let label = metaLine(Words.Accounts.RoutingEditor.order)
        list.axis = .vertical
        list.spacing = 3
        // `aria-labelledby="order-label"`: the list is called by its label.
        list.accessibilityLabel = Words.Accounts.RoutingEditor.order
        addArrangedSubview(label)
        addArrangedSubview(list)
        for account in accounts { rows[account.id] = row(account) }
        lay()
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("OrderListView is built in code")
    }

    func set(_ ids: [String]) {
        order = ids
        lay()
        onChange?(ids)
    }

    private func lay() {
        list.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for (place, id) in order.enumerated() {
            guard let row = rows[id], let account = accounts.first(where: { $0.id == id }) else { continue }
            row.accessibilityLabel = Words.Accounts.RoutingEditor.placeSaid(name: FleetAccounts.name(account), place: place + 1, count: order.count)
            list.addArrangedSubview(row)
        }
    }

    private func row(_ account: FleetAccounts.Account) -> UIView {
        let row = UIView()
        row.backgroundColor = Palette.surfaceFill
        row.layer.cornerRadius = Radius.radiusSm
        row.layer.cornerCurve = .continuous
        let handle = GlyphView(.more, size: 14, tint: Palette.inkSubtle)
        handle.transform = CGAffineTransform(rotationAngle: .pi / 2)
        let dot = UIView()
        dot.backgroundColor = AccountInk.color(account.hue)
        dot.layer.cornerRadius = 4
        dot.translatesAutoresizingMaskIntoConstraints = false
        let name = KitLabel(TypeScale.typeLabel, ink: Palette.inkRow)
        name.text = FleetAccounts.name(account)
        name.lineBreakMode = .byTruncatingTail
        let line = UIStackView(arrangedSubviews: [handle, dot, name])
        line.spacing = Space.space3
        line.alignment = .center
        line.isUserInteractionEnabled = false
        line.translatesAutoresizingMaskIntoConstraints = false
        row.addSubview(line)
        NSLayoutConstraint.activate([
            dot.widthAnchor.constraint(equalToConstant: 8),
            dot.heightAnchor.constraint(equalToConstant: 8),
            row.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHLg),
            line.centerYAnchor.constraint(equalTo: row.centerYAnchor),
            line.leadingAnchor.constraint(equalTo: row.leadingAnchor, constant: Space.space3),
            line.trailingAnchor.constraint(lessThanOrEqualTo: row.trailingAnchor, constant: -Space.space3),
        ])
        row.isAccessibilityElement = true
        row.accessibilityIdentifier = "routing.order.\(account.id)"
        row.accessibilityCustomActions = [
            UIAccessibilityCustomAction(name: Words.Accounts.RoutingEditor.moveUp) { [weak self] _ in self?.nudge(account.id, by: -1) ?? false },
            UIAccessibilityCustomAction(name: Words.Accounts.RoutingEditor.moveDown) { [weak self] _ in self?.nudge(account.id, by: 1) ?? false },
        ]
        row.addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(drag)))
        return row
    }

    private func nudge(_ id: String, by: Int) -> Bool {
        guard let from = order.firstIndex(of: id), order.indices.contains(from + by) else { return false }
        var ids = order
        ids.remove(at: from)
        ids.insert(id, at: from + by)
        set(ids)
        return true
    }

    private var held: (id: String, from: Int, at: Int)?

    @objc private func drag(_ pan: UIPanGestureRecognizer) {
        guard let row = pan.view, let id = rows.first(where: { $0.value === row })?.key else { return }
        let step = row.bounds.height + list.spacing
        switch pan.state {
        case .began:
            let from = order.firstIndex(of: id) ?? 0
            held = (id, from, from)
            row.layer.zPosition = 2
            row.backgroundColor = Palette.surfaceLift
            row.boxShadow = Shadow.shadowMd
        case .changed:
            guard var hold = held else { return }
            let dy = pan.translation(in: list).y
            let next = max(0, min(order.count - 1, Int((Double(hold.from) + dy / step).rounded())))
            if next != hold.at {
                var ids = order.filter { $0 != id }
                ids.insert(id, at: next)
                hold.at = next
                held = hold
                order = ids
                Motion.easeOut.animator(Motion.durControl) {
                    self.lay()
                    self.list.layoutIfNeeded()
                }.startAnimation()
                onChange?(ids)
            }
            row.transform = CGAffineTransform(translationX: 0, y: dy - Double(hold.at - hold.from) * step)
        default:
            held = nil
            Motion.easeOut.animator(UIAccessibility.isReduceMotionEnabled ? 0 : Motion.durExit) {
                row.transform = .identity
            }.addingCompletion {
                row.layer.zPosition = 0
                row.backgroundColor = Palette.surfaceFill
                row.boxShadow = []
            }.startAnimation()
        }
    }
}

// MARK: At the limit

/// What a running session does when its account runs out and another is
/// free (AtLimitBlock.svelte): wait for a reset that is close, move a small
/// conversation whole, or continue a large one from a summary written while
/// the cache is warm. The figure under the numbers plays that policy,
/// rebuilt as they change. Off, the numbers fold away with the figure and
/// the terms.
final class AtLimitView: UIStackView, UITextFieldDelegate {
    var onChange: ((FleetAccounts.AtLimit) -> Void)?
    private(set) var value: FleetAccounts.AtLimit
    private let move = UISwitch()
    private let rows = UIStackView()
    private let wait = KitField()
    private let under = KitField()
    private let at = KitField()
    private let lanes: [FigureLane]
    private let figure: StrategyFigureView

    private static func policy(_ value: FleetAccounts.AtLimit) -> FigurePolicy {
        FigurePolicy(wait: value.waitMinutes, under: value.moveWholeUnderK, at: value.prepareAtPct)
    }

    /// `accounts`: the one that runs out, then the one that is free.
    init(accounts: (FleetAccounts.Account, FleetAccounts.Account), terms: Bool, value: FleetAccounts.AtLimit) {
        self.value = value
        lanes = [accounts.0, accounts.1].map { FigureLane(name: FleetAccounts.name($0), hue: $0.hue) }
        figure = StrategyFigureView(board: .limit, lanes: lanes, policy: Self.policy(value))
        super.init(frame: .zero)
        axis = .vertical
        let head = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
        head.text = Words.Accounts.AtLimit.head
        head.wrap = .balance
        head.accessibilityTraits = .header
        addArrangedSubview(head)
        setCustomSpacing(Space.space3, after: head)
        let moveLabel = KitLabel(TypeScale.typeBody, ink: Palette.inkRow, lines: 0)
        moveLabel.text = Words.Accounts.AtLimit.move
        move.onTintColor = Palette.inkStrong
        // A switch, as the web's (AtLimitBlock.svelte `Switch`): the Mac idiom draws one as a checkbox unless asked.
        move.preferredStyle = .sliding
        move.isOn = value.move
        move.accessibilityLabel = moveLabel.text
        move.accessibilityIdentifier = "routing.move"
        move.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            self.value.move = move.isOn
            fold(rows, open: move.isOn)
            onChange?(self.value)
        }, for: .valueChanged)
        let switchLine = UIStackView(arrangedSubviews: [moveLabel, move])
        switchLine.spacing = Space.space4
        switchLine.alignment = .center
        switchLine.isLayoutMarginsRelativeArrangement = true
        switchLine.directionalLayoutMargins = .init(top: Space.space2, leading: 0, bottom: Space.space3, trailing: 0)
        addArrangedSubview(switchLine)

        rows.axis = .vertical
        let words = Words.Accounts.AtLimit.self
        rows.addArrangedSubview(line(words.wait, field: wait, value: value.waitMinutes, unit: words.minutes, id: "wait"))
        rows.addArrangedSubview(line(words.under, field: under, value: value.moveWholeUnderK, unit: words.kTokens,
                                     aside: words.rereads, id: "under"))
        let otherwise = KitLabel(TypeScale.typeBody, ink: Palette.inkRow, lines: 0)
        otherwise.text = words.otherwise
        let pad = UIStackView(arrangedSubviews: [otherwise])
        pad.isLayoutMarginsRelativeArrangement = true
        pad.directionalLayoutMargins = .init(top: Space.space2, leading: 0, bottom: Space.space2, trailing: 0)
        rows.addArrangedSubview(pad)
        rows.addArrangedSubview(line(words.early, field: at, value: value.prepareAtPct, unit: words.percent,
                                     aside: words.warm, id: "at"))
        let stage = UIStackView(arrangedSubviews: [figure])
        stage.isLayoutMarginsRelativeArrangement = true
        stage.directionalLayoutMargins = .init(top: Space.space3, leading: 0, bottom: Space.space3, trailing: 0)
        figure.accessibilityIdentifier = "routing.figure.limit"
        figure.playing = true
        rows.addArrangedSubview(stage)
        if terms {
            var config = UIButton.Configuration.plain()
            config.attributedTitle = AttributedString(words.terms, attributes: TypeScale.typeLabel.container(color: Palette.linkInk))
            config.image = Glyph.external.image.resized(to: 12)
            config.imagePlacement = .trailing
            config.imagePadding = Space.space1
            config.contentInsets = .init(top: Space.space3, leading: 0, bottom: 0, trailing: 0)
            config.imageColorTransformer = UIConfigurationColorTransformer { _ in Palette.linkInk }
            config.titleAlignment = .leading
            let link = UIButton(configuration: config, primaryAction: UIAction { _ in UIApplication.shared.open(FleetAccounts.termsURL) })
            link.houseStyle()
            link.contentHorizontalAlignment = .leading
            rows.addArrangedSubview(link)
        }
        addArrangedSubview(rows)
        rows.isHidden = !value.move
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("AtLimitView is built in code")
    }

    private func line(_ text: String, field: KitField, value: Int, unit: String, aside: String? = nil, id: String) -> UIView {
        let label = KitLabel(TypeScale.typeBody, ink: Palette.inkRow, lines: 0)
        label.text = text
        field.text = String(value)
        field.keyboardType = .numberPad
        field.textAlignment = .center
        field.delegate = self
        field.accessibilityLabel = Words.Accounts.Editor.fieldWithUnit(label: text, unit: unit)
        field.accessibilityIdentifier = "routing.\(id)"
        field.widthAnchor.constraint(equalToConstant: 64).isActive = true
        field.addAction(UIAction { [weak self] _ in self?.read() }, for: .editingChanged)
        let unitLabel = KitLabel(TypeScale.typeBody, ink: Palette.inkRow)
        unitLabel.text = unit
        let amount = UIStackView(arrangedSubviews: [field, unitLabel, UIView()])
        amount.spacing = Space.space3
        amount.alignment = .center
        let stack = UIStackView(arrangedSubviews: [label, amount])
        stack.axis = .vertical
        stack.spacing = Space.space2
        if let aside { stack.addArrangedSubview(metaLine(aside)) }
        stack.isLayoutMarginsRelativeArrangement = true
        stack.directionalLayoutMargins = .init(top: Space.space2, leading: 0, bottom: Space.space2, trailing: 0)
        return stack
    }

    /// A field's number: whole, at least 0, at most `max`; empty reads as 0.
    private static func whole(_ text: String?, max: Int = .max) -> Int {
        min(max, Swift.max(0, Int((Double(text ?? "") ?? 0).rounded())))
    }

    private func read() {
        value.waitMinutes = Self.whole(wait.text)
        value.moveWholeUnderK = Self.whole(under.text)
        value.prepareAtPct = Self.whole(at.text, max: 100)
        figure.update(lanes: lanes, policy: Self.policy(value))
        onChange?(value)
    }

    func textFieldDidEndEditing(_ field: UITextField) {
        // The field says the number it holds once it is left.
        let shown = field === wait ? value.waitMinutes : field === under ? value.moveWholeUnderK : value.prepareAtPct
        field.text = String(shown)
    }

    #if DEBUG
    var probeFigure: String { figure.probeState }
    /// How the move switch draws: `sliding` or `checkbox`.
    var probeSwitch: String { move.style == .checkbox ? "checkbox" : "sliding" }
    func probeSet(move on: Bool, wait minutes: Int) {
        move.setOn(on, animated: false)
        move.sendActions(for: .valueChanged)
        wait.text = String(minutes)
        read()
    }
    #endif
}
