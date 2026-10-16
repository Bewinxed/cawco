import CawCoCore
import CawCoDesign
import UIKit

/// What every row view reads beyond its own block: the columns at this width,
/// the reader's disclosures, the hub to fetch pictures and history from, the
/// fleet for delegates and runs, and how to open the lightbox.
@MainActor
final class RowEnv {
    var columns = Columns(rail: Size.txXRailNarrow)
    var agentName = "Agent"
    /// Who answers here, when the pane says (a project's Caw): what his replies carry is drawn through it.
    var voice: TranscriptVoice?
    var hub: HubConnection?
    var machineId: String?
    var sessionId = ""
    /// Whether the change being drawn is one the reader is watching (Row.svelte `watched`).
    var watched = false
    var isOpen: (String) -> Bool = { _ in false }
    /// Toggles a disclosure by its key, animating the row it sits in.
    var toggle: (String, UIView) -> Void = { _, _ in }
    var openLightbox: (Lightbox.Item, UIView) -> Void = { _, _ in }
    /// Fetches a file a turn carried (its hub reference, its name) and offers
    /// it in the share sheet, from the view tapped.
    var openFile: (String, String, UIView) -> Void = { _, _, _ in }
    /// The transcripts of delegates opened in this one (Delegate.svelte).
    var delegateTranscript: (String) -> SessionTranscript? = { _ in nil }
    /// A delegate's card opened or folded: its transcript is wanted, or not.
    var watchDelegate: (String, Bool) -> Void = { _, _ in }
    /// This transcript's own blocks, for what a delegate card reads back out of them.
    var parentBlocks: () -> [Block] = { [] }
    /// A run's steps, as its detail reads them.
    var runSteps: (String) -> [RunStep] = { _ in [] }
    /// Opening another session, or a run, in its own view (the host routes it).
    var openSession: (String) -> Void = { _ in }
    var openRun: (String) -> Void = { _ in }
    /// Reveals an artifact tool row's artifact (its input) in this session's preview, once `artifact_show` has opened it.
    var openPreview: ([String: Any]) -> Void = { _ in }
    /// The queued message whose words are in the composer: its bubble folds to its tag.
    var isTaken: (String) -> Bool = { _ in false }
    /// What a queued message was just replaced with, until the hub's own record of the new send arrives.
    var replacement: (String) -> String? = { _ in nil }
    /// Whether a queued message can be taken back and edited (Claude's harness only).
    var canEditQueued: (String) -> Bool = { _ in false }
    /// Lifts a queued message's words into the composer.
    var editQueued: (String) -> Void = { _ in }
    /// Asks again for the page before the first row, which could not be read
    /// (`SessionsStore.readOlderPage`).
    var readOlder: () -> Void = {}
    /// Rendered blocks, shared by every list this transcript draws.
    let cache = BlockCache()

    /// What to call a model (models.svelte `modelLabel`): the catalog's name, else the id.
    func modelLabel(_ model: String) -> String { model.isEmpty ? "Default" : model }

    /// A hub path or absolute URL, resolved against the hub.
    func url(_ path: String) -> URL? {
        if let absolute = URL(string: path), absolute.scheme != nil { return absolute }
        guard let base = hub?.address else { return nil }
        return URL(string: path, relativeTo: base)?.absoluteURL
    }
}

/// A row with a body the reader opens: what it is now, and the change to it,
/// as the animations that draw it and what to do once they have run.
@MainActor
protocol Disclosing: UIView {
    var disclosed: Bool { get }
    func toggled(open: Bool) -> (() -> Void, () -> Void)
}

/// The views a row kind draws, configured from its item.
@MainActor
protocol RowContent: UIView {
    init(env: RowEnv)
    func configure(_ item: Item)
}

/// A row view a RowStore may stand for another item once its own is let go
/// (RowStore `spare`): `configure` sets everything it draws for an item, and
/// `recycle` forgets what it kept of the one before.
@MainActor
protocol Recycled: RowContent {
    func recycle()
}

/// A row laid out by frame, with no constraints inside it (PieceView): its
/// cell stands it by frame and asks its height of it. Moving a row of
/// constraints into a cell moved every one of them into the window's layout
/// engine, and solving them was most of what a row took to come on screen.
@MainActor
protocol FrameRow: RowContent {
    /// The row's height `width` wide.
    func height(for width: CGFloat) -> CGFloat
}

