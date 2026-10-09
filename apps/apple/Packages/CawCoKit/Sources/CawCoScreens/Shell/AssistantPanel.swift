import CawCoAPI
import CawCoCore
import CawCoDesign
import Observation
import UIKit

// The assistant (AssistantPanel.svelte): the supervisor's status, the focused
// session's autopilot, and the intervention log. No chat composer. On a desk
// a pane floating over a page that stays fully interactive; under 900pt a
// drawer from the bottom edge.

typealias SupervisorEvent = Components.Schemas.SupervisorEvent

/// What `GET /api/supervisor` answers with (supervisor.ts `SupervisorStatus`).
struct SupervisorStatus: Decodable {
    struct Config: Decodable { let model: String? }
    struct Status: Decodable {
        let configured: Bool
        let reachable: Bool?
        let resolvedModel: String?
        let error: String?
    }

    let config: Config
    let status: Status
}

/// The panel's contents, shared by the desk pane and the phone drawer.
final class AssistantPanelView: UIView {
    var onClose: () -> Void = {}
    var onOpenSession: (String) -> Void = { _ in }
    private let hub: HubConnection
    private let focusedId: () -> String?
    private let closable: Bool
    private let scroll = UIScrollView()
    /// The body's scroll view, which hands a pull at its top to the drawer.
    var scroller: UIScrollView { scroll }
    private let body = UIStackView()
    private let statusBox = CrossView()
    private let autopilotSection = UIStackView()
    private let logBox = UIStackView()
    private var supervisor: SupervisorStatus?
    private var supervisorError: String?
    private var seeded = false
    private var statusKey = ""

