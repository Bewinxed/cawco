import CawCoDesign
import UIKit

/// Where each row of the transcript list stands: every row, the settled ones
/// then the tail's (the live row, the call in flight, the sends waiting), in
/// one run cut into sections of `chunk`. Every place that turns a row into an
/// index path, or back, asks this; none works the sections out itself.
///
/// The rows are cut into sections so that an update touches only the
/// sections it changes. The cuts are counted from one row, the `origin` (the
/// first the list held, kept for as long as it holds it), not from the first
/// row: a streamed block lands in the newest section, and an older page read
/// in front lands in sections of its own before the origin's, every section
/// the list held standing as it was. Counted from the first row, a page read
/// in front moved every row into another section (30 ms to apply).
///
/// The tail is cut with the settled rows, not kept in a section of its own:
/// an answer that lands keeps its rows (the live row's key, `rekey`) where
/// they stood, so landing it moves no row, and the list draws its rows anew
/// where they stand, as it does a streamed block. In a section of its own the
/// tail's rows left it for the settled section's, every cell made again.
struct RowIndex {
    /// Rows a section holds.
    static let chunk = 128

    let settled: [String]
    private(set) var tail: [String]
    /// The origin row: its id and its settled index.
    let originId: String?
    private let origin: Int
    /// Each settled row's settled index.
    private let settledPlaces: [String: Int]
    /// Each tail row's tail index.
    private var tailPlaces: [String: Int]

    /// Every row's count, settled and tail.
    var count: Int { settled.count + tail.count }
    /// The numbers of the first and last sections.
    private var first: Int { Self.number(0, origin) }
    private var last: Int { Self.number(max(0, count - 1), origin) }

    /// `anchor`: the origin the list counted from (RowIndex `originId`),
    /// kept while the rows hold it; else the first row other than `skip` (the
    /// strip before the first row, which comes and goes).
    init(settled: [String] = [], tail: [String] = [], anchor: String? = nil, skip: String? = nil) {
        self.settled = settled
        self.tail = tail
        var places: [String: Int] = [:]
        places.reserveCapacity(settled.count)
        for (i, id) in settled.enumerated() { places[id] = i }
        settledPlaces = places
        tailPlaces = Self.places(of: tail)
        let held = anchor.flatMap { places[$0] }
        let origin = held ?? settled.firstIndex { $0 != skip } ?? 0
        self.origin = origin
        originId = settled.indices.contains(origin) ? settled[origin] : nil
    }

    private static func places(of tail: [String]) -> [String: Int] {
        var places: [String: Int] = [:]
        for (i, id) in tail.enumerated() { places[id] = i }
        return places
    }

    /// The same settled rows under `tail`: what a frame of a streamed reply
    /// changes. Indexing every settled row again for each was a millisecond
    /// of each such commit in a long session.
    func with(tail: [String]) -> RowIndex {
        var next = self
        next.tail = tail
        next.tailPlaces = Self.places(of: tail)
        return next
    }

    /// The section the row at `row` stands in, counted from the origin's (0).
    private static func number(_ row: Int, _ origin: Int) -> Int {
        let along = row - origin
        return along >= 0 ? along / chunk : -((-along + chunk - 1) / chunk)
    }

    /// Sections the rows take.
    var sections: Int { count == 0 ? 0 : last - first + 1 }
    /// The snapshot's section identifiers, in order.
    var sectionIdentifiers: [Int] { count == 0 ? [] : Array(first ... last) }
    /// The snapshot's identifier of the section at `index`.
    func identifier(ofSection index: Int) -> Int { first + index }

    /// The rows the section at `index` holds, as row indices.
    private func span(_ index: Int) -> Range<Int> {
        let number = first + index
        let start = max(0, origin + number * Self.chunk)
        return start ..< min(count, origin + (number + 1) * Self.chunk)
    }

    /// The row at `row`, settled or tail.
    func id(ofRow row: Int) -> String { row < settled.count ? settled[row] : tail[row - settled.count] }

    /// The rows of section `section`.
    func rows(inSection section: Int) -> [String] { span(section).map(id(ofRow:)) }

    /// The index path of the row at `row`.
    func path(ofRow row: Int) -> IndexPath {
        let index = Self.number(row, origin) - first
        return IndexPath(item: row - span(index).lowerBound, section: index)
    }

    /// The section of the row at `row`.
    func section(ofRow row: Int) -> Int { Self.number(row, origin) - first }

    /// The index path of the row `id`, when the list holds it.
    func path(of id: String) -> IndexPath? {
        if let place = settledPlaces[id] { return path(ofRow: place) }
        return tailPlaces[id].map { path(ofRow: settled.count + $0) }
    }

    /// The row at `path`, when there is one.
    func id(at path: IndexPath) -> String? { row(at: path).map(id(ofRow:)) }

    /// The row index at `path`, settled or tail.
    func row(at path: IndexPath) -> Int? {
        guard path.section >= 0, path.section < sections else { return nil }
        let span = span(path.section)
        let row = span.lowerBound + path.item
        return span.contains(row) ? row : nil
    }

    /// The settled index of the row at `path`; nil for the tail's rows.
    func settledRow(at path: IndexPath) -> Int? { row(at: path).flatMap { $0 < settled.count ? $0 : nil } }

    /// The first row where `settled` then `tail` part from these rows, read
    /// in place: their common count when none does. A long session's rows
    /// copied into one list on each side to compare were 2 ms of a commit.
    func firstDifference(settled: [String], tail: [String]) -> Int {
        let common = min(count, settled.count + tail.count)
        for row in 0 ..< common {
            let other = row < settled.count ? settled[row] : tail[row - settled.count]
            if other != id(ofRow: row) { return row }
        }
        return common
    }

    /// Whether the list holds the row `id`.
    func holds(_ id: String) -> Bool { settledPlaces[id] != nil || tailPlaces[id] != nil }

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
