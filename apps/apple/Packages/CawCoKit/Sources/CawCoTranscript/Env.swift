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
    /// Opens a `show_preview` call's page (its input) in this session's preview.
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
        clock += 1
        if var entry = entries[item.id], let view = entry.view as? V {
            let widthChanged = !Self.same(entry.width, width)
            if entry.print != item.print || widthChanged {
                if widthChanged { (view as? FitsWidth)?.fitWidth = width }
                if entry.print != item.print { view.configure(item); Pace.row() }
                entry.print = item.print
                entry.width = width
                entry.height = nil
            }
            entry.used = clock
            entries[item.id] = entry
            return view
        }
        let view = V(env: env)
        view.translatesAutoresizingMaskIntoConstraints = false
        (view as? FitsWidth)?.fitWidth = width
        view.configure(item)
        Pace.row()
        entries[item.id] = Entry(view: view, print: item.print, width: width, height: nil, used: clock)
        trim()
        return view
    }

    /// Builds `item`'s row off the screen, as `type`, at `width`: its text set
    /// and laid out where it will stand, its height measured. Returns whether
    /// there was anything to do.
    @discardableResult
    func warm(_ type: any RowContent.Type, item: Item, width: CGFloat) -> Bool {
        // A row standing in a cell is that cell's to measure: one on the
        // screen, or one prepared to come on it (a prefetched cell).
        guard !isReady(item, width: width), entries[item.id]?.view.superview == nil else { return false }
        func build<V: RowContent>(_ type: V.Type) -> UIView { row(type, for: item, width: width) }
        let view = build(type)
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
        let size = view.systemLayoutSizeFitting(CGSize(width: width, height: 0), withHorizontalFittingPriority: .required,
                                                verticalFittingPriority: .fittingSizeLevel)
        // Laid out where it will stand, so the cell that shows it finds its
        // text views at their size and lays nothing out again.
        view.frame = CGRect(x: 0, y: 0, width: width, height: size.height)
        view.layoutIfNeeded()
        entries[item.id]?.height = size.height
        return true
    }

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

    /// Only the rows of `ids` are kept.
    func keep(_ ids: some Collection<String>) {
        let wanted = Set(ids)
        entries = entries.filter { wanted.contains($0.key) || $0.value.view.window != nil }
    }

    /// Every row is drawn anew (a theme, a type size or a column change): the
    /// ones off the screen are let go; the ones on it are set again the next
    /// time their cell asks.
    func clear() {
        entries = entries.filter { $0.value.view.window != nil }
        for id in entries.keys {
            entries[id]?.print = ""
            entries[id]?.height = nil
        }
    }

    /// Lets go of the least recently drawn rows off the screen past `limit`.
    private func trim() {
        let off = entries.filter { $0.value.view.window == nil }
        guard off.count > Self.limit else { return }
        for (id, _) in off.sorted(by: { $0.value.used < $1.value.used }).prefix(off.count - Self.limit) {
            entries[id] = nil
        }
    }
}

/// A collection cell standing one item's row (RowStore), its top margin above it.
final class HostCell<Content: RowContent>: UICollectionViewCell, ItemCell {
    private(set) var row: Content?
    private var top: NSLayoutConstraint?
    private weak var store: RowStore?
    /// The item this cell stands: its id and its print.
    private var shown: (id: String, print: String)?
    /// A row was stood here since the cell was last measured: a height the
    /// store holds for it, at this print and this width, is its height.
    private var stood = false

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
        top?.constant = item.top
        shown = (item.id, item.print)
        stood = true
    }

    func lost(_ view: UIView) {
        guard view === row else { return }
        row = nil
        top = nil
        shown = nil
    }

    func redraw(_ item: Item) {
        top?.constant = item.top
        row?.configure(item)
        store?.redrew(item)
        shown = (item.id, item.print)
        stood = false
        invalidateIntrinsicContentSize()
    }

    func forget() {
        stood = false
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
        let fresh = stood
        stood = false
        let width = attributes.size.width
        let margin = top?.constant ?? 0
        if fresh, let shown, let height = store?.height(shown.id, print: shown.print, width: width) {
            attributes.size.height = margin + height
            return attributes
        }
        if abs(bounds.width - width) > 0.5 { bounds.size.width = width }
        layoutIfNeeded()
        let fitted = super.preferredLayoutAttributesFitting(attributes)
        if let shown { store?.measured(shown.id, height: fitted.size.height - margin, width: width) }
        return fitted
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
    /// at: the row (the cell it stands in) is measured again.
    func remeasureRow() {
        var view = superview
        while let current = view, !(current is ItemCell) { view = current.superview }
        guard let cell = view as? ItemCell else { return }
        cell.forget()
        cell.invalidateIntrinsicContentSize()
    }
}

/// A cell drawing one item, whatever its row kind.
@MainActor
protocol ItemCell: UICollectionViewCell {
    /// Draws `item` where the cell stands; the cell sizes itself to it.
    func redraw(_ item: Item)
    /// Its row changed without a new item: its kept height no longer stands.
    func forget()
    /// Its row changed size where it stands (a body moving): measured now at
    /// the width `attributes` give it, and the fitted attributes returned.
    func remeasure(_ attributes: UICollectionViewLayoutAttributes) -> UICollectionViewLayoutAttributes
}
