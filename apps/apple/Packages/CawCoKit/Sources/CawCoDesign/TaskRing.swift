import UIKit

/// How far a session's plan has got, in the space a glyph takes
/// (TaskRing.svelte). The arc wears the view's tint, the directory's identity
/// ink, so progress stays decoration; finishing is the one moment it takes a
/// state colour, the track and arc giving way to a tick in `--success`.
/// With nothing to count while the session works it holds a short arc, 30%
/// of the ring: alive is the whole claim. Nothing planned and nothing
/// running draws nothing.
public final class TaskRingView: UIView {
    public enum Size: Sendable {
        /// 16pt beside a session title, 12pt in a board row.
        case md, sm

        var box: Double { self == .md ? 16 : 12 }
        var stroke: Double { self == .md ? 1.5 : 1.25 }
    }

    private let size: Size
    private let track = CAShapeLayer()
    private let arc = CAShapeLayer()
    private let ring = CALayer()
    private let tick = CAShapeLayer()
    private var done = 0
    private var total = 0
    private var indeterminate = false
    private var drawn = false

    public init(size: Size = .md) {
        self.size = size
        super.init(frame: CGRect(x: 0, y: 0, width: size.box, height: size.box))
        translatesAutoresizingMaskIntoConstraints = false
        isUserInteractionEnabled = false
        let box = size.box, stroke = size.stroke
        let frame = CGRect(x: 0, y: 0, width: box, height: box)
        // Wound from the top, as a clock is read.
        let circle = UIBezierPath(arcCenter: CGPoint(x: box / 2, y: box / 2), radius: (box - stroke) / 2,
                                  startAngle: -.pi / 2, endAngle: .pi * 1.5, clockwise: true).cgPath
        for layer in [track, arc] {
            layer.frame = frame
            layer.path = circle
            layer.fillColor = nil
            layer.lineWidth = stroke
            ring.addSublayer(layer)
        }
        arc.lineCap = .round
        arc.strokeEnd = 0
        ring.frame = frame
        let mark = UIBezierPath()
        mark.move(to: CGPoint(x: box * 0.28, y: box * 0.53))
        mark.addLine(to: CGPoint(x: box * 0.43, y: box * 0.69))
        mark.addLine(to: CGPoint(x: box * 0.72, y: box * 0.34))
        tick.frame = frame
        tick.path = mark.cgPath
        tick.fillColor = nil
        tick.lineWidth = stroke * 1.2
        tick.lineCap = .round
        tick.lineJoin = .round
        tick.opacity = 0
        layer.addSublayer(ring)
        layer.addSublayer(tick)
        NSLayoutConstraint.activate([widthAnchor.constraint(equalToConstant: box), heightAnchor.constraint(equalToConstant: box)])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: TaskRingView, _: UITraitCollection) in view.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TaskRingView is built in code")
    }

    override public func tintColorDidChange() {
        super.tintColorDidChange()
        paint()
    }

    private func paint() {
        track.strokeColor = Palette.border.resolvedColor(with: traitCollection).cgColor
        arc.strokeColor = tintColor.resolvedColor(with: traitCollection).cgColor
        tick.strokeColor = Palette.success.resolvedColor(with: traitCollection).cgColor
    }

    /// The arc's length eases to the new share over `durPop`; the ring and the
    /// tick trade places over `durExit`, the one leaving shrinking to 0.6.
    public func configure(done: Int = 0, total: Int = 0, indeterminate: Bool = false) {
        let first = !drawn
        guard first || done != self.done || total != self.total || indeterminate != self.indeterminate else { return }
        drawn = true
        self.done = done
        self.total = total
        self.indeterminate = indeterminate
        isHidden = !(total > 0 || indeterminate)
        let finished = total > 0 && done >= total
        let share = indeterminate ? 0.3 : Double(min(done, total)) / Double(max(total, 1))
        let still = first || window == nil
        let reduced = UIAccessibility.isReduceMotionEnabled
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        if !still {
            let grow = CABasicAnimation(keyPath: "strokeEnd")
            grow.fromValue = arc.presentation()?.strokeEnd ?? arc.strokeEnd
            grow.toValue = share
            grow.duration = reduced ? Motion.durControl : Motion.durPop
            grow.timingFunction = Motion.easeOut.function
            arc.add(grow, forKey: "share")
            for (layer, shown) in [(ring, !finished), (tick as CALayer, finished)] where (layer.opacity > 0.5) != shown {
                let fade = CABasicAnimation(keyPath: "opacity")
                fade.fromValue = layer.presentation()?.opacity ?? layer.opacity
                fade.toValue = shown ? 1 : 0
                let scale = CABasicAnimation(keyPath: "transform.scale")
                scale.fromValue = shown ? 0.6 : 1
                scale.toValue = shown ? 1 : 0.6
                let both = CAAnimationGroup()
                both.animations = reduced ? [fade] : [fade, scale]
                both.duration = reduced ? Motion.durControl : Motion.durExit
                both.timingFunction = Motion.easeOut.function
                layer.add(both, forKey: "swap")
            }
        }
        arc.strokeEnd = share
        ring.opacity = finished ? 0 : 1
        tick.opacity = finished ? 1 : 0
        CATransaction.commit()
    }
}
