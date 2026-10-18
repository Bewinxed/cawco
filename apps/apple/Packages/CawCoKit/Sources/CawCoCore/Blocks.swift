public import CawCoAPI
public import Foundation
import Observation

/// The pages that hold blocks: the four tabs every project has (core
/// blocks.ts `BLOCK_PAGES`). A custom view is placed on one of these.
public enum BlockPage: String, CaseIterable, Sendable {
    case board, table, pipeline, routines

    /// The page as its tab names it (core `BLOCK_PAGE_TITLES`).
    public var title: String { Words.Blocks.PageTitles.byKey[rawValue] ?? rawValue }
}

/// One block in a page's arrangement (core `BlockPlace`): a built-in
/// block's word, or `view:<name>`; narrow or wide; folded off the page or not.
public struct BlockPlace: Equatable, Sendable {
    public let block: String
    public var wide: Bool
    public var hidden: Bool

    public init(block: String, wide: Bool, hidden: Bool) {
        self.block = block
        self.wide = wide
        self.hidden = hidden
    }

    /// A custom view's block id (core `viewBlock`).
    public static func viewBlock(_ name: String) -> String { "view:\(name)" }

    /// The view a block id names, or nil for a built-in block (core `viewOfBlock`).
    public var view: String? { block.hasPrefix("view:") ? String(block.dropFirst(5)) : nil }
}

/// A project's arrangement of blocks as the hub keeps it (hub blocks.ts;
/// the dashboard's blocks/arrangement.svelte.ts): each page's blocks in the
/// person's order, each narrow or wide, shown or hidden; a custom view
/// placed on a page is a block there and no tab. The page shows what the
/// hub answered: a change is written, and the page reflows when the answer
/// lands; a refused write leaves the page as it stood, with the hub's words
/// on its end row. Read on arrival, on every reconnect, and whenever the hub
/// says the arrangement changed (`blocks.changed`).
@MainActor
@Observable
public final class ProjectBlocks {
    public let projectId: String
    @ObservationIgnored private let hub: HubConnection
    /// The project's kept views by name, once read: a block naming one gone is dropped.
    @ObservationIgnored public var kept: () -> [String]? = { nil }

    /// As the hub last answered it, page by page; nil until the first read lands.
    public private(set) var pages: [BlockPage: [BlockPlace]]?
    /// The hub's words for a page's last refused write.
    public private(set) var refused: [BlockPage: String] = [:]

    @ObservationIgnored private var reads = 0
    @ObservationIgnored private var seen: Int
    @ObservationIgnored private var wasConnected: Bool

    /// Each page's own blocks, in their own order (core `BLOCK_BUILT_INS`):
    /// what a page the person has not arranged lays out.
    public static let builtIns: [BlockPage: [BlockPlace]] = [
        .board: [BlockPlace(block: "board", wide: true, hidden: false)],
        .table: [BlockPlace(block: "table", wide: true, hidden: false)],
        .pipeline: [BlockPlace(block: "pipeline", wide: true, hidden: false)],
        .routines: [
            BlockPlace(block: "routines", wide: false, hidden: false),
            BlockPlace(block: "sources", wide: false, hidden: false),
            BlockPlace(block: "actions", wide: false, hidden: false),
        ],
    ]

    public init(hub: HubConnection, projectId: String) {
        self.hub = hub
        self.projectId = projectId
        seen = hub.blocksChanged[projectId] ?? 0
        wasConnected = hub.state == .connected
        watch()
    }

    public func read() async {
        reads += 1
        let ticket = reads
        guard let client = hub.client,
              let output = try? await client.getApiProjectsByIdBlocks(path: .init(id: projectId)),
              case let .ok(ok) = output, let wire = try? ok.body.json else {
            // The pages stand in their own order until the next read.
            return
        }
        guard ticket == reads else { return }
        pages = Self.pages(wire)
    }

    /// A page's blocks in order: as the person arranged them, then any of
    /// the page's own the record lacks, at its own width. A view no longer
    /// kept is left out; a block this build does not know keeps its place.
    public func placesOf(_ page: BlockPage) -> [BlockPlace] {
        let kept = kept()
        let stored = (pages?[page] ?? []).filter { place in
            guard let view = place.view, let kept else { return true }
            return kept.contains(view)
        }
        let named = Set(stored.map(\.block))
        return stored + (Self.builtIns[page] ?? []).filter { !named.contains($0.block) }
    }

