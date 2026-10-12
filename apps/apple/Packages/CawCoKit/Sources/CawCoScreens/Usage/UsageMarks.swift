import CawCoCore
import CawCoDesign
import UIKit

// The usage marks every Rings surface draws (lib/cawco/usage/*.svelte): an
// account's double dial (Rings), the week's mark (WeekMark), the relay bar
// (Relay), its words (Words) and its tooltips, which a tap opens here as a
// kit popover in the web's exact words.

/// An account's double dial (Rings.svelte): the inner disc is its 5-hour
/// window, a sector clockwise from 12 o'clock for the share left over a
/// track disc; the outer rim is its week, drawn the same way in the week's
/// shade. At its limit the spent window's fill goes and its track takes
/// `ring-track-spent`; out of date, the arcs draw at `account-stale-opacity`.
/// Past its weekly reserve the rim under the reserve is the reserved
/// neutral, a notch cut where the reserve sits in the ground's paint.
/// A new reading eases each arc to its value over `durPanel` on the
/// in-out curve; with Reduce Motion it lands at once.
final class RingsView: UIView {
    /// Rim width and the gap inside it, per size (`RIMS`).
    private static let rims: [Double: (Double, Double)] = [16: (1.5, 1), 24: (2, 1.5), 32: (3.5, 1.5), 56: (6, 3)]

    let size: Double
    /// The paint the notch is cut in (`--ring-ground`).
    var ground: UIColor = Palette.surfaceRaised { didSet { paint() } }
    private let discTrack = CAShapeLayer()
    private let disc = CAShapeLayer()
    private let track = CAShapeLayer()
    private let rim = CAShapeLayer()
    private let reserved = CAShapeLayer()
    private let notch = CAShapeLayer()
    private var ring: Rings.Account?

    init(size: Double) {
        self.size = size
        super.init(frame: CGRect(x: 0, y: 0, width: size, height: size))
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        let (rimWidth, gap) = Self.rims[size] ?? (1.5, 1)
        // The web's 24-unit box, at this size.
        let unit = size / 24
        let u = 24 / size
        let w = rimWidth * u
        let rr = 12 - w / 2
        let rd = 12 - w - gap * u
        let centre = CGPoint(x: size / 2, y: size / 2)
        func circle(_ r: Double) -> CGPath {
            UIBezierPath(arcCenter: centre, radius: r * unit, startAngle: -.pi / 2, endAngle: 1.5 * .pi, clockwise: true).cgPath
        }
        discTrack.path = UIBezierPath(ovalIn: CGRect(x: centre.x - rd * unit, y: centre.y - rd * unit, width: 2 * rd * unit, height: 2 * rd * unit)).cgPath
        disc.path = circle(rd / 2)
        disc.lineWidth = rd * unit
        for layer in [track, rim, reserved, notch] {
            layer.path = circle(rr)
            layer.lineWidth = w * unit
        }
        notch.lineWidth = (w + 1.2 * u) * unit
        for layer in [discTrack, disc, track, rim, reserved, notch] {
            layer.frame = bounds
            layer.lineCap = .butt
            layer.contentsScale = UIScreen.main.scale
            self.layer.addSublayer(layer)
        }
        discTrack.lineWidth = 0
        for layer in [disc, track, rim, reserved, notch] {
            layer.fillColor = nil
        }
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: RingsView, _: UITraitCollection) in view.paint() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("RingsView is built in code")
    }

    override var intrinsicContentSize: CGSize { CGSize(width: size, height: size) }

    func configure(_ ring: Rings.Account, animated: Bool) {
        let before = self.ring
        self.ring = ring
        let discLeft = ring.limitOn == .fiveHour ? 0 : (ring.w5?.left ?? 0)
        let rimLeft = ring.limitOn == .week ? 0 : (ring.week?.left ?? 0)
        let reserve = ring.reserveLeft
        CATransaction.begin()
        let moving = animated && before != nil && !UIAccessibility.isReduceMotionEnabled
        CATransaction.setDisableActions(!moving)
        if moving {
            CATransaction.setAnimationDuration(Motion.durPanel)
            CATransaction.setAnimationTimingFunction(Motion.easeInOut.function)
        }
        disc.strokeEnd = discLeft / 100
        rim.strokeEnd = rimLeft / 100
        let held = reserve.map { min(rimLeft, $0) } ?? 0
        reserved.strokeEnd = held / 100
        reserved.opacity = reserve == nil || held <= 0 ? 0 : 1
        if let reserve {
            notch.strokeStart = max(0, reserve - 0.8) / 100
            notch.strokeEnd = min(100, reserve + 0.8) / 100
        }
        notch.opacity = reserve == nil ? 0 : 1
        let arcs: Float = ring.state == .stale ? Float(Motion.accountStaleOpacity) : 1
        disc.opacity = arcs
        rim.opacity = arcs
        CATransaction.commit()
        paint()
    }

    private func paint() {
        guard let ring else { return }
        let traits = traitCollection
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        discTrack.fillColor = (ring.limitOn == .fiveHour ? Palette.ringTrackSpent : Palette.borderControl).resolvedColor(with: traits).cgColor
        track.strokeColor = (ring.limitOn == .week ? Palette.ringTrackSpent : Palette.borderControl).resolvedColor(with: traits).cgColor
        disc.strokeColor = AccountInk.color(ring.hue).resolvedColor(with: traits).cgColor
        rim.strokeColor = AccountInk.week(ring.hue).resolvedColor(with: traits).cgColor
        reserved.strokeColor = Palette.accountReserved.resolvedColor(with: traits).cgColor
        notch.strokeColor = ground.resolvedColor(with: traits).cgColor
        CATransaction.commit()
    }
}

