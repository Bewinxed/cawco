import CawCoAPI
import CawCoCore
import CawCoDesign
import CawCoMascot
import Observation
import UIKit

/// A project's Caw, as one page holds him (project/caw-lead.svelte.ts): the
/// hub's view of its conversation (on or off, harness, session, why one
/// cannot start), the conversation the project shows (its newest session a
/// person or the project started), and what his face and the head's line
/// say now, from live sources only.
@MainActor
@Observable
final class ProjectCawLead {
    let projectId: String
    private let hub: HubConnection
    /// The hub's view, once read.
    var view: ConversationView?
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
            view = try await hub.caw.caw(projectId)
            refused = nil
        } catch {
            refused = error.localizedDescription
        }
    }

    /// Turns him on or off, or moves him to another harness or model (nil: the harness's default).
    /// `stopping`: turning him off, the ids of what he started that stop now; the rest finish.
    func configure(on: Bool? = nil, harness: String? = nil, model: String?? = nil, stopping: [String]? = nil) async {
        moving = true
        do {
            view = try await hub.caw.configureCaw(projectId, on: on, harness: harness, model: model, stopping: stopping)
            refused = nil
        } catch {
            refused = error.localizedDescription
        }
        moving = false
    }

    /// The conversation the project shows: its newest session a person or
    /// the project started, at the top of its tree; nil for none.
    var conversationId: String? {
        hub.fleet.rows
            .filter { $0.projectId == projectId && $0.parentInstanceId == nil && ($0.origin == .person || $0.origin == .project) }
            .max { $0.createdMs < $1.createdMs }?.id
    }

    /// What the conversation has asked, oldest first: its parked asks.
    var asks: [ParkedAsk] {
        guard let id = conversationId else { return [] }
        return (hub.needs.parked[id] ?? []).sorted { ($0.raisedAt ?? .infinity) < ($1.raisedAt ?? .infinity) }
    }

    /// What his face plays (caw-lead.svelte.ts `status`).
    var status: CawStatus {
        if hub.state == .unreachable { return .reconnecting }
        guard let view else { return .loading }
        if !asks.isEmpty { return .needsYou }
        if let id = conversationId, hub.fleet.activityPulse(id)?.activity == .working { return .working }
        if !view.on { return .sleeping }
        return .ready
    }

    /// What the head's line says while he has something to say; nil gives the line back to the place.
    /// `opens`: the line is his ask, a way to the conversation that holds it.
    var words: (text: String, opens: String?)? {
        switch status {
        case .reconnecting:
            return ("Reconnecting", nil)
        case .needsYou:
            guard let first = asks.first else { return nil }
            let text = first.questions.first?.question ?? (first.summary.isEmpty ? "Caw asks you something" : first.summary)
            return (text, first.paneId)
        case .working:
            let tool = conversationId.flatMap { hub.fleet.pulse($0)?.currentTool }
            return (tool.map { [$0.name, $0.glance ?? ""].filter { !$0.isEmpty }.joined(separator: " · ") } ?? "Working…", nil)
        default:
            return nil
        }
    }

    /// The panel's first line: what Caw is, in a sentence (`sentence`).
    var sentence: String {
        switch status {
        case .sleeping:
            let finishing = view?.running.count ?? 0
            return finishing > 0 ? Words.ProjectConversation.Status.offFinishing(count: finishing) : Words.ProjectConversation.Status.off
        case .working:
            return words?.text ?? "Working…"
        case .needsYou:
            return Words.ProjectConversation.Status.waiting
        case .loading:
            return Words.ProjectConversation.Status.reading
        case .reconnecting:
            return Words.ProjectConversation.Status.reconnecting
        default:
            return Words.ProjectConversation.Status.ready
        }
    }
}

/// Caw at 48pt on the project head's leading edge, or standing at 80 over
/// an empty tab (CawSeat.svelte `size`): what he is doing, and his panel on a tap.
final class ProjectCawSeat: UIControl {
    private let caw = CawView(status: .loading)

