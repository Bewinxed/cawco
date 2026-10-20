import CawCoAPI
import CawCoCore
import CawCoDesign
import UIKit
import WebKit

/// A decision page opened in the Decisions tab's pane (DecisionPage.svelte;
/// The Open Page Rule: in place, nothing modal). The draft-bar head:
/// ‹ Decisions, the page's title and its figure, its state pill. Under it,
/// while it is picked on, the page itself, live from its session's preview
/// origin (DecisionPageFrame); once decided, its record: the cards as they
/// were settled (RecordCardView). At its foot, one docked composer: a note
/// for the session (Send) and the page's one coral act, the next step: I'm
/// done picking, then Make tasks, then none. A refusal leaves the page as it
/// was and says why over the dock.
final class DecisionPageView: UIView, UITextViewDelegate {
    /// ‹ Decisions.
    var onBack: () -> Void = {}
    /// A task a record card made, opened in its sheet.
    var onOpenTask: (String) -> Void = { _ in }
    /// A task the record names, as the board has it.
    var taskOf: (String) -> (kind: Components.Schemas.StageKind?, title: String)? = { _ in nil }

    let name: String
    private let hub: HubConnection
    private let projectId: String
    /// The page as the list had it: the head stands at once, before its read.
    private var summary: DecisionPageSummary?
    private var read: DecisionPageRead?
    private var unread: String?
    private var reads = 0
    private var seen = -1

    // The head (`.page-head`): surface-band, a hairline inside, radius-lg.
    private let band = UIView()
    private var back: UIButton!
    private let titleLabel = KitLabel(TypeScale.typeLabel.with(weight: TypeScale.weightStrong), ink: Palette.inkStrong, lines: 0)
    private let ring = TaskRingView(size: .md)
    private let figure = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private let progress = UIStackView()
    private let pill = StatePillView()
    private let headRow = UIStackView()

    /// The title and the figure a tile hands the head as the page opens, and takes back on ‹ Decisions.
    var sharedViews: (UIView, UIView) { (titleLabel, progress) }
    private let what = UIStackView()

    // The body: the live page, the record, or a sentence.
    private let body = UIView()
    private var frameView: DecisionPageFrame?
    private let records = UIScrollView()
    private let recordGrid = UIStackView()
    private let problem = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
    private let opening = SkeletonView(height: 11)