/// A row that stands at a width its list knows before layout does
/// (ProseView `fitWidth`), so its text is laid out once, at that width.
@MainActor
protocol FitsWidth: AnyObject {
    var fitWidth: CGFloat? { get set }
}

/// The transcript's row views, one per item, each kept as it was drawn: its
/// text set and laid out, at the width its list gave it, and its height at
/// that width. A cell is only the place a row stands while it is on screen;
/// scrolling back to a row, or a cell taking another row, never sets or lays
/// out its text again. A row is built before it scrolls into view
/// (TranscriptView `warm`) on what a frame has to spare, so the frame it
/// enters in only shows it. A row whose item changed (its print) is drawn
/// again in place, and measured again.
///
/// The rows off the screen are kept to `limit`, the least recently drawn let
/// go first: a long session's every row held laid out and painted was more
/// memory than the screen is worth.
@MainActor
final class RowStore {
    private struct Entry {
        let view: UIView & RowContent
        var print: String
        var width: CGFloat?
        /// The row's height at `width` for `print`, once measured.
        var height: CGFloat?
        var used: Int
    }

    private let env: RowEnv
    private var entries: [String: Entry] = [:]
    private var clock = 0
    /// Rows kept that are not on the screen.
    static let limit = 96
    /// Row views let go of (`trim`), by type, set up again for the next item
    /// of their kind rather than a new one made. Making a row's views was
    /// 3.5 ms of the 6 ms a row took to come on the screen, and a fling past
    /// `limit` rows made every row it reached anew (probe-kit spec
    /// `ios-scroll-up`). Only views that set everything again (`Recycled`).
    private var spare: [ObjectIdentifier: [UIView & RowContent]] = [:]
    /// Spare views kept of each type.
    static let spares = 32
    /// Rows past `limit` before any is let go (`trim`): letting go is done in
    /// batches, as sorting every row held by when it was used, for each row
    /// built, was a tenth of a fling's main thread.
    static let slack = 48
    #if DEBUG
    /// Rows stood at an exact height, to be measured once the list is at rest (`verify`).
    private var unverified: [(id: String, print: String, kind: String, view: Weak, height: CGFloat, width: CGFloat)] = []
    private var verified = Set<String>()
    struct Weak { weak var view: UIView? }
    #endif

    init(env: RowEnv) { self.env = env }

    private static func same(_ a: CGFloat?, _ b: CGFloat?) -> Bool {
        guard let a, let b else { return a == nil && b == nil }
        return abs(a - b) < 0.5
    }

    /// Whether `item`'s row is held as it would be drawn at `width`, its height known.
    func isReady(_ item: Item, width: CGFloat) -> Bool {
        guard let entry = entries[item.id] else { return false }
        return entry.print == item.print && Self.same(entry.width, width) && entry.height != nil
    }

    /// The row for `item`, as `type`, drawn for it at `width`: the one held
    /// when there is one, set again only where its item or width changed.
    func row<V: RowContent>(_ type: V.Type, for item: Item, width: CGFloat?) -> V {
        Pace.time(.build) { kept(type, for: item, width: width) }
    }

    private func kept<V: RowContent>(_: V.Type, for item: Item, width: CGFloat?) -> V {
        clock += 1
        if var entry = entries[item.id], let view = entry.view as? V {
            let widthChanged = !Self.same(entry.width, width)
            if entry.print != item.print || widthChanged {
                if widthChanged { (view as? FitsWidth)?.fitWidth = width }
                if entry.print != item.print {
                    #if DEBUG
                    let start = CACurrentMediaTime()
                    defer { Pace.rowSet(V.self, made: 0, configured: CACurrentMediaTime() - start) }
                    #endif
                    view.configure(item)
                    Pace.row()
                }
                entry.print = item.print
                entry.width = width
                entry.height = nil
            }
            entry.used = clock
            entries[item.id] = entry
            return view
        }
        let view: V
        #if DEBUG
        let start = CACurrentMediaTime()
        var madeAt = start
        defer { Pace.rowSet(V.self, made: madeAt - start, configured: CACurrentMediaTime() - madeAt) }
        #endif
        if let kept = spare[ObjectIdentifier(V.self)]?.popLast() as? V {
            refill()
            (kept as? any Recycled)?.recycle()
            // It stands for its new item from nothing, as a new view does:
            // left at the last item's height, its first layout there laid its
            // texts out at a size they are not to have.
            kept.frame = .zero
            view = kept
            #if DEBUG
            Pace.madeRow(spare: true)
            #endif
        } else {
            view = make(V.self)
            #if DEBUG
            Pace.madeRow(spare: false)
            #endif
        }
        #if DEBUG
        madeAt = CACurrentMediaTime()
        #endif
        (view as? FitsWidth)?.fitWidth = width
        view.configure(item)
        Pace.row()
        // The row this key stood for before, of another kind, is let go of, not torn down here.
        if let old = entries[item.id] { letGo(old.view) }
        entries[item.id] = Entry(view: view, print: item.print, width: width, height: nil, used: clock)
        trimLater()
        return view
    }

