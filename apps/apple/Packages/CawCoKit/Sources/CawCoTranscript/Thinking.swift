import CawCoDesign
import UIKit

/// The live reasoning's face (thinking-indicator.svelte): two marks, a
/// circle and an infinity, handing over on a three-breath loop, and four
/// words taking turns, each two breaths, a band of the strong ink passing
/// over the word once a breath. Under Reduce Motion: the infinity alone,
/// "Thinking", still.
final class ThinkingIndicator: UIView {
    private static let words = ["Thinking", "Moonwalking", "Planning", "Refining"]
    private let mark = UIView()
    private let circle = CAShapeLayer()
    private let lemniscate = CAShapeLayer()
    private let labels = UIView()
    private var words: [(word: UILabel, sheen: UILabel, band: CAGradientLayer)] = []

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        mark.translatesAutoresizingMaskIntoConstraints = false
        for (shape, path) in [(circle, Self.circlePath), (lemniscate, Self.infinityPath)] {
            shape.path = path
            shape.fillColor = nil
            shape.lineWidth = 1.5
            shape.lineCap = .round
            shape.lineJoin = .round
            mark.layer.addSublayer(shape)
        }
        labels.translatesAutoresizingMaskIntoConstraints = false
        labels.clipsToBounds = true
        var widest = 0.0
        for word in Self.words {
            let label = UILabel()
            label.attributedText = Styled.string(word, TypeScale.typeLabel, color: Palette.inkMuted, leading: TypeScale.leadingBody)
            let sheen = UILabel()
            sheen.attributedText = Styled.string(word, TypeScale.typeLabel, color: Palette.inkStrong, leading: TypeScale.leadingBody)
            let band = CAGradientLayer()
            band.startPoint = CGPoint(x: 0, y: 0.5)
            band.endPoint = CGPoint(x: 1, y: 0.5)
            band.colors = [UIColor.clear.cgColor, UIColor.black.cgColor, UIColor.clear.cgColor]
            band.locations = [0.35, 0.5, 0.65]
            sheen.layer.mask = band
            label.addSubview(sheen)
            labels.addSubview(label)
            widest = max(widest, label.intrinsicContentSize.width)
            words.append((label, sheen, band))
        }
        addSubview(mark)
        addSubview(labels)
        let height = TypeScale.textLabel * TypeScale.leadingBody
        NSLayoutConstraint.activate([
            mark.leadingAnchor.constraint(equalTo: leadingAnchor),
            mark.centerYAnchor.constraint(equalTo: centerYAnchor),
            mark.widthAnchor.constraint(equalToConstant: Size.txWGlyph),
            mark.heightAnchor.constraint(equalToConstant: Size.txWGlyph),
            labels.leadingAnchor.constraint(equalTo: mark.trailingAnchor, constant: Columns.gap),
            labels.trailingAnchor.constraint(equalTo: trailingAnchor),
            labels.topAnchor.constraint(equalTo: topAnchor),
            labels.bottomAnchor.constraint(equalTo: bottomAnchor),
            labels.widthAnchor.constraint(equalToConstant: ceil(widest)),
            labels.heightAnchor.constraint(equalToConstant: height),
        ])
        isAccessibilityElement = true
        accessibilityLabel = "Thinking…"
        accessibilityTraits = .updatesFrequently
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: ThinkingIndicator, _: UITraitCollection) in view.paint() }
        NotificationCenter.default.addObserver(self, selector: #selector(motionChanged), name: UIAccessibility.reduceMotionStatusDidChangeNotification, object: nil)
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    /// The two marks, on a 24-unit grid drawn at the 16pt cell.
    private static let circlePath: CGPath = {
        let path = UIBezierPath(ovalIn: CGRect(x: 8, y: 8, width: 8, height: 8))
        path.apply(CGAffineTransform(scaleX: Size.txWGlyph / 24, y: Size.txWGlyph / 24))
        return path.cgPath
    }()

    private static let infinityPath: CGPath = {
        let path = UIBezierPath()
        path.move(to: CGPoint(x: 12, y: 12))
        path.addCurve(to: CGPoint(x: 19, y: 12), controlPoint1: CGPoint(x: 14, y: 8.5), controlPoint2: CGPoint(x: 19, y: 8.5))
        path.addCurve(to: CGPoint(x: 12, y: 12), controlPoint1: CGPoint(x: 19, y: 15.5), controlPoint2: CGPoint(x: 14, y: 15.5))
        path.addCurve(to: CGPoint(x: 5, y: 12), controlPoint1: CGPoint(x: 10, y: 8.5), controlPoint2: CGPoint(x: 5, y: 8.5))
        path.addCurve(to: CGPoint(x: 12, y: 12), controlPoint1: CGPoint(x: 5, y: 15.5), controlPoint2: CGPoint(x: 10, y: 15.5))
        path.close()
        path.apply(CGAffineTransform(scaleX: Size.txWGlyph / 24, y: Size.txWGlyph / 24))
        return path.cgPath
    }()

    private func paint() {
        let ink = Palette.inkMuted.resolvedColor(with: traitCollection).cgColor
        circle.strokeColor = ink
        lemniscate.strokeColor = ink
        // The stroke scales with the drawing: 1.5 of 24 units.
        circle.lineWidth = 1.5 * Size.txWGlyph / 24
        lemniscate.lineWidth = circle.lineWidth
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        circle.frame = mark.bounds
        lemniscate.frame = mark.bounds
        for entry in words {
            entry.word.frame = CGRect(origin: .zero, size: entry.word.intrinsicContentSize)
            entry.sheen.frame = entry.word.bounds
            let width = entry.word.bounds.width
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            entry.band.bounds = CGRect(x: 0, y: 0, width: width * 3, height: entry.word.bounds.height)
            entry.band.anchorPoint = CGPoint(x: 0.5, y: 0.5)
            entry.band.position = CGPoint(x: width * 1.5, y: entry.word.bounds.height / 2)
            CATransaction.commit()
        }
        if !animating { animate() }
    }

    private var animating = false

    @objc private func motionChanged() { animating = false; setNeedsLayout() }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil { animating = false; setNeedsLayout() }
    }

    private func animate() {
        guard bounds.width > 0 else { return }
        animating = true
        let still = UIAccessibility.isReduceMotionEnabled
        for layer in [circle, lemniscate] { layer.removeAllAnimations() }
        circle.opacity = still ? 0 : 1
        lemniscate.opacity = still ? 1 : 0
        for (i, entry) in words.enumerated() {
            entry.word.layer.removeAllAnimations()
            entry.band.removeAllAnimations()
            entry.word.alpha = i == 0 ? 1 : 0
            entry.word.transform = .identity
            entry.sheen.isHidden = still
        }
        guard !still else { return }
        let breath = Motion.breath
        let inOut = Motion.easeInOut.function
        let begin = CACurrentMediaTime()
        // The marks trade places twice a loop.
        func swap(_ layer: CAShapeLayer, shown: Bool) {
            let opacity = CAKeyframeAnimation(keyPath: "opacity")
            opacity.values = shown ? [1, 0, 1, 0, 1] : [0, 1, 0, 1, 0]
            let scale = CAKeyframeAnimation(keyPath: "transform")
            let away = shown ? CATransform3DMakeScale(1.15, 0.8, 1) : CATransform3DMakeScale(0.7, 1.1, 1)
            scale.values = shown ? [CATransform3DIdentity, away, CATransform3DIdentity, away, CATransform3DIdentity].map { NSValue(caTransform3D: $0) }
                : [away, CATransform3DIdentity, away, CATransform3DIdentity, away].map { NSValue(caTransform3D: $0) }
            let group = CAAnimationGroup()
            for each in [opacity, scale] as [CAKeyframeAnimation] {
                each.keyTimes = [0, 0.25, 0.5, 0.75, 1]
                each.timingFunctions = Array(repeating: inOut, count: 4)
            }
            group.animations = [opacity, scale]
            group.duration = breath * 3
            group.repeatCount = .infinity
            layer.add(group, forKey: "swap")
        }
        swap(circle, shown: true)
        swap(lemniscate, shown: false)
        // Each word: two breaths of an eight-breath cycle.
        let out = Motion.easeOut.function
        for (i, entry) in words.enumerated() {
            let height = entry.word.bounds.height
            let opacity = CAKeyframeAnimation(keyPath: "opacity")
            opacity.values = [0, 1, 1, 0, 0]
            let lift = CAKeyframeAnimation(keyPath: "transform.translation.y")
            lift.values = [0.8 * height, 0, 0, -0.8 * height, -0.8 * height]
            let group = CAAnimationGroup()
            for each in [opacity, lift] as [CAKeyframeAnimation] {
                each.keyTimes = [0, 0.015, 0.25, 0.26, 1]
                each.timingFunctions = Array(repeating: out, count: 4)
            }
            group.animations = [opacity, lift]
            group.duration = breath * 8
            group.repeatCount = .infinity
            group.fillMode = .both
            group.beginTime = begin + breath * Double(i * 2) - 0.24
            entry.word.layer.add(group, forKey: "cycle")
            entry.word.alpha = 1
            // The light crosses the word, right to left, once a breath.
            let width = entry.word.bounds.width
            let sweep = CABasicAnimation(keyPath: "position.x")
            sweep.fromValue = width * 1.5
            sweep.toValue = -width * 0.5
            sweep.duration = breath
            sweep.timingFunction = inOut
            sweep.repeatCount = .infinity
            entry.band.add(sweep, forKey: "sheen")
        }
    }
}

