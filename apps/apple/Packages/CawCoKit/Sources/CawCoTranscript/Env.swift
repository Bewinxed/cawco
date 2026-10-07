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
    /// Rendered blocks, shared by every list this transcript draws.
    let cache = BlockCache()
    /// Each row's height as last measured, by item id: the print and the
    /// width it was measured at (HostCell `preferredLayoutAttributesFitting`).
    var heights: [String: (print: String, width: CGFloat, height: CGFloat)] = [:]

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

/// A collection cell holding one row view, its top margin above it.
final class HostCell<Content: RowContent>: UICollectionViewCell, ItemCell {
    private(set) var row: Content!
    private var top: NSLayoutConstraint!
    private weak var env: RowEnv?
    /// The item this cell draws: its id and its print.
    private var shown: (id: String, print: String)?
    /// Configured since it was last measured: a height kept for this block,
    /// at this print and this width, is its height without measuring again.
    private var configured = false

    func install(env: RowEnv) {
        guard row == nil else { return }
        self.env = env
        let view = Content(env: env)
        row = view
        view.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(view)
        top = view.topAnchor.constraint(equalTo: contentView.topAnchor)
        let bottom = view.bottomAnchor.constraint(equalTo: contentView.bottomAnchor)
        bottom.priority = .init(999)
        NSLayoutConstraint.activate([
            view.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            view.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            top, bottom,
        ])
    }

    func configure(_ item: Item) {
        top.constant = item.top
        row.configure(item)
        shown = (item.id, item.print)
        configured = true
    }

    func redraw(_ item: Item) {
        configure(item)
        invalidateIntrinsicContentSize()
    }

    func forget() {
        configured = false
        if let shown { env?.heights[shown.id] = nil }
    }

    /// A settled block is measured once at a width: a cell set up for it
    /// again (scrolled back to, reused) takes the height it was measured at.
    /// A row that changed on its own (a picture or a diff arrived, a body
    /// opened) is measured again, and that height is kept instead.
    override func preferredLayoutAttributesFitting(_ attributes: UICollectionViewLayoutAttributes) -> UICollectionViewLayoutAttributes {
        let fresh = configured
        configured = false
        let width = attributes.size.width
        if fresh, let shown, let kept = env?.heights[shown.id], kept.print == shown.print, abs(kept.width - width) < 0.5 {
            attributes.size.height = kept.height
            return attributes
        }
        let fitted = super.preferredLayoutAttributesFitting(attributes)
        if let shown { env?.heights[shown.id] = (shown.print, width, fitted.size.height) }
        return fitted
    }
}

/// A cell drawing one item, whatever its row kind.
@MainActor
protocol ItemCell: UICollectionViewCell {
    /// Draws `item` where the cell stands; the cell sizes itself to it.
    func redraw(_ item: Item)
    /// Its row changed without a new item: its kept height no longer stands.
    func forget()
}