    init(hub: HubConnection, focused: @escaping () -> String?, closable: Bool) {
        self.hub = hub
        self.focusedId = focused
        self.closable = closable
        super.init(frame: .zero)
        backgroundColor = Palette.surfaceRaised
        let head = header()
        let rule = UIView()
        rule.backgroundColor = Palette.borderHairline
        rule.heightAnchor.constraint(equalToConstant: 1).isActive = true
        scroll.alwaysBounceVertical = true
        body.axis = .vertical
        body.spacing = Space.space5
        body.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(body)
        let column = UIStackView(arrangedSubviews: [head, rule, scroll])
        column.axis = .vertical
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        NSLayoutConstraint.activate([
            column.topAnchor.constraint(equalTo: topAnchor),
            column.bottomAnchor.constraint(equalTo: bottomAnchor),
            column.leadingAnchor.constraint(equalTo: leadingAnchor),
            column.trailingAnchor.constraint(equalTo: trailingAnchor),
            body.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: Space.space4),
            body.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -Space.space5),
            body.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: Space.space4),
            body.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -Space.space4),
            scroll.contentLayoutGuide.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
        ])
        body.addArrangedSubview(section("Supervisor", [statusBox]))
        autopilotSection.axis = .vertical
        autopilotSection.spacing = Space.space2
        body.addArrangedSubview(autopilotSection)
        logBox.axis = .vertical
        logBox.spacing = 1
        body.addArrangedSubview(section("Interventions", [logBox]))
        accessibilityLabel = "CawCo Assistant"
        load()
        follow()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("AssistantPanelView is built in code")
    }

    // MARK: Header

    /// 47pt: the brand tile with the assistant glyph, "CawCo Assistant", the
    /// Assistant role pill in sentence case, and on a desk the close button (⌘J).
    private func header() -> UIView {
        let logo = UIView()
        logo.backgroundColor = Palette.brandSolid
        logo.layer.cornerRadius = Radius.radiusSm
        let glyph = GlyphView(.assistant, size: 16, tint: Palette.onBrand)
        glyph.translatesAutoresizingMaskIntoConstraints = false
        logo.addSubview(glyph)
        logo.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            logo.widthAnchor.constraint(equalToConstant: 25),
            logo.heightAnchor.constraint(equalToConstant: 25),
            glyph.centerXAnchor.constraint(equalTo: logo.centerXAnchor),
            glyph.centerYAnchor.constraint(equalTo: logo.centerYAnchor),
        ])
        let title = UILabel()
        let words = NSMutableAttributedString(string: "CawCo", attributes: TypeScale.typeBody.withWeight(TypeScale.weightStrong).attributes(color: Palette.inkStrong))
        words.append(NSAttributedString(string: " Assistant", attributes: TypeScale.typeBody.attributes(color: Palette.inkStrong)))
        title.attributedText = words
        // DESIGN.md keeps uppercase for a ledger's column head alone.
        let role = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
        role.text = "Assistant"
        let pill = UIStackView(arrangedSubviews: [role])
        pill.isLayoutMarginsRelativeArrangement = true
        pill.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 8, bottom: 0, trailing: 8)
        pill.backgroundColor = Palette.surfaceRecess
        pill.layer.cornerRadius = 9.5
        pill.heightAnchor.constraint(equalToConstant: 19).isActive = true
        let row = UIStackView(arrangedSubviews: [logo, title, pill, UIView()])
        row.spacing = 9
        row.setCustomSpacing(9 + 8, after: title)
        row.alignment = .center
        if closable {
            let close = KitGhostButton(.close, label: "Close assistant")
            close.configurationUpdateHandler = { button in
                button.configuration?.background.backgroundColor = button.isHighlighted || button.isHovered ? Palette.surfaceHover : Palette.surfaceRecess
                button.tintColor = button.isHovered ? Palette.inkStrong : Palette.inkMuted
            }
            close.addAction(UIAction { [weak self] _ in self?.onClose() }, for: .primaryActionTriggered)
            KitTip.attach(to: close, label: "Close assistant", keys: "⌘J")
            row.addArrangedSubview(close)
        }
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 12, bottom: 0, trailing: 12)
        // `.panel-head` is 47 with its hairline inside it: 46 and the rule under it.
        row.heightAnchor.constraint(equalToConstant: 46).isActive = true
        title.accessibilityTraits = .header
        return row
    }

    /// A heading's and a status's type: label size and weight. The desk's
    /// pane stands on the page's own leading (1.45, an 18.84pt line); the
    /// drawer's on the label's (16.9pt).
    private var labelRole: TypeRole {
        closable ? TypeScale.typeBody.with(points: TypeScale.typeLabel.points).withWeight(TypeScale.weightStrong) : TypeScale.typeLabel
    }

    private func section(_ title: String, _ parts: [UIView]) -> UIStackView {
        let heading = KitLabel(labelRole, ink: Palette.inkStrong)
        heading.text = title
        heading.accessibilityTraits = .header
        let stack = UIStackView(arrangedSubviews: [heading] + parts)
        stack.axis = .vertical
        stack.spacing = Space.space2
        return stack
    }

    private func note(_ text: String, ink: UIColor = Palette.inkMuted, role: TypeRole = TypeScale.typeBody, lines: Int = 0) -> KitLabel {
        let label = KitLabel(role, ink: ink, lines: lines)
        label.text = text
        label.wrap = .pretty
        return label
    }

    private func statusLine(_ text: String?, on: Bool) -> UIStackView {
        let dot = UIView()
        dot.backgroundColor = on ? Palette.dataOk : Palette.neutral7
        dot.layer.cornerRadius = 3.5
        dot.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([dot.widthAnchor.constraint(equalToConstant: 7), dot.heightAnchor.constraint(equalToConstant: 7)])
        let row = UIStackView(arrangedSubviews: [dot])
        row.spacing = Space.space2
        row.alignment = .center
        if let text {
            let label = KitLabel(labelRole, ink: Palette.inkStrong)
            label.text = text
            label.tabular = true
            row.addArrangedSubview(label)
        } else {
            let bar = SkeletonView(height: 14)
            bar.widthAnchor.constraint(equalToConstant: 112).isActive = true
            row.addArrangedSubview(bar)
            row.accessibilityLabel = "Loading"
        }
        row.addArrangedSubview(UIView())
        return row
    }

    // MARK: Data

    private func load() {
        Task { @MainActor [weak self, hub] in
            do {
                let response = try await hub.api.supervisor.status()
                let body = try response.ok.body.json
                let status = try JSONDecoder().decode(SupervisorStatus.self, from: JSONEncoder().encode(body))
                self?.supervisor = status
                self?.supervisorError = nil
            } catch {
                self?.supervisorError = error.localizedDescription
            }
            self?.render()
        }
        Task { @MainActor [weak self, hub] in
            // The seed goes through the one recorder the frames use: the same
            // row can arrive by both, and there is one merge.
            let rows = (try? await hub.api.supervisor.events(.init(query: .init(limit: 100))).ok.body.json) ?? []
            for row in rows { _ = hub.fleet.recordSupervisorEvent(row) }
            self?.seeded = true
            self?.render()
        }
    }

    private func follow() {
        withObservationTracking {
            render()
        } onChange: { [weak self] in
            Task { @MainActor in self?.follow() }
        }
    }

    /// The ring, seeded and kept live: newest first, 200 at most.
    private var events: [SupervisorEvent] { seeded ? hub.fleet.supervisorEvents : [] }

    private func render() {
        renderStatus()
        renderAutopilot()
        renderLog()
    }

    /// Each state cross-fades into the next where it stands; loading is drawn as the line it becomes.
    private func renderStatus() {
        let key: String
        let next: UIView
        if let supervisorError {
            key = "error:\(supervisorError)"
            next = note("Could not reach the supervisor. \(supervisorError)", ink: Palette.statusFailInk)
        } else if let supervisor {
            if !supervisor.status.configured {
                key = "unconfigured"
                let stack = UIStackView(arrangedSubviews: [statusLine("Not configured", on: false),
                                                           note("Set a supervisor model under fleet settings to enable automated session oversight.")])
                stack.axis = .vertical
                stack.spacing = Space.space2
                next = stack
            } else if supervisor.status.reachable == true {
                let model = supervisor.status.resolvedModel ?? supervisor.config.model ?? "Connected"
                key = "on:\(model)"
                next = statusLine(model, on: true)
            } else {
                key = "unreachable:\(supervisor.status.error ?? "")"
                let stack = UIStackView(arrangedSubviews: [statusLine("Unreachable", on: false)])
                stack.axis = .vertical
                stack.spacing = Space.space2
                if let error = supervisor.status.error { stack.addArrangedSubview(note(error, ink: Palette.statusFailInk)) }
                next = stack
            }
        } else {
            key = "loading"
            next = statusLine(nil, on: false)
        }
        guard key != statusKey else { return }
        statusKey = key
        statusBox.show(next)
    }

    private func renderAutopilot() {
        autopilotSection.arrangedSubviews.forEach { $0.removeFromSuperview() }
        guard let id = focusedId(), let row = hub.fleet.rows.first(where: { $0.id == id }) else {
            autopilotSection.isHidden = true
            return
        }
        autopilotSection.isHidden = false
        let heading = KitLabel(labelRole, ink: Palette.inkStrong)
        heading.text = "Autopilot"
        autopilotSection.addArrangedSubview(heading)
        // `.sect-hint`: meta size on the body's leading.
        let hint = { (text: String) in self.note(text, role: TypeScale.typeBody.with(points: TypeScale.typeMeta.points)) }
        if let autopilot = row.autopilot, autopilot.enabled {
            autopilotSection.addArrangedSubview(statusLine("Enabled", on: true))
            if !autopilot.prompt.isEmpty { autopilotSection.addArrangedSubview(note(autopilot.prompt, lines: 2)) }
            autopilotSection.addArrangedSubview(hint("Edit the standing prompt from the session composer."))
        } else if row.autopilot != nil {
            autopilotSection.addArrangedSubview(statusLine("Paused", on: false))
            autopilotSection.addArrangedSubview(hint("Re-enable from the session composer."))
        } else {
            autopilotSection.addArrangedSubview(statusLine("Off", on: false))
            autopilotSection.addArrangedSubview(hint("Enable autopilot from the session composer to let the supervisor answer on your behalf."))
        }
    }

    private func renderLog() {
        logBox.arrangedSubviews.forEach { $0.removeFromSuperview() }
        guard seeded else {
            for _ in 0 ..< 3 { logBox.addArrangedSubview(SkeletonView(height: 32)) }
            logBox.spacing = Space.space1
            return
        }
        logBox.spacing = 1
        let list = events
        guard !list.isEmpty else {
            let mark = GlyphView(.assistant, size: 20, tint: Palette.inkMuted)
            let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
            title.text = "No interventions yet"
            let line = note("When the supervisor acts on a session, every verdict appears here — replies, escalations, and the ones it let pass.", role: TypeScale.typeLabel.withWeight(.regular))
            let empty = UIStackView(arrangedSubviews: [mark, title, line])
            empty.axis = .vertical
            empty.spacing = Space.space2
            empty.alignment = .leading
            logBox.addArrangedSubview(empty)
            return
        }
        for event in list { logBox.addArrangedSubview(logRow(event)) }
    }

    /// "3s", "2m", "1h", "2d".
    private static func ago(_ ms: Double) -> String {
        let s = max(0, Int((Date().timeIntervalSince1970 * 1000 - ms) / 1000))
        if s < 60 { return "\(s)s" }
        if s < 3600 { return "\(s / 60)m" }
        if s < 86400 { return "\(s / 3600)h" }
        return "\(s / 86400)d"
    }

    /// One verdict: when, which session (its name opens it), the source, the
    /// verdict in its tone's pill, and the message clipped at 80.
    private func logRow(_ event: SupervisorEvent) -> UIView {
        let time = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        time.text = Self.ago(event.createdAt)
        time.tabular = true
        time.widthAnchor.constraint(equalToConstant: 28).isActive = true
        let session: UIView
        if let row = hub.fleet.rows.first(where: { $0.id == event.instanceId }) {
            let leaf = row.cwd.split(separator: "/").last.map(String.init) ?? row.cwd
            let button = KitCutButton(type: .system)
            var config = UIButton.Configuration.plain()
            config.contentInsets = .zero
            config.attributedTitle = AttributedString(row.title ?? leaf, attributes: TypeScale.typeMeta.container(color: Palette.inkStrong))
            config.titleLineBreakMode = .byTruncatingTail
            button.configuration = config
            button.contentHorizontalAlignment = .leading
            button.addAction(UIAction { [weak self] _ in self?.onOpenSession(event.instanceId) }, for: .primaryActionTriggered)
            session = button
        } else {
            let gone = KitLabel(TypeScale.typeCode.with(points: TypeScale.typeMeta.points), ink: Palette.inkMuted)
            gone.text = String(event.instanceId.prefix(8))
            session = gone
        }
        session.widthAnchor.constraint(equalToConstant: 100).isActive = true
        let source = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        source.text = event.source.rawValue
        let verdict = Self.pill(event.verdict)
        let row = UIStackView(arrangedSubviews: [time, session, source, verdict])
        row.spacing = Space.space2
        row.alignment = .firstBaseline
        if let message = event.message {
            let msg = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
            msg.text = message.count > 80 ? "\(message.prefix(77))..." : message
            msg.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            row.addArrangedSubview(msg)
        } else {
            row.addArrangedSubview(UIView())
        }
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space1, leading: 0, bottom: Space.space1, trailing: 0)
        // `.log-row`: the 18pt pill and `space1` above and under it.
        row.heightAnchor.constraint(equalToConstant: 18 + Space.space1 * 2).isActive = true
        return row
    }

    /// `.log-verdict`: an 18pt pill, 6pt in, label type, in its tone's ground and ink.
    private static func pill(_ verdict: SupervisorEvent.VerdictPayload) -> UIView {
        let (ground, ink): (UIColor, UIColor) = switch verdict {
        case .reply: (Palette.statusLiveBg, Palette.statusLiveInk)
        case .escalate, .ask: (Palette.statusAttnBg, Palette.statusAttnInk)
        case .error: (Palette.statusFailBg, Palette.statusFailInk)
        case .silent, .skipped: (Palette.surfaceRecess, Palette.inkMuted)
        }
        let label = KitLabel(TypeScale.typeLabel, ink: ink)
        label.text = verdict.rawValue
        let pill = UIStackView(arrangedSubviews: [label])
        pill.alignment = .center
        pill.isLayoutMarginsRelativeArrangement = true
        pill.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 6, bottom: 0, trailing: 6)
        pill.backgroundColor = ground
        pill.layer.cornerRadius = 9
        pill.heightAnchor.constraint(equalToConstant: 18).isActive = true
        pill.setContentHuggingPriority(.required, for: .horizontal)
        pill.isAccessibilityElement = true
        pill.accessibilityLabel = verdict.rawValue
        return pill
    }
}

