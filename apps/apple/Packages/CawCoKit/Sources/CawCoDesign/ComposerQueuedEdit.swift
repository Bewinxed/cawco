import GameController
import UIKit

// Editing a queued message (composer-recall `editQueued`): its words lift out
// of the transcript into the composer, the bubble folding down to its tag,
// and the composer grows by one row, out of its history button as the wheel
// grows, that says what is happening. Return replaces the message, Escape
// (or Keep it, on a touch screen) gives it back as it was; either way the
// words fly back and the bubble unfolds.

/// One end of a flight: where the words stand in the window, how far that
/// view has scrolled them, and how they are set there.
struct LiftEnd {
    let box: CGRect
    let scroll: Double
    let attributes: [NSAttributedString.Key: Any]

    /// The words as a bubble sets them: the body role, wrapping.
    @MainActor
    static func bubble(_ view: UIView) -> LiftEnd {
        LiftEnd(box: view.convert(view.bounds, to: nil), scroll: 0, attributes: wrapping(TypeScale.typeBody.attributes(color: Palette.inkStrong)))
    }

    @MainActor
    static func wrapping(_ attributes: [NSAttributedString.Key: Any]) -> [NSAttributedString.Key: Any] {
        var attributes = attributes
        if let paragraph = (attributes[.paragraphStyle] as? NSParagraphStyle)?.mutableCopy() as? NSMutableParagraphStyle {
            paragraph.lineBreakMode = .byWordWrapping
            attributes[.paragraphStyle] = paragraph
        }
        return attributes
    }
}

/// The words in flight between the bubble and the field (composer-recall
/// `fly`): two copies, one set as each end sets them, each showing only what
/// its end shows, travelling from one box to the other on the drawer curve
/// and crossfading. The scale follows the width, so the words keep their shape.
@MainActor
enum LiftFlight {
    static func fly(_ text: String, from: LiftEnd, to: LiftEnd, in window: UIWindow, done: @escaping () -> Void) {
        guard from.box.width > 0, to.box.width > 0 else { return done() }
        func copy(_ end: LiftEnd) -> UIView {
            let clip = UIView()
            clip.isUserInteractionEnabled = false
            clip.clipsToBounds = true
            clip.layer.anchorPoint = .zero
            clip.bounds = CGRect(origin: .zero, size: end.box.size)
            clip.layer.position = end.box.origin
            let label = UILabel()
            label.numberOfLines = 0
            label.attributedText = NSAttributedString(string: text, attributes: end.attributes)
            let height = label.sizeThatFits(CGSize(width: end.box.width, height: .greatestFiniteMagnitude)).height
            label.frame = CGRect(x: 0, y: -end.scroll, width: end.box.width, height: max(height, end.box.height + end.scroll))
            clip.addSubview(label)
            window.addSubview(clip)
            return clip
        }
        let a = copy(from), b = copy(to)
        let k = to.box.width / from.box.width
        let dx = to.box.minX - from.box.minX, dy = to.box.minY - from.box.minY
        b.alpha = 0
        let start = CACurrentMediaTime()
        // Its display link holds it for as long as it runs.
        let ticker = FrameTicker()
        func place(_ e: Double) {
            let towards = 1 + (k - 1) * e, back = 1 + (1 / k - 1) * (1 - e)
            a.transform = CGAffineTransform(translationX: dx * e, y: dy * e).scaledBy(x: towards, y: towards)
            b.transform = CGAffineTransform(translationX: -dx * (1 - e), y: -dy * (1 - e)).scaledBy(x: back, y: back)
            a.alpha = e < 0.55 ? 1 - e / 0.55 : 0
            b.alpha = e < 0.45 ? e / 0.45 : 1
        }
        place(0)
        ticker.run { now in
            let q = min(1, (now - start) / Motion.durLift)
            place(Motion.easeDrawer.value(at: q))
            guard q >= 1 else { return true }
            a.removeFromSuperview()
            b.removeFromSuperview()
            done()
            return false
        }
    }
}

/// The row the composer grows while a queued message is edited
/// (composer-recall `.edit-row`): what is happening, and the two ways out,
/// as key hints on a hardware keyboard or a Keep it button on a touch
/// screen. Inset past the shoulders' curve and clipped to the shape, so
/// what it says comes up from inside it, never above its edge.
@MainActor
final class EditRow: UIView {
    var onKeep: () -> Void = {}
    private let what = UIStackView()
    private let trailing: UIView
    private let clip = CAShapeLayer()
    let keep: UIButton?

    /// Whether the hints can be followed: a Mac, or a hardware keyboard attached.
    static var keyboard: Bool {
        #if targetEnvironment(macCatalyst)
        true
        #else
        GCKeyboard.coalesced != nil
        #endif
    }

    private static let role = TypeRole(weight: .medium, size: TypeScale.textMeta ... TypeScale.textMeta, leading: TypeScale.leadingMeta,
                                       family: FontFamily.fontBody)

