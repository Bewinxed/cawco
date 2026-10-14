import AuthenticationServices
import CawCoCore
import CawCoDesign
import OSLog
import UIKit

/// Configure › Models CawCo uses (routes/config/models/+page.svelte), three
/// groups in the web's order: OpenRouter's connection; Jev, its route now,
/// the TypeSafe key and the suggest-while-typing switch; and fleet watch,
/// its switch and what opens a signal, as facts.
///
/// Every step answers where it was asked (The Stay In Context Rule): a
/// button spins with the web's pending words until the hub answers, a
/// switch shows the hub's value once the hub has it, and a refusal stays
/// under its group in the hub's words.
///
/// OpenRouter connects through the web's own route: the hub's connect
/// address opens in the system's authentication sheet with the dashboard's
/// Models page on its https address (`/health` `secureDashboard`) as
/// OpenRouter's callback, and that page hands the `code` to the hub. The
/// sheet shares Safari's cookies, so a sign-in the dashboard's address sits
/// behind (Cloudflare Access) carries over. While the sheet is up the
/// connection is read every two seconds, and the sheet closes itself once
/// the hub holds the key. With no https address known, nothing opens and
/// the group says so.
final class ModelsSectionController: ConfigSectionController, ASWebAuthenticationPresentationContextProviding {
    fileprivate static let log = Logger(subsystem: "dev.cawco.app", category: "Models")

    private let settings: ModelsSettings

    // OpenRouter
    private lazy var connectButton = KitButton.make("Connect OpenRouter", variant: .action, height: .sm) { [weak self] in self?.connect() }
    private lazy var disconnectButton = KitButton.make("Disconnect", variant: .outline, height: .sm) { [weak self] in self?.disconnect() }
    private let openRouterLine = StatusLine()
    private let openRouterProblem = ProblemLine()
    private var signIn: ASWebAuthenticationSession?
    private var watching: Task<Void, Never>?
    /// OpenRouter's sheet closed and the connection is being read again.
    private var exchanging = false

    // Jev
    private lazy var saveButton = KitButton.make("Save key", variant: .action, height: .sm) { [weak self] in self?.saveKey() }
    private lazy var removeButton = KitButton.make("Remove key", variant: .outline, height: .sm) { [weak self] in self?.removeKey() }
    private let routeLine = StatusLine()
    private let keyField = KitField()
    private let keyLine = StatusLine()
    private let suggest = SwitchField(label: "Suggest skills and MCP servers while typing")
    private let jevProblem = ProblemLine()

    // Fleet watch
    private let watch = SwitchField(label: "Enabled")
    private let facts = UIStackView()
    private let watchProblem = ProblemLine()

    /// What the log said last, so each answer is logged once.
    private var logged = ""

    override init(section: ConfigSection, context: ShellContext) {
        settings = ModelsSettings(hub: context.hub)
        super.init(section: section, context: context)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ModelsSectionController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let rule = { () -> UIView in
            let rule = UIView()
            rule.backgroundColor = Palette.borderHairline
            rule.heightAnchor.constraint(equalToConstant: 1).isActive = true
            return rule
        }
        // `.group + .group`: 18pt under a hairline.
        let page = UIStackView(arrangedSubviews: [openRouterGroup(), rule(), jevGroup(), rule(), watchGroup()])
        page.axis = .vertical
        page.spacing = 18
        setContent([page])
    }

    override func viewIsAppearing(_ animated: Bool) {
        super.viewIsAppearing(animated)
        Task { await settings.read() }
    }

    // MARK: Groups

    private func group(_ views: [UIView]) -> UIStackView {
        let group = UIStackView(arrangedSubviews: views)
        group.axis = .vertical
        group.spacing = 8
        return group
    }

    private func note(_ text: String) -> KitLabel {
        let note = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        note.text = text
        note.wrap = .pretty
        return note
    }

    private func openRouterGroup() -> UIView {
        let header = nsSectionHeader(.globe, hue: section.hue, "OpenRouter") as! UIStackView
        header.addArrangedSubview(disconnectButton)
        header.addArrangedSubview(connectButton)
        connectButton.accessibilityIdentifier = "models.openrouter.connect"
        disconnectButton.accessibilityIdentifier = "models.openrouter.disconnect"
        openRouterLine.accessibilityIdentifier = "models.openrouter.status"
        return group([
            header,
            note("One way to reach Jev. A TypeSafe key held in Jev below takes over from it."),
            openRouterLine,
            openRouterProblem,
        ])
    }