/// The week's mark before a week figure (WeekMark.svelte): a 10pt disc in
/// the track's grey, the week's share left drawn over it as a sector
/// clockwise from 12 o'clock in the rim's shade; any share above nothing
/// shows at least an eighth (`Rings.weekMarkShown`).
final class WeekMarkView: UIView {
    static let side = 10.0
    private let track = CAShapeLayer()
    private let share = CAShapeLayer()
    private var hue = "amber"

    init() {
        super.init(frame: CGRect(x: 0, y: 0, width: Self.side, height: Self.side))
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        track.path = UIBezierPath(ovalIn: bounds).cgPath
        share.path = UIBezierPath(arcCenter: CGPoint(x: 5, y: 5), radius: 2.5, startAngle: -.pi / 2, endAngle: 1.5 * .pi, clockwise: true).cgPath
        share.lineWidth = 5
        share.fillColor = nil
        for layer in [track, share] {
            layer.frame = bounds
            self.layer.addSublayer(layer)
        }
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: WeekMarkView, _: UITraitCollection) in view.paint() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("WeekMarkView is built in code")
    }

    override var intrinsicContentSize: CGSize { CGSize(width: Self.side, height: Self.side) }

    func configure(_ ring: Rings.Account) {
        hue = ring.hue
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        share.strokeEnd = Rings.weekMarkShown(ring) / 100
        CATransaction.commit()
        paint()
    }

    private func paint() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        track.fillColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
        share.strokeColor = AccountInk.week(hue).resolvedColor(with: traitCollection).cgColor
        CATransaction.commit()
    }
}

/// A span nobody carries (Relay.svelte `.blank`): hatched, 1pt
/// `border-control` stripes at 45°, `space-1` apart, over the ground; the
/// stop starts on a 1pt `ink-strong` tick.
final class HatchView: UIView {
    var ground: UIColor = Palette.surfaceRaised { didSet { setNeedsDisplay() } }
    var stop = false { didSet { setNeedsDisplay() } }

    override init(frame: CGRect) {
        super.init(frame: frame)
        isOpaque = false
        contentMode = .redraw
        isUserInteractionEnabled = false
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: HatchView, _: UITraitCollection) in view.setNeedsDisplay() }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("HatchView is built in code")
    }

    override func draw(_ rect: CGRect) {
        guard let context = UIGraphicsGetCurrentContext() else { return }
        context.setFillColor(ground.resolvedColor(with: traitCollection).cgColor)
        context.fill(bounds)
        // `repeating-linear-gradient(-45deg, …)`: the bands run up and to the
        // right, one 1pt stripe each `space-1` across them.
        let step = Space.space1 * 2.squareRoot()
        context.setStrokeColor(Palette.borderControl.resolvedColor(with: traitCollection).cgColor)
        context.setLineWidth(1)
        var x = -bounds.height
        while x < bounds.width + bounds.height {
            context.move(to: CGPoint(x: x, y: bounds.height))
            context.addLine(to: CGPoint(x: x + bounds.height, y: 0))
            x += step
        }
        context.strokePath()
        if stop {
            context.setFillColor(Palette.inkStrong.resolvedColor(with: traitCollection).cgColor)
            context.fill(CGRect(x: 0, y: 0, width: 1, height: bounds.height))
        }
    }
}

