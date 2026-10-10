import CawCoCore
import OSLog
import UIKit

/// The one human-in-the-loop surface, parked above the composer
/// (transcript/Prompt.svelte `.hitl`): a permission gate, who asks and what
/// will happen over the change itself and its fields, then Approve and Deny
/// as symmetric recessed peers at opposite ends, or a question, its options
/// as chips led by keycaps, then
/// Answer and Dismiss. The pressed button pends with its own label while its
/// peers dim; a refusal stops it and says why under the buttons.
///
/// A question can be minimized, by the chevron in its head or a swipe down
/// on the card: the card folds to a one-line bar, the tray row's chip
/// (`TrayChipView`), Caw's needs-you face, what it asks and a chevron, so the
/// transcript reads behind it. A tap on the bar brings the card back.
/// Minimizing answers nothing; the ask stays parked (MinimizedAsks).
///
/// The card is its head, its body and its foot (Prompt.svelte `h2`, `.body`,
/// `.foot`). It stands in the composer's column, which the dock holds between
/// the tab strip and the keyboard's top (ComposerDock), so the room over the
/// tray row and the pill is all it gets. When that room is shorter than the
/// card, only the body gives: it scrolls inside the card between the head and
/// the foot, which keep their places, and the buttons stay on the card's foot.
@MainActor
public final class PromptCardView: UIView, UIGestureRecognizerDelegate {
    public enum Choice: Sendable {
        case allow, deny, answer
    }

    public let ask: ParkedAsk
    /// Settles the ask: `answers` holds the picks, by question, for `.answer`.
    public var onAnswer: (Choice, [String: [String]]) -> Void = { _, _ in }
    /// The card changed height (a disclosure, a wait line).
    public var onHeight: () -> Void = {}
    /// The card folded to its bar or opened again: the composer gives the
    /// bar the tray row's place, or the row back (ComposerView `syncLift`).
    var onFold: () -> Void = {}

    private var picks: [String: [String]] = [:]
    /// Which question the digits answer: the first one still unanswered.
    private var current = 0
    private var pressed: Choice?
    private var refused: String?
    private var connected = true
    private var chips: [[OptionChip]] = []
    private var buttons: [Choice: UIButton] = [:]
    private let wait = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    /// The card in full: everything but the minimized bar. Its head, then
    /// `scroll`, then `foot`.
    private let column = UIStackView()
    /// The ask's words and its options (a permission's change and fields).
    private let body = UIStackView()
    /// The body's window: as tall as the body while the room allows, shorter
    /// and scrolling when it does not (`.body { flex: 1 1 auto; min-block-size: 0;
    /// overflow-y: auto }`).
    private let scroll: UIScrollView
    /// The body's step to the foot: the gap its last row keeps under it.
    private var bodyGap = 0.0
    /// The buttons and the wait line under them, never scrolled away (`.foot { flex: none }`).
    private let foot = UIStackView()
    /// The body's window as tall as the body. Below every row's compression
    /// resistance (750), so a short room shortens the window, never a row;
    /// above hugging (250).
    private let fits: NSLayoutConstraint
    private static let fitsPriority: Float = 700
    /// Where the card stands among the cards on the pill, counted down from
    /// the pill: the farther one gives its room first (ComposerView `syncPrompts`).
    var roomRank = 0 {
        didSet { fits.priority = UILayoutPriority(Self.fitsPriority - Float(min(roomRank, 40))) }
    }

    /// The body ran past its window as of the last layout.
    private var overflowed = false
    /// The minimized question's bar; a permission has none.
    private var bar: PromptBar?
    /// Folded to its bar: what the reader set on this device (MinimizedAsks).
    public private(set) var minimized = false

