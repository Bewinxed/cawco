import CawCoCore
import CawCoDesign
import UIKit

/// Recent (home/HomeRecent.svelte): everything else that can be opened,
/// every session no other home list shows and the transcripts stored on the
/// machines, behind one disclosure with search. On the phone it closes the
/// home's page; in the wide rail it sits under Projects. One piece for both:
/// what it lists, its lines' cells, its menus and what a press does; the list
/// that holds it draws the lines it hands out, among its own.
@MainActor
final class RecentList {
    static let page = 30

    /// One of Recent's lines, by a stable id.
    nonisolated enum Line: Hashable, Sendable {
        case head
        case search
        case row(String)
        /// No session matches the search.
        case none
        /// "Show N more".
        case more
    }

    /// What Recent puts in its list: its lines, and the window's question
    /// under the row that asked it (AskHere), by where it stands.
    nonisolated enum Entry: Hashable, Sendable {
        case line(Line)
        case ask(String)
    }

    private let hub: HubConnection
    private let home: HomeModel
    /// The list it stands in ("page-recent", "rail-recent"): its menus ask their questions there.
    let place: String
    /// What a row's session menu does through the shell.
    var sessionMenus: (() -> SessionMenuContext?)?
    /// The search or "Show more" changed what is listed: the host reads Recent again.
    var onChange: () -> Void = {}
    /// The search field took the keyboard.
    var onSearchBegan: () -> Void = {}

    /// Everything Recent lists, before the search narrows it.
    private(set) var all: [HomeModel.RecentItem] = []
    /// The rows the last read listed, by id, for the cells to read.
    private var listed: [String: HomeModel.RecentItem] = [:]
    private var search = ""
    private var shown = RecentList.page

    init(hub: HubConnection, home: HomeModel, place: String) {
        self.hub = hub
        self.home = home
        self.place = place
    }

    /// Recent's entries from `recent` (the board's), the question standing
    /// at `asked` under its row; none until the hub is read or with nothing in it.
    func entries(_ recent: [HomeModel.RecentItem], asked: String?) -> [Entry] {
        all = recent
        listed = [:]
        guard home.ready, !recent.isEmpty else { return [] }
        var entries: [Entry] = [.line(.head)]
        guard home.recentOpen else { return entries }
        entries.append(.line(.search))
        let matches = matches()
        for item in matches.prefix(shown) {
            listed[item.id] = item
            entries.append(.line(.row(item.id)))
            // Its live menu asks by the instance, its stored menu by the conversation.
            let here = [item.id, item.instance?.id].compactMap { $0.map { "\(place)/\($0)" } }
            if let asked, here.contains(asked) { entries.append(.ask(asked)) }
        }
        if matches.isEmpty {
            entries.append(.line(.none))
        } else if matches.count > shown {
            entries.append(.line(.more))
        }
        return entries
    }

    /// What the last read listed, narrowed by the search.
    private func matches() -> [HomeModel.RecentItem] {
        let needle = search.trimmingCharacters(in: .whitespaces).lowercased()
        guard !needle.isEmpty else {
            return all
        }
        return all.filter { $0.title.lowercased().contains(needle) || $0.place.lowercased().contains(needle) }
    }

    /// Whether `line` is session `id`'s row: by the conversation, or by the instance a live one runs as.
    func holds(_ line: Line, session id: String) -> Bool {
        guard case let .row(rid) = line else { return false }
        return rid == id || listed[rid]?.instance?.id == id
    }

    // MARK: What a line draws

    private func content(_ id: String) -> SessionRowView.Content? {
        guard let recent = listed[id] else { return nil }
        // Acted on by its live menu under its instance's id, by its stored menu under its own.
        let asked = hub.acts.words(recent.instance?.id ?? recent.id, status: recent.instance?.status.rawValue)
        return SessionRowView.Content(
            id: recent.id,
            place: recent.markPlace,
            status: HomeViewController.status(recent.instance, home: home),
            title: recent.title,
            line: asked?.text ?? recent.place,
            lineFails: asked?.failed ?? false,
            trail: recent.at > 0 ? Naming.span(ms: home.now - recent.at) : "",
            stale: !home.live,
            hover: recent.instance?.id,
            endWord: recent.instance?.endWord
        )
    }

