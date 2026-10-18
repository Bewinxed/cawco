import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit

/// The session Composer with words alone, to Caw (ViewRoutines.svelte
/// `askCaw`, the project page's Ask Caw for a view): its own binding, Caw
/// named on its field, no Attach. A send goes as the thread composer's does
/// (ThreadViewController `send`): the field clears at once, a refusal puts
/// the words back with why over them, and words the hub never answered go
/// again under the same id, which the hub answers with what it kept. A
/// starter pressed into the field (`press`) is told to the hub as picked or
/// edited once its words go (`tellStarterOutcome`).
final class CawAskComposer: UIView {
    /// The words, and the id they go under; throws the hub's refusal.
    var submit: (_ text: String, _ id: String) async throws -> Void = { _, _ in }
    /// Its height changed (a line, a fold, the refusal over it).
    var onHeight: () -> Void = {}
    let binding: SessionComposerBinding
    private let composer = ComposerView()
    private let hub: HubConnection
    private let projectId: String
    private var sending = false
    private var sendError: String?
    private var unanswered: (words: String, id: String)?
    /// The starter last pressed into the field, its words as the press put them.
    private var pressed: (place: Components.Schemas.StarterPlace, text: String)?

    init(id: String, placeholder: String, hub: HubConnection, projectId: String) {
        self.hub = hub
        self.projectId = projectId
        binding = SessionComposerBinding(sessionId: id)
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        binding.agentName = "Caw"
        binding.placeholder = placeholder
        binding.attachMenu = nil
        binding.delegates = false
        binding.onSend = { [weak self] words, _ in self?.send(words) }
        composer.translatesAutoresizingMaskIntoConstraints = false
        addSubview(composer)
        NSLayoutConstraint.activate([
            composer.topAnchor.constraint(equalTo: topAnchor),
            composer.bottomAnchor.constraint(equalTo: bottomAnchor),
            composer.leadingAnchor.constraint(equalTo: leadingAnchor),
            composer.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
        composer.onHeight = { [weak self] in
            self?.superview?.setNeedsLayout()
            self?.onHeight()
        }
        composer.bind(binding, direction: 0, landing: 0)
        render()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("CawAskComposer is built in code")
    }

    /// A starter's words into the field, the caret after them; nothing is sent.
    func press(_ text: String, place: Components.Schemas.StarterPlace) {
        pressed = (place, text)
        binding.setDraft(text)
        binding.focus()
    }

    func focus() { binding.focus() }

    private func render() {
        binding.writable = hub.state == .connected
        binding.action = sending ? .sending : .send
        binding.sendError = sendError
        binding.publish()
    }

    private func send(_ words: String) {
        guard hub.state == .connected, !sending else { return }
        let id = unanswered.flatMap { $0.words == words ? $0.id : nil } ?? UUID().uuidString.lowercased()
        sending = true
        sendError = nil
        binding.sent()
        render()
        Task { [weak self] in
            guard let self else { return }
            do {
                try await submit(words, id)
                unanswered = nil
                // A starter pressed into the field went, as it stood or changed (Jev's steering).
                if let pressed {
                    self.pressed = nil
                    let picked = words.trimmingCharacters(in: .whitespacesAndNewlines) == pressed.text.trimmingCharacters(in: .whitespacesAndNewlines)
                    Task { [hub, projectId] in
                        try? await ProjectTasks(hub: hub, projectId: projectId).tellStarterOutcome(picked: picked, place: pressed.place, text: pressed.text)
                    }
                }
            } catch {
                binding.setDraft(words)
                let unreached = ThreadsStore.unreachable(error)
                unanswered = unreached ? (words, id) : nil
                sendError = unreached ? ThreadsStore.sendUnreached : ThreadsStore.failureWords(error)
            }
            sending = false
            render()
        }
    }
}

/// Ask Caw for a view (routes/project/[id] `askView`): the session Composer
/// to Caw, words alone, floating from where it was asked in a popover that
/// draws nothing of its own (`.view-ask-pop`: the Composer is the surface),
/// `cPanelW` wide at most. The words go to him as a view request, in a thread
/// of their own, where he drafts the view; the popover closes once the hub
/// has them, and a refusal stays over the words, which come back.
final class ViewAskController: KitPopoverController {
    private let ask: CawAskComposer
    private let projectId: String

    init(hub: HubConnection, projectId: String) {
        self.projectId = projectId
        ask = CawAskComposer(id: "view-ask:\(projectId)", placeholder: Words.Views.placeholder, hub: hub, projectId: projectId)
        super.init(chromeless: true)
        ask.submit = { [weak self] text, id in
            let thread = try await hub.threads.requestView(projectId: projectId, text: text, id: id)
            #if DEBUG
            ViewsProbe.say("views asked \(thread.id)")
            #endif
            self?.dismiss(animated: true)
        }
        ask.onHeight = { [weak self] in self?.fit() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ViewAskController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        card.addSubview(ask)
        NSLayoutConstraint.activate([
            ask.topAnchor.constraint(equalTo: card.topAnchor),
            ask.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            ask.trailingAnchor.constraint(equalTo: card.trailingAnchor),
        ])
        fit()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        ask.focus()
        #if DEBUG
        ViewsProbe.say("views ask open")
        #endif
    }

    /// `min(cPanelW, 100vw − 2 × space-3)` wide, as tall as what the Composer stands, and `space-4` under it.
    private func fit() {
        let width = min(Size.cPanelW, (view.window?.bounds.width ?? UIScreen.main.bounds.width) - Space.space3 * 2)
        let height = ask.systemLayoutSizeFitting(CGSize(width: width, height: 0), withHorizontalFittingPriority: .required,
                                                 verticalFittingPriority: .fittingSizeLevel).height + Space.space4
        preferredContentSize = CGSize(width: width, height: height)
    }
}
