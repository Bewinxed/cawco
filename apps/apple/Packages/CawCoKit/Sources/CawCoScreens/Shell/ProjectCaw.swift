import CawCoAPI
import CawCoCore
import CawCoDesign
import CawCoMascot
import Observation
import UIKit

/// A project's Caw, as one page holds him (project/caw-lead.svelte.ts): the
/// hub's view of the lead (on or off, harness, session, why he cannot
/// start), and what his face and the head's line say now, from live
/// sources only.
@MainActor
@Observable
final class ProjectCawLead {
    let projectId: String
    private let hub: HubConnection
    /// The hub's view, once read.
    var view: CawLeadView?
    /// The last read or change the hub refused, in its words.
    var refused: String?
    /// A switch or harness change is on its way to the hub.
    var moving = false

    init(hub: HubConnection, projectId: String) {
        self.hub = hub
        self.projectId = projectId
    }

    /// Reads his view; the page calls it on arrival, after a reconnect, and as a turn begins.
    func read() async {
        do {
            view = try await hub.threads.caw(projectId)
            refused = nil
        } catch {
            refused = error.localizedDescription
        }
    }

    /// Turns him on or off, or moves him to another harness or model (nil: the harness's default).
    func configure(on: Bool? = nil, harness: String? = nil, model: String?? = nil, initiated: String? = nil) async {
        moving = true
        do {
            view = try await hub.threads.configureCaw(projectId, on: on, harness: harness, model: model, initiated: initiated)
            refused = nil
        } catch {
            refused = error.localizedDescription
        }
        moving = false
    }

    /// What he has asked in his threads, oldest first: his questions and
    /// project settings on his row, and memory proposals he asked about
    /// (parked under their own id, tagged to one of this project's threads).
    var asks: [ParkedAsk] {
        let lead = view?.leadInstanceId
        let threads = Set(hub.threads.of(projectId).map(\.id))
        return hub.needs.parked.values.joined().filter { ask in
            guard let threadId = ask.threadId else { return false }
            return ask.instanceId == lead || threads.contains(threadId)
        }.sorted { ($0.raisedAt ?? .infinity) < ($1.raisedAt ?? .infinity) }
    }

    /// What his face plays (caw-lead.svelte.ts `status`).
    var status: CawStatus {
        if hub.state == .unreachable { return .reconnecting }
        guard let view else { return .loading }
        if !asks.isEmpty { return .needsYou }
        if let lead = view.leadInstanceId, hub.fleet.activityPulse(lead)?.activity == .working { return .working }
        if !view.on { return .sleeping }
        return .ready
    }

    /// What the head's line says while he has something to say; nil gives the line back to the place.
    var words: (text: String, threadId: String?)? {
        switch status {
        case .reconnecting:
            return ("Reconnecting", nil)
        case .needsYou:
            guard let first = asks.first else { return nil }
            let text = first.questions.first?.question ?? (first.summary.isEmpty ? "Caw asks you something" : first.summary)
            return (text, first.threadId)
        case .working:
            let tool = view?.leadInstanceId.flatMap { hub.fleet.pulse($0)?.currentTool }
            return (tool.map { [$0.name, $0.glance ?? ""].filter { !$0.isEmpty }.joined(separator: " · ") } ?? "Working…", nil)
        default:
            return nil
        }
    }

    /// The panel's first line: what Caw is, in a sentence (`sentence`).
    var sentence: String {
        switch status {
        case .sleeping:
            let finishing = (view?.running ?? []).filter { $0.kind != .turn }.count
            return finishing > 0 ? "Off · \(finishing) of his still finishing" : "Off · answers when you write"
        case .working:
            return "Awake · \(view?.answering ?? words?.text ?? "working")"
        case .needsYou:
            return "Awake · waiting on you"
        case .loading:
            return "Reading the board…"
        case .reconnecting:
            return "Reconnecting to the hub"
        default:
            return "Awake · resting"
        }
    }
}

/// Caw at 48pt on the project head's leading edge (CawSeat.svelte): what he
/// is doing, and his panel on a tap.
final class ProjectCawSeat: UIControl {
    private let caw = CawView(status: .loading)