    init(side: Double = 48) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        caw.isUserInteractionEnabled = false
        hold(caw)
        NSLayoutConstraint.activate([widthAnchor.constraint(equalToConstant: side), heightAnchor.constraint(equalToConstant: side)])
        isAccessibilityElement = true
        accessibilityTraits = .button
        accessibilityLabel = "Caw"
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    func configure(_ status: CawStatus, sentence: String) {
        if caw.status != status { caw.status = status }
        accessibilityValue = sentence
        hold()
    }

    /// He holds his still while working when the reader turned his loop off (CawSeat.svelte `still`).
    private func hold() {
        caw.still = caw.status == .working && !CawLoopPreference.on
    }

    private lazy var loopWatch: NSObjectProtocol = NotificationCenter.default.addObserver(forName: CawLoopPreference.changed, object: nil, queue: .main) { [weak self] _ in
        MainActor.assumeIsolated { self?.hold() }
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        _ = loopWatch
    }
}

/// Caw's panel (project/CawPanel.svelte): what he is doing in one sentence,
/// the switch for whether the project's events reach a conversation, the
/// harness and model its conversation runs on, and the project's
/// conversation: open it, or start a new one in the New Session form at the
/// project's checkout, a starter's words in it. Off, he acts only when you
/// write to him (Caw on and off).
final class ProjectCawPanel: KitPopoverController {
    private let lead: ProjectCawLead
    private let hub: HubConnection
    private let projectName: String
    private let openSession: (String) -> Void
    private let newConversation: (_ prompt: String?) -> Void
    private let stack = UIStackView()
    private static let inset = 12.0