    /// A new row view of `type`.
    private func make<V: RowContent>(_: V.Type) -> V {
        let view = V(env: env)
        // A frame row stands by its frame; any other, by the constraints its cell pins it with.
        if !(view is any FrameRow) { view.translatesAutoresizingMaskIntoConstraints = false }
        return view
    }

    /// The row view kinds kept one spare of always: the ones a live turn
    /// brings (a sent message, a reasoning block, a reply's first piece, a
    /// call), so the commit that shows the first of them sets one up for its
    /// item rather than making it (2 to 3.5 ms of a turn's start). One taken
    /// is made again in a turn of the main thread of its own (`refill`).
    var reserve: [any Recycled.Type] = [] {
        didSet { refill() }
    }

    /// A refill is waiting for its turn.
    private var refilling = false

    /// Makes the reserve's missing spares, one view a turn of the main
    /// thread: the run loop's default mode, never a scroll's (tracking)
    /// nor a commit's own turn. A frame's spare time, which a busy main
    /// thread never had, decided nothing (a reasoning row made in its commit).
    private func refill() {
        guard !refilling, reserve.contains(where: { spare[ObjectIdentifier($0)]?.isEmpty ?? true }) else { return }
        refilling = true
        RunLoop.main.perform(inModes: [.default]) { [weak self] in
            MainActor.assumeIsolated { self?.refillOne() }
        }
    }

    /// Makes one of the reserve's missing spares, and asks for the next.
    private func refillOne() {
        refilling = false
        func made<V: Recycled>(_ type: V.Type) -> UIView & RowContent { make(type) }
        if let type = reserve.first(where: { spare[ObjectIdentifier($0)]?.isEmpty ?? true }) {
            let view = made(type)
            // The first cast of a row type to a protocol looks the conformance
            // up across the whole binary, milliseconds: done here, for the
            // casts its row goes through (RowStore `row`, HostCell), not in
            // the commit that stands the first of its kind (a turn's first
            // reasoning row, 3 ms of its commit).
            _ = view as? FitsWidth
            _ = view as? any Recycled
            _ = view as? any FrameRow
            _ = view as? any Disclosing
            spare[ObjectIdentifier(type), default: []].append(view)
        }
        refill()
    }

    /// Builds `item`'s row off the screen, as `type`, at `width`: its text set
    /// and laid out where it will stand, its height measured, or, with
    /// `exact`, laid out once at that height and nothing measured. Returns
    /// whether there was anything to do.
    @discardableResult
    func warm(_ type: any RowContent.Type, item: Item, width: CGFloat, exact: CGFloat?) -> Bool {
        Pace.time(.warm) {
            if let exact { stand(type, item: item, width: width, at: exact) } else { stand(type, item: item, width: width) }
        }
    }

    /// Builds the row and lays it out once at its exact height.
    private func stand(_ type: any RowContent.Type, item: Item, width: CGFloat, at height: CGFloat) -> Bool {
        guard !isReady(item, width: width), entries[item.id]?.view.superview == nil else { return false }
        func build<V: RowContent>(_ type: V.Type) -> UIView { row(type, for: item, width: width) }
        let view = build(type)
        // Out of every cell a row of constraints stands at its width only by one (`stand` below).
        let standing = view is any FrameRow ? nil : view.widthAnchor.constraint(equalToConstant: width)
        standing?.isActive = true
        defer { standing?.isActive = false }
        view.frame = CGRect(x: 0, y: 0, width: width, height: height)
        view.layoutIfNeeded()
        entries[item.id]?.height = height
        #if DEBUG
        verifyLater(item.id, print: item.print, kind: String(describing: type), view: view, height: height, width: width)
        #endif
        return true
    }