    private func jevGroup() -> UIView {
        let header = nsSectionHeader(.jev, hue: section.hue, "Jev") as! UIStackView
        header.spacing = 8
        header.addArrangedSubview(removeButton)
        header.addArrangedSubview(saveButton)
        saveButton.accessibilityIdentifier = "models.jev.save"
        removeButton.accessibilityIdentifier = "models.jev.remove"
        routeLine.accessibilityIdentifier = "models.jev.route"
        keyLine.accessibilityIdentifier = "models.jev.key-state"
        keyField.isSecureTextEntry = true
        keyField.textContentType = .password
        keyField.returnKeyType = .done
        keyField.accessibilityIdentifier = "models.jev.key"
        keyField.addAction(UIAction { [weak self] _ in self?.saveKey() }, for: .editingDidEndOnExit)
        suggest.toggle.accessibilityIdentifier = "models.jev.suggest"
        suggest.onChange = { [weak self] on in
            guard let self else { return }
            Task { await self.settings.setSuggest(on) }
        }
        return group([
            header,
            note("Answers the hub's yes/no questions: meaning rules, fleet watch, suggestions and its own judgments. It goes straight to TypeSafe while a key is held here, otherwise through OpenRouter."),
            routeLine,
            ConfigField(label: "TypeSafe key", control: keyField),
            keyLine,
            suggest,
            jevProblem,
        ])
    }

    private func watchGroup() -> UIView {
        let header = nsSectionHeader(.rules, hue: section.hue, "Fleet watch")
        watch.toggle.accessibilityIdentifier = "models.watch.on"
        watch.onChange = { [weak self] on in
            guard let self else { return }
            Task { await self.settings.setWatch(on) }
        }
        facts.axis = .vertical
        facts.spacing = 4
        facts.accessibilityIdentifier = "models.watch.facts"
        return group([
            header,
            note("Reads every session's stream for a loop or a stall. A yes from Jev, or a second signal while Jev is off, starts one triage that tells the session's lead. In a project whose Caw is off, it tells you instead."),
            watch,
            facts,
            watchProblem,
        ])
    }

    // MARK: Drawing

    override func refreshContent() {
        ready = settings.ready || exchanging
        problem = settings.readProblem
        drawOpenRouter()
        drawJev()
        drawWatch()
        logAnswers()
    }

    private func drawOpenRouter() {
        let connected = settings.openRouter?.connected == true
        connectButton.isHidden = connected
        disconnectButton.isHidden = !connected
        KitButton.setTitle(settings.connecting ? "Opening OpenRouter…" : "Connect OpenRouter", of: connectButton, variant: .action, height: .sm)
        connectButton.configuration?.showsActivityIndicator = settings.connecting
        connectButton.isEnabled = !settings.connecting && !exchanging && signIn == nil
        KitButton.setTitle(settings.disconnecting ? "Disconnecting…" : "Disconnect", of: disconnectButton, variant: .outline, height: .sm)
        disconnectButton.configuration?.showsActivityIndicator = settings.disconnecting
        disconnectButton.isEnabled = !settings.disconnecting
        if exchanging {
            openRouterLine.set(.pending, "Finishing the connection with OpenRouter…")
        } else if connected, let at = settings.openRouter?.connectedAt {
            openRouterLine.set(.ok, "Connected \(RailAge.ago(at, now: Date.now.timeIntervalSince1970 * 1000))")
        } else {
            openRouterLine.set(.off, "Not connected")
        }
        openRouterProblem.set(settings.ready ? settings.openRouterError : nil)
    }

