import CawCoCore
import CawCoDesign
import CawCoTranscript
import Observation
import UIKit

/// An attempt's transcript in the task sheet (tasks/AttemptTranscript.svelte):
/// the session's own transcript (TranscriptView, the session page's), in a
/// pane `30rem` tall under the attempt, or, expanded, in a pane of its own
/// at the sheet's full height (beside the task on a wide screen, over it on
/// a narrow one). Its session is watched from when the pane is made until
/// `close`, and its transcript followed while it is.
final class AttemptTranscriptPane: UIView {
    let instanceId: String
    private let hub: HubConnection
    private let transcript: SessionTranscript
    private let transcriptView = TranscriptView()
    private let hint = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private var toggle: UIButton!
    private var headInsets: [NSLayoutConstraint] = []
    private var closed = false
    private let expanded: Bool

    /// Expand or Collapse was pressed.
    var onToggle: () -> Void = {}
    /// Open session, or a session the transcript names, in its own view.
    var onOpenSession: (String) -> Void = { _ in }

    /// "Attempt 2": what the attempt is called in the sheet.
    var attempt: String {
        didSet { name() }
    }

    init(hub: HubConnection, instanceId: String, attempt: String, expanded: Bool) {
        self.hub = hub
        self.instanceId = instanceId
        self.attempt = attempt
        self.expanded = expanded
        transcript = hub.sessions.open(instanceId)
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceRaised
        clipsToBounds = true
        accessibilityIdentifier = expanded ? "task-transcript-expanded" : "task-transcript"

        let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        title.text = "Transcript"
        title.accessibilityTraits = .header
        let words = UIStackView(arrangedSubviews: [title, hint])
        words.axis = .vertical
        toggle = KitButton.make(expanded ? "Collapse transcript" : "Expand transcript", glyph: expanded ? .minimize : .maximize,
                                variant: .outline, height: .sm) { [weak self] in self?.onToggle() }
        toggle.accessibilityIdentifier = "task-transcript-expand"
        let open = KitButton.make("Open session", glyph: .external, variant: .ghost, height: .sm) { [weak self] in
            guard let self else { return }
            onOpenSession(instanceId)
        }
        let acts = UIStackView(arrangedSubviews: [toggle, open])
        acts.spacing = Space.space2
        // `.words { flex: 1 1 12rem }` beside the acts, which wrap under them where they do not fit.
        let line = FlexRow(lead: words, trail: acts, basis: 192, gap: Space.space3, rowGap: Space.space2, centred: true)
        let head = UIView()
        line.translatesAutoresizingMaskIntoConstraints = false
        head.addSubview(line)
        // `padding: space-3 space-4`; expanded, `space-5` on top and `space-8` at its end, clear of the sheet's close.
        headInsets = [
            line.topAnchor.constraint(equalTo: head.topAnchor, constant: expanded ? Space.space5 : Space.space3),
            line.bottomAnchor.constraint(equalTo: head.bottomAnchor, constant: -Space.space3),
            line.leadingAnchor.constraint(equalTo: head.leadingAnchor, constant: Space.space4),
            line.trailingAnchor.constraint(equalTo: head.trailingAnchor, constant: expanded ? -Space.space8 : -Space.space4),
        ]
        NSLayoutConstraint.activate(headInsets)
        let rule = UIView()
        rule.backgroundColor = Palette.borderHairline
        transcriptView.hub = hub
        transcriptView.onOpenSession = { [weak self] id in self?.onOpenSession(id) }
        transcriptView.onOpenRun = { [weak self] runId in self?.onOpenSession(BoardRun.prefix + runId) }
        for part in [head, rule, transcriptView] as [UIView] {
            part.translatesAutoresizingMaskIntoConstraints = false
            addSubview(part)
        }
        NSLayoutConstraint.activate([
            head.topAnchor.constraint(equalTo: topAnchor),
            head.leadingAnchor.constraint(equalTo: leadingAnchor),
            head.trailingAnchor.constraint(equalTo: trailingAnchor),
            rule.topAnchor.constraint(equalTo: head.bottomAnchor),
            rule.leadingAnchor.constraint(equalTo: leadingAnchor),
            rule.trailingAnchor.constraint(equalTo: trailingAnchor),
            rule.heightAnchor.constraint(equalToConstant: 1),
            transcriptView.topAnchor.constraint(equalTo: rule.bottomAnchor),
            transcriptView.leadingAnchor.constraint(equalTo: leadingAnchor),
            transcriptView.trailingAnchor.constraint(equalTo: trailingAnchor),
            transcriptView.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        if !expanded {
            // Under the attempt: a pane of its own height in a well's border at `--radius-lg`.
            heightAnchor.constraint(equalToConstant: 480).isActive = true
            layer.borderWidth = 1
            layer.cornerRadius = Radius.radiusLg
            layer.cornerCurve = .continuous
        }
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (pane: AttemptTranscriptPane, _: UITraitCollection) in pane.paint() }
        paint()
        name()
        follow()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    private func paint() {
        layer.borderColor = Palette.borderWell.resolvedColor(with: traitCollection).cgColor
    }

    private func name() {
        hint.text = "What \(attempt.lowercased())'s session said and did"
        accessibilityLabel = "\(attempt)'s transcript"
    }

    /// Hands the transcript to its view, and again whenever what it read of it changes.
    private func follow() {
        guard !closed else { return }
        withObservationTracking {
            transcriptView.configure(transcript)
        } onChange: { [weak self] in
            Task { @MainActor in self?.follow() }
        }
    }

    /// Stops watching the session; the pane is done with.
    func close() {
        guard !closed else { return }
        closed = true
        hub.sessions.close(instanceId)
    }
}

/// Two parts on one line, the first growing from its `basis` beside the
/// second; where the line cannot hold both, the second wraps under the first
/// at its start (`display: flex; flex-wrap: wrap`, the first `flex: 1 1
/// <basis>`). `gap` across, `rowGap` between the lines; on one line the two
/// are top-aligned, or `centred`.
final class FlexRow: UIView {
    private let lead: UIView
    private let trail: UIView?
    private let basis: Double
    private let gap: Double
    private var across: [NSLayoutConstraint] = []
    private var down: [NSLayoutConstraint] = []
    private var isAcross = true

    init(lead: UIView, trail: UIView?, basis: Double, gap: Double, rowGap: Double, centred: Bool = false) {
        self.lead = lead
        self.trail = trail
        self.basis = basis
        self.gap = gap
        super.init(frame: .zero)
        lead.translatesAutoresizingMaskIntoConstraints = false
        addSubview(lead)
        let leadBottom = lead.bottomAnchor.constraint(equalTo: bottomAnchor)
        leadBottom.priority = .defaultLow
        NSLayoutConstraint.activate([
            lead.topAnchor.constraint(greaterThanOrEqualTo: topAnchor),
            lead.leadingAnchor.constraint(equalTo: leadingAnchor),
            lead.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor),
            leadBottom,
        ])
        guard let trail else {
            NSLayoutConstraint.activate([lead.topAnchor.constraint(equalTo: topAnchor), lead.trailingAnchor.constraint(equalTo: trailingAnchor)])
            return
        }
        trail.translatesAutoresizingMaskIntoConstraints = false
        trail.setContentHuggingPriority(.required, for: .horizontal)
        trail.setContentCompressionResistancePriority(.required, for: .horizontal)
        addSubview(trail)
        let trailBottom = trail.bottomAnchor.constraint(equalTo: bottomAnchor)
        trailBottom.priority = .defaultLow
        NSLayoutConstraint.activate([trail.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor), trailBottom])
        across = [
            lead.trailingAnchor.constraint(equalTo: trail.leadingAnchor, constant: -gap),
            trail.trailingAnchor.constraint(equalTo: trailingAnchor),
        ] + (centred
            ? [lead.centerYAnchor.constraint(equalTo: centerYAnchor), trail.centerYAnchor.constraint(equalTo: centerYAnchor),
               lead.topAnchor.constraint(greaterThanOrEqualTo: topAnchor), trail.topAnchor.constraint(greaterThanOrEqualTo: topAnchor)]
            : [lead.topAnchor.constraint(equalTo: topAnchor), trail.topAnchor.constraint(equalTo: topAnchor)])
        down = [
            lead.topAnchor.constraint(equalTo: topAnchor),
            lead.trailingAnchor.constraint(equalTo: trailingAnchor),
            trail.topAnchor.constraint(equalTo: lead.bottomAnchor, constant: rowGap),
            trail.leadingAnchor.constraint(equalTo: leadingAnchor),
            trail.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor),
        ]
        NSLayoutConstraint.activate(across)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard let trail, bounds.width > 0 else { return }
        let needed = basis + gap + trail.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize).width
        let fits = bounds.width >= needed
        guard fits != isAcross else { return }
        isAcross = fits
        NSLayoutConstraint.deactivate(fits ? down : across)
        NSLayoutConstraint.activate(fits ? across : down)
        invalidateIntrinsicContentSize()
        setNeedsLayout()
    }
}