    /// `face` draws Caw's needs-you face for a question's minimized bar, and
    /// `diff` one change a permission makes: both live above this module.
    public init(_ ask: ParkedAsk, arriving: Bool, face: () -> UIView, diff: (PermissionChange) -> UIView) {
        self.ask = ask
        let scroll = UIScrollView()
        self.scroll = scroll
        let fits = scroll.frameLayoutGuide.heightAnchor.constraint(equalTo: scroll.contentLayoutGuide.heightAnchor)
        fits.priority = UILayoutPriority(Self.fitsPriority)
        self.fits = fits
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusLg
        layer.cornerCurve = .continuous
        isAccessibilityElement = false
        // One group to VoiceOver, named for what asks.
        accessibilityContainerType = .semanticGroup
        accessibilityIdentifier = "prompt-card"
        accessibilityLabel = ask.isQuestion ? "Question from the agent" : "Permission request from \(ask.presentation.asker)"
        // The card in full and its bar are one column's two rows, one shown.
        let faces = UIStackView()
        faces.axis = .vertical
        faces.translatesAutoresizingMaskIntoConstraints = false
        addSubview(faces)
        NSLayoutConstraint.activate([
            faces.leadingAnchor.constraint(equalTo: leadingAnchor),
            faces.trailingAnchor.constraint(equalTo: trailingAnchor),
            faces.topAnchor.constraint(equalTo: topAnchor),
            faces.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        column.axis = .vertical
        // `.hitl`: its padding starts inside its 1px border.
        let inset = Space.space3 + 1
        column.isLayoutMarginsRelativeArrangement = true
        column.directionalLayoutMargins = NSDirectionalEdgeInsets(top: inset, leading: inset, bottom: inset, trailing: inset)
        faces.addArrangedSubview(column)
        body.axis = .vertical
        body.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(body)
        scroll.showsHorizontalScrollIndicator = false
        scroll.contentInsetAdjustmentBehavior = .never
        NSLayoutConstraint.activate([
            body.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
            body.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
            body.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            body.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            body.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
            scroll.heightAnchor.constraint(greaterThanOrEqualToConstant: 0),
            fits,
        ])
        foot.axis = .vertical
        if ask.isQuestion {
            buildQuestion()
            let made = PromptBar(face: face(), words: ask.questions.first?.question ?? "Question from the agent")
            made.addAction(UIAction { [weak self] _ in self?.setMinimized(false) }, for: .touchUpInside)
            faces.addArrangedSubview(made)
            bar = made
            let swipe = UISwipeGestureRecognizer(target: self, action: #selector(swiped))
            swipe.direction = .down
            swipe.delegate = self
            addGestureRecognizer(swipe)
        } else {
            buildPermission(diff: diff)
        }
        column.addArrangedSubview(scroll)
        column.setCustomSpacing(bodyGap, after: scroll)
        wait.isHidden = true
        wait.wrap = .pretty
        foot.addArrangedSubview(wait)
        column.addArrangedSubview(foot)
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (card: PromptCardView, _: UITraitCollection) in
            card.paint()
        }
        minimized = ask.isQuestion && MinimizedAsks.contains(ask.requestId)
        showFace()
        render()
        if arriving, !minimized { settle() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("PromptCardView is built in code")
    }

    private func paint() {
        layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
    }

    // MARK: Minimized

    @objc private func swiped() {
        if !minimized { setMinimized(true) }
    }

    /// A swipe down that starts in the body counts only while the body is at
    /// its top, where a downward pull has nothing to scroll (Prompt.svelte
    /// `swipeStart`); the head and the foot always count.
    public func gestureRecognizer(_: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        !scroll.bounds.contains(touch.location(in: scroll)) || scroll.contentOffset.y <= 0
    }

    /// At the body's top its pull and the swipe are the one gesture.
    public func gestureRecognizer(_: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        other === scroll.panGestureRecognizer
    }

    override public func layoutSubviews() {
        super.layoutSubviews()
        // The body has just run past its window: its indicator shows once
        // that there is more under the foot.
        let overflows = scroll.contentSize.height > scroll.bounds.height + 0.5
        if overflows, !overflowed, !scroll.isHidden, window != nil { scroll.flashScrollIndicators() }
        overflowed = overflows
        #if DEBUG
        logLayout()
        #endif
    }

    #if DEBUG
    /// A simulator pass reads the body's window here
    /// (scripts/probe-ios-question-keyboard.ts): the accessibility tree gives
    /// each chip's frame, never where the body clips it. In the card's own
    /// points, with its last button's frame to place them on screen by.
    private static let layoutLog = Logger(subsystem: "dev.cawco.app", category: "PromptCard")
    private var loggedLayout = ""

    private func logLayout() {
        guard let last = buttons[.deny], !minimized else { return }
        // The stacks inside place the body after the card's own pass.
        column.superview?.layoutIfNeeded()
        let body = scroll.convert(scroll.bounds, to: self)
        let anchor = last.convert(last.bounds, to: self)
        let line = "ask=\(ask.requestId) " + String(format: "card=%.1f,%.1f anchor=%.1f,%.1f body=%.1f,%.1f content=%.1f",
                                                    bounds.width, bounds.height, anchor.minX, anchor.minY,
                                                    body.minY, body.maxY, scroll.contentSize.height)
        guard line != loggedLayout else { return }
        loggedLayout = line
        Self.layoutLog.notice("\(line, privacy: .public)")
    }
    #endif

    /// Folds the question to its bar or opens it again; answers nothing.
    private func setMinimized(_ on: Bool) {
        guard ask.isQuestion, on != minimized else { return }
        minimized = on
        MinimizedAsks.set(ask.requestId, on)
        let apply = {
            self.showFace()
            self.onFold()
            // The card, the tray row it hands over and the composer's place
            // over the transcript all move in the one pass.
            self.window?.layoutIfNeeded()
        }
        if window != nil, !UIAccessibility.isReduceMotionEnabled {
            // Put down fast; brought back over the card's own arrival
            // (`settle`, two `durControl`): exits run quicker than entrances.
            let duration = on ? Motion.durControl : Motion.durControl * 2
            Motion.easeOut.animator(duration) { apply() }.startAnimation()
        } else {
            apply()
        }
        onHeight()
        // The keys follow what the reader is now looking at.
        UIAccessibility.post(notification: .layoutChanged, argument: on ? bar : column)
    }

    /// The card's surface in full; minimized, the bar draws its own.
    private func showFace() {
        column.isHidden = minimized
        column.alpha = minimized ? 0 : 1
        bar?.isHidden = !minimized
        bar?.alpha = minimized ? 1 : 0
        if minimized { bar?.revealed() }
        backgroundColor = minimized ? .clear : Palette.surfaceRaised
        layer.borderWidth = minimized ? 0 : 1
        boxShadow = minimized ? [] : Shadow.shadowHairline
        paint()
    }

    /// The one settle when it comes in while its session is watched: up 8pt
    /// and in over two `durControl` on the out curve, then completely still.
    private func settle() {
        guard !UIAccessibility.isReduceMotionEnabled else { return }
        alpha = 0
        transform = CGAffineTransform(translationX: 0, y: 8)
        Motion.easeOut.animator(Motion.durControl * 2) {
            self.alpha = 1
            self.transform = .identity
        }.startAnimation()
    }

    // MARK: Head

    private func head(_ words: String, minimizes: Bool = false) -> UIView {
        let pill = UIStackView()
        pill.axis = .horizontal
        pill.spacing = Space.space1
        pill.alignment = .center
        pill.isLayoutMarginsRelativeArrangement = true
        pill.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: Space.space2, bottom: 0, trailing: Space.space2)
        pill.backgroundColor = Palette.statusAttnBg
        pill.layer.cornerRadius = 10
        pill.addArrangedSubview(GlyphView(.arrowUp, size: 12, tint: Palette.statusAttnInk))
        let needs = KitLabel(TypeScale.typeLabel, ink: Palette.statusAttnInk)
        needs.text = "needs you"
        pill.addArrangedSubview(needs)
        pill.heightAnchor.constraint(equalToConstant: 20).isActive = true
        let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
        title.text = words
        // The pill and the title as wide as their words; the row's rest is empty.
        pill.setContentHuggingPriority(.required, for: .horizontal)
        pill.setContentCompressionResistancePriority(.required, for: .horizontal)
        title.setContentHuggingPriority(.required, for: .horizontal)
        let row = UIStackView(arrangedSubviews: [pill, title, UIView()])
        row.spacing = Space.space2
        row.alignment = .center
        row.isAccessibilityElement = true
        row.accessibilityLabel = "Needs you. \(words)"
        row.accessibilityTraits = .header
        guard minimizes else { return row }
        // The question's minimize chevron ends the head (Prompt.svelte
        // `.minimize`): muted ink in a 24pt box; the window gives it its 44pt
        // reach (TouchReach).
        let minimize = UIButton(type: .system)
        minimize.setImage(Glyph.chevronDown.image.resized(to: 16), for: .normal)
        minimize.tintColor = Palette.inkMuted
        minimize.accessibilityLabel = "Minimize question"
        minimize.addAction(UIAction { [weak self] _ in self?.setMinimized(true) }, for: .touchUpInside)
        NSLayoutConstraint.activate([
            minimize.widthAnchor.constraint(equalToConstant: 24),
            minimize.heightAnchor.constraint(equalToConstant: 24),
        ])
        minimize.setContentHuggingPriority(.required, for: .horizontal)
        let line = UIStackView(arrangedSubviews: [row, minimize])
        line.spacing = Space.space2
        line.alignment = .center
        return line
    }

    private func lede(_ text: String) -> KitLabel {
        let label = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong, lines: 0)
        label.role = TypeRole(weight: TypeScale.typeBody.weight, size: TypeScale.typeBody.size, leading: TypeScale.leadingBody, family: TypeScale.typeBody.family)
        label.text = text
        label.wrap = .pretty
        return label
    }

    // MARK: Question

    /// Puts `row` in the body, `gap` over whatever follows it.
    private func place(_ row: UIView, gap: Double) {
        body.addArrangedSubview(row)
        body.setCustomSpacing(gap, after: row)
        bodyGap = gap
    }

    private func buildQuestion() {
        let top = head("Question from the agent", minimizes: true)
        column.addArrangedSubview(top)
        column.setCustomSpacing(Space.space2, after: top)
        for (qi, question) in ask.questions.enumerated() {
            // The lede's 7 and the options' 2 are adjoining margins: they collapse to 7.
            place(lede(question.question), gap: Space.space2)
            var row: [OptionChip] = []
            for (i, option) in question.options.enumerated() {
                let chip = OptionChip(key: i + 1, label: option.label)
                chip.accessibilityIdentifier = "prompt-option-\(qi + 1)-\(i + 1)"
                // A plain UIControl sends touchUpInside, never primaryActionTriggered.
                chip.addAction(UIAction { [weak self] _ in self?.toggle(qi, option.label) }, for: .touchUpInside)
                row.append(chip)
            }
            chips.append(row)
            place(WrapLayout(row), gap: Space.space2)
        }
        let answer = Self.button("Answer", glyph: Glyph.answer, kind: .primary) { [weak self] in self?.submitQuestion() }
        let dismiss = Self.button("Dismiss", glyph: nil, kind: .outline) { [weak self] in self?.choose(.deny) }
        answer.accessibilityIdentifier = "prompt-answer"
        dismiss.accessibilityIdentifier = "prompt-dismiss"
        buttons = [.answer: answer, .deny: dismiss]
        let actions = UIStackView(arrangedSubviews: [answer, dismiss, UIView()])
        actions.spacing = Space.space2
        foot.addArrangedSubview(actions)
    }

    private func toggle(_ index: Int, _ label: String) {
        guard answerable, index < ask.questions.count else { return }
        let question = ask.questions[index]
        current = index
        var chosen = picks[question.question] ?? []
        if question.multiSelect == true {
            if chosen.contains(label) { chosen.removeAll { $0 == label } } else { chosen.append(label) }
        } else {
            // Re-picking the chosen option clears it, so a mis-keyed digit undoes with the same digit.
            chosen = chosen == [label] ? [] : [label]
        }
        picks[question.question] = chosen
        if !chosen.isEmpty, question.multiSelect != true,
           let next = ask.questions.firstIndex(where: { (picks[$0.question] ?? []).isEmpty }) {
            current = next
        }
        #if DEBUG
        // What a tap picked, for the same simulator pass.
        Self.layoutLog.notice("pick q=\(index + 1, privacy: .public) \"\(label, privacy: .public)\" answered=\(self.allAnswered, privacy: .public)")
        #endif
        render()
    }

    private var allAnswered: Bool {
        !ask.questions.isEmpty && ask.questions.allSatisfy { !(picks[$0.question] ?? []).isEmpty }
    }

    private func submitQuestion() {
        guard answerable, allAnswered else { return }
        pressed = .answer
        refused = nil
        onAnswer(.answer, picks)
        render()
    }

    // MARK: Permission

    /// Who asks, what will happen and to what, how much changes, then the
    /// change and the fields, open (Prompt.svelte's permission body). The
    /// words are the hub's, the same on the web and in Telegram.
    private func buildPermission(diff: (PermissionChange) -> UIView) {
        let presentation = ask.presentation
        let top = head("\(presentation.asker) asks for permission")
        column.addArrangedSubview(top)
        column.setCustomSpacing(Space.space2, after: top)
        let words = lede(presentation.summary)
        words.role = TypeRole(weight: TypeScale.weightStrong, size: TypeScale.typeBody.size, leading: TypeScale.leadingBody, family: TypeScale.typeBody.family)
        if let detail = presentation.detail {
            place(words, gap: Space.space1)
            let line = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted, lines: 0)
            line.role = TypeRole(weight: TypeScale.weightBody, size: TypeScale.typeLabel.size, leading: TypeScale.typeLabel.leading, family: TypeScale.typeLabel.family)
            line.text = detail
            place(line, gap: Space.space2)
        } else {
            place(words, gap: Space.space2)
        }
        if let command = ask.command {
            let text = KitLabel(TypeScale.typeCode, ink: Palette.inkStrong, lines: 0)
            text.role = TypeRole(weight: .regular, size: TypeScale.textLabel ... TypeScale.textLabel, leading: TypeScale.leadingCode, family: FontFamily.fontMono)
            text.text = command
            let rule = UIView()
            rule.backgroundColor = Palette.borderHairline
            rule.widthAnchor.constraint(equalToConstant: 2).isActive = true
            let block = UIStackView(arrangedSubviews: [rule, text])
            block.spacing = Space.space3
            block.isLayoutMarginsRelativeArrangement = true
            block.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 3, leading: 0, bottom: 3, trailing: 0)
            place(block, gap: Space.space2)
        }
        // The change itself, open: a grant is made on what it changes.
        for change in presentation.changes {
            place(diff(change), gap: Space.space2)
        }
        // The rest of the input, shown, its secrets already hidden by the hub.
        if !presentation.fields.isEmpty {
            let fields = UIStackView()
            fields.axis = .vertical
            fields.spacing = Space.space2
            fields.isLayoutMarginsRelativeArrangement = true
            fields.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space3, leading: Space.space3, bottom: Space.space3, trailing: Space.space3)
            fields.backgroundColor = Palette.surfaceRecess
            fields.layer.cornerRadius = Radius.radiusSm
            fields.layer.cornerCurve = .continuous
            for field in presentation.fields {
                let key = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted)
                key.text = field.key
                let value = KitLabel(TypeScale.typeCode, ink: Palette.inkStrong, lines: 12)
                value.role = TypeRole(weight: .regular, size: TypeScale.textMeta ... TypeScale.textMeta, leading: TypeScale.leadingCode, family: FontFamily.fontMono)
                value.text = field.value
                let pair = UIStackView(arrangedSubviews: [key, value])
                pair.axis = .vertical
                pair.spacing = Space.space1
                pair.isAccessibilityElement = true
                pair.accessibilityLabel = "\(field.key): \(field.value)"
                fields.addArrangedSubview(pair)
            }
            place(fields, gap: Space.space3)
        }

        let approve = Self.button("Approve", glyph: .tick, kind: .grant) { [weak self] in self?.choose(.allow) }
        let deny = Self.button("Deny", glyph: .close, kind: .refuse) { [weak self] in self?.choose(.deny) }
        approve.accessibilityIdentifier = "prompt-approve"
        deny.accessibilityIdentifier = "prompt-deny"
        buttons = [.allow: approve, .deny: deny]
        // The full width between grant and refusal, never less than 32pt.
        let choice = UIStackView(arrangedSubviews: [approve, UIView(), deny])
        choice.spacing = Space.space8
        foot.addArrangedSubview(choice)
    }

    // MARK: Answering

    private var outside = false
    private var answerable: Bool { pressed == nil && connected && !outside }

    private func choose(_ choice: Choice) {
        guard answerable else { return }
        pressed = choice
        refused = nil
        onAnswer(choice, [:])
        render()
    }

    /// The hub's word on this card's answer, and whether it can be sent at all.
    public func update(sent: Ledger.Command?, connected: Bool) {
        self.connected = connected
        if let sent, sent.stage == .failed {
            refused = sent.reason.map { "Couldn't send that answer. \($0)" } ?? "Couldn't send that answer."
        } else {
            refused = nil
        }
        // An answer already out from another surface (the board's card):
        // nothing here can be pressed until the hub settles it.
        outside = pressed == nil && sent.map { $0.stage != .failed } == true
        render()
    }

    /// The answer never left this device: the card is answerable again,
    /// with the reason under it.
    public func refuse(_ reason: String) {
        refused = reason
        render()
    }

    /// The keys the card advertises: a digit picks the option wearing it,
    /// Return sends once every question is answered. Escape is never one of
    /// them: a question is put down only by its own Dismiss button.
    @discardableResult
    public func key(_ input: String) -> Bool {
        // A minimized question takes no keys: nothing hidden is answered.
        guard answerable, !minimized else { return false }
        if ask.isQuestion, let digit = Int(input), (1 ... 9).contains(digit),
           current < ask.questions.count, digit <= ask.questions[current].options.count {
            toggle(current, ask.questions[current].options[digit - 1].label)
            return true
        }
        if input == "\r", ask.isQuestion, allAnswered {
            submitQuestion()
            return true
        }
        return false
    }

    private func render() {
        // Refused, the card is answerable again; the reason stays under it.
        if refused != nil { pressed = nil }
        for (choice, button) in buttons {
            let pending = pressed == choice
            // Before an answer every button is live while the hub is; after
            // one, the pressed button pends and its peers dim.
            button.isEnabled = pressed == nil ? connected && !outside : pending
            Self.setPending(button, pending, label: Self.pendingLabel(choice, question: ask.isQuestion))
        }
        if let answer = buttons[.answer], pressed == nil {
            answer.isEnabled = connected && !outside && allAnswered
        }
        for (qi, row) in chips.enumerated() {
            let question = ask.questions[qi]
            for (i, chip) in row.enumerated() {
                let label = question.options[i].label
                chip.configure(selected: (picks[question.question] ?? []).contains(label), live: qi == current && i < 9, enabled: answerable)
            }
        }
        let line: String? = refused ?? (pressed == nil && !connected ? "Reconnecting — can't answer yet." : nil)
        let changed = wait.isHidden != (line == nil)
        wait.text = line
        wait.ink = refused != nil ? Palette.statusFailInk : Palette.inkMuted
        wait.isHidden = line == nil
        if changed { onHeight() }
    }

    private static func pendingLabel(_ choice: Choice, question: Bool) -> String {
        switch choice {
        case .allow: "Approving…"
        case .deny: question ? "Dismissing…" : "Denying…"
        case .answer: "Answering…"
        }
    }

    // MARK: Buttons

    public enum ButtonKind {
        /// The question's Answer: the action surface, a step wider.
        case primary
        case outline
        /// Approve: recessed, the check in strong ink.
        case grant
        /// Deny: recessed, the cross in muted ink.
        case refuse
    }

    /// The card's buttons (Prompt.svelte `btnBase`): 44pt on touch, radius 8,
    /// the label role, 11pt in (14 for Answer), a 12pt glyph 7pt off. A
    /// move's approval card answers with the same ones.
    public static func button(_ title: String, glyph: Glyph?, kind: ButtonKind, action: @escaping () -> Void) -> UIButton {
        let variant: KitButton.Variant = switch kind {
        case .primary: .action
        case .outline: .outline
        case .grant, .refuse: .secondary
        }
        let ink: UIColor = switch kind {
        case .primary: Palette.onAction
        case .outline, .grant: Palette.inkStrong
        case .refuse: Palette.inkMuted
        }
        let button = KitButton.make(title, glyph: glyph, glyphTint: ink, variant: variant, height: .lg, action: action)
        var config = button.configuration
        config?.attributedTitle = AttributedString(title, attributes: TypeScale.typeLabel.container(color: ink, tracking: -0.01))
        config?.image = glyph?.image.resized(to: 12)
        config?.imagePadding = Space.space2
        // The web button's 1px border is part of its box, as in `KitButton`.
        let pad = (kind == .primary ? Space.space4 : Space.space3) + 1
        config?.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: pad, bottom: 0, trailing: pad)
        config?.background.cornerRadius = Radius.radiusSm
        config?.background.customView?.layer.cornerRadius = Radius.radiusSm
        button.configuration = config
        button.accessibilityLabel = title
        button.setContentHuggingPriority(.required, for: .horizontal)
        return button
    }

    /// A pressed button pends: its label morphs to what it is doing, a
    /// spinner turning in its glyph's place.
    public static func setPending(_ button: UIButton, _ pending: Bool, label: String) {
        let key = "pending"
        let showing = button.layer.value(forKey: key) as? Bool ?? false
        guard showing != pending else { return }
        button.layer.setValue(pending, forKey: key)
        guard var config = button.configuration else { return }
        let resting = button.layer.value(forKey: "resting") as? AttributedString ?? config.attributedTitle
        let restingImage = button.layer.value(forKey: "restingImage") as? UIImage ?? config.image
        if pending {
            button.layer.setValue(resting, forKey: "resting")
            if let restingImage { button.layer.setValue(restingImage, forKey: "restingImage") }
            var title = resting ?? AttributedString(label)
            title.characters.replaceSubrange(title.startIndex ..< title.endIndex, with: label)
            config.attributedTitle = title
            config.image = SpinnerView.still(side: 12)
        } else {
            config.attributedTitle = resting
            config.image = restingImage
        }
        button.configuration = config
        let spin = CABasicAnimation(keyPath: "transform.rotation.z")
        spin.fromValue = 0
        spin.toValue = Double.pi * 2
        spin.duration = 1
        spin.repeatCount = .infinity
        if pending { button.imageView?.layer.add(spin, forKey: "spin") } else { button.imageView?.layer.removeAnimation(forKey: "spin") }
        button.accessibilityValue = pending ? label : nil
    }
}