    private func stand(_ type: any RowContent.Type, item: Item, width: CGFloat) -> Bool {
        // A row standing in a cell is that cell's to measure: one on the
        // screen, or one prepared to come on it (a prefetched cell).
        guard !isReady(item, width: width), entries[item.id]?.view.superview == nil else { return false }
        func build<V: RowContent>(_ type: V.Type) -> UIView { row(type, for: item, width: width) }
        #if DEBUG
        let fresh = entries[item.id] == nil
        var marks = [CACurrentMediaTime()]
        defer {
            if Pace.probing, marks.count == 5 { Pace.warmed(String(describing: type), fresh: fresh, marks: marks) }
        }
        #endif
        let view = build(type)
        #if DEBUG
        marks.append(CACurrentMediaTime())
        #endif
        if let row = view as? any FrameRow {
            // Its height asked of it, then laid out once there.
            let height = row.height(for: width)
            #if DEBUG
            marks.append(CACurrentMediaTime())
            marks.append(CACurrentMediaTime())
            #endif
            view.frame = CGRect(x: 0, y: 0, width: width, height: height)
            view.layoutIfNeeded()
            #if DEBUG
            marks.append(CACurrentMediaTime())
            #endif
            entries[item.id]?.height = height
            return true
        }
        // A row with no superview takes no width from its frame: layout gave
        // it the width its content asked for. A grouped turn's clock alone
        // made one 39pt wide, and its list, its tab stop past the line's end
        // at that width, was laid out for good (the main thread held, the
        // screen frozen mid-scroll). Here, as in a cell, it stands at its width.
        let standing = view.widthAnchor.constraint(equalToConstant: width)
        standing.isActive = true
        defer { standing.isActive = false }
        // Two passes, as a cell measures (HostCell): laid out at its width so
        // every text learns it, then measured.
        view.frame = CGRect(x: 0, y: 0, width: width, height: max(view.bounds.height, 1))
        view.layoutIfNeeded()
        #if DEBUG
        marks.append(CACurrentMediaTime())
        #endif
        let size = view.systemLayoutSizeFitting(CGSize(width: width, height: 0), withHorizontalFittingPriority: .required,
                                                verticalFittingPriority: .fittingSizeLevel)
        #if DEBUG
        marks.append(CACurrentMediaTime())
        #endif
        // Laid out where it will stand, so the cell that shows it finds its
        // text views at their size and lays nothing out again.
        view.frame = CGRect(x: 0, y: 0, width: width, height: size.height)
        view.layoutIfNeeded()
        #if DEBUG
        marks.append(CACurrentMediaTime())
        #endif
        entries[item.id]?.height = size.height
        return true
    }

    #if DEBUG
    /// A row stood at an exact height, measured as its view lays out once the
    /// list is at rest (`verify`): any difference is a drift (probe-kit spec
    /// `ios-scroll-up`, which must count none).
    func verifyLater(_ id: String, print: String, kind: String, view: UIView, height: CGFloat, width: CGFloat) {
        guard Pace.probing, !verified.contains(id) else { return }
        unverified.append((id, print, kind, Weak(view: view), height, width))
    }

    /// Measures rows stood at exact heights until `deadline`; whether any are left.
    @discardableResult
    func verify(until deadline: Double) -> Bool {
        while !unverified.isEmpty, CACurrentMediaTime() < deadline {
            let next = unverified.removeLast()
            // Only a view that still stands for the row it was stood for: a
            // row view let go of stands for another row since (`spare`).
            guard !verified.contains(next.id), let view = next.view.view, let entry = entries[next.id],
                  entry.view === view, entry.print == next.print else { continue }
            verified.insert(next.id)
            let real: CGFloat
            if let row = view as? any FrameRow {
                real = row.height(for: next.width)
            } else {
                // A row out of every cell stands at its width only by a constraint (`stand`).
                let standing = view.superview == nil ? view.widthAnchor.constraint(equalToConstant: next.width) : nil
                standing?.isActive = true
                real = view.systemLayoutSizeFitting(CGSize(width: next.width, height: 0), withHorizontalFittingPriority: .required,
                                                    verticalFittingPriority: .fittingSizeLevel).height
                standing?.isActive = false
            }
            Pace.heightChecked(next.kind, id: next.id, exact: next.height, real: real)
        }
        return !unverified.isEmpty
    }
    #endif