/// The panel as the phone's drawer holds it (`max-h-[85dvh]` of the drawer's
/// own cap), telling the shell when the drawer has gone.
final class AssistantHolder: UIViewController {
    private let panel: AssistantPanelView
    private let onGone: () -> Void

    init(panel: AssistantPanelView, onGone: @escaping () -> Void) {
        self.panel = panel
        self.onGone = onGone
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("AssistantHolder is built in code")
    }

    /// The panel's head starts at the grabber's foot, as every drawer's
    /// content does (HouseSheet): the drawer's title is only a screen
    /// reader's (the panel's own label), so it takes no room.
    override func loadView() {
        let box = UIView()
        panel.backgroundColor = .clear
        panel.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(panel)
        let tall = box.heightAnchor.constraint(equalToConstant: UIScreen.main.bounds.height * 0.85)
        tall.priority = .defaultHigh
        NSLayoutConstraint.activate([
            panel.topAnchor.constraint(equalTo: box.topAnchor),
            panel.bottomAnchor.constraint(equalTo: box.bottomAnchor),
            panel.leadingAnchor.constraint(equalTo: box.leadingAnchor),
            panel.trailingAnchor.constraint(equalTo: box.trailingAnchor),
            tall,
        ])
        view = box
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        onGone()
    }
}