extension SpinnerView {
    /// The kit spinner drawn once, for a button's glyph slot that turns it.
    static func still(side: Double) -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: side, height: side)).image { context in
            let rect = CGRect(x: 0, y: 0, width: side, height: side)
            let ctx = context.cgContext
            let width = 2.5 * side / 24
            let radius = side * 9 / 24
            ctx.setLineWidth(width)
            ctx.setLineCap(.round)
            ctx.setStrokeColor(UIColor.black.withAlphaComponent(0.25).cgColor)
            ctx.addArc(center: CGPoint(x: rect.midX, y: rect.midY), radius: radius, startAngle: 0, endAngle: .pi * 2, clockwise: false)
            ctx.strokePath()
            ctx.setStrokeColor(UIColor.black.cgColor)
            ctx.addArc(center: CGPoint(x: rect.midX, y: rect.midY), radius: radius, startAngle: -.pi / 2, endAngle: 0, clockwise: false)
            ctx.strokePath()
        }.withRenderingMode(.alwaysTemplate)
    }
}

/// A drawing that must be painted again when the view it stands in is shown:
/// Caw's mark (CawCoMascot `CawMark`) pauses after its first second, and one
/// loaded while hidden has never been painted.
@MainActor
public protocol RedrawsOnReveal: UIView {
    func redraw()
}