    /// The row's height for `item` at `width`, when it is known.
    func height(_ id: String, print: String, width: CGFloat) -> CGFloat? {
        guard let entry = entries[id], entry.print == print, entry.width.map({ abs($0 - width) < 0.5 }) == true else { return nil }
        return entry.height
    }

    /// The row for `id` was measured at `width`.
    func measured(_ id: String, height: CGFloat, width: CGFloat) {
        guard let entry = entries[id], Self.same(entry.width, width) || entry.width == nil else { return }
        entries[id]?.height = height
        entries[id]?.width = width
    }

    /// The cell standing the row for `id`, on the screen or prepared to come on it.
    func cell(holding id: String) -> ItemCell? {
        entries[id]?.view.superview?.superview as? ItemCell
    }

    /// The row for `id` changed where it stands (a picture, a body opened):
    /// its height is measured again.
    func forget(_ id: String) { entries[id]?.height = nil }

    /// The row `view` stands in, off the screen, changed where it stands (a
    /// body moving while its row is out of every cell).
    func forget(holding view: UIView) {
        let root = sequence(first: view, next: { $0.superview }).reduce(view) { $1 }
        for (id, entry) in entries where entry.view === root { entries[id]?.height = nil }
    }

    /// What the row for `id` reads beyond its item changed (a queued message
    /// lifted into the composer, a preview opened): it is set again the next
    /// time a cell stands it.
    func stale(_ id: String) {
        entries[id]?.print = ""
        entries[id]?.height = nil
    }

    /// The rows held that are drawn in `type`, with their item ids.
    func held<V: RowContent>(_: V.Type) -> [(id: String, view: V)] {
        entries.compactMap { id, entry in (entry.view as? V).map { (id, $0) } }
    }

    /// The row for `item` was drawn again where it stands (a streamed frame).
    func redrew(_ item: Item) {
        entries[item.id]?.print = item.print
        entries[item.id]?.height = nil
    }

    /// The rows of `ids` are let go of (their items are gone), but one on the screen.
    func drop(_ ids: Set<String>) {
        for id in ids {
            guard let entry = entries[id], entry.view.window == nil else { continue }
            entries[id] = nil
            letGo(entry.view)
        }
    }

    /// Only the rows of `ids` are kept.
    func keep(_ ids: some Collection<String>) {
        let wanted = Set(ids)
        for (id, entry) in entries where !wanted.contains(id) && entry.view.window == nil {
            entries[id] = nil
            letGo(entry.view)
        }
    }

    /// Every row is drawn anew (a theme, a type size or a column change): the
    /// ones off the screen are let go; the ones on it are set again the next
    /// time their cell asks.
    func clear() {
        dying += spare.values.flatMap(\.self)
        spare = [:]
        // The live kinds' spares are made again for the new look.
        refill()
        for (id, entry) in entries where entry.view.window == nil {
            entries[id] = nil
            dying.append(entry.view)
        }
        releaseLater()
        for id in entries.keys {
            entries[id]?.print = ""
            entries[id]?.height = nil
        }
    }

    /// A trim is waiting for its turn.
    private var trimming = false

    /// Lets go of rows past `limit` in a turn of the main thread of its own
    /// (any mode: a scroll's too, so a fling never holds every row it
    /// passed): letting a batch go released the views past the spares, and
    /// that, inside whichever row's build crossed the limit, was 3 ms of a
    /// live turn's commit.
    private func trimLater() {
        guard !trimming, entries.count > Self.limit + Self.slack else { return }
        trimming = true
        RunLoop.main.perform(inModes: [.common]) { [weak self] in
            MainActor.assumeIsolated {
                self?.trimming = false
                self?.trim()
            }
        }
    }

    /// Lets go of the least recently drawn rows off the screen past `limit`,
    /// once `slack` more are held than it allows.
    private func trim() {
        guard entries.count > Self.limit + Self.slack else { return }
        let off = entries.filter { $0.value.view.window == nil }
        guard off.count > Self.limit else { return }
        for (id, entry) in off.sorted(by: { $0.value.used < $1.value.used }).prefix(off.count - Self.limit) {
            entries[id] = nil
            letGo(entry.view)
        }
    }

    /// Row views let go of that no spare takes, released in a turn of the
    /// main thread of their own (`releaseLater`).
    private var dying: [UIView] = []
    private var releasing = false

