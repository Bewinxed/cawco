import CawCoDesign
import UIKit

/// Where each row of the transcript list stands: the settled rows in
/// sections of `chunk`, oldest first, then the tail's section (the live row,
/// the call in flight, the sends waiting). Every place that turns a row into
/// an index path, or back, asks this; none works the sections out itself.
///
/// The settled rows are cut into sections so that an update touches only the
/// sections it changes: a streamed block lands in the last one.
struct RowIndex {
    /// Settled rows a section holds.
    static let chunk = 128
    /// The tail section's identifier in the list's snapshot (the settled
    /// sections are identified by their place, 0 on).
    static let tailSection = -1

    let settled: [String]
    let tail: [String]
    /// Each row's place: its settled index, or `settled.count` plus its tail index.
    private let places: [String: Int]

    init(settled: [String] = [], tail: [String] = []) {
        self.settled = settled
        self.tail = tail
        var places: [String: Int] = [:]
        places.reserveCapacity(settled.count + tail.count)
        for (i, id) in settled.enumerated() { places[id] = i }
        for (i, id) in tail.enumerated() { places[id] = settled.count + i }
        self.places = places
    }

    /// Sections the settled rows take.
    var settledSections: Int { (settled.count + Self.chunk - 1) / Self.chunk }
    /// The tail section's index: after every settled one.
    var tailIndex: Int { settledSections }
    /// The snapshot's section identifiers, in order.
    var sectionIdentifiers: [Int] { Array(0 ..< settledSections) + [Self.tailSection] }

    /// The settled rows of section `section`.
    func settled(inSection section: Int) -> ArraySlice<String> {
        let start = section * Self.chunk
        return settled[start ..< min(settled.count, start + Self.chunk)]
    }

    /// The index path of the settled row at `row`.
    func settledPath(_ row: Int) -> IndexPath { IndexPath(item: row % Self.chunk, section: row / Self.chunk) }

    /// The index path of the row `id`, when the list holds it.
    func path(of id: String) -> IndexPath? {
        guard let place = places[id] else { return nil }
        return place < settled.count ? settledPath(place) : IndexPath(item: place - settled.count, section: tailIndex)
    }

    /// The row at `path`, when there is one.
    func id(at path: IndexPath) -> String? {
        if path.section == tailIndex { return tail.indices.contains(path.item) ? tail[path.item] : nil }
        guard let row = settledRow(at: path) else { return nil }
        return settled[row]
    }

    /// The settled index of the row at `path`; nil for the tail's rows.
    func settledRow(at path: IndexPath) -> Int? {
        guard path.section < settledSections else { return nil }
        let row = path.section * Self.chunk + path.item
        return row < settled.count ? row : nil
    }

    /// Whether the list holds the row `id`.
    func holds(_ id: String) -> Bool { places[id] != nil }

    /// Every row the list holds, in order.
    var all: [String] { settled + tail }
}

/// The sections a row's new height changed.
final class RowInvalidation: UICollectionViewLayoutInvalidationContext {
    var sections = Set<Int>()
}

/// The transcript list's layout: its rows one under another, each as tall as
/// `height` says, across the list's width less the ledger's inset. A row with
/// an exact height (worked out before any view, TranscriptPrep) stands there
/// and is never measured; any other stands at what its cell measured, or an
/// estimate until then, and takes its measured height when its cell gives it
/// (self-sizing: the tail, an opened body, a row whose words changed).
///
/// UICollectionViewCompositionalLayout solved its estimated section again
/// for each row that came on the screen at a height other than its estimate,
/// and for every update: a thousand rows made that most of a frame
/// (probe-kit spec `ios-scroll-up`). This one keeps each section's running
/// offsets and works them out again only for what changed.
final class RowLayout: UICollectionViewLayout {
    /// A row's cell height (its margin and the row) and whether it is exact.
    var height: (IndexPath) -> (height: CGFloat, exact: Bool) = { _ in (44, false) }
    /// A cell measured its row at another height than the layout gave it.
    var measured: (IndexPath, CGFloat) -> Void = { _, _ in }
    /// Where the list is to stand once an update's rows are in; nil leaves it.
    var stand: (() -> CGFloat?)?
    /// Where the list stands while a body opens or folds shut under the
    /// reader (`revealMoved`): whatever the list's own resizing proposes.
    var hold: CGFloat?
    /// The sections an update about to be applied changes, where its caller
    /// knows them (TranscriptView `commit`): only those are worked out again.
    var changing: Set<Int>?