/// A minimized question (Composer.svelte `.asked-chip`): the tray row's chip
/// in its needs tone (`TrayChipView`), the card's whole width, a coarse tray
/// chip's height. Caw's needs-you face, what the question asks on one line,
/// and the chevron it comes back up by.
final class PromptBar: UIControl {
    private let surface = UIView()
    private let face: UIView

    /// The bar is on screen again: Caw's face is painted, not left as it
    /// paused while the bar was hidden.
    func revealed() {
        (face as? RedrawsOnReveal)?.redraw()
    }

    init(face: UIView, words: String) {
        self.face = face
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        surface.isUserInteractionEnabled = false
        surface.layer.cornerRadius = Radius.radiusSm
        surface.layer.cornerCurve = .continuous
        surface.layer.borderWidth = 1
        surface.boxShadow = Shadow.shadowTile
        surface.translatesAutoresizingMaskIntoConstraints = false
        addSubview(surface)
        face.translatesAutoresizingMaskIntoConstraints = false
        let title = KitLabel(TypeScale.typeLabel, ink: Palette.statusAttnInk)
        title.text = words
        title.lineBreakMode = .byTruncatingTail
        title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let chevron = GlyphView(.chevronUp, size: 16, tint: Palette.statusAttnInk)
        chevron.setContentHuggingPriority(.required, for: .horizontal)
        let line = UIStackView(arrangedSubviews: [face, title, chevron])
        line.spacing = Size.cPillGap
        line.alignment = .center
        line.isUserInteractionEnabled = false
        line.translatesAutoresizingMaskIntoConstraints = false
        addSubview(line)
        NSLayoutConstraint.activate([
            surface.leadingAnchor.constraint(equalTo: leadingAnchor),
            surface.trailingAnchor.constraint(equalTo: trailingAnchor),
            surface.topAnchor.constraint(equalTo: topAnchor),
            surface.bottomAnchor.constraint(equalTo: bottomAnchor),
            face.widthAnchor.constraint(equalToConstant: 16),
            face.heightAnchor.constraint(equalToConstant: 16),
            line.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space2),
            line.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space2),
            line.centerYAnchor.constraint(equalTo: centerYAnchor),
            heightAnchor.constraint(equalToConstant: Size.cTrayChipCoarse),
        ])
        isAccessibilityElement = true
        accessibilityTraits = .button
        accessibilityLabel = "Show the question from the agent: \(words)"
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (bar: PromptBar, _: UITraitCollection) in bar.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("PromptBar is built in code")
    }

    /// The kit's press (`.kit-tray-chip:active`): `pressScale` over
    /// `durControl`, none with Reduce Motion.
    override var isHighlighted: Bool {
        didSet {
            guard isHighlighted != oldValue else { return }
            let to = isHighlighted && !UIAccessibility.isReduceMotionEnabled ? Motion.pressScale : 1
            Motion.easeOut.animator(Motion.durControl) {
                self.transform = CGAffineTransform(scaleX: to, y: to)
            }.startAnimation()
        }
    }

    private func paint() {
        surface.backgroundColor = Palette.statusAttnBg
        surface.layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
    }
}