    /// A row view let go of: a spare for the next item of its kind, else
    /// released later. Released where it was let go, a row view's tree came
    /// down inside the commit that let it go: a live row's key standing for
    /// another kind (the working indicator giving way to the reply) was 3.5
    /// ms of a turn's commit.
    private func letGo(_ view: UIView & RowContent) {
        if keepSpare(view) { return }
        dying.append(view)
        releaseLater()
    }

    private func releaseLater() {
        guard !releasing, !dying.isEmpty else { return }
        releasing = true
        RunLoop.main.perform(inModes: [.common]) { [weak self] in
            MainActor.assumeIsolated {
                self?.releasing = false
                self?.dying.removeAll()
            }
        }
    }

    /// Keeps a row view let go of for the next item of its kind. Only one in
    /// no cell: a cell off the screen still holding its row may be one the
    /// list prepared to show next, which shows what it holds without being
    /// asked for its row again. A cell given another item lets its row go
    /// (HostCell `host`), so most rows let go of are in none. Whether it kept it.
    private func keepSpare(_ view: UIView & RowContent) -> Bool {
        guard view is any Recycled, view.superview == nil else { return false }
        let type = ObjectIdentifier(Swift.type(of: view))
        guard spare[type, default: []].count < Self.spares else { return false }
        spare[type, default: []].append(view)
        return true
    }
}

/// A collection cell standing one item's row (RowStore), its top margin above it.
final class HostCell<Content: RowContent>: UICollectionViewCell, ItemCell {
    private(set) var row: Content?
    /// The room above the row (Item `top`).
    private var margin: CGFloat = 0
    /// What pins a row of constraints under its margin; none for a frame row (FrameRow).
    private var top: NSLayoutConstraint?
    private weak var store: RowStore?
    /// The item this cell stands: its id and its print.
    private var shown: (id: String, print: String)?
    /// A row was stood here since the cell was last measured: a height the
    /// store holds for it, at this print and this width, is its height.
    private var stood = false
    /// The row changed where it stands since it was last measured (`forget`,
    /// a measured redraw). Until then a frame row (FrameRow), whose height is
    /// only its content's at its width, keeps the height it stands at however
    /// often the list asks: every update asked each cell on the screen again,
    /// and each was measured again, a turn's start and end 12 ms of the main
    /// thread. A row of constraints is measured on any ask but the first
    /// after it is stood (`stood`): a kept height let one skip a measure it needed.
    private var unsure = false

    /// Stands `item`'s row here, taking it from wherever it stood before.
    func host(_ item: Item, store: RowStore, width: CGFloat?) {
        self.store = store
        let view = store.row(Content.self, for: item, width: width)
        if view !== row {
            if let row, row.superview === contentView { row.removeFromSuperview() }
            // The cell it stood in before (one going away, or reused) no longer has it.
            (view.superview?.superview as? any RowHost)?.lost(view)
            view.removeFromSuperview()
            row = view
            contentView.addSubview(view)
            top = nil
            if !(view is any FrameRow) {
                let top = view.topAnchor.constraint(equalTo: contentView.topAnchor)
                let bottom = view.bottomAnchor.constraint(equalTo: contentView.bottomAnchor)
                bottom.priority = .init(999)
                NSLayoutConstraint.activate([
                    view.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
                    view.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
                    top, bottom,
                ])
                self.top = top
            }
        }
        place(item.top)
        shown = (item.id, item.print)
        stood = true
        unsure = false
    }

    /// The row stands `margin` under the cell's top.
    private func place(_ margin: CGFloat) {
        self.margin = margin
        top?.constant = margin
        if let row = row as? any FrameRow { stand(row) }
    }

    /// A frame row takes the cell's width, under its margin, to the cell's foot.
    private func stand(_ row: any FrameRow) {
        let frame = CGRect(x: 0, y: margin, width: contentView.bounds.width, height: max(0, contentView.bounds.height - margin))
        if row.frame != frame { row.frame = frame }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if let row = row as? any FrameRow, row.superview === contentView { stand(row) }
    }

    func lost(_ view: UIView) {
        guard view === row else { return }
        row = nil
        top = nil
        shown = nil
    }

    func redraw(_ item: Item, measured: Bool) {
        place(item.top)
        row?.configure(item)
        store?.redrew(item)
        shown = (item.id, item.print)
        // A row at an exact height takes its new one from the layout (its
        // section worked out again, TranscriptView `redrawInPlace`): nothing is measured.
        stood = !measured
        unsure = measured
        if measured { invalidateIntrinsicContentSize() }
    }