    override init(frame: CGRect) {
        super.init(frame: frame)
        translatesAutoresizingMaskIntoConstraints = false
        caw.isUserInteractionEnabled = false
        hold(caw)
        NSLayoutConstraint.activate([widthAnchor.constraint(equalToConstant: 48), heightAnchor.constraint(equalToConstant: 48)])
        isAccessibilityElement = true
        accessibilityTraits = .button
        accessibilityLabel = "Caw"
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    func configure(_ status: CawStatus, sentence: String) {
        if caw.status != status { caw.status = status }
        accessibilityValue = sentence
    }
}

/// Caw's panel (project/CawPanel.svelte): who he is and what he is doing in
/// one sentence, the lead switch, the harness he runs on and his model, and
/// the way to talk to him, on or off. Off, he acts only when you write to
/// him (WORDS.md, Caw on and off).
final class ProjectCawPanel: KitPopoverController {
    private let lead: ProjectCawLead
    private let hub: HubConnection
    private let projectName: String
    private let openThread: (String) -> Void
    private let stack = UIStackView()
    private static let inset = 12.0

    private let face = UIView()
    private var faceStatus: CawStatus?
    private let sentence = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
    private let toggle = UISwitch()
    private let turnLine = UIStackView()
    private let turnWords = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private let offTray = UIStackView()
    private let offWords = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private var stopAll: UIButton!
    private let refusedLine = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)
    private let harness = UIButton(configuration: .bordered())
    private let model = UIButton(configuration: .bordered())
    private var talk: UIButton!
    private var last: UIButton!
    private let field = KitField(placeholder: "Message the project…")
    private var send: UIButton!
    private let talkRow = UIStackView()
    private let unreachable = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    /// What the off control asks about: his own turn alone, or what he started.
    private var asking: Asking?
    private var talking = false
    private var cutting = false

    private enum Asking {
        case turn(Components.Schemas.CawRunning)
        case running([Components.Schemas.CawRunning])
    }