    /// The page a custom view stands on as a block, or nil: it is its own tab.
    public func pageOfView(_ name: String) -> BlockPage? {
        let block = BlockPlace.viewBlock(name)
        return BlockPage.allCases.first { page in placesOf(page).contains { $0.block == block } }
    }

    /// Writes a page's arrangement whole. Answers whether the hub took it;
    /// refused, the page stands as it was and its end row says why.
    @discardableResult
    public func set(_ page: BlockPage, _ places: [BlockPlace]) async -> Bool {
        do {
            guard let client = hub.client else { throw TaskRefusal(message: "No hub is connected.") }
            guard let wirePage = Operations.PutApiProjectsByIdBlocksByPage.Input.Path.PagePayload(rawValue: page.rawValue) else {
                throw TaskRefusal(message: "This app can't arrange the \(page.title) page.")
            }
            let blocks = places.map { place in
                Operations.PutApiProjectsByIdBlocksByPage.Input.Body.JsonPayload.BlocksPayloadPayload(
                    block: place.block, width: place.wide ? .wide : .narrow, hidden: place.hidden)
            }
            let output = try await client.putApiProjectsByIdBlocksByPage(path: .init(id: projectId, page: wirePage),
                                                                         body: .json(.init(blocks: blocks)))
            guard case let .ok(ok) = output else { throw await TaskRefusal.reading(output) }
            reads += 1
            pages = Self.pages(try ok.body.json)
            refused[page] = nil
            return true
        } catch {
            refused[page] = error.localizedDescription
            return false
        }
    }

    /// One block of a page changed in place (its width, hidden or shown).
    @discardableResult
    public func change(_ page: BlockPage, _ block: String, wide: Bool? = nil, hidden: Bool? = nil) async -> Bool {
        await set(page, placesOf(page).map { place in
            guard place.block == block else { return place }
            var next = place
            if let wide { next.wide = wide }
            if let hidden { next.hidden = hidden }
            return next
        })
    }

    /// A block moved to `to`, its place in the page's order.
    @discardableResult
    public func move(_ page: BlockPage, _ block: String, to: Int) async -> Bool {
        let places = placesOf(page)
        guard let from = places.firstIndex(where: { $0.block == block }), to != from else { return true }
        var next = places
        let moving = next.remove(at: from)
        next.insert(moving, at: max(0, min(to, next.count)))
        return await set(page, next)
    }

    /// A kept view placed on `page`, at its end, narrow: it is no tab now, and on no other page.
    @discardableResult
    public func place(_ name: String, on page: BlockPage) async -> Bool {
        let block = BlockPlace.viewBlock(name)
        return await set(page, placesOf(page).filter { $0.block != block } + [BlockPlace(block: block, wide: false, hidden: false)])
    }

    /// A view's block leaves its page: the view is its own tab again.
    @discardableResult
    public func unplace(_ name: String) async -> Bool {
        guard let page = pageOfView(name) else { return true }
        let block = BlockPlace.viewBlock(name)
        return await set(page, placesOf(page).filter { $0.block != block })
    }

    private static func pages(_ wire: Components.Schemas.BlockArrangement) -> [BlockPage: [BlockPlace]] {
        let read = { (places: [Components.Schemas.BlockPlace]?) in
            places?.map { BlockPlace(block: $0.block, wide: $0.width == .wide, hidden: $0.hidden) }
        }
        var pages: [BlockPage: [BlockPlace]] = [:]
        pages[.board] = read(wire.pages.board)
        pages[.table] = read(wire.pages.table)
        pages[.pipeline] = read(wire.pages.pipeline)
        pages[.routines] = read(wire.pages.routines)
        return pages
    }

    /// Reads again when the hub says the arrangement changed, and on every reconnect.
    private func watch() {
        withObservationTracking {
            _ = hub.blocksChanged[projectId]
            _ = hub.state
        } onChange: { [weak self] in
            Task { @MainActor [weak self] in
                guard let self else { return }
                let changes = hub.blocksChanged[projectId] ?? 0
                let connected = hub.state == .connected
                let reread = changes != seen || (connected && !wasConnected)
                seen = changes
                wasConnected = connected
                if connected, reread { Task { await self.read() } }
                watch()
            }
        }
    }
}