    init(keyboard: Bool) {
        if keyboard {
            let hints = UIStackView(arrangedSubviews: [KeyHint("↵", "replaces it"), Self.dot(), KeyHint("esc", "keeps it")])
            hints.spacing = Space.space1
            hints.alignment = .center
            trailing = hints
            keep = nil
        } else {
            var config = UIButton.Configuration.plain()
            config.title = "Keep it"
            let font = Self.role.font
            config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
                var outgoing = incoming
                outgoing.font = font
                outgoing.foregroundColor = Palette.inkMuted
                return outgoing
            }
            config.contentInsets = NSDirectionalEdgeInsets(top: 4, leading: 8, bottom: 4, trailing: 8)
            config.background.cornerRadius = Radius.radiusSm
            let button = UIButton(configuration: config)
            button.accessibilityLabel = "Keep it as it was"
            button.houseStyle()
            trailing = button
            keep = button
        }
        super.init(frame: .zero)
        keep?.addAction(UIAction { [weak self] _ in self?.onKeep() }, for: .primaryActionTriggered)
        // A dot, not a pill: a rounded tag beside the curved shoulder reads as a second, clashing curve.
        let dot = UIView()
        dot.backgroundColor = Palette.statusAttnInk
        dot.layer.cornerRadius = 3
        dot.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([dot.widthAnchor.constraint(equalToConstant: 6), dot.heightAnchor.constraint(equalToConstant: 6)])
        let label = KitLabel(Self.role, ink: Palette.inkRow)
        label.text = "Editing your queued message"
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        what.addArrangedSubview(dot)
        what.addArrangedSubview(label)
        what.spacing = 6
        what.alignment = .center
        let line = UIStackView(arrangedSubviews: [what, UIView(), trailing])
        line.spacing = Space.space2
        line.alignment = .center
        line.translatesAutoresizingMaskIntoConstraints = false
        addSubview(line)
        NSLayoutConstraint.activate([
            line.leadingAnchor.constraint(equalTo: leadingAnchor),
            line.trailingAnchor.constraint(equalTo: trailingAnchor),
            // Clear of the fade at the grown top.
            line.topAnchor.constraint(equalTo: topAnchor, constant: 6),
            line.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        trailing.setContentHuggingPriority(.required, for: .horizontal)
        trailing.setContentCompressionResistancePriority(.required, for: .horizontal)
        layer.mask = clip
        clip.actions = ["path": NSNull(), "bounds": NSNull(), "position": NSNull()]
        for part in [what, trailing] as [UIView] {
            part.alpha = 0
            part.transform = CGAffineTransform(translationX: 0, y: 8)
        }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("EditRow is built in code")
    }

    private static func dot() -> UIView {
        let label = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        label.text = "·"
        return label
    }

    /// The shape, in this row's box.
    func clip(to path: CGPath) {
        clip.frame = bounds
        clip.path = path
    }

    /// The label and the hints come up with the shape, one after the other;
    /// they sink back as it folds.
    func show(_ shown: Bool) {
        let rest = shown ? CGAffineTransform.identity : CGAffineTransform(translationX: 0, y: 8)
        let alpha: CGFloat = shown ? 1 : 0
        guard window != nil, !UIAccessibility.isReduceMotionEnabled else {
            for part in [what, trailing] as [UIView] {
                part.alpha = alpha
                part.transform = rest
            }
            return
        }
        for (i, part) in ([what, trailing] as [UIView]).enumerated() {
            let delay = shown && i == 1 ? Motion.durStagger : 0
            Motion.easeOut.animator(Motion.durFade) { part.alpha = alpha }.startAnimation(afterDelay: delay)
            Motion.easeDrawer.animator(Motion.durPanel) { part.transform = rest }.startAnimation(afterDelay: delay)
        }
    }
}

/// A key and what it does (`kbd`, the jump palette's hint): a recess tile in
/// muted meta, then its word.
@MainActor
final class KeyHint: UIStackView {
    init(_ key: String, _ word: String) {
        super.init(frame: .zero)
        let cap = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        cap.text = key
        cap.textAlignment = .center
        let tile = UIView()
        tile.backgroundColor = Palette.surfaceRecess
        tile.layer.cornerRadius = Radius.radiusXs
        tile.layer.cornerCurve = .continuous
        cap.translatesAutoresizingMaskIntoConstraints = false
        tile.addSubview(cap)
        NSLayoutConstraint.activate([
            tile.heightAnchor.constraint(equalToConstant: 20),
            tile.widthAnchor.constraint(greaterThanOrEqualToConstant: 20),
            cap.leadingAnchor.constraint(equalTo: tile.leadingAnchor, constant: 4),
            cap.trailingAnchor.constraint(equalTo: tile.trailingAnchor, constant: -4),
            cap.centerYAnchor.constraint(equalTo: tile.centerYAnchor),
        ])
        let label = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        label.text = word
        addArrangedSubview(tile)
        addArrangedSubview(label)
        spacing = 4
        alignment = .center
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("KeyHint is built in code")
    }
}

/// A queued message, while its words are in the composer: the draft that
/// stepped aside for them, the grown row, and the way back.
@MainActor
final class QueuedEdit {
    let entry: RecallEntry
    /// What was in the composer, which comes back when the words go.
    var draft: String
    var attachments: [ComposerAttachment]
    var caret: NSRange
    private unowned let composer: ComposerView
    private weak var binding: SessionComposerBinding?
    private var halo: RecallHalo?
    private var row: EditRow?
    private var inset = 0.0
    private(set) var leaving = false

