import CawCoDesign
import CawCoMascot
import UIKit

/// A compaction in the transcript (CompactionDivider.svelte): a wavy
/// vermillion line across the column with "Compacted" in the middle of it,
/// Caw before the word. The whole divider is the button that opens the
/// compaction's brief under it, at the text column, under one line of the
/// facts the harness reported; until the brief has arrived there is nothing
/// to open and the button waits disabled.
final class CompactionDividerView: UIView, RowContent, Disclosing {
    var disclosed: Bool { reveal.isOpen }

    private let env: RowEnv
    private let button = CompactionButton()
    private let facts = WrapLabel(wrap: .pretty) // CompactionDivider `p.facts`
    private let text = MessageBody()
    private let column = UIStackView()
    private let reveal: Reveal
    private var lead: NSLayoutConstraint!
    private var key = ""
    /// The summary's source, drawn once the divider is opened.
    private var brief = ""

    init(env: RowEnv) {
        self.env = env
        let box = UIView()
        reveal = Reveal(box)
        super.init(frame: .zero)
        column.axis = .vertical
        column.spacing = Space.space2
        column.addArrangedSubview(facts)
        column.addArrangedSubview(text)
        column.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(column)
        lead = column.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: env.columns.text)
        button.translatesAutoresizingMaskIntoConstraints = false
        // The button over the brief: its reach under a finger runs a little into it.
        addSubview(reveal)
        addSubview(button)
        NSLayoutConstraint.activate([
            lead, column.trailingAnchor.constraint(equalTo: box.trailingAnchor),
            column.topAnchor.constraint(equalTo: box.topAnchor, constant: Space.space1),
            column.bottomAnchor.constraint(equalTo: box.bottomAnchor),
            button.leadingAnchor.constraint(equalTo: leadingAnchor), button.trailingAnchor.constraint(equalTo: trailingAnchor),
            button.topAnchor.constraint(equalTo: topAnchor, constant: Space.space2),
            button.heightAnchor.constraint(equalToConstant: Size.cBtnHSm),
            reveal.leadingAnchor.constraint(equalTo: leadingAnchor), reveal.trailingAnchor.constraint(equalTo: trailingAnchor),
            reveal.topAnchor.constraint(equalTo: button.bottomAnchor), reveal.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        button.addAction(UIAction { [weak self] _ in if let self { env.toggle(key, self) } }, for: .touchUpInside)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    func toggled(open: Bool) -> (() -> Void, () -> Void) {
        if open { text.configure(brief, style: .muted) }
        button.set(open: open, animated: true)
        return reveal.toggle(open: open)
    }

    func configure(_ item: Item) {
        guard case let .compaction(compaction) = item.kind else { return }
        // The same compaction's summary arriving brings the chevron in; a cell reused for another is simply set.
        let same = key == compaction.key && window != nil
        key = compaction.key
        lead.constant = env.columns.text
        let line = compaction.facts
        facts.attributedText = Styled.string(line, TypeScale.typeMeta, color: Palette.inkMuted, lineBreak: .byWordWrapping)
        facts.isHidden = line.isEmpty
        let open = compaction.brief != nil && env.isOpen(key)
        // The summary is drawn when it is opened: shut, it is pages of text
        // nobody sees, and building them was the dearest row of a first screen.
        brief = compaction.brief ?? ""
        text.configure(open ? brief : "", style: .muted)
        button.set(enabled: compaction.brief != nil, animated: same)
        button.set(open: open, animated: false)
        reveal.set(open: open)
    }

    /// Landed live: the wave draws in once from the word outward and Caw
    /// comes in with it, `delay` from now (the row's place opening first).
    func arrive(after delay: TimeInterval) {
        layoutIfNeeded()
        button.arrive(after: delay)
    }

    /// The transcript has come on screen: Caw, loaded while it was not, is drawn now.
    func cameOnScreen() { button.redrawCaw() }

    /// The button's reach under a finger (`.touch-hit`), in `view`'s space.
    func reach(in view: UIView) -> CGRect { button.convert(button.reach, to: view) }

    /// The button, for a touch its reach takes outside this row.
    var control: UIControl? { button.isEnabled ? button : nil }
}

/// One line of words drawn at a point of its own choosing inside a box of
/// whole pixels: a label centres its line in its box, which puts a baseline
/// between pixels; this one draws it exactly where it is told.
final class InkLine: UIView {
    var text = "" { didSet { setNeedsDisplay() } }
    var font = UIFont.systemFont(ofSize: 12) { didSet { setNeedsDisplay() } }
    var ink = UIColor.label { didSet { setNeedsDisplay() } }
    /// Where the line's top-left stands in this view: its baseline is the font's ascender below it.
    var origin = CGPoint.zero { didSet { if origin != oldValue { setNeedsDisplay() } } }

    /// The line's own size, unrounded.
    var size: CGSize { NSAttributedString(string: text, attributes: [.font: font]).size() }

    init() {
        super.init(frame: .zero)
        isOpaque = false
        isUserInteractionEnabled = false
        contentMode = .redraw
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (line: InkLine, _: UITraitCollection) in line.setNeedsDisplay() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    override func draw(_: CGRect) {
        NSAttributedString(string: text, attributes: [.font: font, .foregroundColor: ink]).draw(at: origin)
    }
}

/// The divider's button (CompactionDivider `.divider`): two arms of the wave
/// either side of the centre — Caw, the word, and a chevron that takes no
/// room. As the chevron comes in the centre steps half its width aside and
/// each arm draws back the same from the centre.
final class CompactionButton: UIControl {
    /// A finger has no hover, so what opens always shows that it does
    /// (`pointer: coarse`); under a pointer the chevron comes in on hover.
    #if targetEnvironment(macCatalyst)
    private static let coarse = false
    #else
    private static let coarse = true
    #endif

    /// Half the chevron's mark and gap: how far the centre and each arm move to hold it.
    private static let room = (Size.iconSm + Space.space1) / 2

    private let arms = (start: UIView(), end: UIView())
    private let waves = (start: CAShapeLayer(), end: CAShapeLayer())
    private let clips = (start: CALayer(), end: CALayer())
    private let mid = UIView()
    /// Caw, a folded note in his beak, drawn from his `compacted` file: his
    /// still's box is his slot; his rim and his coming in draw a little past it.
    private let caw = CawMark(status: .compacted, side: Size.txCompactCaw)
    private let word = InkLine()
    private let chevron = UIView()
    private let turn = UIView()
    private let sharp = UIImageView()
    private let soft = UIImageView()
    private let font = TypeScale.typeMeta.font(TypeScale.typeMeta.points, weight: TypeScale.typeMeta.weight)

    private var open = false
    private var hovered = false
    /// How far in the chevron is: 0 away, 1 beside the word.
    private var chev: Double = 0
    /// The length of the wave each arm shows, along the curve.
    private var run: Double = 0
    private var laid = CGSize.zero

    init() {
        super.init(frame: .zero)
        for (arm, wave, clip) in [(arms.start, waves.start, clips.start), (arms.end, waves.end, clips.end)] {
            arm.isUserInteractionEnabled = false
            wave.fillColor = nil
            wave.lineWidth = 1
            wave.lineCap = .round
            arm.layer.addSublayer(wave)
            clip.backgroundColor = UIColor.black.cgColor
            arm.layer.mask = clip
            addSubview(arm)
        }
        mid.isUserInteractionEnabled = false
        addSubview(mid)
        mid.addSubview(caw)
        word.font = font
        word.text = "Compacted"
        mid.addSubview(word)
        let image = Glyph.chevronBold.image.resized(to: Size.iconSm)
        sharp.image = image
        soft.image = image.blurredGlyph()
        for view in [soft, sharp] {
            view.frame = CGRect(x: 0, y: 0, width: Size.iconSm, height: Size.iconSm)
            turn.addSubview(view)
        }
        turn.frame = sharp.frame
        chevron.addSubview(turn)
        mid.addSubview(chevron)
        isAccessibilityElement = true
        #if targetEnvironment(macCatalyst)
        addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hover)))
        #endif
        registerForTraitChanges([UITraitUserInterfaceStyle.self, UITraitDisplayScale.self]) { (button: CompactionButton, _: UITraitCollection) in
            button.paint(animated: false)
        }
        paint(animated: false)
        place(animated: false)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    func redrawCaw() { caw.redraw() }

    // MARK: State

    func set(enabled: Bool, animated: Bool) {
        guard enabled != isEnabled || accessibilityLabel == nil else { return }
        isEnabled = enabled
        if !enabled { hovered = false }
        describe()
        paint(animated: animated)
        place(animated: animated)
    }

    func set(open: Bool, animated: Bool) {
        let turned = open != self.open
        self.open = open
        describe()
        place(animated: animated)
        guard turned else { return }
        // The mark turns on the spot: on-screen movement, not an entrance.
        let angle: CGAffineTransform = open ? CGAffineTransform(rotationAngle: .pi / 2) : .identity
        if animated, !UIAccessibility.isReduceMotionEnabled {
            Motion.easeInOut.animator(Motion.durToggle) { self.turn.transform = angle }.startAnimation()
        } else { turn.transform = angle }
    }

    private func describe() {
        accessibilityLabel = isEnabled ? "Compacted, \(open ? "hide" : "show") the summary" : "Compacted"
        accessibilityTraits = isEnabled ? .button : [.button, .notEnabled]
    }

    @objc private func hover(_ gesture: UIHoverGestureRecognizer) {
        let over = isEnabled && (gesture.state == .began || gesture.state == .changed)
        guard over != hovered else { return }
        hovered = over
        paint(animated: true)
        place(animated: true)
    }

    /// Pressed: the centre gives, the line holds.
    override var isHighlighted: Bool {
        didSet {
            guard isHighlighted != oldValue else { return }
            Motion.easeOut.animator(Motion.durToggle) { self.mid.transform = self.centre }.startAnimation()
        }
    }

    /// The centre's place: a step aside for the chevron, and the press.
    private var centre: CGAffineTransform {
        let press = isHighlighted && isEnabled && !UIAccessibility.isReduceMotionEnabled ? Motion.pressScale : 1
        return CGAffineTransform(translationX: -chev * Self.room, y: 0).scaledBy(x: press, y: press)
    }

    /// 44pt under a finger, centred on the 30pt line (`.touch-hit`).
    var reach: CGRect {
        Self.coarse ? bounds.insetBy(dx: 0, dy: min(0, (bounds.height - Size.cBtnHLg) / 2)) : bounds
    }

    override func point(inside point: CGPoint, with _: UIEvent?) -> Bool { reach.contains(point) }

    // MARK: Drawing

    /// The line and the word: the solid vermillion and the brand ink at rest,
    /// both the stronger vermillion under the pointer.
    private func paint(animated: Bool) {
        let line = (hovered ? Palette.brandInkStrong : Palette.brandSolid).resolvedColor(with: traitCollection).cgColor
        let ink = hovered ? Palette.brandInkStrong : Palette.brandInk
        CATransaction.begin()
        CATransaction.setDisableActions(!animated)
        CATransaction.setAnimationDuration(Motion.durControl)
        CATransaction.setAnimationTimingFunction(Motion.easeOut.function)
        waves.start.strokeColor = line
        waves.end.strokeColor = line
        CATransaction.commit()
        let tint = { self.word.ink = ink; self.sharp.tintColor = ink; self.soft.tintColor = ink }
        if animated {
            UIView.transition(with: mid, duration: Motion.durControl, options: [.transitionCrossDissolve, .allowUserInteraction], animations: tint)
        } else { tint() }
    }

    /// Where the chevron stands now: in for what opens under a finger, under
    /// the pointer, and while the brief is open.
    private func place(animated: Bool) {
        let to: Double = isEnabled && (Self.coarse || hovered || open) ? 1 : 0
        let moved = to != chev
        chev = to
        let still = UIAccessibility.isReduceMotionEnabled
        // It leaves a little quicker than it arrives.
        let (duration, curve) = to == 1 ? (Motion.durToggle, Motion.easeArrive) : (Motion.durControl, Motion.easeOut)
        let glide = animated && moved && !still
        let move: @MainActor @Sendable () -> Void = {
            self.mid.transform = self.centre
            // It slides out from the word's edge to its gap, growing from a quarter.
            self.chevron.transform = CGAffineTransform(translationX: to * Space.space1, y: 0).scaledBy(x: 0.25 + 0.75 * to, y: 0.25 + 0.75 * to)
            self.soft.alpha = 1 - to
            self.sharp.alpha = to
        }
        let fade: @MainActor @Sendable () -> Void = { self.chevron.alpha = to }
        if glide { curve.animator(duration, animations: move).startAnimation() } else { move() }
        if animated, moved { curve.animator(duration, animations: fade).startAnimation() } else { fade() }
        CATransaction.begin()
        CATransaction.setDisableActions(!glide)
        CATransaction.setAnimationDuration(duration)
        CATransaction.setAnimationTimingFunction(curve.function)
        clip()
        CATransaction.commit()
    }

    /// Each arm drawn back from the centre by the chevron's room.
    private func clip() {
        let back = chev * Self.room
        let arm = arms.start.bounds
        clips.start.frame = CGRect(x: 0, y: 0, width: max(0, arm.width - back), height: arm.height)
        clips.end.frame = CGRect(x: back, y: 0, width: max(0, arm.width - back), height: arm.height)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard bounds.size != laid else { return }
        laid = bounds.size
        let ink = word.size
        let cawWidth = Size.txCompactCaw
        let midWidth = cawWidth + Size.cPillGap + ink.width
        let arm = max(0, (bounds.width - midWidth - 2 * Space.space2) / 2)
        let waveTop = (bounds.height - Size.txCompactWave) / 2
        // Caw's picture, the word and the mark each stand on whole device
        // pixels, so none of them is drawn resampled.
        let scale = traitCollection.displayScale
        func whole(_ value: Double) -> Double { (value * scale).rounded() / scale }
        // The centre is one CSS line of the word (`font: var(--type-meta)`), Caw
        // and the chevron hung on it by `vertical-align: middle`, their middles
        // half the x-height above the baseline. The line's strut (LineBox) rises
        // further above the baseline than Caw's box does, so the line box is
        // taller than Caw and, centred in the button, stands everything on it a
        // little low. Mobile Safari: line box 18.59 at 5.70, Caw at 6.30, the
        // chevron at 9.30.
        let strut = LineBox.strut(font, height: TypeScale.typeMeta.lineHeight)
        let middle = Double(font.xHeight) / 2
        let above = max(strut.above, Size.txCompactCaw / 2 + middle)
        let below = max(strut.below, Size.txCompactCaw / 2 - middle)
        let top = (bounds.height - above - below) / 2
        /// A place on the line, from the button's top, on a whole device pixel, in the centre's space.
        func onLine(_ offset: Double) -> Double { whole(top + offset) - top }
        // The centre is laid out at rest; its transform is its place now.
        let transform = mid.transform
        mid.transform = .identity
        let midX = whole(arm + Space.space2)
        mid.frame = CGRect(x: midX, y: top, width: midWidth, height: above + below)
        mid.transform = transform
        caw.frame = CGRect(x: 0, y: onLine(above - middle - Size.txCompactCaw / 2), width: cawWidth, height: Size.txCompactCaw)
        // The word is drawn where the layout puts it, to the fraction of a pixel
        // across and its baseline on a whole one, in a box of whole pixels.
        word.frame = CGRect(x: cawWidth + Size.cPillGap - 1, y: 0, width: ink.width.rounded(.up) + 2, height: above + below)
        word.origin = CGPoint(x: 1 + (arm + Space.space2 - midX), y: onLine(above) - font.ascender)
        let spot = chevron.transform
        chevron.transform = .identity
        chevron.frame = CGRect(x: whole(cawWidth + Size.cPillGap + ink.width), y: onLine(above - middle - Size.iconSm / 2), width: Size.iconSm, height: Size.iconSm)
        chevron.transform = spot
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        arms.start.frame = CGRect(x: 0, y: waveTop, width: arm, height: Size.txCompactWave)
        arms.end.frame = CGRect(x: bounds.width - arm, y: waveTop, width: arm, height: Size.txCompactWave)
        // The wave is 1.087pt long for each point it crosses; dashed to this
        // length the line ends on a round cap just inside the column.
        run = max(0, (arm - 2) * 1.08)
        let path = Self.wave(across: arm)
        for wave in [waves.start, waves.end] {
            wave.setAffineTransform(.identity)
            wave.frame = CGRect(x: 0, y: 0, width: arm, height: Size.txCompactWave)
            wave.path = path
            wave.lineDashPattern = [NSNumber(value: run), 9999]
            wave.contentsScale = traitCollection.displayScale
        }
        // Mirrored, so both arms run outward from the word.
        waves.start.setAffineTransform(CGAffineTransform(scaleX: -1, y: 1))
        clip()
        CATransaction.commit()
    }

    /// One arm of the wave, drawn from the label outward: a 16pt wavelength
    /// at 1.5pt amplitude along the middle of its box (`M1 3q4-3 8 0t8 0…`),
    /// longer than the arm; the dash decides how much of it shows.
    private static func wave(across width: Double) -> CGPath {
        let path = CGMutablePath()
        let middle = Size.txCompactWave / 2
        path.move(to: CGPoint(x: 1, y: middle))
        for half in 0 ..< Int((width / 8).rounded(.up)) + 2 {
            let from = 1 + 8 * Double(half)
            path.addQuadCurve(to: CGPoint(x: from + 8, y: middle), control: CGPoint(x: from + 4, y: half.isMultiple(of: 2) ? 0 : 2 * middle))
        }
        return path
    }

    /// The line draws in once from the word outward over --dur-pop on
    /// --ease-out, held back until `delay` has passed, and Caw comes in then
    /// by his file's own clip.
    func arrive(after delay: TimeInterval) {
        guard !UIAccessibility.isReduceMotionEnabled else { return }
        func play(_ keyPath: String, from: Double, on layer: CALayer) {
            let animation = CABasicAnimation(keyPath: keyPath)
            animation.fromValue = from
            animation.duration = Motion.durPop
            animation.timingFunction = Motion.easeOut.function
            animation.beginTime = layer.convertTime(CACurrentMediaTime(), from: nil) + delay
            animation.fillMode = .backwards
            layer.add(animation, forKey: "arrive.\(keyPath)")
        }
        for wave in [waves.start, waves.end] { play("lineDashPhase", from: run, on: wave) }
        caw.arrive(after: delay)
    }
}
