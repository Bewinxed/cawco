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
final class HostCell<Content: RowContent>: UICollectionViewCell {
    private(set) var row: Content!
    private var top: NSLayoutConstraint!

    func install(env: RowEnv) {
        guard row == nil else { return }
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
    }
}