    private func drawJev() {
        let jev = settings.jev
        let held = jev?.typesafe
        removeButton.isHidden = held == nil
        KitButton.setTitle(settings.removingKey ? "Removing…" : "Remove key", of: removeButton, variant: .outline, height: .sm)
        removeButton.configuration?.showsActivityIndicator = settings.removingKey
        removeButton.isEnabled = !settings.savingKey && !settings.removingKey
        KitButton.setTitle(settings.savingKey ? "Saving…" : "Save key", of: saveButton, variant: .action, height: .sm)
        saveButton.configuration?.showsActivityIndicator = settings.savingKey
        saveButton.isEnabled = !settings.savingKey && !settings.removingKey

        switch jev?.route {
        case .typesafe:
            routeLine.set(.ok, "Jev goes to TypeSafe directly with the key held here.")
        case .openrouter:
            routeLine.set(.ok, "Jev goes through OpenRouter. A key saved here takes over from it.")
        default:
            routeLine.set(.off, "Jev is off. Save a TypeSafe key here, or connect OpenRouter above.")
        }
        keyField.attributedPlaceholder = NSAttributedString(
            string: held == nil ? "Paste your TypeSafe API key" : "Paste a new key to replace the held one",
            attributes: [.font: TypeScale.typeBody.font, .foregroundColor: Palette.mutedForeground]
        )
        if let held {
            keyLine.set(.ok, "Held, ends …\(held.ends)")
        } else {
            keyLine.set(.off, "Not set")
        }
        let routed = jev?.route != nil
        suggest.set(on: jev?.suggestWhileTyping ?? false,
                    hint: routed
                        ? "Jev reads the message as you write it and offers chips you can add to it. The session's tools are not changed."
                        : "Needs Jev — save a TypeSafe key above, or connect OpenRouter.",
                    enabled: routed && !settings.savingSuggest)
        jevProblem.set(settings.ready ? settings.jevError : nil)
    }

    private func drawWatch() {
        let state = settings.watch
        let on = state?.on ?? false
        watch.set(on: on,
                  hint: on ? "Every session is watched. Nothing spends until a signal opens." : "Off — no session is watched.",
                  enabled: state != nil && !settings.savingWatch)
        facts.arrangedSubviews.forEach { $0.removeFromSuperview() }
        if let state {
            let limits = state.limits
            let lines = [
                "Same error \(Int(limits.sameError)) times in \(Int(limits.errorTurns)) turns",
                "Same tool call \(Int(limits.sameCall)) times in a row",
                "No file changed in \(Int(limits.quietTurns)) turns",
                "No output for \(Int(limits.stallMinutes)) min in a running turn",
                state.jev ? "Jev answers whether a session is stuck before triage starts." : "Jev is off: a second signal starts triage.",
            ]
            for line in lines {
                let fact = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
                fact.tabular = true
                fact.text = line
                facts.addArrangedSubview(fact)
            }
        }
        facts.isHidden = state == nil
        watchProblem.set(settings.ready ? settings.watchError : nil)
    }

    /// The hub's answers, one line each time they change: the DEBUG probe's record.
    private func logAnswers() {
        #if DEBUG
        let line = [
            "openrouter \(settings.openRouter.map { $0.connected ? "connected" : "off" } ?? "-")",
            "route \(settings.jev?.route.map { "\($0)" } ?? "off")",
            "key \(settings.jev?.typesafe.map { "held …\($0.ends)" } ?? "unset")",
            "suggest \(settings.jev.map { $0.suggestWhileTyping ? "on" : "off" } ?? "-")",
            "watch \(settings.watch.map { $0.on ? "on" : "off" } ?? "-")",
            "working \([settings.savingKey ? "saving" : nil, settings.removingKey ? "removing" : nil, settings.savingSuggest ? "suggest" : nil, settings.savingWatch ? "watch" : nil].compactMap(\.self).joined(separator: ","))",
            "problem \(settings.openRouterError ?? settings.jevError ?? settings.watchError ?? "-")",
        ].joined(separator: " · ")
        guard line != logged else { return }
        logged = line
        Self.log.notice("models: \(line, privacy: .public)")
        #endif
    }

    // MARK: Steps

    private func saveKey() {
        let key = keyField.text ?? ""
        Task {
            if await settings.saveKey(key) {
                keyField.text = ""
                keyField.resignFirstResponder()
            }
        }
    }

    private func removeKey() {
        Task { await settings.removeKey() }
    }

    private func disconnect() {
        Task { await settings.disconnect() }
    }