    init(lead: ProjectCawLead, hub: HubConnection, projectName: String, openThread: @escaping (String) -> Void) {
        self.lead = lead
        self.hub = hub
        self.projectName = projectName
        self.openThread = openThread
        super.init()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    override func viewDidLoad() {
        super.viewDidLoad()
        stack.axis = .vertical
        stack.spacing = Space.space2
        stack.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: card.topAnchor, constant: Self.inset),
            stack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: Self.inset + 4),
            stack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -Self.inset - 4),
        ])
        let head = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        head.role = TypeScale.typeLabel.with(weight: TypeScale.weightStrong)
        head.text = "Caw · lead of \(projectName)"
        stack.addArrangedSubview(head)

        face.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([face.widthAnchor.constraint(equalToConstant: 18), face.heightAnchor.constraint(equalToConstant: 18)])
        stack.addArrangedSubview(row([face, sentence]))

        toggle.onTintColor = Palette.brandSolid
        toggle.addAction(UIAction { [weak self] _ in self?.flip() }, for: .valueChanged)
        toggle.accessibilityLabel = "Caw lead"
        let switchWord = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        switchWord.text = "Caw lead"
        switchWord.isAccessibilityElement = false
        stack.addArrangedSubview(row([toggle, switchWord]))

        // His own turn, asked about under the switch: its words, then the two ways.
        turnLine.axis = .vertical
        turnLine.spacing = Space.space2
        let finish = KitButton.make("Let him finish", variant: .outline, height: .sm) { [weak self] in self?.offWithTurn("finish") }
        let stopNow = KitButton.make("Stop now", variant: .outline, height: .sm) { [weak self] in self?.offWithTurn("stop") }
        turnLine.addArrangedSubview(turnWords)
        turnLine.addArrangedSubview(row([finish, stopNow]))
        turnLine.isHidden = true
        stack.addArrangedSubview(turnLine)

        // What he started still runs (CawOffTray): named, then finish or stop.
        offTray.axis = .vertical
        offTray.spacing = Space.space2
        let letFinish = KitButton.make("Let them finish", variant: .outline, height: .sm) { [weak self] in self?.offWithRunning("finish") }
        stopAll = KitButton.make("Stop and turn Caw off", variant: .outline, height: .sm) { [weak self] in self?.offWithRunning("stop") }
        offTray.addArrangedSubview(offWords)
        offTray.addArrangedSubview(row([letFinish, stopAll]))
        offTray.isHidden = true
        stack.addArrangedSubview(offTray)

        refusedLine.isHidden = true
        stack.addArrangedSubview(refusedLine)

        let runsOn = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        runsOn.text = "Runs on"
        for button in [harness, model] {
            button.showsMenuAsPrimaryAction = true
            button.configuration?.buttonSize = .small
            button.configuration?.baseForegroundColor = Palette.inkStrong
        }
        harness.accessibilityLabel = "Harness"
        model.accessibilityLabel = "Model"
        stack.addArrangedSubview(row([runsOn, harness, model]))

        talk = KitButton.make("Message Caw", variant: .outline, height: .sm) { [weak self] in
            self?.talking = true
            self?.render()
            self?.field.becomeFirstResponder()
        }
        last = KitButton.make("Open last thread", variant: .ghost, height: .sm) { [weak self] in
            guard let self, let thread = hub.threads.of(lead.projectId).first else { return }
            dismiss(animated: true)
            openThread(thread.id)
        }
        stack.addArrangedSubview(row([talk, UIView(), last]))

        // His field (CawField): your words start a thread, Caw woken with them.
        field.accessibilityLabel = "Message Caw"
        field.returnKeyType = .send
        field.addAction(UIAction { [weak self] _ in self?.startThread() }, for: .editingDidEndOnExit)
        send = KitButton.make("Send", variant: .action, height: .sm) { [weak self] in self?.startThread() }
        talkRow.addArrangedSubview(field)
        talkRow.addArrangedSubview(send)
        talkRow.spacing = Space.space2
        talkRow.alignment = .center
        talkRow.isHidden = true
        stack.addArrangedSubview(talkRow)

        unreachable.text = "The hub is not answering; what shows was read before."
        stack.addArrangedSubview(unreachable)

        Task { [lead] in
            await lead.read()
        }
        render()
    }

    private func row(_ views: [UIView]) -> UIStackView {
        let line = UIStackView(arrangedSubviews: views)
        line.spacing = Space.space2
        line.alignment = .center
        line.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHSm).isActive = true
        return line
    }

    /// Draws what the lead says now, and again whenever it changes.
    private func render() {
        withObservationTracking {
            draw()
        } onChange: { [weak self] in
            Task { @MainActor in self?.render() }
        }
        fit()
    }

    private func draw() {
        let view = lead.view
        let status = lead.status
        if faceStatus != status {
            faceStatus = status
            face.subviews.forEach { $0.removeFromSuperview() }
            face.hold(CawMark(status: status, side: 18))
        }
        sentence.text = lead.sentence
        toggle.isOn = view?.on ?? false
        toggle.isEnabled = !lead.moving && view != nil && !cutting
        refusedLine.text = lead.refused
        refusedLine.isHidden = lead.refused == nil
        let current = view?.harness.rawValue ?? ""
        harness.configuration?.attributedTitle = AttributedString(
            lead.moving ? "Moving…" : view.map { _ in ModelCatalog.harnessName(current) } ?? "Reading…",
            attributes: TypeScale.typeLabel.container(color: Palette.inkStrong))
        harness.isEnabled = !lead.moving && view != nil
        harness.menu = UIMenu(options: .singleSelection, children: ["claude", "opencode"].map { value in
            UIAction(title: ModelCatalog.harnessName(value), state: value == current ? .on : .off) { [weak self] _ in
                guard value != current else { return }
                Task { await self?.lead.configure(harness: value) }
            }
        })
        model.isHidden = view == nil
        let chosen = view?.model
        model.configuration?.attributedTitle = AttributedString(chosen.map { ModelCatalog.modelName($0).name } ?? "Default",
                                                                attributes: TypeScale.typeLabel.container(color: Palette.inkStrong))
        let models = ModelCatalog.models(hub.fleet, harness: current, machineIds: [])
        model.menu = UIMenu(options: .singleSelection, children: [UIAction(title: "Default", state: chosen == nil ? .on : .off) { [weak self] _ in
            Task { await self?.lead.configure(model: .some(nil)) }
        }] + models.map { row in
            UIAction(title: ModelCatalog.modelName(row.value, displayName: row.displayName).name, state: row.value == chosen ? .on : .off) { [weak self] _ in
                Task { await self?.lead.configure(model: .some(row.value)) }
            }
        })
        switch asking {
        case let .turn(turn)?:
            turnWords.text = "\(turn.title ?? "Answering an event"). Off, it can finish or stop now."
            turnLine.isHidden = false
            offTray.isHidden = true
        case let .running(running)?:
            let count = running.count
            offWords.text = "He started \(count) \(count == 1 ? "thing that is" : "things that are") still running. Let \(count == 1 ? "it" : "them") finish, or stop \(count == 1 ? "it" : "them") now."
                + "\n" + running.map { "· \($0.title ?? $0.id)" }.joined(separator: "\n")
            stopAll.configuration?.title = "Stop \(count) and turn Caw off"
            offTray.isHidden = false
            turnLine.isHidden = true
        case nil:
            turnLine.isHidden = true
            offTray.isHidden = true
        }
        let problem = view?.problem != nil
        let lastThread = hub.threads.of(lead.projectId).first
        talk.isHidden = problem || talking
        last.isHidden = lastThread == nil
        talk.superview?.isHidden = talk.isHidden && last.isHidden
        talkRow.isHidden = !talking
        unreachable.isHidden = hub.state != .unreachable
    }

    /// The card's size for what it holds now.
    private func fit() {
        let width = min(352, (view.window?.bounds.width ?? UIScreen.main.bounds.width) - 32)
        let height = stack.systemLayoutSizeFitting(CGSize(width: width - (Self.inset + 4) * 2, height: 0), withHorizontalFittingPriority: .required,
                                                   verticalFittingPriority: .fittingSizeLevel).height + Self.inset * 2
        preferredContentSize = CGSize(width: width, height: height)
    }

    /// Turning him off (The Stay In Context Rule): nothing he started runs,
    /// and it just flips; his own turn alone asks one line; what he started
    /// still running unfolds a tray under the switch that names each one.
    private func flip() {
        let next = toggle.isOn
        if asking != nil {
            // The switch again while the line asks: nothing changes.
            asking = nil
            render()
            return
        }
        Task { [weak self, lead] in
            if next {
                await lead.configure(on: true)
                self?.render()
                return
            }
            await lead.read()
            let running = lead.view?.running ?? []
            if running.isEmpty {
                await lead.configure(on: false)
            } else if running.allSatisfy({ $0.kind == .turn }) {
                self?.asking = .turn(running[0])
            } else {
                self?.asking = .running(running)
            }
            self?.render()
        }
    }

    private func offWithTurn(_ initiated: String) {
        guard case let .turn(turn)? = asking else { return }
        cutting = initiated == "stop"
        render()
        var unhear: (() -> Void)?
        if cutting {
            // The line stays until the hub says his turn stopped.
            unhear = hub.onProjectStop { [weak self] frame in
                guard frame.instanceId == turn.id else { return }
                unhear?()
                self?.cutting = false
                self?.asking = nil
                self?.render()
            }
        }
        Task { [weak self, lead] in
            await lead.configure(on: false, initiated: initiated)
            if initiated == "finish" || lead.refused != nil {
                unhear?()
                self?.cutting = false
                self?.asking = nil
            }
            self?.render()
        }
    }

    private func offWithRunning(_ initiated: String) {
        guard case .running? = asking else { return }
        Task { [weak self, lead] in
            await lead.configure(on: false, initiated: initiated)
            if lead.refused == nil { self?.asking = nil }
            self?.render()
        }
    }

    /// "Message Caw": a new thread with your words; the field closes once the hub has it.
    private func startThread() {
        let words = (field.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !words.isEmpty, hub.state == .connected else { return }
        send.isEnabled = false
        Task { [weak self, hub, lead] in
            do {
                try await hub.threads.say(projectId: lead.projectId, threadId: nil, body: words, id: UUID().uuidString.lowercased())
                self?.field.text = ""
                self?.talking = false
            } catch {
                lead.refused = error.localizedDescription
            }
            self?.send.isEnabled = true
            self?.render()
        }
    }
}