    private let face = UIView()
    private var faceStatus: CawStatus?
    private let sentence = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
    private let toggle = UISwitch()
    private let offTray = UIStackView()
    private let offWords = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private var stopAll: UIButton!
    private let refusedLine = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)
    private let harness = UIButton(configuration: .bordered())
    private let model = UIButton(configuration: .bordered())
    private var newOne: UIButton!
    private var open: UIButton!
    private let unreachable = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    /// What the conversation started that still runs, while the off control asks about it.
    private var asking: [Components.Schemas.CawRunning]?

    init(lead: ProjectCawLead, hub: HubConnection, projectName: String, openSession: @escaping (String) -> Void,
         newConversation: @escaping (_ prompt: String?) -> Void) {
        self.lead = lead
        self.hub = hub
        self.projectName = projectName
        self.openSession = openSession
        self.newConversation = newConversation
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
        face.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([face.widthAnchor.constraint(equalToConstant: 18), face.heightAnchor.constraint(equalToConstant: 18)])
        stack.addArrangedSubview(row([face, sentence]))

        toggle.onTintColor = Palette.brandSolid
        toggle.addAction(UIAction { [weak self] _ in self?.flip() }, for: .valueChanged)
        toggle.accessibilityLabel = "Events reach a conversation"
        let switchWord = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        switchWord.text = "Events reach a conversation"
        switchWord.isAccessibilityElement = false
        stack.addArrangedSubview(row([toggle, switchWord]))

        // What he started still runs (CawOffTray): named, then finish or stop.
        offTray.axis = .vertical
        offTray.spacing = Space.space2
        let letFinish = KitButton.make("Let them finish", variant: .outline, height: .sm) { [weak self] in self?.offWithRunning(stopAll: false) }
        stopAll = KitButton.make("Stop and turn Caw off", variant: .outline, height: .sm) { [weak self] in self?.offWithRunning(stopAll: true) }
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
        // Set once and made as they open, from Caw as he stands then: a redraw that
        // set a new menu cancelled one a tap was opening.
        harness.menuOnOpen(options: .singleSelection) { [weak self] in
            guard let self else { return [] }
            let current = lead.view?.harness.rawValue ?? ""
            // Caw runs on every harness (core `HARNESSES`).
            return Components.Schemas.HarnessKind.allCases.map(\.rawValue).map { value in
                UIAction(title: ModelCatalog.harnessName(value), state: value == current ? .on : .off) { [weak self] _ in
                    guard value != current else { return }
                    Task { await self?.lead.configure(harness: value) }
                }
            }
        }
        model.menuOnOpen(options: .singleSelection) { [weak self] in
            guard let self else { return [] }
            let chosen = lead.view?.model
            let models = ModelCatalog.models(hub.fleet, harness: lead.view?.harness.rawValue ?? "", machineIds: [])
            return [UIAction(title: "Default", state: chosen == nil ? .on : .off) { [weak self] _ in
                Task { await self?.lead.configure(model: .some(nil)) }
            }] + models.map { row in
                UIAction(title: ModelCatalog.modelName(row.value, displayName: row.displayName).name, state: row.value == chosen ? .on : .off) { [weak self] _ in
                    Task { await self?.lead.configure(model: .some(row.value)) }
                }
            }
        }
        stack.addArrangedSubview(row([runsOn, harness, model]))

        // The project's conversation: a new one in the New Session form, and the one it shows.
        newOne = KitButton.make(Words.ProjectConversation.newConversation, variant: .outline, height: .sm) { [weak self] in
            guard let self else { return }
            dismiss(animated: true)
            newConversation(nil)
        }
        open = KitButton.make("Open conversation", variant: .ghost, height: .sm) { [weak self] in
            guard let self, let id = lead.conversationId else { return }
            dismiss(animated: true)
            openSession(id)
        }
        stack.addArrangedSubview(row([newOne, UIView(), open]))

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

    /// Draws what Caw says now, and again whenever it changes.
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
        toggle.isEnabled = !lead.moving && view != nil
        refusedLine.text = lead.refused
        refusedLine.isHidden = lead.refused == nil
        let current = view?.harness.rawValue ?? ""
        harness.configuration?.attributedTitle = AttributedString(
            lead.moving ? "Moving…" : view.map { _ in ModelCatalog.harnessName(current) } ?? "Reading…",
            attributes: TypeScale.typeLabel.container(color: Palette.inkStrong))
        harness.isEnabled = !lead.moving && view != nil
        model.isHidden = view == nil
        let chosen = view?.model
        model.configuration?.attributedTitle = AttributedString(chosen.map { ModelCatalog.modelName($0).name } ?? "Default",
                                                                attributes: TypeScale.typeLabel.container(color: Palette.inkStrong))
        if let running = asking {
            let count = running.count
            offWords.text = "He started \(count) \(count == 1 ? "thing that is" : "things that are") still running. Let \(count == 1 ? "it" : "them") finish, or stop \(count == 1 ? "it" : "them") now."
                + "\n" + running.map { "· \($0.title ?? $0.id)" }.joined(separator: "\n")
            stopAll.configuration?.title = "Stop \(count) and turn Caw off"
            offTray.isHidden = false
        } else {
            offTray.isHidden = true
        }
        newOne.isHidden = view?.problem != nil
        open.isHidden = lead.conversationId == nil
        newOne.superview?.isHidden = newOne.isHidden && open.isHidden
        unreachable.isHidden = hub.state != .unreachable
    }

    /// The card's size for what it holds now.
    private func fit() {
        let width = min(352, (view.window?.bounds.width ?? UIScreen.main.bounds.width) - 32)
        let height = stack.systemLayoutSizeFitting(CGSize(width: width - (Self.inset + 4) * 2, height: 0), withHorizontalFittingPriority: .required,
                                                   verticalFittingPriority: .fittingSizeLevel).height + Self.inset * 2
        preferredContentSize = CGSize(width: width, height: height)
    }

    /// Turning events off (The Stay In Context Rule): nothing the
    /// conversation started runs, and it just flips; what it started still
    /// running unfolds a tray under the switch that names each one.
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
            } else {
                self?.asking = running
            }
            self?.render()
        }
    }

    private func offWithRunning(stopAll: Bool) {
        guard let running = asking else { return }
        let stopping = stopAll ? running.map(\.id) : []
        Task { [weak self, lead] in
            await lead.configure(on: false, stopping: stopping)
            if lead.refused == nil { self?.asking = nil }
            self?.render()
        }
    }
}