    /// Each section's rows' tops within it, and its foot after the last.
    private var tops: [[CGFloat]] = []
    private var exacts: [[Bool]] = []
    private var sectionTops: [CGFloat] = []
    private var contentHeight: CGFloat = 0
    private var laidWidth: CGFloat = -1
    /// Everything is worked out again at the next `prepare`; else only `stale` sections.
    private var whole = true
    private var stale = Set<Int>()

    override class var invalidationContextClass: AnyClass { RowInvalidation.self }

    /// Whether the row at `path` stands at its exact height, worked out before
    /// any view was: its cell stands it there and measures nothing (HostCell).
    func isExact(_ path: IndexPath) -> Bool {
        path.section < exacts.count && path.item < exacts[path.section].count && exacts[path.section][path.item]
    }

    /// The ledger's asymmetric inset: 25 at the start, 21 at the end; 18 both 900pt wide and under.
    private var insets: (leading: CGFloat, trailing: CGFloat) {
        let narrow = (collectionView?.bounds.width ?? 0) <= 900
        return narrow ? (Space.space5, Space.space5) : (Space.space7, Space.space6)
    }

    /// The offset that stands the list's foot at the foot of its view.
    var foot: CGFloat {
        guard let view = collectionView else { return 0 }
        let inset = view.adjustedContentInset
        return max(-inset.top, collectionViewContentSize.height - view.bounds.height + inset.bottom)
    }

    /// The list is moved to where it is to stand as soon as the rows have
    /// their places and before any is built, so only rows it shows are.
    override func prepare() {
        super.prepare()
        Pace.time(.layout) { solve() }
        settle()
    }

    /// The list's place is read after it has been told of the update, not
    /// after `prepare`: the list is stood there too.
    override func prepare(forCollectionViewUpdates updates: [UICollectionViewUpdateItem]) {
        super.prepare(forCollectionViewUpdates: updates)
        settle()
    }

    private func settle() {
        guard let view = collectionView, let y = stand?() ?? hold, abs(view.contentOffset.y - y) > 0.5 else { return }
        view.contentOffset.y = y
    }

    override func targetContentOffset(forProposedContentOffset proposed: CGPoint) -> CGPoint {
        guard let y = stand?() ?? hold else { return super.targetContentOffset(forProposedContentOffset: proposed) }
        return CGPoint(x: proposed.x, y: y)
    }

    /// Works the rows' places out: every section after a change of rows or
    /// width, else the sections a row's height changed in.
    private func solve() {
        guard let view = collectionView else { return }
        let sections = view.numberOfSections
        if whole || abs(view.bounds.width - laidWidth) > 0.5 || tops.count != sections {
            laidWidth = view.bounds.width
            tops = Array(repeating: [], count: sections)
            exacts = Array(repeating: [], count: sections)
            for section in 0 ..< sections { solve(section, in: view) }
        } else {
            for section in stale where section < sections { solve(section, in: view) }
        }
        whole = false
        stale = []
        sectionTops = []
        sectionTops.reserveCapacity(sections)
        var y: CGFloat = 0
        for section in 0 ..< sections {
            sectionTops.append(y)
            y += tops[section].last ?? 0
        }
        contentHeight = y
    }