    // The dock.
    private let dock = UIStackView()
    private let feedback = KitLabel(TypeScale.typeMeta, ink: Palette.error11, lines: 0)
    private let shell = UIView()
    private let note = UITextView()
    private let placeholder = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted)
    private var noteHeight: NSLayoutConstraint!
    private var send: UIButton!
    private var primary: UIButton!
    private let fade = FootFade()
    private var sendingNote = false
    private var acting = false
    private var gutters: [NSLayoutConstraint] = []
    private var dockWidth: NSLayoutConstraint!
    /// The title's group spans the head once it wraps under ‹ Decisions.
    private var whatSpans: NSLayoutConstraint!

    init(name: String, summary: DecisionPageSummary?, hub: HubConnection, projectId: String) {
        self.name = name
        self.summary = summary
        self.hub = hub
        self.projectId = projectId
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        build()
        render()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("DecisionPageView is built in code")
    }

    // MARK: Building

    private func build() {
        band.backgroundColor = Palette.surfaceBand
        band.layer.cornerRadius = Radius.radiusLg
        band.layer.cornerCurve = .continuous
        band.layer.borderWidth = 1
        band.translatesAutoresizingMaskIntoConstraints = false
        back = KitButton.make(Words.Decisions.tab, glyph: .chevronLeft, variant: .ghost, height: .sm) { [weak self] in self?.onBack() }
        back.setContentHuggingPriority(.required, for: .horizontal)
        back.setContentCompressionResistancePriority(.required, for: .horizontal)
        figure.tabular = true
        progress.addArrangedSubview(ring)
        progress.addArrangedSubview(figure)
        progress.spacing = Space.space2
        progress.alignment = .center
        titleLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let gap = UIView()
        gap.setContentHuggingPriority(.init(1), for: .horizontal)
        for part in [titleLabel, progress, gap, pill] as [UIView] { what.addArrangedSubview(part) }
        what.spacing = Space.space3
        what.alignment = .center
        headRow.addArrangedSubview(back)
        headRow.addArrangedSubview(what)
        headRow.spacing = Space.space3
        headRow.translatesAutoresizingMaskIntoConstraints = false
        band.addSubview(headRow)
        addSubview(band)

        body.translatesAutoresizingMaskIntoConstraints = false
        addSubview(body)
        records.alwaysBounceVertical = true
        records.translatesAutoresizingMaskIntoConstraints = false
        recordGrid.axis = .vertical
        recordGrid.spacing = Space.space3
        recordGrid.translatesAutoresizingMaskIntoConstraints = false
        records.addSubview(recordGrid)
        problem.translatesAutoresizingMaskIntoConstraints = false
        opening.translatesAutoresizingMaskIntoConstraints = false
        for part in [records, problem, opening] as [UIView] { body.addSubview(part) }

        // The dock (`.cin`, the composer recipe): the note, Send, the one act.
        fade.isUserInteractionEnabled = false
        fade.translatesAutoresizingMaskIntoConstraints = false
        addSubview(fade)
        feedback.isHidden = true
        shell.layer.cornerRadius = Radius.radiusLg
        shell.layer.cornerCurve = .continuous
        shell.layer.borderWidth = 1
        shell.boxShadow = Shadow.shadowTile
        shell.clipsToBounds = false
        let material = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterial))
        material.layer.cornerRadius = Radius.radiusLg
        material.layer.cornerCurve = .continuous
        material.clipsToBounds = true
        material.isUserInteractionEnabled = false
        material.translatesAutoresizingMaskIntoConstraints = false
        shell.insertSubview(material, at: 0)
        note.font = TypeScale.typeBody.font
        note.textColor = Palette.inkStrong
        note.backgroundColor = .clear
        note.textContainerInset = UIEdgeInsets(top: 7, left: 0, bottom: 7, right: 0)
        note.textContainer.lineFragmentPadding = 0
        note.isScrollEnabled = false
        note.delegate = self
        note.accessibilityLabel = Words.Decisions.noteLabel
        placeholder.text = Words.Decisions.note
        placeholder.isUserInteractionEnabled = false
        placeholder.translatesAutoresizingMaskIntoConstraints = false
        note.addSubview(placeholder)
        send = KitButton.make("", glyph: Glyph.send, variant: .outline, height: .sm) { [weak self] in self?.sendNote() }
        // `.ctl`: a square of the composer field's height, not the small icon button's.
        send.constraints.filter { $0.firstAttribute == .width }.forEach { $0.isActive = false }
        send.accessibilityLabel = Words.Decisions.send
        send.configuration?.background.cornerRadius = Radius.radiusXs
        primary = KitButton.make(Words.Decisions.done, variant: .action, height: .sm) { [weak self] in self?.act() }
        primary.configuration?.background.cornerRadius = Radius.radiusXs
        for button in [send!, primary!] {
            button.setContentHuggingPriority(.required, for: .horizontal)
            button.setContentCompressionResistancePriority(.required, for: .horizontal)
        }
        let row = UIStackView(arrangedSubviews: [note, send, primary])
        row.spacing = Space.space2
        row.alignment = .bottom
        row.translatesAutoresizingMaskIntoConstraints = false
        shell.addSubview(row)
        dock.addArrangedSubview(feedback)
        dock.addArrangedSubview(shell)
        dock.axis = .vertical
        dock.spacing = Space.space2
        dock.translatesAutoresizingMaskIntoConstraints = false
        addSubview(dock)

        let inset = Size.cComposerInset
        whatSpans = what.widthAnchor.constraint(equalTo: headRow.widthAnchor)
        noteHeight = note.heightAnchor.constraint(equalToConstant: Size.cComposerField)
        dockWidth = dock.widthAnchor.constraint(equalToConstant: Size.cComposerW)
        dockWidth.priority = .defaultHigh
        NSLayoutConstraint.activate([
            band.topAnchor.constraint(equalTo: topAnchor),
            headRow.topAnchor.constraint(equalTo: band.topAnchor, constant: Space.space2),
            headRow.bottomAnchor.constraint(equalTo: band.bottomAnchor, constant: -Space.space2),
            // The back button hangs `space-2` into the band's leading inset.
            headRow.leadingAnchor.constraint(equalTo: band.leadingAnchor, constant: Space.space3 - Space.space2),
            headRow.trailingAnchor.constraint(equalTo: band.trailingAnchor, constant: -Space.space3),
            body.topAnchor.constraint(equalTo: band.bottomAnchor, constant: Space.space3),
            body.bottomAnchor.constraint(equalTo: bottomAnchor),
            records.topAnchor.constraint(equalTo: body.topAnchor),
            records.bottomAnchor.constraint(equalTo: body.bottomAnchor),
            records.leadingAnchor.constraint(equalTo: body.leadingAnchor),
            records.trailingAnchor.constraint(equalTo: body.trailingAnchor),
            recordGrid.topAnchor.constraint(equalTo: records.contentLayoutGuide.topAnchor),
            recordGrid.leadingAnchor.constraint(equalTo: records.contentLayoutGuide.leadingAnchor),
            recordGrid.trailingAnchor.constraint(equalTo: records.contentLayoutGuide.trailingAnchor),
            recordGrid.bottomAnchor.constraint(equalTo: records.contentLayoutGuide.bottomAnchor),
            recordGrid.widthAnchor.constraint(equalTo: records.frameLayoutGuide.widthAnchor),
            problem.topAnchor.constraint(equalTo: body.topAnchor, constant: Space.space5),
            problem.leadingAnchor.constraint(equalTo: body.leadingAnchor),
            problem.trailingAnchor.constraint(lessThanOrEqualTo: body.trailingAnchor),
            opening.topAnchor.constraint(equalTo: body.topAnchor, constant: Space.space5),
            opening.leadingAnchor.constraint(equalTo: body.leadingAnchor, constant: Space.space5),
            opening.widthAnchor.constraint(equalTo: body.widthAnchor, multiplier: 0.42),
            material.topAnchor.constraint(equalTo: shell.topAnchor),
            material.bottomAnchor.constraint(equalTo: shell.bottomAnchor),
            material.leadingAnchor.constraint(equalTo: shell.leadingAnchor),
            material.trailingAnchor.constraint(equalTo: shell.trailingAnchor),
            row.topAnchor.constraint(equalTo: shell.topAnchor, constant: inset),
            row.bottomAnchor.constraint(equalTo: shell.bottomAnchor, constant: -inset),
            row.leadingAnchor.constraint(equalTo: shell.leadingAnchor, constant: Space.space3),
            row.trailingAnchor.constraint(equalTo: shell.trailingAnchor, constant: -inset),
            noteHeight,
            send.widthAnchor.constraint(equalToConstant: Size.cComposerField),
            send.heightAnchor.constraint(equalToConstant: Size.cComposerField),
            primary.heightAnchor.constraint(equalToConstant: Size.cComposerField),
            placeholder.topAnchor.constraint(equalTo: note.topAnchor, constant: 7),
            placeholder.leadingAnchor.constraint(equalTo: note.leadingAnchor),
            placeholder.widthAnchor.constraint(equalTo: note.widthAnchor),
            // 720 wide, centred, `space-4` over the pane's foot and its safe area; the pane's width under it.
            dockWidth,
            dock.widthAnchor.constraint(lessThanOrEqualTo: widthAnchor),
            dock.centerXAnchor.constraint(equalTo: centerXAnchor),
            dock.bottomAnchor.constraint(equalTo: safeAreaLayoutGuide.bottomAnchor, constant: -Space.space4),
            fade.leadingAnchor.constraint(equalTo: leadingAnchor),
            fade.trailingAnchor.constraint(equalTo: trailingAnchor),
            fade.bottomAnchor.constraint(equalTo: bottomAnchor),
            fade.topAnchor.constraint(equalTo: dock.topAnchor, constant: -Space.space8),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (page: DecisionPageView, _: UITraitCollection) in page.paint() }
        paint()
    }

    private func paint() {
        band.layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
        shell.layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
        shell.backgroundColor = UIAccessibility.isReduceTransparencyEnabled ? Palette.surfaceRaised : Palette.materialPanel
    }

    /// The page's gutters: the head and the record keep them; the live page runs edge to edge under them as the web's pane does.
    func inset(leading: Double, trailing: Double) {
        NSLayoutConstraint.deactivate(gutters)
        gutters = [
            band.leadingAnchor.constraint(equalTo: leadingAnchor, constant: leading),
            band.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -trailing),
            body.leadingAnchor.constraint(equalTo: leadingAnchor, constant: leading),
            body.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -trailing),
        ]
        NSLayoutConstraint.activate(gutters)
    }

    // MARK: Reading

    /// The page's read: on arrival, and again whenever the hub says its pages or tasks moved.
    func refresh(summary next: DecisionPageSummary?) {
        if let next { summary = next }
        let moves = (hub.decisionsChanged[projectId] ?? 0) + (hub.tasksChanged[projectId] ?? 0)
        if moves != seen {
            seen = moves
            Task { await load() }
        }
        render()
    }

    private func load() async {
        reads += 1
        let ticket = reads
        do {
            let next = try await ProjectTasks(hub: hub, projectId: projectId).decision(name)
            guard ticket == reads else { return }
            read = next
            unread = nil
        } catch {
            guard ticket == reads else { return }
            unread = error.localizedDescription
        }
        render()
    }

    /// What stands on the page for what was read; called again by the tab as the fleet moves.
    func render() {
        let state = read?.state ?? summary?.state
        let title = read?.title ?? summary?.title ?? name
        titleLabel.text = title
        let decided = read?.record != nil
        if let state {
            let picked = read?.picked ?? summary?.picked ?? 0, cards = read?.cards ?? summary?.cards ?? 0
            let made = read?.decided ?? summary?.decided ?? 0, tasks = read?.tasks ?? summary?.tasks ?? 0
            let words = DecisionWords.progress(picked: picked, cards: cards, decided: made, tasks: tasks, state: state)
            if let madeAt = read?.record?.madeAt, let at = try? Date(madeAt, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)) {
                figure.text = Words.Decisions.decidedAt(figure: words, age: RailAge.short(at.timeIntervalSince1970 * 1000, now: Date.now.timeIntervalSince1970 * 1000))
            } else {
                figure.text = words
            }
            ring.configure(done: DecisionWords.isDecided(state) ? 1 : Int(picked), total: DecisionWords.isDecided(state) ? 1 : Int(cards))
            ring.superview?.isHidden = false
        } else {
            ring.superview?.isHidden = true
        }
        let writer = read?.writer ?? summary?.writer
        let working = writer.map { hub.fleet.activityPulse($0.instanceId)?.activity == .working } ?? false
        let shownPill = state.flatMap { DecisionWords.pill(state: $0, writer: writer, working: working, short: false) }
        pill.show(shownPill)

        // The body.
        let artifact = read?.artifactId
        frameView?.isHidden = true
        records.isHidden = true
        problem.isHidden = true
        opening.isHidden = true
        if let unread, read == nil {
            problem.text = Words.Decisions.unread(problem: unread)
            problem.isHidden = false
        } else if let record = read?.record {
            records.isHidden = false
            showRecord(record)
        } else if let artifact, let read {
            if frameView?.artifactId != artifact {
                frameView?.removeFromSuperview()
                let made = DecisionPageFrame(hub: hub, projectId: projectId, artifactId: artifact, name: read.name, title: read.title)
                body.addSubview(made)
                NSLayoutConstraint.activate([
                    made.topAnchor.constraint(equalTo: body.topAnchor),
                    made.bottomAnchor.constraint(equalTo: body.bottomAnchor),
                    made.leadingAnchor.constraint(equalTo: body.leadingAnchor),
                    made.trailingAnchor.constraint(equalTo: body.trailingAnchor),
                ])
                frameView = made
            }
            frameView?.isHidden = false
        } else if read != nil {
            problem.text = Words.Decisions.gone
            problem.isHidden = false
        } else {
            opening.isHidden = false
        }

        // The one act: the next step, none once decided.
        let act: (label: String, pending: String)? = {
            guard let state, !decided, state != .decided else { return nil }
            return state == .picking ? (Words.Decisions.done, Words.Decisions.sending) : (Words.Decisions.makeTasks, Words.Decisions.making)
        }()
        primary.isHidden = act == nil
        if let act {
            let pending = acting || state == .making
            KitButton.setTitle(pending ? act.pending : act.label, of: primary, variant: .action, height: .sm)
            primary.configuration?.showsActivityIndicator = pending
            primary.isEnabled = !pending
        }
        let words = note.text.trimmingCharacters(in: .whitespacesAndNewlines)
        send.isEnabled = !words.isEmpty && !sendingNote
        send.configuration?.showsActivityIndicator = sendingNote
        placeholder.isHidden = !note.text.isEmpty
        layoutIfNeeded()
        let room = bounds.height - dock.frame.minY
        frameView?.insetBottom = max(0, room)
        records.contentInset.bottom = max(0, room) + Space.space4
        fade.solid = max(0, room)
        #if DEBUG
        sayPage(state: state, act: act?.label)
        #endif
    }

    #if DEBUG
    private var said = ""

    /// `decisions page …`: its state, its figure and pill, what its body
    /// shows, and its act's words and centre in the window, where a touch lands.
    private func sayPage(state: Components.Schemas.DecisionState?, act: String?) {
        guard ViewsProbe.on, window != nil else { return }
        let body = !records.isHidden ? "record" : frameView?.isHidden == false ? "live" : !problem.isHidden ? "problem" : "opening"
        let acting = act.map { "\($0)@\(ViewsProbe.centre(primary))" } ?? "none"
        let line = "decisions page name=\(name) state=\(state?.rawValue ?? "") figure=\(figure.text ?? "") pill=\(pill.isHidden ? "none" : pill.accessibilityLabel ?? "") body=\(body) act=\(acting)"
        guard line != said else { return }
        said = line
        ViewsProbe.say(line)
    }
    #endif

    /// The record on the page's own grid: two across from 1024pt, one under.
    private var shownRecord: [String] = []
    private func showRecord(_ record: Components.Schemas.DecisionRecord) {
        let wide = (window?.bounds.width ?? bounds.width) >= 1024
        let key = record.cards.map { "\($0.id):\($0.tasks.count)" } + [wide ? "wide" : "narrow"]
        guard key != shownRecord else { return }
        shownRecord = key
        recordGrid.arrangedSubviews.forEach { $0.removeFromSuperview() }
        let cards = record.cards.map { card -> UIView in
            let view = RecordCardView(card, hub: hub.address)
            view.taskOf = taskOf
            view.onOpenTask = { [weak self] id in self?.onOpenTask(id) }
            view.show()
            return view
        }
        let across = wide ? 2 : 1
        for start in stride(from: 0, to: cards.count, by: across) {
            let pair = UIStackView(arrangedSubviews: Array(cards[start ..< min(start + across, cards.count)]))
            if pair.arrangedSubviews.count < across { pair.addArrangedSubview(UIView()) }
            pair.axis = .horizontal
            pair.distribution = .fillEqually
            pair.alignment = .fill
            pair.spacing = Space.space3
            recordGrid.addArrangedSubview(pair)
        }
    }

    // MARK: Acting

    /// I'm done picking, or Make tasks: the page read again after; a refusal said over the dock.
    private func act() {
        guard let state = read?.state ?? summary?.state, !acting else { return }
        acting = true
        say(nil)
        render()
        Task { [weak self] in
            guard let self else { return }
            do {
                let api = try ProjectTasks(hub: hub, projectId: projectId)
                if state == .picking {
                    let sent = try await api.sendDecision(name)
                    #if DEBUG
                    ViewsProbe.say("decisions sent \(name) to=\(sent.to.rawValue)")
                    #endif
                    _ = sent
                } else {
                    read = try await api.makeDecisionTasks(name)
                    #if DEBUG
                    ViewsProbe.say("decisions tasks \(name) state=\(read?.state.rawValue ?? "")")
                    #endif
                }
                await load()
            } catch {
                say(error.localizedDescription)
            }
            acting = false
            render()
        }
    }

    /// The note, sent to the page's session (or Caw); the field empties once the hub has it.
    private func sendNote() {
        let words = note.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !words.isEmpty, !sendingNote else { return }
        sendingNote = true
        say(nil)
        render()
        Task { [weak self] in
            guard let self else { return }
            do {
                try await ProjectTasks(hub: hub, projectId: projectId).sendDecision(name, text: words)
                note.text = ""
                grow()
                await load()
            } catch {
                say(error.localizedDescription)
            }
            sendingNote = false
            render()
        }
    }

    private func say(_ refusal: String?) {
        feedback.text = refusal
        Motion.easeOut.animator(Motion.durFade) { self.feedback.isHidden = refusal == nil }.startAnimation()
        if let refusal { UIAccessibility.post(notification: .announcement, argument: refusal) }
    }

    func textViewDidChange(_: UITextView) {
        if feedback.isHidden == false { say(nil) }
        grow()
        render()
    }

    /// Return sends; Shift-Return (a hardware keyboard) breaks the line.
    func textView(_: UITextView, shouldChangeTextIn _: NSRange, replacementText text: String) -> Bool {
        guard text == "\n" else { return true }
        sendNote()
        return false
    }

    /// The field grows with its words from the composer's height to 200pt, then scrolls.
    private func grow() {
        let fit = note.sizeThatFits(CGSize(width: note.bounds.width, height: .greatestFiniteMagnitude)).height
        let height = min(200, max(Size.cComposerField, fit))
        note.isScrollEnabled = fit > 200
        guard abs(noteHeight.constant - height) > 0.5 else { return }
        noteHeight.constant = height
    }

    // MARK: The head's shape

    override func layoutSubviews() {
        super.layoutSubviews()
        // `.head-row` wraps: ‹ Decisions, then the title's group once it has under 14rem beside it.
        let room = band.bounds.width - Space.space3 * 2 - back.intrinsicContentSize.width - Space.space3
        let stacked = room < 224
        if (headRow.axis == .vertical) != stacked {
            headRow.axis = stacked ? .vertical : .horizontal
            headRow.alignment = stacked ? .leading : .center
            whatSpans.isActive = stacked
        }
        dockWidth.constant = (window?.bounds.width ?? bounds.width) < 900 ? bounds.width : Size.cComposerW
    }
}