/// The desk's pane: 380pt wide, 40pt from the top and 24 from the right,
/// up to 899pt tall and 64 short of the window, `--radius-panel`, the
/// overlay shadow. It grows out of the rail's Assistant row (from 0.96 and
/// 8pt below over `durPanel` on the drawer curve) and goes back into it over
/// `durExit`; with less motion it only fades. No scrim: the page under it
/// stays live.
final class AssistantPane: UIView {
    let panel: AssistantPanelView

    init(panel: AssistantPanelView) {
        self.panel = panel
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        // `.panel { box-shadow: var(--shadow-overlay) }`, cast by the panel's
        // rounded rect: the panel clips, so its unclipped frame casts it.
        layer.cornerRadius = Radius.radiusPanel
        layer.cornerCurve = .continuous
        boxShadow = Shadow.shadowOverlay
        panel.layer.cornerRadius = Radius.radiusPanel
        panel.layer.cornerCurve = .continuous
        panel.clipsToBounds = true
        panel.translatesAutoresizingMaskIntoConstraints = false
        addSubview(panel)
        NSLayoutConstraint.activate([
            panel.topAnchor.constraint(equalTo: topAnchor),
            panel.bottomAnchor.constraint(equalTo: bottomAnchor),
            panel.leadingAnchor.constraint(equalTo: leadingAnchor),
            panel.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
        accessibilityViewIsModal = false
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("AssistantPane is built in code")
    }

    /// `top: 40px` under a 60px top bar is 20 above the bar's seam: the pane
    /// keeps that overlap with the bar it stands under, whatever the bar's height.
    func install(in host: UIView, under bar: UIView) {
        host.addSubview(self)
        let tall = heightAnchor.constraint(equalToConstant: 899)
        tall.priority = .defaultHigh
        NSLayoutConstraint.activate([
            topAnchor.constraint(equalTo: bar.bottomAnchor, constant: -20),
            trailingAnchor.constraint(equalTo: host.trailingAnchor, constant: -24),
            widthAnchor.constraint(equalToConstant: 380),
            tall,
            // `min(899px, 100dvh - 64px)` under `top: 40px`: never nearer the foot than 24.
            bottomAnchor.constraint(lessThanOrEqualTo: host.bottomAnchor, constant: -24),
        ])
    }

    /// From (or back into) `origin`, a point in the pane's superview.
    func appear(from origin: CGPoint?, completion: (() -> Void)? = nil) { move(in: true, origin: origin, completion: completion) }
    func disappear(into origin: CGPoint?, completion: (() -> Void)? = nil) { move(in: false, origin: origin, completion: completion) }

    private func move(in arriving: Bool, origin: CGPoint?, completion: (() -> Void)?) {
        superview?.layoutIfNeeded()
        let still = UIAccessibility.isReduceMotionEnabled
        var away = CGAffineTransform.identity
        if !still {
            let center = CGPoint(x: frame.midX, y: frame.midY)
            let from = origin ?? center
            let dx = from.x - center.x, dy = from.y - center.y
            away = CGAffineTransform(translationX: dx * 0.04, y: dy * 0.04 + 8).scaledBy(x: 0.96, y: 0.96)
        }
        if arriving {
            alpha = 0
            transform = away
        }
        let curve = arriving ? Motion.easeDrawer : Motion.easeOut
        let animator = curve.animator(arriving ? Motion.durPanel : Motion.durExit) {
            self.alpha = arriving ? 1 : 0
            self.transform = arriving ? .identity : away
        }
        animator.addCompletion { _ in completion?() }
        animator.startAnimation()
    }
}
