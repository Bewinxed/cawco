import Observation
public import UIKit

/// One observation path on every supported OS. A model change schedules a
/// layout pass; UIKit coalesces changes before the screen reads its stores.
open class ObservedViewController: UIViewController {
    private var needsRefresh = true

    public final func requestRefresh() {
        needsRefresh = true
        viewIfLoaded?.setNeedsLayout()
    }

    override open func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        guard needsRefresh else { return }
        needsRefresh = false
        withObservationTracking {
            refreshContent()
        } onChange: { [weak self] in
            Task { @MainActor in self?.requestRefresh() }
        }
    }

    open func refreshContent() {}
}
