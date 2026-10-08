import CawCoCore
import CawCoDesign
import CawCoMascot
import OSLog
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
    private let body = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
    let scroll = UIScrollView()
    private let problem = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)
    private let status = StatusLineView()
    private let found = UIStackView()
    private let foundHead = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let networkAccess = UIStackView()
    private let searching = UIStackView()
    private let noWifi = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
    private var connectButton: UIButton!
    // The hub sheet's Notifications section (paywall DESIGN.md H): never empty,
    // and the one CawCo Pro surface an owner sees. No price, no selling row.
    private let notifications = UIStackView()
    private let notifyLine = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
    private let notifySpinner = KitSpinner(side: 16)
    private let notifyReason = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)
    private let notifyAction = UIStackView()
    private let quietRow = UIStackView()
    private let quietHint = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let quietSwitch = UISwitch()
    private lazy var testLink = LinkButton(PaywallCopy.Hub.test) { Task { await PushRegistry.shared.sendTest() } }
    private let testProblem = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)
    // H5: the free week's day-6 reminder.
    private let reminderRow = UIStackView()
    private let reminderHint = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private let reminderSwitch = UISwitch()
    // H7: this device leaves the relay.
    private let removeBlock = UIStackView()
    private lazy var removeLink = LinkButton(PaywallCopy.Hub.remove) { Task { await PushRegistry.shared.removeFromRelay() } }
    private let removeProblem = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)
    private var drawnNotify: NotifyState?
    /// H2's Turn on: the shell opens the notification setup over this sheet.
    var turnOnNotifications: () -> Void = {}
    /// Caw on this screen; when the screen goes, Root lets him fade out over the next one.
    private(set) var caw: CawView?
    private var shownFound: [HubDiscovery.Found] = []
    #if DEBUG
    private var lastEvidence = ""
    #endif

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
            // First run: no hub yet, so nothing is going on and he sleeps.
            let caw = CawView(status: mode == .firstRun ? .sleeping : .reconnecting)
            self.caw = caw
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

        let title = KitLabel(TypeScale.typeTitle, ink: Palette.inkStrong, lines: 0)
        title.text = mode == .reconnecting ? "Your hub" : "Connect to your hub"
        title.accessibilityTraits = .header
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

        // In the house sheet the sheet's own title names it.
        title.isHidden = mode == .change
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

        let searchLabel = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
        searchLabel.text = "Looking for your hub on this Wi-Fi network…"
        let spinner = KitSpinner()
        spinner.isAccessibilityElement = false
        searching.spacing = Space.space2
        searching.alignment = .center
        searching.addArrangedSubview(spinner)
        searching.addArrangedSubview(searchLabel)
        searching.isHidden = true
        // Before a hub answers, the section carries the search instead of rows.
        found.addArrangedSubview(searching)

        noWifi.text = "Hubs are found automatically on the same Wi-Fi. Over Tailscale, enter your hub's Tailscale name."
        noWifi.isHidden = true
        column.addArrangedSubview(noWifi)

        let networkProblem = KitLabel(TypeScale.typeBody, ink: Palette.statusFailInk, lines: 0)
        networkProblem.text = "Local Network access is off. Allow it in Settings to find your hub."
        networkAccess.axis = .vertical
        networkAccess.spacing = Space.space2
        networkAccess.addArrangedSubview(networkProblem)
        networkAccess.addArrangedSubview(KitButton.make("Open Settings", variant: .outline, height: .lg, stretch: true) {
            UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!)
        })
        networkAccess.isHidden = true
        column.addArrangedSubview(networkAccess)
        NotificationCenter.default.addObserver(self, selector: #selector(sceneWillEnterForeground(_:)), name: UIScene.willEnterForegroundNotification, object: nil)

        connectButton = KitButton.make(mode == .reconnecting ? "Connect to this address" : "Connect", variant: .action, height: .lg, stretch: true) { [weak self] in
            self?.connect()
        }
        column.addArrangedSubview(connectButton)
        if mode == .change {
            column.addArrangedSubview(notificationsSection())
        }
        fieldChanged()

        scroll.alwaysBounceVertical = false
        scroll.keyboardDismissMode = .interactive
        scroll.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scroll)
        scroll.addSubview(column)
        let content = scroll.contentLayoutGuide
        let frame = scroll.frameLayoutGuide
        if mode == .change {
            // The system sheet under its navigation bar: the column stands in
            // the sheet's layout margins at its own height, and scrolls above the keyboard.
            NSLayoutConstraint.activate([
                scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                scroll.topAnchor.constraint(equalTo: view.topAnchor),
                scroll.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
                column.topAnchor.constraint(equalTo: content.topAnchor, constant: Space.space3),
                column.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -Space.space5),
                column.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
                column.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
            ])
            return
        }
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

    /// Where this device's notifications stand, as the section says it.
    private enum NotifyState: Equatable {
        /// H2: not set up. `entitled` false: no free week or Pro, so no Turn on.
        case off(entitled: Bool)
        /// H3: iOS refuses them.
        case denied
        /// H3b: the token, or the relay and the hub, on the way.
        case pending
        /// H3b: APNs refused this device.
        case failed
        /// H3c: Cawrier's or the hub's reason.
        case relay(String)
        /// H4.
        case on
    }

    private func notificationsSection() -> UIView {
        let head = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        head.text = PaywallCopy.Hub.title
        head.accessibilityTraits = .header
        notifySpinner.isAccessibilityElement = false
        let lineRow = UIStackView(arrangedSubviews: [notifySpinner, notifyLine])
        lineRow.spacing = Space.space2
        lineRow.alignment = .center
        notifyAction.axis = .vertical
        let label = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong)
        label.text = PaywallCopy.Hub.quiet
        let words = UIStackView(arrangedSubviews: [label, quietHint])
        words.axis = .vertical
        words.spacing = Space.space1
        quietSwitch.onTintColor = Palette.inkStrong
        quietSwitch.accessibilityLabel = PaywallCopy.Hub.quiet
        quietSwitch.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            PushRegistry.shared.setQuiet(quietSwitch.isOn)
        }, for: .valueChanged)
        quietRow.addArrangedSubview(words)
        quietRow.addArrangedSubview(quietSwitch)
        quietRow.alignment = .center
        quietRow.spacing = Space.space3
        let test = UIStackView(arrangedSubviews: [testLink, testProblem])
        test.axis = .vertical
        test.alignment = .leading

        let reminderLabel = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong)
        reminderLabel.text = PaywallCopy.Hub.reminder
        let reminderWords = UIStackView(arrangedSubviews: [reminderLabel, reminderHint])
        reminderWords.axis = .vertical
        reminderWords.spacing = Space.space1
        reminderSwitch.onTintColor = Palette.inkStrong
        reminderSwitch.accessibilityLabel = PaywallCopy.Hub.reminder
        reminderSwitch.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            PushRegistry.shared.setTrialReminder(reminderSwitch.isOn)
        }, for: .valueChanged)
        reminderRow.addArrangedSubview(reminderWords)
        reminderRow.addArrangedSubview(reminderSwitch)
        reminderRow.alignment = .center
        reminderRow.spacing = Space.space3

        let removeHint = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        removeHint.text = PaywallCopy.Hub.removeHint
        removeBlock.axis = .vertical
        removeBlock.alignment = .leading
        for view in [removeLink, removeHint, removeProblem] { removeBlock.addArrangedSubview(view) }

        notifications.axis = .vertical
        notifications.spacing = Space.space2
        for view in [head, lineRow, notifyReason, notifyAction, quietRow, reminderRow, test, removeBlock] { notifications.addArrangedSubview(view) }
        return notifications
    }

    private var notifyState: NotifyState {
        let push = PushRegistry.shared
        guard Pro.shared.access?.entitled == true else { return .off(entitled: false) }
        if push.authorization == .denied { return .denied }
        // H7 took this device off the relay: H2 until it is turned on again.
        if !push.allowed || push.removed { return .off(entitled: true) }
        if push.tokenFailed { return .failed }
        if push.token == nil { return .pending }
        switch push.relay {
        case .done: return .on
        case let .failed(reason): return .relay(reason)
        case .idle, .working: return .pending
        }
    }

    /// The hub's answer is what the switch shows; it moves only when the hub said so.
    private func refreshNotifications() {
        guard mode == .change else { return }
        let push = PushRegistry.shared
        let state = notifyState
        if state != drawnNotify {
            drawnNotify = state
            for view in notifyAction.arrangedSubviews { view.removeFromSuperview() }
            var line: String?
            var reason: String?
            var action: (String, () -> Void)?
            switch state {
            case let .off(entitled):
                line = PaywallCopy.Hub.off
                if entitled { action = (PaywallCopy.Hub.turnOn, { [weak self] in self?.turnOnNotifications() }) }
            case .denied:
                line = PaywallCopy.Hub.denied
                action = (PaywallCopy.Hub.openSettings, { UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!) })
            case .pending:
                line = PaywallCopy.Hub.registering
            case .failed:
                line = PaywallCopy.Hub.registerFailed
                action = (PaywallCopy.Hub.tryAgain, { PushRegistry.shared.retry() })
            case let .relay(said):
                line = PaywallCopy.Hub.relayFailed
                reason = said
                action = (PaywallCopy.Hub.tryAgain, { PushRegistry.shared.retry() })
            case .on:
                break
            }
            notifyLine.text = line
            notifyLine.superview?.isHidden = line == nil
            notifyLine.ink = state == .failed ? Palette.statusFailInk : Palette.inkMuted
            notifySpinner.isHidden = state != .pending
            notifyReason.text = reason
            notifyReason.isHidden = reason == nil
            if let action {
                notifyAction.addArrangedSubview(KitButton.make(action.0, variant: .outline, height: .lg, stretch: true, action: action.1))
            }
            notifyAction.isHidden = action == nil
            quietRow.isHidden = state != .on
            testLink.superview?.isHidden = state != .on
            removeBlock.isHidden = state != .on
        }
        // H5 shows while a free week is live and iOS allows notifications.
        var trialLive = false
        if case .trial = Pro.shared.access { trialLive = true }
        reminderRow.isHidden = !(trialLive && push.allowed)
        if reminderSwitch.isOn != push.trialReminder { reminderSwitch.setOn(push.trialReminder, animated: true) }
        reminderHint.text = push.trialReminder ? PaywallCopy.Hub.reminderOn : PaywallCopy.Hub.reminderOff
        removeLink.busy = push.removing
        removeProblem.text = push.removeProblem
        removeProblem.isHidden = push.removeProblem == nil
        if let quiet = push.quiet {
            quietSwitch.setOn(quiet, animated: true)
            quietHint.text = quiet ? PaywallCopy.Hub.quietOn : PaywallCopy.Hub.quietOff
        }
        quietSwitch.isEnabled = !push.quietSending
        testLink.busy = push.testSending
        testProblem.text = push.testProblem
        testProblem.isHidden = push.testProblem == nil
    }

    override func refreshContent() {
        refreshNotifications()
        // A hub that was never entered has no state to say.
        status.isHidden = hub.address == nil
        status.configure(hub: hub, ready: false)
        networkAccess.isHidden = !discovery.localNetworkDenied
        let noLocalPath = discovery.localNetworkAvailable == false
        noWifi.isHidden = !noLocalPath
        body.text = noLocalPath
            ? "The hub's Tailscale address, like http://<machine>.<tailnet>.ts.net:3456."
            : "The hub's address on your network, like http://192.168.3.100:3456."
        field.placeholder = noLocalPath ? "http://<machine>.<tailnet>.ts.net:3456" : "http://hub:3456"
        let hubs = discovery.found
        searching.isHidden = !discovery.browsing || !hubs.isEmpty
        found.isHidden = hubs.isEmpty && searching.isHidden
        guard hubs != shownFound else {
            return
        }
        shownFound = hubs
        for view in found.arrangedSubviews.dropFirst(2) {
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
    }

    @objc private func sceneWillEnterForeground(_ note: Notification) {
        guard let scene = note.object as? UIWindowScene, scene === viewIfLoaded?.window?.windowScene,
              discovery.localNetworkDenied else { return }
        discovery.stop()
        discovery.start()
    }

    #if DEBUG
    /// Simulator proof reads the laid-out views, including effective hidden
    /// state, rather than interpreting a screenshot or inventing model output.
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        guard ProcessInfo.processInfo.arguments.contains("--connect-evidence") else { return }
        func rows(_ node: UIView) -> [String] {
            guard !node.isHidden else { return [] }
            let text: String? = if let label = node as? UILabel { label.text }
                else if let field = node as? UITextField { field.placeholder }
                else if let button = node as? UIButton { button.configuration?.attributedTitle.map { String($0.characters) } }
                else if node is KitSpinner { "KitSpinner" }
                else { nil }
            let frame = node.convert(node.bounds, to: view)
            let row = text.map { "\($0) frame=\(frame)" }
            return (row.map { [$0] } ?? []) + node.subviews.flatMap(rows)
        }
        let evidence = rows(view).joined(separator: " | ")
        if evidence != lastEvidence {
            lastEvidence = evidence
            Logger(subsystem: "dev.cawco.app", category: "ConnectEvidence").notice("\(evidence, privacy: .public)")
        }
    }
    #endif

    private func fieldChanged() {
        connectButton.isEnabled = !(field.text ?? "").trimmingCharacters(in: .whitespaces).isEmpty
    }

    func textFieldShouldReturn(_: UITextField) -> Bool {
        connect()
        return true
    }

    /// A number in 100.64.0.0/10, the range Tailscale hands out.
    private static func isTailscaleNumber(_ host: String?) -> Bool {
        let parts = (host ?? "").split(separator: ".", omittingEmptySubsequences: false).compactMap { Int($0) }
        return parts.count == 4 && (host ?? "").split(separator: ".").count == 4 && parts[0] == 100 && (64 ... 127).contains(parts[1])
    }

    private func connect() {
        guard let address = HubConnection.address(from: field.text ?? "") else {
            problem.text = "That isn't an address the app can reach. Enter it as http://host:port."
            problem.isHidden = false
            return
        }
        if Self.isTailscaleNumber(address.host) {
            // Plain HTTP is allowed to the .ts.net name, never to the number.
            problem.text = "A Tailscale machine is reached by its name, which ends in .ts.net, like http://<machine>.<tailnet>.ts.net:3456."
            problem.isHidden = false
            return
        }
        problem.isHidden = true
        view.endEditing(true)
        hub.connect(to: address)
        done()
    }
}