/// One option of a question (`.qopts button`): at least 30pt, 7/11 in, the
/// control border, radius 8, raised, the label role, led by its 17pt mono
/// keycap. Picked, it takes the brand edge, a recess fill and an inverted
/// keycap; a keycap the digits are not pointed at goes quiet.
final class OptionChip: UIControl {
    private let keycap = KitLabel(TypeScale.typeMeta, ink: Palette.inkStrong)
    private let cap = UIView()
    private let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
    private var selectedNow = false

    init(key: Int, label: String) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        keycap.role = TypeRole(weight: .regular, size: TypeScale.textMeta ... TypeScale.textMeta, leading: 1, family: FontFamily.fontMono)
        keycap.text = "\(key)"
        keycap.textAlignment = .center
        cap.layer.cornerRadius = Radius.radiusXs
        cap.layer.cornerCurve = .continuous
        cap.translatesAutoresizingMaskIntoConstraints = false
        cap.addSubview(keycap)
        // The option's words keep the page's body leading (13px / 18.85px on the web).
        title.role = TypeScale.typeLabel.with(leading: TypeScale.leadingBody)
        title.text = label
        let row = UIStackView(arrangedSubviews: [cap, title])
        row.spacing = Space.space2
        row.alignment = .center
        row.isUserInteractionEnabled = false
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            keycap.leadingAnchor.constraint(equalTo: cap.leadingAnchor, constant: 4),
            keycap.trailingAnchor.constraint(equalTo: cap.trailingAnchor, constant: -4),
            keycap.centerYAnchor.constraint(equalTo: cap.centerYAnchor),
            cap.heightAnchor.constraint(equalToConstant: 17),
            cap.widthAnchor.constraint(greaterThanOrEqualToConstant: 17),
            // 7/11 in from inside its 1px border.
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space3 + 1),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space3 - 1),
            row.topAnchor.constraint(equalTo: topAnchor, constant: Space.space2 + 1),
            row.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space2 - 1),
            heightAnchor.constraint(greaterThanOrEqualToConstant: 30),
        ])
        isAccessibilityElement = true
        accessibilityLabel = label
        accessibilityHint = "Key \(key)"
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (chip: OptionChip, _: UITraitCollection) in
            chip.paint()
        }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("OptionChip is built in code")
    }

    func configure(selected: Bool, live: Bool, enabled: Bool) {
        selectedNow = selected
        isEnabled = enabled
        cap.alpha = selected || live ? 1 : 0.45
        accessibilityTraits = selected ? [.button, .selected] : .button
        paint()
    }

    private func paint() {
        let traits = traitCollection
        layer.borderColor = (selectedNow ? Palette.brandSolid : Palette.borderControl).resolvedColor(with: traits).cgColor
        backgroundColor = selectedNow ? Palette.surfaceRecess : isHighlighted ? Palette.surfaceHover : Palette.surfaceRaised
        cap.backgroundColor = selectedNow ? Palette.chipChosenBg : Palette.surfaceRecess
        keycap.ink = selectedNow ? Palette.chipChosenInk : Palette.inkStrong
    }

    override var isHighlighted: Bool {
        didSet { paint() }
    }
}

