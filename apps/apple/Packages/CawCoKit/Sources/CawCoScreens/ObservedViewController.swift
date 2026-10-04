import Observation
public import UIKit

/// One observation path on every supported OS. A model change schedules a
/// layout pass; UIKit coalesces changes before the screen reads its stores.
///
/// A screen has two things to keep current, observed apart:
///
/// - its content, what stands on it and in what order (`refreshContent`,
///   then `drawContent`): a session joining a list, a tab changing;
/// - its rows, what each standing thing draws of its own (`refreshRows`):
///   a session's tool in flight, how long its turn has run.
///
/// Pulses arrive more than once a second across the fleet. A pulse wakes only
/// what read that session, so a row's pulse runs the rows pass alone, and the
/// rows pass redraws only the rows whose drawn state moved (`RowPrints`).
/// The content is worked out again only when what it is made of changes.
///
/// A screen with no list of live rows reads and draws in `refreshContent`
/// and leaves the other two alone.
open class ObservedViewController: UIViewController {
    private var needsContent = true
    private var needsRows = true

    /// The content is read and drawn again on the next layout pass.
    public final func requestRefresh() {
        needsContent = true
        viewIfLoaded?.setNeedsLayout()
    }

    /// The rows alone are drawn again on the next layout pass.
    public final func requestRows() {
        needsRows = true
        viewIfLoaded?.setNeedsLayout()
    }

    override open func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        if needsContent {
            needsContent = false
            needsRows = true
            withObservationTracking {
                refreshContent()
            } onChange: { [weak self] in
                Task { @MainActor in self?.requestRefresh() }
            }
            drawContent()
        }
        if needsRows {
            needsRows = false
            withObservationTracking {
                refreshRows()
            } onChange: { [weak self] in
                Task { @MainActor in self?.requestRows() }
            }
        }
    }

    /// Reads what the screen is made of. Whatever it reads redraws the whole
    /// screen when it changes: a list reads here which rows stand and in what
    /// order, and nothing only one row draws.
    open func refreshContent() {}

    /// Draws what `refreshContent` kept. Nothing read here is observed: a
    /// list applies its snapshot here, so the cells it configures do not tie
    /// the whole screen to their own sessions.
    open func drawContent() {}

    /// Draws each standing row's own state, observed apart from the content.
    open func refreshRows() {}
}

/// What each standing row last drew. A pass hands it what every row draws
/// now and redraws only the rows it gives back: the ones whose drawn state
/// moved.
@MainActor
struct RowPrints<ID: Hashable> {
    private var drawn: [ID: AnyHashable] = [:]

    /// The rows of `next` that drew something else last time; `next` is kept
    /// as what stands now. A row that was not standing before is given back
    /// only with `new`: a list whose cells are configured as they come on
    /// screen leaves it out, a screen that fills its own row views asks for it.
    mutating func take(_ next: [ID: AnyHashable], new: Bool = false) -> [ID] {
        let changed = next.compactMap { id, print in
            switch drawn[id] {
            case let .some(before): before == print ? nil : id
            case .none: new ? id : nil
            }
        }
        drawn = next
        return changed
    }
}