    /// OpenRouter's page in the system's authentication sheet; the
    /// dashboard's Models page, its callback, hands the code to the hub.
    private func connect() {
        Task {
            guard let address = await settings.connectAddress() else { return }
            // OpenRouter returns to the dashboard's page, never to this
            // scheme: the sheet ends when the hub holds the key (below) or
            // the person closes it.
            let session = ASWebAuthenticationSession(url: address, callback: .customScheme("cawco")) { [weak self] _, _ in
                Task { @MainActor in self?.signedIn() }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            signIn = session
            guard session.start() else {
                signIn = nil
                requestRefresh()
                return
            }
            requestRefresh()
            // The hub holds the key once the dashboard's page has exchanged
            // the code: the sheet then closes itself.
            watching = Task { [weak self] in
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(2))
                    guard let self, !Task.isCancelled else { return }
                    await settings.readOpenRouter()
                    if settings.openRouter?.connected == true {
                        signIn?.cancel()
                        return
                    }
                }
            }
        }
    }

    /// The sheet closed, by the person or because the hub holds the key: the
    /// connection and Jev's route are read again.
    private func signedIn() {
        watching?.cancel()
        watching = nil
        signIn = nil
        exchanging = true
        requestRefresh()
        Task {
            await settings.readRoute()
            exchanging = false
            requestRefresh()
        }
    }

    nonisolated func presentationAnchor(for _: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated { view.window ?? ASPresentationAnchor() }
    }
}

/// A one-line status (the page's `.status`): the connected tick, a dot
/// (off, or breathing while the hub works), and the words; strong ink when
/// it is on, muted when it is off.
private final class StatusLine: UIStackView {
    enum Tone { case ok, off, pending }

    private let tick = GlyphView(.passed, size: 16, tint: Palette.statusLiveGlyph)
    private let dot = UIView()
    private let words = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)

    init() {
        super.init(frame: .zero)
        spacing = 8
        alignment = .center
        dot.layer.cornerRadius = 3.5
        dot.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([dot.widthAnchor.constraint(equalToConstant: 7), dot.heightAnchor.constraint(equalToConstant: 7)])
        words.tabular = true
        words.accessibilityTraits = .updatesFrequently
        for part in [tick, dot, words] { addArrangedSubview(part) }
        isAccessibilityElement = true
        accessibilityTraits = .updatesFrequently
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("StatusLine is built in code")
    }

    func set(_ tone: Tone, _ text: String) {
        tick.isHidden = tone != .ok
        dot.isHidden = tone == .ok
        dot.backgroundColor = Palette.inkMuted.withAlphaComponent(tone == .pending ? 0.6 : 0.5)
        breathe(tone == .pending)
        words.ink = tone == .ok ? Palette.inkStrong : Palette.inkMuted
        guard words.text != text else { return }
        words.text = text
        accessibilityLabel = text
        UIAccessibility.post(notification: .layoutChanged, argument: nil)
    }

    /// While the hub works the dot breathes (the page's `.pulse`: `breathe
    /// var(--breath)`, to a third of its ink at the half); still under Reduce Motion.
    private func breathe(_ on: Bool) {
        guard on != (dot.layer.animation(forKey: "breath") != nil) else { return }
        dot.layer.removeAnimation(forKey: "breath")
        guard on, !UIAccessibility.isReduceMotionEnabled else { return }
        let pulse = CABasicAnimation(keyPath: "opacity")
        pulse.fromValue = 1
        pulse.toValue = 0.2 / 0.6
        pulse.duration = Motion.breath / 2
        pulse.autoreverses = true
        pulse.repeatCount = .infinity
        pulse.timingFunction = Motion.easeInOut.function
        dot.layer.add(pulse, forKey: "breath")
    }
}

/// A group's refusal (the page's `.problem`): the hub's words in the fail
/// ink, gone when there is nothing to say.
private final class ProblemLine: UIStackView {
    private let words = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)

    init() {
        super.init(frame: .zero)
        words.accessibilityIdentifier = "models.problem"
        addArrangedSubview(words)
        isHidden = true
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("ProblemLine is built in code")
    }

    func set(_ problem: String?) {
        guard words.text != problem || isHidden != (problem == nil) else { return }
        words.text = problem
        isHidden = problem == nil
        if let problem { UIAccessibility.post(notification: .announcement, argument: problem) }
    }
}