    /// What a row draws of its own (a pulse, an age), for the rows pass to
    /// compare; nil for a line that draws only what the last read listed.
    func print(of line: Line) -> AnyHashable? {
        guard case let .row(id) = line else { return nil }
        return content(id).map(AnyHashable.init)
    }

    // MARK: Cells

    private lazy var headCell = UICollectionView.CellRegistration<RecentHeadCell, Line> { [weak self] cell, _, _ in
        guard let self else { return }
        cell.configure(count: all.count, open: home.recentOpen)
    }

    private lazy var searchCell = UICollectionView.CellRegistration<SearchCell, Line> { [weak self] cell, _, _ in
        guard let self else { return }
        if cell.field.text != search {
            cell.field.text = search
        }
        cell.field.removeTarget(nil, action: nil, for: [.editingChanged, .editingDidBegin])
        cell.field.addAction(UIAction { [weak self] _ in self?.onSearchBegan() }, for: .editingDidBegin)
        cell.field.addAction(UIAction { [weak self, weak cell] _ in
            guard let self, let cell else { return }
            search = cell.field.text ?? ""
            shown = Self.page
            onChange()
        }, for: .editingChanged)
    }

    private lazy var rowCell = UICollectionView.CellRegistration<RecentRowCell, Line> { [weak self] cell, _, line in
        guard let self, case let .row(id) = line, let content = content(id) else { return }
        cell.row.configure(content)
        // Recent offers no Peek, on the page or in the rail.
        cell.actions.configure(title: content.title, peeks: false, archives: false)
        // LiveSessionMenu for a session the hub holds, StoredSessionMenu for a stored transcript.
        cell.row.menu = { [weak self] copy in
            guard let self, let context = sessionMenus?()?.at(place), let recent = listed[id] else { return nil }
            if let held = recent.instance {
                guard BoardRun.runId(of: held.id) == nil, !ThreadTabs.isThread(held.id), let now = hub.fleet.byId[held.id] else { return nil }
                return SessionMenus.live(now, context: context, copy: copy)
            }
            let fleet = hub.fleet
            guard let info = fleet.catalog(recent.machineId).first(where: {
                fleet.conversationId(sessionKey: $0.sessionId, machineId: recent.machineId, cwd: $0.cwd) == id
            }) else { return nil }
            return SessionMenus.stored(machineId: recent.machineId, info: info, context: context, copy: copy)
        }
    }

    private lazy var noneCell = UICollectionView.CellRegistration<NoteCell, Line> { [weak self] cell, _, _ in
        cell.label.text = "No session matches “\(self?.search ?? "")”."
    }

    private lazy var moreCell = UICollectionView.CellRegistration<ButtonCell, Line> { [weak self] cell, _, _ in
        guard let self else { return }
        let left = matches().count - shown
        cell.configure(title: "Show \(min(Self.page, left)) more")
        cell.onTap = { [weak self] in
            guard let self else { return }
            shown += Self.page
            onChange()
        }
    }

    /// `line`'s cell in the list holding Recent.
    func cell(_ line: Line, in view: UICollectionView, at index: IndexPath) -> UICollectionViewCell {
        switch line {
        case .head: view.dequeueConfiguredReusableCell(using: headCell, for: index, item: line)
        case .search: view.dequeueConfiguredReusableCell(using: searchCell, for: index, item: line)
        case .row: view.dequeueConfiguredReusableCell(using: rowCell, for: index, item: line)
        case .none: view.dequeueConfiguredReusableCell(using: noneCell, for: index, item: line)
        case .more: view.dequeueConfiguredReusableCell(using: moreCell, for: index, item: line)
        }
    }

    // MARK: A press

    /// The lines a press selects: the disclosure and the rows.
    static func selects(_ line: Line) -> Bool {
        switch line {
        case .head, .row: true
        default: false
        }
    }

    /// The disclosure opens or closes Recent (`recentOpen`, the same on the
    /// page and in the rail); a row opens its conversation.
    func select(_ line: Line, open: (String) -> Void) {
        switch line {
        case .head: home.recentOpen.toggle()
        case let .row(id): open(id)
        default: break
        }
    }
}
