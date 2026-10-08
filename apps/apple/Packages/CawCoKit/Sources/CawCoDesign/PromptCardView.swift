import CawCoCore
import UIKit

/// The one human-in-the-loop surface, parked above the composer
/// (transcript/Prompt.svelte `.hitl`): a permission gate, who asks and what
/// will happen over the change itself and its fields, then Approve and Deny
/// as symmetric recessed peers at opposite ends, or a question, its options
/// as chips led by keycaps, then
/// Answer and Dismiss. The pressed button pends with its own label while its
/// peers dim; a refusal stops it and says why under the buttons.
@MainActor
public final class PromptCardView: UIView {
    public enum Choice: Sendable {
        case allow, deny, answer
    }

    public let ask: ParkedAsk
    /// Settles the ask: `answers` holds the picks, by question, for `.answer`.
    public var onAnswer: (Choice, [String: [String]]) -> Void = { _, _ in }
    /// The card changed height (a disclosure, a wait line).
    public var onHeight: () -> Void = {}

    private var picks: [String: [String]] = [:]
    /// Which question the digits answer: the first one still unanswered.
    private var current = 0
    private var pressed: Choice?
    private var refused: String?
    private var connected = true
    private var chips: [[OptionChip]] = []
    private var buttons: [Choice: UIButton] = [:]
    private let wait = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)

    /// `diff` draws one change a permission makes: the transcript's diff,
    /// which lives above this module.
    public init(_ ask: ParkedAsk, arriving: Bool, diff: (PermissionChange) -> UIView) {
        self.ask = ask
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Radius.radiusLg
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        boxShadow = Shadow.shadowHairline
        isAccessibilityElement = false
        accessibilityLabel = ask.isQuestion ? "Question from the agent" : "Permission request from \(ask.presentation.asker)"
        let column = UIStackView()
        column.axis = .vertical
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        // `.hitl`: its padding starts inside its 1px border.
        let inset = Space.space3 + 1
        NSLayoutConstraint.activate([
            column.leadingAnchor.constraint(equalTo: leadingAnchor, constant: inset),
            column.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -inset),
            column.topAnchor.constraint(equalTo: topAnchor, constant: inset),
            column.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -inset),
        ])
        if ask.isQuestion {
            buildQuestion(column)
        } else {
            buildPermission(column, diff: diff)
        }
        wait.isHidden = true
        wait.wrap = .pretty
        column.addArrangedSubview(wait)
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (card: PromptCardView, _: UITraitCollection) in
            card.paint()
        }
        paint()
        render()
        if arriving { settle() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("PromptCardView is built in code")
    }

    private func paint() {
        layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
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

    private func head(_ words: String) -> UIView {
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
        return row
    }

    private func lede(_ text: String) -> KitLabel {
        let label = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong, lines: 0)
        label.role = TypeRole(weight: TypeScale.typeBody.weight, size: TypeScale.typeBody.size, leading: TypeScale.leadingBody, family: TypeScale.typeBody.family)
        label.text = text
        label.wrap = .pretty
        return label
    }

    // MARK: Question

    private func buildQuestion(_ column: UIStackView) {
        let top = head("Question from the agent")
        column.addArrangedSubview(top)
        column.setCustomSpacing(Space.space2, after: top)
        for (qi, question) in ask.questions.enumerated() {
            let words = lede(question.question)
            column.addArrangedSubview(words)
            // The lede's 7 and the options' 2 are adjoining margins: they collapse to 7.
            column.setCustomSpacing(Space.space2, after: words)
            var row: [OptionChip] = []
            for (i, option) in question.options.enumerated() {
                let chip = OptionChip(key: i + 1, label: option.label)
                // A plain UIControl sends touchUpInside, never primaryActionTriggered.
                chip.addAction(UIAction { [weak self] _ in self?.toggle(qi, option.label) }, for: .touchUpInside)
                row.append(chip)
            }
            chips.append(row)
            let wrap = WrapLayout(row)
            column.addArrangedSubview(wrap)
            column.setCustomSpacing(Space.space2, after: wrap)
        }
        let answer = Self.button("Answer", glyph: Glyph.answer, kind: .primary) { [weak self] in self?.submitQuestion() }
        let dismiss = Self.button("Dismiss", glyph: nil, kind: .outline) { [weak self] in self?.choose(.deny) }
        buttons = [.answer: answer, .deny: dismiss]
        let actions = UIStackView(arrangedSubviews: [answer, dismiss, UIView()])
        actions.spacing = Space.space2
        column.addArrangedSubview(actions)
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
    private func buildPermission(_ column: UIStackView, diff: (PermissionChange) -> UIView) {
        let presentation = ask.presentation
        let top = head("\(presentation.asker) asks for permission")
        column.addArrangedSubview(top)
        column.setCustomSpacing(Space.space2, after: top)
        let words = lede(presentation.summary)
        words.role = TypeRole(weight: TypeScale.weightStrong, size: TypeScale.typeBody.size, leading: TypeScale.leadingBody, family: TypeScale.typeBody.family)
        column.addArrangedSubview(words)
        column.setCustomSpacing(Space.space1, after: words)
        if let detail = presentation.detail {
            let line = KitLabel(TypeScale.typeLabel, ink: Palette.inkMuted, lines: 0)
            line.role = TypeRole(weight: TypeScale.weightBody, size: TypeScale.typeLabel.size, leading: TypeScale.typeLabel.leading, family: TypeScale.typeLabel.family)
            line.text = detail
            column.addArrangedSubview(line)
            column.setCustomSpacing(Space.space2, after: line)
        } else {
            column.setCustomSpacing(Space.space2, after: words)
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
            column.addArrangedSubview(block)
            column.setCustomSpacing(Space.space2, after: block)
        }
        // The change itself, open: a grant is made on what it changes.
        for change in presentation.changes {
            let made = diff(change)
            column.addArrangedSubview(made)
            column.setCustomSpacing(Space.space2, after: made)
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
            column.addArrangedSubview(fields)
            column.setCustomSpacing(Space.space3, after: fields)
        }

        let approve = Self.button("Approve", glyph: .tick, kind: .grant) { [weak self] in self?.choose(.allow) }
        let deny = Self.button("Deny", glyph: .close, kind: .refuse) { [weak self] in self?.choose(.deny) }
        buttons = [.allow: approve, .deny: deny]
        // The full width between grant and refusal, never less than 32pt.
        let choice = UIStackView(arrangedSubviews: [approve, UIView(), deny])
        choice.spacing = Space.space8
        column.addArrangedSubview(choice)
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
    /// Return sends once every question is answered, Escape dismisses.
    @discardableResult
    public func key(_ input: String) -> Bool {
        guard answerable else { return false }
        if input == UIKeyCommand.inputEscape {
            choose(.deny)
            return true
        }
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

    enum ButtonKind {
        /// The question's Answer: the action surface, a step wider.
        case primary
        case outline
        /// Approve: recessed, the check in strong ink.
        case grant
        /// Deny: recessed, the cross in muted ink.
        case refuse
    }

    /// The card's buttons (Prompt.svelte `btnBase`): 44pt on touch, radius 8,
    /// the label role, 11pt in (14 for Answer), a 12pt glyph 7pt off.
    static func button(_ title: String, glyph: Glyph?, kind: ButtonKind, action: @escaping () -> Void) -> UIButton {
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
        config?.attributedTitle = AttributedString(title, attributes: AttributeContainer(TypeScale.typeLabel.attributes(color: ink, tracking: -0.01)))
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
