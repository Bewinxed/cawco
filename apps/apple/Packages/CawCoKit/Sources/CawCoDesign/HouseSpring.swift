import Foundation

/// The spring the house settles a hand-driven surface on (`durSettle`, no
/// bounce: critically damped at that response), stepped by hand each frame
/// so a finger can take the surface again mid-flight. `x` is how far the
/// surface stands from where it is settling, in points; `v` its speed, pt/s.
public struct HouseSpring: Sendable {
    public var x: Double
    public var v: Double
    public let target: Double
    static let stiffness = pow(2 * .pi / Motion.durSettle, 2)
    static let damping = 4 * .pi / Motion.durSettle

    public init(x: Double, v: Double, target: Double) {
        self.x = x
        self.v = v
        self.target = target
    }

    /// Moves it on by `dt` seconds; true once it has come to rest.
    public mutating func step(_ dt: Double) -> Bool {
        var left = dt
        while left > 0 {
            let h = min(left, 1.0 / 240)
            let a = -Self.stiffness * x - Self.damping * v
            v += a * h
            x += v * h
            left -= h
        }
        return abs(x) < 0.5 && abs(v) < 20
    }
}
