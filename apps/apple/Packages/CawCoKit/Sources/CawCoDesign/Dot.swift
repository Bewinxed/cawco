import UIKit

/// The house's one dot: a branch's live beat, an ask's mark, and the
/// activity dot (DESIGN.md "Activity dot"), as a pin the agent is working on
/// wears it in its row and card.
public final class Dot: UIView {
    /// The pulse asked for: the lowest opacity at its half, and its period.
    private var pulse: (low: Double, period: TimeInterval)?

    public init(_ side: Double, color: UIColor) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = color
        layer.cornerRadius = side / 2
        NSLayoutConstraint.activate([widthAnchor.constraint(equalToConstant: side), heightAnchor.constraint(equalToConstant: side)])
        setContentHuggingPriority(.required, for: .horizontal)
        setContentCompressionResistancePriority(.required, for: .horizontal)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    /// The dot beats (opacity to 0.3 at half) on --breath, --ease-in-out, unless motion is reduced.
    public func beat() {
        pulse = (0.3, Motion.breath)
        play()
    }

    /// The activity dot's Working pulse (DESIGN.md: "pulses on the 1.2s
    /// loop"; PinList.svelte `pin-live`: opacity to 0.4 at half on
    /// --dur-loop, --ease-in-out); still with reduced motion.
    public func working() {
        pulse = (0.4, Motion.durLoop)
        play()
    }

    /// A layer's animations go when it leaves the window: the pulse starts again when the dot is back.
    override public func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil { play() }
    }

    private func play() {
        layer.removeAnimation(forKey: "beat")
        guard let pulse, !UIAccessibility.isReduceMotionEnabled else { return }
        let beat = CAKeyframeAnimation(keyPath: "opacity")
        beat.values = [1, pulse.low, 1]
        beat.keyTimes = [0, 0.5, 1]
        beat.duration = pulse.period
        beat.timingFunctions = [Motion.easeInOut.function, Motion.easeInOut.function]
        beat.repeatCount = .infinity
        layer.add(beat, forKey: "beat")
    }
}
