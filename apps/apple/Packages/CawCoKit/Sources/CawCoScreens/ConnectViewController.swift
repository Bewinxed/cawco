import CawCoCore
import CawCoDesign
import CawCoMascot
import UIKit

/// The hub's address, entered once and kept, the hubs found on this network,
/// and the connection's state. Caw stands in at first run and while a kept
/// hub cannot be reached. Plain on purpose: onboarding brings the first-run
/// design.
final class ConnectViewController: ObservedViewController, UITextFieldDelegate {
    enum Mode {
        /// No hub yet.
        case firstRun
        /// A hub is kept but has not answered on this launch.
        case reconnecting
        /// The operator is pointing the app at another hub.
        case change
    }

    private let hub: HubConnection
    private let mode: Mode
    private let done: () -> Void
    private let discovery = HubDiscovery()
    private let field = UITextField()
    private let problem = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)
    private let status = StatusLineView()
    private let found = UIStackView()
    private let foundHead = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private var connectButton: UIButton!
    private var shownFound: [HubDiscovery.Found] = []

    init(hub: HubConnection, mode: Mode, done: @escaping () -> Void = {}) {
        self.hub = hub
        self.mode = mode
        self.done = done
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ConnectViewController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess

        let column = UIStackView()
        column.axis = .vertical
        column.spacing = Space.space5
        column.translatesAutoresizingMaskIntoConstraints = false

        if mode != .change {
            let caw = CawView(status: mode == .firstRun ? .ready : .reconnecting)
            let box = UIView()
            box.addSubview(caw)
            column.addArrangedSubview(box)
            NSLayoutConstraint.activate([
                caw.widthAnchor.constraint(equalToConstant: HomeViewController.cawSide),
                caw.heightAnchor.constraint(equalToConstant: HomeViewController.cawSide),
                caw.centerXAnchor.constraint(equalTo: box.centerXAnchor),
                caw.topAnchor.constraint(equalTo: box.topAnchor),
                caw.bottomAnchor.constraint(equalTo: box.bottomAnchor),
            ])
        }

        let title = KitLabel(TypeScale.typeTitle, ink: Palette.inkStrong, tracking: TypeScale.trackTitle, lines: 0)
        title.text = mode == .reconnecting ? "Your hub" : "Connect to your hub"
        title.accessibilityTraits = .header
        let body = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
        body.text = "The hub's address on your network, like http://192.168.3.100:3456."

        field.placeholder = "http://hub:3456"
        field.text = hub.address?.absoluteString
        field.font = TypeScale.typeBody.font
        field.adjustsFontForContentSizeCategory = true
        field.textColor = Palette.inkStrong
        field.keyboardType = .URL
        field.textContentType = .URL
        field.autocapitalizationType = .none
        field.autocorrectionType = .no
        field.returnKeyType = .go
        field.clearButtonMode = .whileEditing
        field.delegate = self
        field.accessibilityLabel = "Hub address"
        let well = TileView(radius: Radius.radiusMd)
        well.addSubview(field)
        field.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            field.leadingAnchor.constraint(equalTo: well.leadingAnchor, constant: Space.space3),
            field.trailingAnchor.constraint(equalTo: well.trailingAnchor, constant: -Space.space3),
            field.topAnchor.constraint(equalTo: well.topAnchor),
            field.bottomAnchor.constraint(equalTo: well.bottomAnchor),
            well.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHLg),
        ])
        field.addAction(UIAction { [weak self] _ in self?.fieldChanged() }, for: .editingChanged)
        problem.isHidden = true

        let entry = UIStackView(arrangedSubviews: [title, body, well, problem, status])
        entry.axis = .vertical
        entry.spacing = Space.space2
        column.addArrangedSubview(entry)

        foundHead.text = "On this network"
        found.axis = .vertical
        found.spacing = Space.space1
        found.addArrangedSubview(foundHead)
        found.isHidden = true
        column.addArrangedSubview(found)

        connectButton = KitButton.make(mode == .reconnecting ? "Connect to this address" : "Connect", variant: .action, height: .lg, stretch: true) { [weak self] in
            self?.connect()
        }
        column.addArrangedSubview(connectButton)
        fieldChanged()

        let scroll = UIScrollView()
        scroll.alwaysBounceVertical = false
        scroll.keyboardDismissMode = .interactive
        scroll.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scroll)
        scroll.addSubview(column)
        let content = scroll.contentLayoutGuide
        let frame = scroll.frameLayoutGuide
        NSLayoutConstraint.activate([
            scroll.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            scroll.topAnchor.constraint(equalTo: view.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
            // Caw's acting reaches past his still box: room for it under the bars.
            column.topAnchor.constraint(equalTo: content.topAnchor, constant: Space.space8 + Space.space5),
            column.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -Space.space5),
            // A readable column, centred in a wide window.
            column.leadingAnchor.constraint(greaterThanOrEqualTo: frame.leadingAnchor, constant: Space.space5),
            column.trailingAnchor.constraint(lessThanOrEqualTo: frame.trailingAnchor, constant: -Space.space5),
            column.centerXAnchor.constraint(equalTo: frame.centerXAnchor),
            column.widthAnchor.constraint(lessThanOrEqualToConstant: 420),
        ])
        let width = column.widthAnchor.constraint(equalTo: frame.widthAnchor, constant: -Space.space5 * 2)
        width.priority = .defaultHigh
        width.isActive = true
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        discovery.start()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        discovery.stop()
    }

    override func refreshContent() {
        // A hub that was never entered has no state to say.
        status.isHidden = hub.address == nil
        status.configure(hub: hub, ready: false, spend: "")
        let hubs = discovery.found
        guard hubs != shownFound else {
            return
        }
        shownFound = hubs
        for view in found.arrangedSubviews.dropFirst() {
            view.removeFromSuperview()
        }
        for hub in hubs {
            let button = KitButton.make("\(hub.name)  ·  \(hub.address.absoluteString)", variant: .outline, height: .lg, stretch: true) { [weak self] in
                self?.field.text = hub.address.absoluteString
                self?.connect()
            }
            button.contentHorizontalAlignment = .leading
            found.addArrangedSubview(button)
        }
        found.isHidden = hubs.isEmpty
    }

    private func fieldChanged() {
        connectButton.isEnabled = !(field.text ?? "").trimmingCharacters(in: .whitespaces).isEmpty
    }

    func textFieldShouldReturn(_: UITextField) -> Bool {
        connect()
        return true
    }

    private func connect() {
        guard let address = HubConnection.address(from: field.text ?? "") else {
            problem.text = "That isn't an address the app can reach. Enter it as http://host:port."
            problem.isHidden = false
            return
        }
        problem.isHidden = true
        view.endEditing(true)
        hub.connect(to: address)
        done()
    }
}