/// A decision page's state, in its word and hue (StatePill.svelte): sent
/// while its session works on it (`status-pill-live`), decided once its
/// record stands (`status-pill-done`); a page still picked on has none.
final class StatePillView: UIView {
    private let label = KitLabel(TypeScale.typeLabel, ink: Palette.statusLiveInk)

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = 12
        layer.cornerCurve = .continuous
        label.lineBreakMode = .byTruncatingTail
        label.translatesAutoresizingMaskIntoConstraints = false
        addSubview(label)
        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: 24),
            label.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10),
            label.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10),
            label.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        setContentHuggingPriority(.required, for: .horizontal)
        isAccessibilityElement = true
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("StatePillView is built in code")
    }

    /// The tint and the word move with the state over `durPanel`.
    func show(_ pill: DecisionWords.Pill?) {
        isHidden = pill == nil
        guard let pill else { return }
        label.text = pill.who.map { "\(pill.word) · \($0)" } ?? pill.word
        accessibilityLabel = pill.title
        let ground = pill.tone == .done ? Palette.statusDoneBg : Palette.statusLiveBg
        let ink = pill.tone == .done ? Palette.statusDoneInk : Palette.statusLiveInk
        guard backgroundColor != ground else { return }
        let paint: @MainActor @Sendable () -> Void = { self.backgroundColor = ground; self.label.textColor = ink }
        if window != nil, !UIAccessibility.isReduceMotionEnabled {
            Motion.easeOut.animator(Motion.durPanel, animations: paint).startAnimation()
        } else {
            paint()
        }
    }
}

