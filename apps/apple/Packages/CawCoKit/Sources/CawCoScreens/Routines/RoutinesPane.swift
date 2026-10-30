import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// A project's routines (ViewRoutines.svelte; PRD §5.5, P3): what runs on
/// its own (Routines), what fires it (Event sources), and what its runs
/// asked you to approve (Approved actions). Three blocks of the page, in the
/// person's arrangement, beside any custom view placed here; each headed
/// with its count and the needs-you mark when something in it waits on you.
/// Side by side on a wide screen, stacked on a phone. With no routine yet it
/// offers to start one: starters over the Composer to Caw, whose words start
/// a new conversation in the project. Held as a skeleton until the hub's first read.
final class RoutinesPane: UIView {
    /// A new conversation in the project on these words: the New Session form at its checkout.
    var newConversation: (String) -> Void = { _ in }
    /// A session by its id: a conversation run's.
    var openSession: (String) -> Void = { _ in }
    /// The custom views placed on this page, as blocks, by block id (B3e).
    var viewItems: () -> [String: BlockItem] = { [:] }

    let routines: ProjectRoutines
    private let hub: HubConnection
    private let projectId: String
    private let scroll = UIScrollView()
    private let column = UIStackView()
    let blocksPage: BlockPageView
    private let skeleton = SkeletonView(height: 256)
    private let stateHolder = UIStackView()
    private var shownState = ""
    private let ledger = RoutinesLedger()
    private let ask: CawAskComposer
    private var asking = false
    /// Each block's body and head parts, one view each for the pane's life, drawn again only when what they say changed.
    private let routinesBody = Held<BodyShown>()
    private let sources = Held<SourcesShown>()
    private let actions = Held<ActionsShown>()
    private let routinesMeta = Held<MetaShown>()
    private let sourcesMeta = Held<MetaShown>()
    private let actionsMeta = Held<MetaShown>()
    private let relay = Held<RelayShown>()
    private var newRoutine: UIButton!

    private enum BodyShown: Equatable {
        case empty(canTalk: Bool, starters: [Components.Schemas.ProjectStarter], project: String, problem: String?)
        case ledger(asking: Bool)
    }

    private struct SourcesShown: Equatable {
        let routes: [RoutineRoute]
        let polls: [RoutinePoll]
        let names: [String: String]
        let minute: Int
    }

    private struct ActionsShown: Equatable {
        let actions: [ApprovedAction]
        let names: [String: String]
        let minute: Int
    }

    private struct MetaShown: Equatable {
        let count: Int
        let needs: Int
        let said: String
    }

    private struct RelayShown: Equatable {
        let live: Bool
        let tip: String?
    }
    private var edges: [NSLayoutConstraint] = []