/// Chips that wrap: each as wide as its content, `gap` apart either way.
public final class WrapLayout: UIView {
    private let items: [UIView]
    private let gap: Double
    private var laidWidth = 0.0

    public init(_ items: [UIView], gap: Double = Space.space2) {
        self.items = items
        self.gap = gap
        super.init(frame: .zero)
        for item in items {
            item.translatesAutoresizingMaskIntoConstraints = true
            addSubview(item)
        }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("WrapLayout is built in code")
    }

    override public var intrinsicContentSize: CGSize {
        CGSize(width: UIView.noIntrinsicMetric, height: arrange(width: bounds.width, apply: false))
    }

    override public func layoutSubviews() {
        super.layoutSubviews()
        _ = arrange(width: bounds.width, apply: true)
        if laidWidth != bounds.width {
            laidWidth = bounds.width
            invalidateIntrinsicContentSize()
        }
    }

    private func arrange(width: Double, apply: Bool) -> Double {
        guard width > 0 else { return 30 }
        var x = 0.0, y = 0.0, line = 0.0
        for item in items {
            let fit = item.systemLayoutSizeFitting(CGSize(width: width, height: UIView.layoutFittingCompressedSize.height), withHorizontalFittingPriority: .fittingSizeLevel, verticalFittingPriority: .fittingSizeLevel)
            let w = min(width, fit.width)
            let h = item.systemLayoutSizeFitting(CGSize(width: w, height: 0), withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height
            if x > 0, x + w > width {
                x = 0
                y += line + gap
                line = 0
            }
            if apply { item.frame = CGRect(x: x, y: y, width: w, height: h) }
            x += w + gap
            line = max(line, h)
        }
        return y + line
    }
}