/// A reasoning block (Thinking.svelte): on the rail, its header the live
/// face or "Reasoning" with the CPU mark, folded to the end of its last
/// thought, opening into its steps — one per block of the text, each on a
/// dot with a hairline down to the next.
final class ThinkingView: RailRow, RowContent, Disclosing {
    var disclosed: Bool { reveal.isOpen }

    private let header = UIView()
    private let live = ThinkingIndicator()
    private let identity = UIView()
    private let chevron = Chevron(size: Size.iconSm, tint: Palette.inkMuted)
    private let tail = UILabel()
    private let tailFade = CAGradientLayer()
    private let steps = UIStackView()
    private let reveal: Reveal
    private var key = ""
    private var text = ""
    private var isLive = false
    private var open = false

    required init(env: RowEnv) {
        reveal = Reveal(steps)
        reveal.fades = true
        super.init(env: env)
        let cpu = RailCell(.cpu)
        let label = LineLabel(hug: .required, resist: .required)
        label.attributedText = Styled.string("Reasoning", TypeScale.typeLabel, color: Palette.inkMuted, leading: TypeScale.leadingBody)
        let face = railLine([cpu, label])
        identity.pin(face)
        let labelCell = UIView()
        labelCell.translatesAutoresizingMaskIntoConstraints = false
        labelCell.pin(identity)
        labelCell.addSubview(live)
        NSLayoutConstraint.activate([
            live.leadingAnchor.constraint(equalTo: labelCell.leadingAnchor),
            live.centerYAnchor.constraint(equalTo: labelCell.centerYAnchor),
            live.trailingAnchor.constraint(lessThanOrEqualTo: labelCell.trailingAnchor),
        ])
        labelCell.setContentHuggingPriority(.required, for: .horizontal)
        tail.translatesAutoresizingMaskIntoConstraints = false
        tail.lineBreakMode = .byTruncatingHead
        tail.textAlignment = .right
        tail.setContentCompressionResistancePriority(.init(1), for: .horizontal)
        tail.setContentHuggingPriority(.init(1), for: .horizontal)
        // Pinned to its end, the start fading out (mask: transparent → ink at 30%).
        tailFade.startPoint = CGPoint(x: 0, y: 0.5)
        tailFade.endPoint = CGPoint(x: 1, y: 0.5)
        tailFade.colors = [UIColor.clear.cgColor, UIColor.black.cgColor]
        tailFade.locations = [0, 0.3]
        tail.layer.mask = tailFade
        let line = railLine([labelCell, chevron, tail])
        header.pin(line)
        header.heightAnchor.constraint(greaterThanOrEqualToConstant: Size.txLine).isActive = true
        steps.axis = .vertical
        body.addArrangedSubview(header)
        body.addArrangedSubview(reveal)
        header.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tap)))
        header.isAccessibilityElement = true
        header.accessibilityTraits = .button
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        tailFade.frame = tail.bounds
        CATransaction.commit()
    }

    @objc private func tap() {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        env.toggle(key, self)
    }

    /// The block's text, one step per block (blank lines part them, except inside a fence).
    static func paragraphs(_ source: String) -> [String] {
        var blocks: [String] = []
        var current: [String] = []
        var fenced = false
        for line in source.components(separatedBy: "\n") {
            if line.trimmingCharacters(in: .whitespaces).hasPrefix("```") || line.trimmingCharacters(in: .whitespaces).hasPrefix("~~~") { fenced.toggle() }
            if !fenced, line.trimmingCharacters(in: .whitespaces).isEmpty {
                if !current.isEmpty { blocks.append(current.joined(separator: "\n")) }
                current = []
                continue
            }
            current.append(line)
        }
        if current.contains(where: { !$0.trimmingCharacters(in: .whitespaces).isEmpty }) { blocks.append(current.joined(separator: "\n")) }
        return blocks
    }

    /// Whether the block is open: a live one opens by default, a settled one
    /// folds; the reader's choice flips the default.
    static func isOpen(_ reasoning: Item.Reasoning, env: RowEnv) -> Bool {
        (reasoning.live || reasoning.folding) != env.isOpen(reasoning.key)
    }

    func toggled(open: Bool) -> (() -> Void, () -> Void) {
        self.open = open
        chevron.set(open: open, animated: true)
        setTail(animated: true)
        return reveal.toggle(open: open)
    }

    func configure(_ item: Item) {
        guard case let .thinking(reasoning) = item.kind else { return }
        place()
        key = reasoning.key
        let wasLive = isLive
        isLive = reasoning.live
        text = reasoning.text
        live.isHidden = !reasoning.live
        identity.isHidden = reasoning.live
        if wasLive != reasoning.live, env.watched, !UIAccessibility.isReduceMotionEnabled {
            // The two labels cross-fade in one place over --dur-control.
            let shown: UIView = reasoning.live ? live : identity
            shown.alpha = 0
            Motion.easeOut.animator(Motion.durControl) { shown.alpha = 1 }.startAnimation()
        }
        let paragraphs = Self.paragraphs(reasoning.text)
        fillSteps(paragraphs, live: reasoning.live)
        let empty = reasoning.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        chevron.isHidden = empty
        open = Self.isOpen(reasoning, env: env)
        chevron.set(open: open, animated: false)
        reveal.set(open: open)
        let last = (paragraphs.last ?? "").replacing(/[*_`#>]/, with: "")
        let line = String(last.split(whereSeparator: \.isWhitespace).joined(separator: " ").suffix(240))
        tail.attributedText = Styled.string(line, TypeScale.typeMeta, color: Palette.inkMuted, lineBreak: .byTruncatingHead)
        setTail(animated: false)
        header.accessibilityLabel = reasoning.live ? "Thinking" : "Reasoning"
        header.accessibilityValue = empty ? nil : (open ? "Expanded" : "Collapsed")
    }

    private func setTail(animated: Bool) {
        let shown = !open && !(tail.attributedText?.string.isEmpty ?? true)
        guard animated, env.watched, !UIAccessibility.isReduceMotionEnabled else {
            tail.alpha = shown ? 1 : 0
            tail.transform = .identity
            return
        }
        if shown {
            // Folding shut, the last thought's end rises into the header (--dur-exit).
            tail.alpha = 0
            tail.transform = CGAffineTransform(translationX: 0, y: TypeScale.textMeta * TypeScale.leadingRoot * 0.5)
            Motion.easeOut.animator(Motion.durExit) { self.tail.alpha = 1; self.tail.transform = .identity }.startAnimation()
        } else {
            Motion.easeOut.animator(Motion.durControl) { self.tail.alpha = 0 }.startAnimation()
        }
    }

    private var drawnSteps: [String] = []

    private func fillSteps(_ paragraphs: [String], live: Bool) {
        // Steps already drawn keep their views; only the last and new ones change.
        while steps.arrangedSubviews.count > paragraphs.count { steps.arrangedSubviews.last?.removeFromSuperview() }
        for (i, paragraph) in paragraphs.enumerated() {
            let isLast = i == paragraphs.count - 1
            if i < steps.arrangedSubviews.count, let step = steps.arrangedSubviews[i] as? StepView {
                step.configure(paragraph, last: isLast, fading: live && env.watched)
            } else {
                let step = StepView()
                step.configure(paragraph, last: isLast, fading: false)
                if drawnSteps.count > 0, env.watched, !UIAccessibility.isReduceMotionEnabled {
                    step.alpha = 0
                    Motion.easeOut.animator(Motion.durMenu) { step.alpha = 1 }.startAnimation()
                }
                steps.addArrangedSubview(step)
            }
        }
        drawnSteps = paragraphs
    }

    func fade(_ now: Double) {
        for case let step as StepView in steps.arrangedSubviews { step.fade(now) }
    }
}

/// One reasoning step (thinking-step.svelte): its dot centred on the first
/// line in a 15pt column, a hairline down to the next step, the text muted.
final class StepView: UIView {
    private let dot = Dot(Space.space1, color: Palette.inkMuted)
    private let connector = UIView()
    private let text = MessageBody()

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        connector.translatesAutoresizingMaskIntoConstraints = false
        connector.backgroundColor = Palette.borderHairline
        let column = UIView()
        column.translatesAutoresizingMaskIntoConstraints = false
        column.addSubview(dot)
        column.addSubview(connector)
        addSubview(column)
        addSubview(text)
        let line = TypeScale.textBody * TypeScale.leadingBody
        NSLayoutConstraint.activate([
            column.leadingAnchor.constraint(equalTo: leadingAnchor),
            column.topAnchor.constraint(equalTo: topAnchor),
            column.bottomAnchor.constraint(equalTo: bottomAnchor),
            column.widthAnchor.constraint(equalToConstant: Size.txStepCol),
            dot.centerXAnchor.constraint(equalTo: column.centerXAnchor),
            dot.centerYAnchor.constraint(equalTo: column.topAnchor, constant: line / 2),
            connector.centerXAnchor.constraint(equalTo: column.centerXAnchor),
            connector.widthAnchor.constraint(equalToConstant: 1),
            connector.topAnchor.constraint(equalTo: column.topAnchor, constant: line),
            connector.bottomAnchor.constraint(equalTo: column.bottomAnchor),
            text.leadingAnchor.constraint(equalTo: column.trailingAnchor, constant: Space.space2),
            text.trailingAnchor.constraint(equalTo: trailingAnchor),
            text.topAnchor.constraint(equalTo: topAnchor),
            text.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space2),
        ])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    private var source = ""

    func configure(_ paragraph: String, last: Bool, fading: Bool) {
        connector.isHidden = last
        guard paragraph != source else { return }
        source = paragraph
        text.configure(fading ? PartialSyntax.hide(paragraph) : paragraph, style: .step, fading: fading)
    }

    func fade(_ now: Double) { text.fade(now) }
}
