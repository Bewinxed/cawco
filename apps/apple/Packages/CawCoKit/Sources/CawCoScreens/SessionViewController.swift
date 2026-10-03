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
    private var approve: UIBarButtonItem!
    private var deny: UIBarButtonItem!
    private var back: UIBarButtonItem!
    private var windowAction: UIWindowScene.ActivationAction!
    private var barMode: String?
    private var entry: UIStackView!
    private var entryLeading: NSLayoutConstraint!
    private var entryTrailing: NSLayoutConstraint!
    private var entryBottom: NSLayoutConstraint!
    private var sent: String?
    private var opened = true
    var onClose: () -> Void = {}
    var onReturnToFleet: () -> Void = {}

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
        back = UIBarButtonItem(title: "Fleet", image: UIImage(systemName: "chevron.backward"), primaryAction: UIAction { [weak self] _ in self?.onReturnToFleet() })
        approve = UIBarButtonItem(title: "Approve", image: Glyph.tick.image, primaryAction: UIAction { [weak self] _ in self?.answer(.allow) })
        deny = UIBarButtonItem(title: "Deny", image: Glyph.close.image, primaryAction: UIAction { [weak self] _ in self?.answer(.deny) })
        NavigationItems.keepVisible([approve, deny])
        let activity = Self.activity(sessionId)
        windowAction = UIWindowScene.ActivationAction { _ in UIWindowScene.ActivationConfiguration(userActivity: activity) }
        windowAction.title = "Open in new window"
        windowAction.image = UIImage(systemName: "rectangle.badge.plus")
        configureBar()

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
        entry = UIStackView(arrangedSubviews: [composer, send])
        entry.axis = .horizontal; entry.spacing = Space.space2; entry.alignment = .bottom
        entry.translatesAutoresizingMaskIntoConstraints = false
        send.setContentHuggingPriority(.required, for: .horizontal)
        view.addSubview(head); view.addSubview(transcriptView); view.addSubview(entry)
        let material = MaterialPanelView()
        if material.hasGlass { composer.backgroundColor = .clear }
        material.translatesAutoresizingMaskIntoConstraints = false
        view.insertSubview(material, belowSubview: entry)
        NSLayoutConstraint.activate([
            material.leadingAnchor.constraint(equalTo: entry.leadingAnchor),
            material.trailingAnchor.constraint(equalTo: entry.trailingAnchor),
            material.topAnchor.constraint(equalTo: entry.topAnchor),
            material.bottomAnchor.constraint(equalTo: entry.bottomAnchor),
        ])
        head.addInteraction(UIDragInteraction(delegate: self))
        send.isPointerInteractionEnabled = true
        let safe = view.safeAreaLayoutGuide
        entryLeading = entry.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: Space.space5)
        entryTrailing = entry.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -Space.space5)
        entryBottom = entry.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor, constant: -Space.space3)
        NSLayoutConstraint.activate([
            head.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: Space.space5),
            head.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -Space.space5),
            head.topAnchor.constraint(equalTo: safe.topAnchor, constant: Space.space3),
            transcriptView.topAnchor.constraint(equalTo: head.bottomAnchor, constant: Space.space2),
            transcriptView.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            transcriptView.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            transcriptView.bottomAnchor.constraint(equalTo: entry.topAnchor, constant: -Space.space3),
            entryLeading, entryTrailing, entryBottom,
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

    var restorationValues: [String: Any] {
        var values: [String: Any] = ["draft": composer.text ?? ""]
        if let position = try? JSONEncoder().encode(transcriptView.restorationPosition) { values["transcriptPosition"] = position }
        return values
    }

    func restoreValues(_ values: [AnyHashable: Any]) {
        if let draft = values["draft"] as? String { composer.text = draft }
        if let data = values["transcriptPosition"] as? Data,
           let position = try? JSONDecoder().decode(TranscriptPosition.self, from: data) {
            transcriptView.restorePosition(position)
        }
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
        configureBar()
        if let id = sent, let command = hub.ledger.commands[id] {
            notice.text = command.reason ?? command.stage.rawValue.capitalized
        } else { notice.text = transcript.error ?? (transcript.loading ? "Reading transcript…" : transcript.blocks.isEmpty ? "This session hasn't said anything yet." : "") }
        notice.isHidden = notice.text?.isEmpty != false
        transcriptView.configure(transcript)
        toolbarItems?.first?.isEnabled = transcript.cursor != nil && !transcript.loadingOlder
    }

    func focusComposer() { composer.becomeFirstResponder() }
    var canControl: Bool { hub.fleet.byId[sessionId]?.isLive == true && hub.state == .connected }

    private var pendingAsk: ParkedAsk? { hub.needs.parked[sessionId]?.first { !$0.isQuestion } }
    var answerTarget: (ask: ParkedAsk, machineId: String)? {
        guard hub.state == .connected, let ask = pendingAsk, let row = hub.fleet.byId[sessionId] else { return nil }
        let sent = hub.needs.answerSent(for: ask)
        return sent == nil || sent?.stage == .failed ? (ask, row.machineId) : nil
    }
    private func answer(_ answer: NeedsYouStore.Answer) {
        guard let target = answerTarget else { return }
        hub.needs.answer(target.ask, machineId: target.machineId, answer)
    }
    private func configureBar() {
        approve.isEnabled = answerTarget != nil
        deny.isEnabled = answerTarget != nil
        let mode = pendingAsk?.requestId ?? "session"
        guard mode != barMode else { return }
        barMode = mode
        NavigationItems.configure(navigationItem, leading: [back],
            prominent: pendingAsk == nil ? [steer] : [approve],
            trailing: pendingAsk == nil ? [stop] : [deny, steer, stop],
            overflow: [windowAction])
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        guard entryLeading != nil else { return }
        var leading = Space.space5
        var trailing = -Space.space5
        var bottom = -Space.space3
        if #available(iOS 27.1, macCatalyst 27.1, *) {
            let safe = view.bounds.inset(by: view.safeAreaInsets)
            let normal = CGRect(x: safe.minX + Space.space5,
                y: view.keyboardLayoutGuide.layoutFrame.minY - Space.space3 - entry.bounds.height,
                width: max(0, safe.width - Space.space5 * 2), height: entry.bounds.height)
            // Test the undisplaced pose, not the previous layout's displaced
            // frame; otherwise avoidance would toggle on and off every pass.
            for region in view.reservedRegions(kind: .division) where region.isActive && normal.intersects(region.frame) {
                let fold = region.frame // Includes the system's interactive-content margins.
                if fold.height > fold.width {
                    let before = fold.minX - safe.minX
                    let after = safe.maxX - fold.maxX
                    if after >= before { leading = max(leading, fold.maxX - safe.minX + Space.space3) }
                    else { trailing = min(trailing, fold.minX - safe.maxX - Space.space3) }
                } else {
                    bottom = min(bottom, fold.minY - view.keyboardLayoutGuide.layoutFrame.minY - Space.space3)
                }
            }
        }
        if entryLeading.constant != leading || entryTrailing.constant != trailing || entryBottom.constant != bottom {
            entryLeading.constant = leading; entryTrailing.constant = trailing; entryBottom.constant = bottom
        }
    }

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