/// What a dock stands over (FootFade.svelte with `solid`): the recess solid
/// from the pane's foot up to the dock's top, then dissolving over `space-8`.
final class FootFade: UIView {
    private let gradient = CAGradientLayer()
    var solid = 0.0 { didSet { if solid != oldValue { setNeedsLayout() } } }

    init() {
        super.init(frame: .zero)
        layer.addSublayer(gradient)
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (fade: FootFade, _: UITraitCollection) in fade.setNeedsLayout() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("FootFade is built in code")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        gradient.frame = bounds
        let ink = Palette.surfaceRecess.resolvedColor(with: traitCollection)
        gradient.colors = [ink.withAlphaComponent(0).cgColor, ink.cgColor, ink.cgColor]
        let edge = bounds.height > 0 ? max(0, min(1, 1 - solid / bounds.height)) : 1
        gradient.locations = [0, NSNumber(value: edge), 1]
        CATransaction.commit()
    }
}

/// A decision page, live (PageFrame.svelte): the project's page, on the
/// project's own preview origin at `/__cawco/page/<id>/`, whichever session
/// wrote it and whether or not it still stands
/// (hub preview.ts). Its overlay joins the page's document itself (the
/// `cawco:hello` names it), so a pick here is a pick in the panel and every
/// other view, and a revision morphs in place. It draws in the app's
/// scheme and pads its foot for the docked composer (`inset.bottom`). Host
/// mode enters with a pass of its own; a lapsed pass enters again once.
final class DecisionPageFrame: UIView, WKScriptMessageHandler, WKNavigationDelegate {
    let artifactId: String
    private let hub: HubConnection
    private let projectId: String
    private let name: String
    private var web: WKWebView!
    private let problem = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
    private let opening = SkeletonView(height: 11)
    private var route: PreviewRoute?
    private var connected = false
    private var turnedAway = 0

