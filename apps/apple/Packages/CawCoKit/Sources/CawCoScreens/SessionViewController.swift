import CawCoCore
import CawCoDesign
import CawCoTranscript
import UIKit

final class SessionViewController: ObservedViewController, UIDragInteractionDelegate {
    let sessionId: String
    private let hub: HubConnection
    private let transcript: SessionTranscript
    private let transcriptView = TranscriptView()
    private let connection = StatusLineView()
    private let state = StatusGlyph(.unknown)
    private let place = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private let notice = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private let composer = UITextView(usingTextLayoutManager: true)
    private var send: UIButton!
    private var stop: UIBarButtonItem!
    private var steer: UIBarButtonItem!
    private var sent: String?
    private var opened = true
    var onClose: () -> Void = {}

    init(hub: HubConnection, id: String) {
        self.hub = hub
        sessionId = id
        transcript = hub.sessions.open(id)
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("SessionViewController is built in code") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfacePage
        navigationItem.largeTitleDisplayMode = .never
        stop = UIBarButtonItem(title: "Stop", image: UIImage(systemName: "stop.fill"), primaryAction: UIAction { [weak self] _ in self?.stopTurn() })
        steer = UIBarButtonItem(title: "Steer", image: UIImage(systemName: "paperplane"), primaryAction: UIAction { [weak self] _ in self?.focusComposer() })
        navigationItem.trailingItemGroups = [UIBarButtonItemGroup(barButtonItems: [steer, stop], representativeItem: nil)]
        if #available(iOS 27.1, macCatalyst 27.1, *) {
            navigationItem.pinnedTrailingGroup = UIBarButtonItemGroup(barButtonItems: [steer], representativeItem: nil)
            navigationItem.trailingItemGroups = [UIBarButtonItemGroup(barButtonItems: [stop], representativeItem: nil)]
        }
        let activity = Self.activity(sessionId)
        let newWindow = UIWindowScene.ActivationAction { _ in UIWindowScene.ActivationConfiguration(userActivity: activity) }
        newWindow.title = "Open in new window"
        newWindow.image = UIImage(systemName: "rectangle.badge.plus")
        let windows = UIBarButtonItem(title: "Window", image: UIImage(systemName: "ellipsis"), menu: UIMenu(children: [newWindow]))
        if #available(iOS 27.1, macCatalyst 27.1, *) {
            navigationItem.trailingItemGroups = [UIBarButtonItemGroup(barButtonItems: [stop, windows], representativeItem: nil)]
        } else {
            navigationItem.trailingItemGroups = [UIBarButtonItemGroup(barButtonItems: [steer, stop, windows], representativeItem: nil)]
        }

        let head = UIStackView(arrangedSubviews: [connection, state, place, notice])
        head.axis = .vertical; head.spacing = Space.space2
        head.translatesAutoresizingMaskIntoConstraints = false
        transcriptView.translatesAutoresizingMaskIntoConstraints = false
        composer.font = TypeScale.typeBody.font
        composer.adjustsFontForContentSizeCategory = true
        composer.textColor = Palette.inkStrong
        composer.backgroundColor = Palette.surfaceRaised
        composer.layer.cornerRadius = Radius.radiusMd
        composer.accessibilityLabel = "Steer message"
        composer.accessibilityIdentifier = "steer-message"
        composer.textContainerInset = .init(top: Space.space3, left: Space.space3, bottom: Space.space3, right: Space.space3)
        composer.heightAnchor.constraint(equalToConstant: Space.space8 * 2).isActive = true
        send = KitButton.make("Send", variant: .action, height: .lg) { [weak self] in self?.sendMessage() }
        send.accessibilityIdentifier = "send-steer"
        let entry = UIStackView(arrangedSubviews: [composer, send])
        entry.axis = .horizontal; entry.spacing = Space.space2; entry.alignment = .bottom
        entry.translatesAutoresizingMaskIntoConstraints = false
        send.setContentHuggingPriority(.required, for: .horizontal)
        view.addSubview(head); view.addSubview(transcriptView); view.addSubview(entry)
        head.addInteraction(UIDragInteraction(delegate: self))
        send.isPointerInteractionEnabled = true
        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            head.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: Space.space5),
            head.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -Space.space5),
            head.topAnchor.constraint(equalTo: safe.topAnchor, constant: Space.space3),
            transcriptView.topAnchor.constraint(equalTo: head.bottomAnchor, constant: Space.space2),
            transcriptView.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            transcriptView.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            transcriptView.bottomAnchor.constraint(equalTo: entry.topAnchor, constant: -Space.space3),
            entry.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: Space.space5),
            entry.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -Space.space5),
            entry.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor, constant: -Space.space3),
        ])
        let older = UIBarButtonItem(title: "Earlier", image: UIImage(systemName: "clock.arrow.circlepath"), primaryAction: UIAction { [weak self] _ in
            guard let self else { return }; hub.sessions.older(sessionId)
        })
        let latest = UIBarButtonItem(title: "Latest", image: UIImage(systemName: "arrow.down"), primaryAction: UIAction { [weak self] _ in self?.transcriptView.latest() })
        toolbarItems = [older, UIBarButtonItem(systemItem: .flexibleSpace), latest]
        navigationController?.setToolbarHidden(false, animated: false)
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        navigationController?.setToolbarHidden(false, animated: animated)
        requestRefresh()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isMovingFromParent || navigationController?.isBeingDismissed == true { close() }
    }

    func close() {
        guard opened else { return }; opened = false
        hub.sessions.close(sessionId)
        onClose()
    }

    override func refreshContent() {
        let row = hub.fleet.byId[sessionId]
        navigationItem.title = row.map(hub.fleet.title) ?? "Session"
        connection.configure(hub: hub, ready: !transcript.loading, spend: "")
        place.text = row.map { hub.fleet.placeOf($0.machineId, $0.cwd) + " · " + ($0.harness ?? "claude") } ?? ""
        let status: SessionStatus
        if hub.state != .connected || row?.isStale == true { status = .unknown }
        else if hub.needs.blocked(sessionId) { status = .needsYou }
        else if row?.isFailed == true { status = .error }
        else if row?.status == .starting { status = .starting }
        else if row?.status == .stopped { status = .stopped }
        else { status = transcript.tail?.busy == true ? .working : .idle }
        state.configure(status)
        stop.isEnabled = row?.isLive == true && hub.state == .connected
        steer.isEnabled = stop.isEnabled
        send.isEnabled = steer.isEnabled
        if let id = sent, let command = hub.ledger.commands[id] {
            notice.text = command.reason ?? command.stage.rawValue.capitalized
        } else { notice.text = transcript.error ?? (transcript.loading ? "Reading transcript…" : transcript.blocks.isEmpty ? "This session hasn't said anything yet." : "") }
        notice.isHidden = notice.text?.isEmpty != false
        transcriptView.configure(transcript)
        toolbarItems?.first?.isEnabled = transcript.cursor != nil && !transcript.loadingOlder
    }

    func focusComposer() { composer.becomeFirstResponder() }
    var canControl: Bool { hub.fleet.byId[sessionId]?.isLive == true && hub.state == .connected }

    func stopTurn() {
        guard let row = hub.fleet.byId[sessionId], row.isLive, hub.state == .connected else { return }
        sent = hub.sessions.stop(row)
        requestRefresh()
    }

    private func sendMessage() {
        guard let row = hub.fleet.byId[sessionId], row.isLive else { return }
        let text = composer.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        sent = hub.sessions.steer(row, text: text)
        if hub.ledger.commands[sent!]?.undelivered != true { composer.text = "" }
        composer.resignFirstResponder()
        requestRefresh()
    }

    override var keyCommands: [UIKeyCommand]? {
        [UIKeyCommand(title: "Stop", action: #selector(stopKey), input: ".", modifierFlags: .command),
         UIKeyCommand(title: "Steer", action: #selector(steerKey), input: "l", modifierFlags: .command)]
    }
    @objc private func stopKey() { stopTurn() }
    @objc private func steerKey() { focusComposer() }

    static func activity(_ id: String) -> NSUserActivity {
        let activity = NSUserActivity(activityType: "dev.cawco.session")
        activity.userInfo = ["sessionId": id]
        activity.targetContentIdentifier = id
        return activity
    }

    func dragInteraction(_ interaction: UIDragInteraction, itemsForBeginning session: UIDragSession) -> [UIDragItem] {
        [UIDragItem(itemProvider: NSItemProvider(object: Self.activity(sessionId)))]
    }
}