    init(_ entry: RecallEntry, composer: ComposerView, binding: SessionComposerBinding, draft: String, attachments: [ComposerAttachment], caret: NSRange) {
        self.entry = entry
        self.composer = composer
        self.binding = binding
        self.draft = draft
        self.attachments = attachments
        self.caret = caret
    }

    var keepButton: UIView? { row?.keep }

    /// The words lift out of `words` (the bubble's, when it is on screen)
    /// into the field. Both ends are measured first, then the change.
    func begin(from words: UIView?) {
        var from: LiftEnd?
        if let words { from = LiftEnd.bubble(words) }
        Feel.prepare()
        Feel.took()
        binding?.foldQueued(entry.id, true, nil)
        composer.editEnters(entry.text)
        grow()
        composer.field.becomeFirstResponder()
        // A long message opens scrolled to its end, where the caret is.
        composer.scrollFieldToEnd()
        guard let from, let window = composer.window, !UIAccessibility.isReduceMotionEnabled else { return }
        let field = composer.field
        field.alpha = 0
        LiftFlight.fly(entry.text, from: from, to: composer.fieldEnd(), in: window) { field.alpha = 1 }
    }

    /// The composer stays grown by one row while the words are in it.
    private func grow() {
        let ring = composer.ring
        let geometry = RecallGeometry(width: ring.bounds.width, base: ring.bounds.height,
                                      button: composer.historyBox.convert(composer.historyBox.bounds, to: ring).midX)
        composer.grown = true
        let halo = RecallHalo(geometry, extra: Recall.editExtra)
        ring.insertSubview(halo, belowSubview: composer.pill)
        self.halo = halo
        let row = EditRow(keyboard: EditRow.keyboard)
        row.onKeep = { [weak self] in self?.giveBack(nil) }
        // Inset past the shoulders' curve, set from the shape's own taper.
        inset = (Recall.taper(width: geometry.width, extra: Recall.editExtra) + Radius.radiusLg + 8).rounded()
        row.frame = CGRect(x: inset, y: -Recall.editExtra, width: max(0, geometry.width - 2 * inset), height: Recall.editExtra)
        ring.addSubview(row)
        self.row = row
        halo.onPaint = { [weak self] path, box in
            guard let self, let row = self.row else { return }
            var shift = CGAffineTransform(translationX: box.minX - row.frame.minX, y: box.minY - row.frame.minY)
            row.clip(to: path.copy(using: &shift) ?? path)
        }
        halo.paint()
        halo.morph(to: 1, extra: Recall.editExtra, duration: Motion.durGrow)
        // Partway up, once there is room for it.
        if UIAccessibility.isReduceMotionEnabled {
            row.show(true)
        } else {
            DispatchQueue.main.asyncAfter(deadline: .now() + Motion.durControl) { [weak row] in row?.show(true) }
        }
    }

    /// The field grew or shrank: the shape and its row stay on the pill's top edge.
    func relayout() {
        guard let halo, !leaving else { return }
        halo.base = composer.ring.bounds.height
    }

    /// Gives the words back to their bubble: `replacement` takes their
    /// place, or they go back as they were.
    func giveBack(_ replacement: String?) {
        guard !leaving else { return }
        leaving = true
        let words = replacement ?? entry.text
        let from = composer.fieldEnd()
        Feel.gaveBack()
        fold(animated: true)
        composer.editLeaves(self, focus: true)
        binding?.foldQueued(entry.id, false, replacement)
        let binding = binding
        let id = entry.id
        if let target = binding?.queuedWords(id), let window = composer.window, !UIAccessibility.isReduceMotionEnabled {
            target.alpha = 0
            // The bubble is unfolding: where its words will stand, set as they will be.
            target.superview?.layoutIfNeeded()
            LiftFlight.fly(words, from: from, to: LiftEnd.bubble(target), in: window) {
                target.alpha = 1
                if replacement != nil { binding?.flashQueued(id) }
            }
        } else if replacement != nil {
            binding?.flashQueued(id)
        }
        if let replacement { binding?.onReplaceQueued(id, replacement) }
    }

    /// Folds the grown row back into the history button.
    private func fold(animated: Bool) {
        let halo = halo, row = row
        self.halo = nil
        self.row = nil
        let still = !animated || UIAccessibility.isReduceMotionEnabled || composer.window == nil
        row?.show(false)
        let composer = composer
        let done = {
            row?.removeFromSuperview()
            halo?.remove()
            composer.stepOutIfIdle()
        }
        if let halo, !still { halo.morph(to: 0, extra: halo.extra, duration: Motion.durGrowExit, done: done) } else { done() }
    }

    /// Gone at once, the message back as it was (the composer switched conversation).
    func dismiss() {
        guard !leaving else { return }
        leaving = true
        fold(animated: false)
        composer.editLeaves(self, focus: false)
        binding?.foldQueued(entry.id, false, nil)
    }
}