    /// What the docked composer covers of the page's foot.
    var insetBottom = 0.0 {
        didSet {
            guard abs(insetBottom - oldValue) > 0.5, connected else { return }
            deliver(["type": "cawco:place", "inset": ["bottom": insetBottom]])
        }
    }

    init(hub: HubConnection, projectId: String, artifactId: String, name: String, title: String) {
        self.hub = hub
        self.projectId = projectId
        self.artifactId = artifactId
        self.name = name
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        // Laid out at the pane's width, as the web's iframe lays it out.
        configuration.userContentController.addUserScript(WKUserScript(source: PreviewController.viewport, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        configuration.userContentController.addUserScript(WKUserScript(source: PreviewController.host, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        configuration.userContentController.add(WeakHandler(self), name: "cawco")
        web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = self
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.backgroundColor = .clear
        web.isInspectable = true
        web.accessibilityLabel = title
        web.alpha = 0
        web.translatesAutoresizingMaskIntoConstraints = false
        problem.isHidden = true
        problem.translatesAutoresizingMaskIntoConstraints = false
        opening.translatesAutoresizingMaskIntoConstraints = false
        for part in [web!, problem, opening] as [UIView] { addSubview(part) }
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: topAnchor),
            web.bottomAnchor.constraint(equalTo: bottomAnchor),
            web.leadingAnchor.constraint(equalTo: leadingAnchor),
            web.trailingAnchor.constraint(equalTo: trailingAnchor),
            problem.topAnchor.constraint(equalTo: topAnchor, constant: Space.space5),
            problem.leadingAnchor.constraint(equalTo: leadingAnchor),
            problem.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor),
            opening.topAnchor.constraint(equalTo: topAnchor, constant: Space.space5),
            opening.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space5),
            opening.widthAnchor.constraint(equalTo: widthAnchor, multiplier: 0.42),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (frame: DecisionPageFrame, _: UITraitCollection) in
            guard frame.connected else { return }
            frame.deliver(["type": "cawco:theme", "theme": frame.theme])
        }
        enter()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("DecisionPageFrame is built in code")
    }