    private func solve(_ section: Int, in view: UICollectionView) {
        let count = view.numberOfItems(inSection: section)
        var at: [CGFloat] = [0]
        var exact: [Bool] = []
        at.reserveCapacity(count + 1)
        exact.reserveCapacity(count)
        var y: CGFloat = 0
        for item in 0 ..< count {
            let row = height(IndexPath(item: item, section: section))
            y += row.height
            at.append(y)
            exact.append(row.exact)
        }
        tops[section] = at
        exacts[section] = exact
    }

    override var collectionViewContentSize: CGSize {
        CGSize(width: collectionView?.bounds.width ?? 0, height: contentHeight)
    }

    private func attributes(_ path: IndexPath) -> UICollectionViewLayoutAttributes? {
        guard path.section < tops.count, path.item + 1 < tops[path.section].count else { return nil }
        let at = tops[path.section]
        let (leading, trailing) = insets
        let attributes = UICollectionViewLayoutAttributes(forCellWith: path)
        attributes.frame = CGRect(x: leading, y: sectionTops[path.section] + at[path.item],
                                  width: max(0, laidWidth - leading - trailing), height: at[path.item + 1] - at[path.item])
        return attributes
    }

    override func layoutAttributesForItem(at indexPath: IndexPath) -> UICollectionViewLayoutAttributes? {
        attributes(indexPath)
    }

    override func layoutAttributesForElements(in rect: CGRect) -> [UICollectionViewLayoutAttributes]? {
        var out: [UICollectionViewLayoutAttributes] = []
        for section in sectionTops.indices {
            let top = sectionTops[section]
            let at = tops[section]
            guard let foot = at.last, top + foot >= rect.minY else { continue }
            if top > rect.maxY { break }
            // The first row whose foot is past the rect's top, by halving.
            var low = 0, high = at.count - 1
            while low < high {
                let mid = (low + high) / 2
                if top + at[mid + 1] < rect.minY { low = mid + 1 } else { high = mid }
            }
            var item = low
            while item + 1 < at.count, top + at[item] <= rect.maxY {
                if let attributes = attributes(IndexPath(item: item, section: section)) { out.append(attributes) }
                item += 1
            }
        }
        return out
    }

    override func shouldInvalidateLayout(forBoundsChange newBounds: CGRect) -> Bool {
        abs(newBounds.width - laidWidth) > 0.5
    }

    override func invalidateLayout(with context: UICollectionViewLayoutInvalidationContext) {
        super.invalidateLayout(with: context)
        if context.invalidateEverything {
            whole = true
        } else if context.invalidateDataSourceCounts {
            if let changing { stale.formUnion(changing) } else { whole = true }
        }
        if let rows = context as? RowInvalidation { stale.formUnion(rows.sections) }
    }

    override func shouldInvalidateLayout(forPreferredLayoutAttributes preferred: UICollectionViewLayoutAttributes,
                                         withOriginalAttributes original: UICollectionViewLayoutAttributes) -> Bool {
        abs(preferred.size.height - original.size.height) > 0.5
    }

    /// A cell's measured height: the row takes it (`measured`, which the
    /// height it is asked for next reads), and its section is worked out
    /// again. A row wholly above the view's top that changes height moves
    /// the list by as much, so what the reader sees stays where it is.
    override func invalidationContext(forPreferredLayoutAttributes preferred: UICollectionViewLayoutAttributes,
                                      withOriginalAttributes original: UICollectionViewLayoutAttributes) -> UICollectionViewLayoutInvalidationContext {
        let context = super.invalidationContext(forPreferredLayoutAttributes: preferred, withOriginalAttributes: original)
        measured(original.indexPath, preferred.size.height)
        (context as? RowInvalidation)?.sections.insert(original.indexPath.section)
        let change = preferred.size.height - original.size.height
        context.contentSizeAdjustment = CGSize(width: 0, height: change)
        if let view = collectionView, hold == nil, original.frame.maxY <= view.contentOffset.y + view.adjustedContentInset.top {
            context.contentOffsetAdjustment = CGPoint(x: 0, y: change)
        }
        return context
    }
}