/// The relay (Relay.svelte): who carries your new sessions across the next
/// five hours as one bar on a `border-control` groove, a band per carry
/// span in its account's hue, 2pt apart; a span nobody carries hatched, the
/// stop behind its tick; hour ticks under it, each placed by the bar's own
/// mapping. A tap on a band names its account and span and lights its cell.
final class RelayView: UIView {
    static let gap = 2.0
    /// 7pt; 11pt on touch, which every iOS screen is.
    static let barHeight = Space.space3
    var ground: UIColor = Palette.surfaceRaised { didSet { blanks.forEach { $0.ground = ground } } }
    /// A band was tapped: its segment and its view.
    var onBand: (Rings.Segment, UIView) -> Void = { _, _ in }

    private let bar = UIView()
    private var bands: [UIView] = []
    private var blanks: [HatchView] = []
    private var drawn: [(Rings.Segment, UIView)] = []
    private var tickViews: [(Rings.Tick, UIView, KitLabel)] = []
    private var segments: [Rings.Segment] = []
    private var ticks: [Rings.Tick] = []
    private let tickRole = TypeScale.typeMeta.figure()

    override init(frame: CGRect) {
        super.init(frame: frame)
        bar.layer.cornerRadius = Radius.radiusHair
        bar.clipsToBounds = true
        bar.backgroundColor = Palette.borderControl
        // The bar reads out whole ("Next 5 hours: …") as a group, and each
        // band in it is its own control with its own words.
        bar.isAccessibilityElement = false
        bar.accessibilityContainerType = .semanticGroup
        bar.accessibilityIdentifier = "usage-relay"
        addSubview(bar)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("RelayView is built in code")
    }

    /// The ticks' line: `space-1` and one meta line.
    private var ticksHeight: Double { Space.space1 + TypeScale.typeMeta.lineHeight }

    override var intrinsicContentSize: CGSize {
        CGSize(width: UIView.noIntrinsicMetric, height: Self.barHeight + ticksHeight)
    }

    func configure(_ segments: [Rings.Segment], stopKey: String?, names: (Rings.Account) -> String) {
        self.segments = segments
        ticks = Rings.ticks(segments)
        drawn.forEach { $0.1.removeFromSuperview() }
        drawn = []
        bands = []
        blanks = []
        for seg in segments {
            if let ring = seg.ring {
                let band = UIControl()
                band.backgroundColor = AccountInk.color(ring.hue)
                band.layer.cornerRadius = Radius.radiusHair
                band.alpha = ring.state == .stale ? Motion.accountStaleOpacity : 1
                band.isAccessibilityElement = true
                band.accessibilityTraits = .button
                band.accessibilityLabel = Rings.bandTip(seg, name: names(ring))
                band.accessibilityIdentifier = "usage-band-\(seg.id)"
                band.addAction(UIAction { [weak self, weak band] _ in
                    guard let self, let band else { return }
                    onBand(seg, band)
                }, for: .touchUpInside)
                bar.addSubview(band)
                bands.append(band)
                drawn.append((seg, band))
            } else {
                let blank = HatchView()
                blank.ground = ground
                blank.stop = seg.id == stopKey
                blank.accessibilityIdentifier = seg.id == stopKey ? "relay-stop" : nil
                bar.addSubview(blank)
                blanks.append(blank)
                drawn.append((seg, blank))
            }
        }
        bar.accessibilityLabel = Rings.relayLabel(segments)
        tickViews.forEach { $0.1.removeFromSuperview(); $0.2.removeFromSuperview() }
        tickViews = ticks.map { tick in
            let mark = UIView()
            mark.backgroundColor = Palette.inkSubtle
            let label = KitLabel(tickRole, ink: Palette.inkSubtle)
            label.text = tick.text
            label.isAccessibilityElement = false
            label.translatesAutoresizingMaskIntoConstraints = true
            addSubview(mark)
            addSubview(label)
            return (tick, mark, label)
        }
        setNeedsLayout()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let width = bounds.width
        bar.frame = CGRect(x: 0, y: 0, width: width, height: Self.barHeight)
        let total = segments.reduce(0) { $0 + $1.ms }
        let room = max(0, width - Double(max(0, segments.count - 1)) * Self.gap)
        var x = 0.0
        for (seg, view) in drawn {
            let w = total > 0 ? room * seg.ms / total : 0
            view.frame = CGRect(x: x, y: 0, width: w, height: Self.barHeight)
            x += w + Self.gap
        }
        for (tick, mark, label) in tickViews {
            let at = room * tick.share + Double(tick.gaps) * Self.gap
            mark.frame = CGRect(x: tick.hour == 5 ? at - 1 : tick.hour == 0 ? at : at - 0.5, y: Self.barHeight, width: 1, height: 3)
            let size = label.intrinsicContentSize
            let left = switch tick.hour {
            case 0: at
            case 5: at - size.width
            default: at - size.width / 2
            }
            label.frame = CGRect(x: left, y: Self.barHeight + 3 + 1, width: size.width, height: size.height)
        }
    }
}