    init(hub: HubConnection, projectId: String, blocks: ProjectBlocks) {
        self.hub = hub
        self.projectId = projectId
        routines = ProjectRoutines(hub: hub, projectId: projectId)
        blocksPage = BlockPageView(page: .routines, blocks: blocks)
        ask = CawAskComposer(id: "routines:\(projectId)", placeholder: Words.Routines.placeholder, hub: hub, projectId: projectId)
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        scroll.alwaysBounceVertical = true
        scroll.keyboardDismissMode = .interactive
        scroll.translatesAutoresizingMaskIntoConstraints = false
        addSubview(scroll)
        column.axis = .vertical
        column.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(column)
        for part in [skeleton, stateHolder, blocksPage] as [UIView] { column.addArrangedSubview(part) }
        skeleton.layer.cornerRadius = Radius.radiusLg
        stateHolder.axis = .vertical
        stateHolder.alignment = .leading
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: topAnchor),
            scroll.bottomAnchor.constraint(equalTo: bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: trailingAnchor),
            column.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            column.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -Space.space6),
        ])
        ledger.act = { [weak self] work in
            guard let self else { return }
            Task { @MainActor in
                do {
                    try await routines.act(work)
                } catch {
                    Toast.error(error.localizedDescription, in: window)
                }
            }
        }
        ledger.openSession = { [weak self] id in self?.openSession(id) }
        // His words start a new conversation in the project: the New Session
        // form at its checkout, the words in it.
        ask.submit = { [weak self] text in
            guard let self else { return }
            asking = false
            newConversation(text)
        }
        newRoutine = KitButton.make(Words.Routines.newRoutine, variant: .outline, height: .sm) { [weak self] in
            guard let self else { return }
            asking.toggle()
            newRoutine.accessibilityValue = asking ? "expanded" : "collapsed"
            onChange()
            if asking { DispatchQueue.main.async { self.ask.focus() } }
        }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("RoutinesPane is built in code")
    }

    /// Asks the page that holds the pane to draw it again.
    var onChange: () -> Void = {}

    /// The page's gutters.
    func inset(leading: Double, trailing: Double) {
        NSLayoutConstraint.deactivate(edges)
        edges = [
            column.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: leading),
            column.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -trailing),
        ]
        NSLayoutConstraint.activate(edges)
    }

    // MARK: Showing

    func show(projectName: String, canTalk: Bool, cawProblem: String?, starters: [Components.Schemas.ProjectStarter]) {
        guard let page = routines.page else {
            blocksPage.isHidden = true
            if let problem = routines.problem {
                skeleton.isHidden = true
                stateHolder.isHidden = false
                putState("unread:\(problem)") {
                    let retry = KitButton.make(Words.Routines.retry, variant: .outline) { [weak self] in Task { await self?.routines.read() } }
                    retry.setContentHuggingPriority(.required, for: .horizontal)
                    return KitEmptyState(icon: .clock, title: Words.Routines.unavailable,
                                         line: Words.Routines.unavailableLine(project: projectName, problem: problem), action: retry)
                }
            } else {
                skeleton.isHidden = false
                stateHolder.isHidden = true
            }
            return
        }
        skeleton.isHidden = true
        stateHolder.isHidden = true
        blocksPage.isHidden = false
        let empty = page.routines.isEmpty
        if empty { asking = false }
        // A ledger's times say "ago": they move on with the clock's minute.
        let minute = Int(Date.now.timeIntervalSince1970 / 60)

        // Routines: the empty state, or the ledger under New routine's composer.
        // The ledger is one view for the pane's life, its rows changed in place.
        if empty {
            routinesBody.hold(.empty(canTalk: canTalk, starters: canTalk ? starters : [], project: projectName, problem: cawProblem)) { _ in
                let state: UIView
                if canTalk {
                    let chips: [UIView] = starters.isEmpty ? [] : [CawStartersView(starters) { [weak self] text in self?.ask.press(text, place: .routines) }]
                    let action = UIStackView(arrangedSubviews: chips + [ask])
                    action.axis = .vertical
                    action.spacing = Space.space3
                    state = KitEmptyState(mark: GlyphView(.clock, size: 20, tint: Palette.inkMuted), after: Space.space2 + Space.space1,
                                          title: Words.Routines.empty, line: Words.Routines.emptyCaw(project: projectName),
                                          action: action, stretchAction: true)
                } else {
                    state = KitEmptyState(icon: .clock, title: Words.Routines.empty,
                                          line: Words.Routines.emptyOff(problem: cawProblem ?? Words.Routines.away))
                }
                return padded(state, max: Size.cStartersW)
            }
        } else {
            ledger.show(routines: page.routines, routes: page.routes, actions: page.actions)
            routinesBody.hold(.ledger(asking: asking)) { _ in
                let stack = UIStackView(arrangedSubviews: asking ? [padded(ask, max: nil), ledger] : [ledger])
                stack.axis = .vertical
                return stack
            }
        }

        // Each block's count, and the needs-you mark while something in it waits on you.
        let failingRoutines = page.routines.count { $0.enabled && $0.runs.first?.outcome == .failed }
        let sourceCount = page.routes.count + page.polls.count
        let failingSources = page.polls.count { $0.failure != nil }
        let waitingActions = page.actions.count(where: ActionsLedger.waitsOnYou)
        routinesMeta.hold(.init(count: page.routines.count, needs: failingRoutines, said: Words.Routines.failing(count: failingRoutines)), make: Self.meta)
        sourcesMeta.hold(.init(count: sourceCount, needs: failingSources, said: Words.Routines.failing(count: failingSources)), make: Self.meta)
        actionsMeta.hold(.init(count: page.actions.count, needs: waitingActions, said: Words.Routines.waiting(count: waitingActions)), make: Self.meta)
        let relayLive = page.relays.contains { $0.state == .live }
        relay.hold(.init(live: relayLive, tip: relayLive ? nil : page.relays.first?.inbound ?? Words.Routines.polledOnly)) { shown in
            let badge = KitBadge(shown.live ? Words.Routines.relayLive : Words.Routines.relayOff, variant: shown.live ? .live : .plain)
            LedgerParts.tip(badge, shown.tip)
            return badge
        }

        let names = Dictionary(page.routines.map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })
        sources.hold(.init(routes: page.routes, polls: page.polls, names: names, minute: minute)) { _ in
            sourceCount == 0 ? purpose(Words.Routines.noSources) : SourcesLedger(routes: page.routes, polls: page.polls, routines: page.routines)
        }
        actions.hold(.init(actions: page.actions, names: names, minute: minute)) { _ in
            page.actions.isEmpty ? purpose(Words.Routines.noActions) : ActionsLedger(page.actions, routineNames: names)
        }
        newRoutine.isHidden = empty || !canTalk
        var items: [String: BlockItem] = [
            "routines": BlockItem(title: Words.Routines.tab, glyph: .clock, meta: routinesMeta,
                                  action: newRoutine.isHidden ? nil : newRoutine, content: routinesBody, measure: Size.cBlockRoutines,
                                  hideable: true, body: .capped, card: true),
            "sources": BlockItem(title: Words.Routines.sources, glyph: .hook, meta: sourcesMeta,
                                 action: relay, content: sources, measure: Size.cBlockLedger, hideable: true, body: .capped, card: true),
            "actions": BlockItem(title: Words.Routines.actions, glyph: .shield, meta: actionsMeta,
                                 content: actions, measure: Size.cBlockLedger, hideable: true, body: .capped, card: true),
        ]
        items.merge(viewItems()) { own, _ in own }
        blocksPage.show(items)
    }

    private func putState(_ key: String, _ make: () -> UIView) {
        guard key != shownState else { return }
        shownState = key
        stateHolder.arrangedSubviews.forEach { $0.removeFromSuperview() }
        stateHolder.addArrangedSubview(make())
    }

    /// A block's count in meta type, subtle, then the needs-you mark when something waits.
    private static func meta(_ shown: MetaShown) -> UIView {
        let number = KitLabel(TypeScale.typeMeta, ink: Palette.inkSubtle)
        number.text = "\(shown.count)"
        number.tabular = true
        let row = UIStackView(arrangedSubviews: [number])
        row.spacing = Space.space1
        row.alignment = .center
        if shown.needs > 0 {
            let mark = GlyphView(.attention, size: Size.iconSm, tint: Palette.statusAttnGlyph)
            mark.isAccessibilityElement = true
            mark.accessibilityLabel = shown.said
            LedgerParts.tip(mark, shown.said)
            row.addArrangedSubview(mark)
        }
        return row
    }

    /// What a block says it is for while it holds nothing (`.purpose`): meta, muted, `space-3` in.
    private func purpose(_ text: String) -> UIView {
        let line = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        line.text = text
        line.wrap = .pretty
        return padded(line, max: nil)
    }

    /// In a block's card, words, starters and the composer stand `space-3` in from its edges.
    private func padded(_ view: UIView, max: Double?) -> UIView {
        let box = UIView()
        view.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(view)
        NSLayoutConstraint.activate([
            view.topAnchor.constraint(equalTo: box.topAnchor, constant: Space.space3),
            view.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -Space.space3),
            view.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: Space.space3),
            view.trailingAnchor.constraint(lessThanOrEqualTo: box.trailingAnchor, constant: -Space.space3),
        ])
        let fill = view.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -Space.space3)
        fill.priority = .defaultHigh
        fill.isActive = true
        if let max { view.widthAnchor.constraint(lessThanOrEqualToConstant: max).isActive = true }
        return box
    }

    #if DEBUG
    /// The routines ledger's ⋯ for a routine, for the probe.
    func menu(of id: String) -> UIButton? { ledger.menus[id] }

    /// Said again once the grid's own pass has placed the blocks: a ⋯ that moved says where it went.
    override func layoutSubviews() {
        super.layoutSubviews()
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
        }
    }
    #endif
}

/// One place on a page that holds the view drawn for what it shows (a
/// Svelte `{#key}`): the same view while that is the same, a new one only
/// when it changed, so a control inside it (an open menu, a focused field)
/// keeps its window across the page's refreshes.
final class Held<Value: Equatable>: UIView {
    private var shown: Value?

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("Held is built in code")
    }

    func hold(_ value: Value, make: (Value) -> UIView) {
        guard value != shown else { return }
        shown = value
        subviews.forEach { $0.removeFromSuperview() }
        let view = make(value)
        view.translatesAutoresizingMaskIntoConstraints = false
        addSubview(view)
        NSLayoutConstraint.activate([
            view.topAnchor.constraint(equalTo: topAnchor),
            view.bottomAnchor.constraint(equalTo: bottomAnchor),
            view.leadingAnchor.constraint(equalTo: leadingAnchor),
            view.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
    }
}