    func forget() {
        stood = false
        unsure = true
        if let shown { store?.forget(shown.id) }
    }

    func remeasure(_ attributes: UICollectionViewLayoutAttributes) -> UICollectionViewLayoutAttributes {
        forget()
        let fitted = preferredLayoutAttributesFitting(attributes)
        // The list's own ask for its size in the layout pass that follows is this one's answer.
        stood = true
        return fitted
    }

    /// A row the store holds measured at this width stands at that height:
    /// it was laid out there, so nothing in it is laid out again. A row that
    /// changed where it stands (a picture or a diff arrived, a body opened,
    /// a streamed frame) is measured, and the store keeps that height.
    ///
    /// Measured in two passes at the width it will stand at: one lays it out,
    /// so every text in it learns the width it stands at (ProseView
    /// `laidWidth`), then the measure. Measured in one, a text whose width
    /// only layout knows was measured before it had one.
    override func preferredLayoutAttributesFitting(_ attributes: UICollectionViewLayoutAttributes) -> UICollectionViewLayoutAttributes {
        let first = stood
        let fresh = first || (row is any FrameRow && !unsure)
        stood = false
        let width = attributes.size.width
        // A row whose exact height the layout gave (RowLayout) stands at it: nothing is measured.
        if fresh, ((superview as? UICollectionView)?.collectionViewLayout as? RowLayout)?.isExact(attributes.indexPath) == true {
            #if DEBUG
            if first, let shown, let row { store?.verifyLater(shown.id, print: shown.print, kind: String(describing: Content.self), view: row,
                                                       height: attributes.size.height - margin, width: width) }
            #endif
            return attributes
        }
        if fresh, let shown, let height = store?.height(shown.id, print: shown.print, width: width) {
            attributes.size.height = margin + height
            return attributes
        }
        if let row = row as? any FrameRow {
            // A frame row says its height at a width: nothing is solved.
            return Pace.time(.measure) {
                let height = row.height(for: width)
                if let shown { store?.measured(shown.id, height: height, width: width) }
                unsure = false
                attributes.size.height = margin + height
                return attributes
            }
        }
        return Pace.time(.measure) {
            if abs(bounds.width - width) > 0.5 { bounds.size.width = width }
            layoutIfNeeded()
            let fitted = super.preferredLayoutAttributesFitting(attributes)
            if let shown { store?.measured(shown.id, height: fitted.size.height - margin, width: width) }
            return fitted
        }
    }
}

/// A cell a row can be taken from.
@MainActor
protocol RowHost: AnyObject {
    /// `view` now stands in another cell.
    func lost(_ view: UIView)
}

extension HostCell: RowHost {}

extension UIView {
    /// What this view draws no longer fits the height its row was measured
    /// at: the row (the cell it stands in) is measured again. A transcript
    /// row forgets the height it kept, and its list (RowLayout) reads it
    /// again. Any other self-sizing cell, a list's or a table's, is asked to
    /// size itself again as UIKit's self-sizing invalidation takes it
    /// (`invalidateIntrinsicContentSize` on the cell), once the pass laying
    /// it out is over: raised inside that pass, where a view learns its new
    /// width, the list had already taken the cell's size and kept it (the
    /// task sheet's report stood 395.5pt tall at a width it needs 578.5 for,
    /// after its transcript collapsed on an iPad). A view in no cell is laid
    /// out again by its own invalidation.
    func remeasureRow() {
        var view = superview
        while let current = view, !(current is UICollectionViewCell || current is UITableViewCell) { view = current.superview }
        guard let cell = view else { return }
        if let row = cell as? ItemCell {
            row.forget()
            cell.invalidateIntrinsicContentSize()
            return
        }
        DispatchQueue.main.async { [weak cell] in cell?.invalidateIntrinsicContentSize() }
    }
}

/// A cell drawing one item, whatever its row kind.
@MainActor
protocol ItemCell: UICollectionViewCell {
    /// Draws `item` where the cell stands; `measured`: the cell sizes itself
    /// to it, else it stands at the exact height the layout gives it.
    func redraw(_ item: Item, measured: Bool)
    /// Its row changed without a new item: its kept height no longer stands.
    func forget()
    /// Its row changed size where it stands (a body moving): measured now at
    /// the width `attributes` give it, and the fitted attributes returned.
    func remeasure(_ attributes: UICollectionViewLayoutAttributes) -> UICollectionViewLayoutAttributes
}
