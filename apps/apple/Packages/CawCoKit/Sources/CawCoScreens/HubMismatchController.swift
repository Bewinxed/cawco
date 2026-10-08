import CawCoCore
import CawCoDesign
import UIKit

/// The hub answered in a shape this app cannot read: what to do about it,
/// once, in place of a wait that would never end. Nothing tells which side
/// is behind, so it names both fixes in the words the composer's alert uses
/// (`HubConnection.Incompatible`): the hub's version from `/health`, an app
/// update from TestFlight, or a hub update; Reconnect reads it again after.
final class HubMismatchController: UIViewController {
    private let hub: HubConnection
    private let incompatible: HubConnection.Incompatible

    init(hub: HubConnection, incompatible: HubConnection.Incompatible) {
        self.hub = hub
        self.incompatible = incompatible
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("HubMismatchController is built in code") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        let reconnect = KitButton.make("Reconnect", variant: .outline, height: .sm) { [weak self] in self?.hub.reconnect() }
        let testFlight = KitButton.make("Open TestFlight", variant: .ghost, height: .sm) {
            UIApplication.shared.open(HubConnection.Incompatible.testFlight)
        }
        // The next action, with the TestFlight link beside it.
        let actions = UIStackView(arrangedSubviews: [reconnect, testFlight])
        actions.spacing = Space.space2
        actions.alignment = .center
        let state = KitEmptyState(
            icon: .warning,
            title: HubConnection.Incompatible.title,
            line: incompatible.message(host: hub.address?.host() ?? "your hub"),
            action: actions
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