    private var theme: String { traitCollection.userInterfaceStyle == .dark ? "dark" : "light" }

    private var place: URL? {
        route?.origin.appending(components: "__cawco", "page", artifactId, directoryHint: .isDirectory)
    }

    /// Where its project's pages are served, asked once, then entered (with a ticket in host mode).
    private func enter() {
        Task { [weak self] in
            guard let self else { return }
            do {
                let found: PreviewRoute
                if let route {
                    found = route
                } else {
                    found = try await hub.previewAddress(.project(projectId))
                }
                route = found
                guard let place else { return }
                web.load(URLRequest(url: try await hub.previewLoad(place, for: .project(projectId), byHost: found.byHost)))
            } catch {
                fail(error.localizedDescription)
            }
        }
    }

    private func fail(_ words: String) {
        problem.text = words
        problem.isHidden = false
        opening.isHidden = true
        web.alpha = 0
    }

    private func hello() {
        connected = false
        deliver([
            "type": "cawco:hello",
            "theme": theme,
            "artifact": ["id": artifactId, "kind": "page", "name": name],
            "sync": "/__cawco/artifact/\(artifactId)",
            "inset": ["bottom": insetBottom],
        ])
    }

    private func deliver(_ message: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: message), let json = String(data: data, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.__cawcoDeliver && window.__cawcoDeliver(\(json))")
    }

    /// Only the overlay's own words are heard, and only from the page's own origin.
    func userContentController(_: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let said = message.body as? String, said.utf8.count <= 4096,
              let data = said.data(using: .utf8),
              let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = body["type"] as? String else { return }
        switch type {
        case "cawco:loaded":
            hello()
        case "cawco:ready":
            connected = true
            turnedAway = 0
            opening.isHidden = true
            Motion.easeOut.animator(Motion.durFade) { self.web.alpha = 1 }.startAnimation()
        case "cawco:locked":
            turnedAway += 1
            guard turnedAway <= 1 else { return fail(Words.Decisions.turnedAway) }
            enter()
        default:
            break
        }
    }

    func webView(_: WKWebView, didFailProvisionalNavigation _: WKNavigation!, withError error: any Error) {
        guard !HubConnection.interruptedByPolicy(error) else { return }
        let host = route.map { $0.origin.host() ?? $0.origin.absoluteString } ?? ""
        fail(Words.Decisions.unreached(host: host))
    }

    func webView(_: WKWebView, didFail _: WKNavigation!, withError error: any Error) {
        guard !HubConnection.interruptedByPolicy(error) else { return }
        fail(error.localizedDescription)
    }
}
