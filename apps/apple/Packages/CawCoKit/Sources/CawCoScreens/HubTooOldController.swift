import CawCoCore
import CawCoDesign
import UIKit

/// The hub answered in a shape this app cannot read: what to do about it,
/// once, in place of a wait that would never end. Its version is the hub's
/// own (`/health`); Reconnect reads it again after the reader updated it.
final class HubTooOldController: UIViewController {
    private let hub: HubConnection
    private let incompatible: HubConnection.Incompatible

    init(hub: HubConnection, incompatible: HubConnection.Incompatible) {
        self.hub = hub
        self.incompatible = incompatible
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("HubTooOldController is built in code") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        let host = hub.address?.host() ?? "your hub"
        let runs = incompatible.hubVersion.map { "It runs CawCo \($0), which this app cannot read." }
            ?? "It answers in a shape this app cannot read."
        let reconnect = KitButton.make("Reconnect", variant: .outline, height: .sm) { [weak self] in self?.hub.reconnect() }
        let state = KitEmptyState(
            icon: .warning,
            title: "This hub is older than the app",
            line: "\(runs) Update CawCo on \(host), then reconnect.",
            action: reconnect
        )
        state.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(state)
        NSLayoutConstraint.activate([
            state.centerYAnchor.constraint(equalTo: view.safeAreaLayoutGuide.centerYAnchor),
            state.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: Space.space6),
            state.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -Space.space6),
        ])
    }
}