/// A Rings sentence, typeset (Words.svelte): plain words in the line's own
/// ink; emphasis at weight 500 in the strongest ink; a measured figure in
/// the mono figure face at 500; an account's name led by its 6pt dot.
enum UsageWords {
    static func text(_ parts: [Rings.Part], role: TypeRole, ink: UIColor, strongInk: UIColor = Palette.inkStrong,
                     traits: UITraitCollection) -> NSAttributedString {
        let out = NSMutableAttributedString()
        let base = role.attributes(color: ink)
        let strong = role.withWeight(.medium)
        let figure = role.figure(weight: .medium)
        func run(_ text: String, _ attributes: [NSAttributedString.Key: Any]) {
            out.append(NSAttributedString(string: text, attributes: attributes))
        }
        var bold = base
        bold[.font] = strong.font
        bold[.foregroundColor] = strongInk
        for part in parts {
            switch part {
            case let .text(text):
                run(text, base)
            case let .strong(text):
                run(text, bold)
            case let .figure(text):
                var mono = bold
                mono[.font] = figure.font
                run(text, mono)
            case let .account(name, hue):
                let dot = NSTextAttachment()
                let side = 6.0
                dot.image = UIGraphicsImageRenderer(size: CGSize(width: side + 4, height: side)).image { _ in
                    AccountInk.color(hue).resolvedColor(with: traits).setFill()
                    UIBezierPath(ovalIn: CGRect(x: 0, y: 0, width: side, height: side)).fill()
                }
                // `vertical-align: 1px` from the baseline.
                dot.bounds = CGRect(x: 0, y: 1, width: side + 4, height: side)
                var at = base
                at[.attachment] = dot
                out.append(NSAttributedString(string: "\u{FFFC}", attributes: at))
                run(name, bold)
            }
        }
        return out
    }
}

/// The kit tooltip's words, opened by a tap (tip.svelte with `tap`): a
/// kit popover holding the tip's text, its first line strong where the tip
/// has a title (a dial's names whose it is), in meta type. A second tap
/// anywhere closes it.
final class UsageTipController: KitPopoverController {
    private let titleText: String?
    private let body: String
    private let stack = UIStackView()
    static let maxWidth = 280.0

    init(_ body: String, title: String? = nil) {
        titleText = title
        self.body = body
        super.init()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("UsageTipController is built in code")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        stack.axis = .vertical
        stack.spacing = 2
        stack.translatesAutoresizingMaskIntoConstraints = false
        if let titleText {
            let head = KitLabel(TypeScale.typeMeta.withWeight(.medium), ink: Palette.inkStrong, lines: 0)
            head.text = titleText
            stack.addArrangedSubview(head)
        }
        let words = KitLabel(TypeScale.typeMeta, ink: Palette.inkRow, lines: 0)
        words.text = body
        usageProbe?.notice("tip title=\(self.titleText ?? "-", privacy: .public) body=\(self.body.replacingOccurrences(of: "\n", with: " / "), privacy: .public)")
        words.accessibilityIdentifier = "usage-tip"
        stack.addArrangedSubview(words)
        card.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: card.topAnchor, constant: Space.space2),
            stack.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -Space.space2),
            stack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: Space.space3),
            stack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -Space.space3),
        ])
        let fit = stack.systemLayoutSizeFitting(CGSize(width: Self.maxWidth - 2 * Space.space3, height: 0),
                                                withHorizontalFittingPriority: .fittingSizeLevel, verticalFittingPriority: .fittingSizeLevel)
        let width = min(Self.maxWidth, fit.width + 2 * Space.space3)
        let tall = stack.systemLayoutSizeFitting(CGSize(width: width - 2 * Space.space3, height: 0),
                                                 withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height
        preferredContentSize = CGSize(width: width.rounded(.up), height: (tall + 2 * Space.space2).rounded(.up))
    }

    /// Opens a tip off `source` (the part of it in `rect`), on `side`, centred on it.
    @discardableResult
    static func show(_ body: String, title: String? = nil, from source: UIView, rect: CGRect? = nil, side: KitPopover.Side,
                     in presenter: UIViewController, onClose: (() -> Void)? = nil) -> UsageTipController {
        let tip = UsageTipController(body, title: title)
        tip.onClose = onClose
        KitPopover.present(tip, from: source, rect: rect, in: presenter, align: .center, side: side, offset: 8)
        return tip
    }

    var onClose: (() -> Void)?

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        onClose?()
    }
}
