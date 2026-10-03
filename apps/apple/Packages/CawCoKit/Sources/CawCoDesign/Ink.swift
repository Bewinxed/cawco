import UIKit

/// One Display P3 colour: red, green, blue, alpha.
public struct P3: Sendable {
    public let red: Double
    public let green: Double
    public let blue: Double
    public let alpha: Double

    public init(_ red: Double, _ green: Double, _ blue: Double, _ alpha: Double) {
        self.red = red
        self.green = green
        self.blue = blue
        self.alpha = alpha
    }

    var color: UIColor { UIColor(displayP3Red: red, green: green, blue: blue, alpha: alpha) }
}

/// A colour a composite token (a shadow layer, a gradient stop) is drawn in,
/// authored once per appearance, the way `light-dark()` reads on the web.
public struct Ink: Sendable {
    public let light: P3
    public let dark: P3

    public init(light: P3, dark: P3) {
        self.light = light
        self.dark = dark
    }

    /// Resolves against the trait collection it is drawn in.
    public var color: UIColor {
        let light = light.color
        let dark = dark.color
        return UIColor { traits in traits.userInterfaceStyle == .dark ? dark : light }
    }
}

/// One layer of a CSS `box-shadow` token, in points.
public struct ShadowLayer: Sendable {
    public let x: Double
    public let y: Double
    public let blur: Double
    public let spread: Double
    public let ink: Ink
    public let inset: Bool

    public init(x: Double, y: Double, blur: Double, spread: Double, ink: Ink, inset: Bool) {
        self.x = x
        self.y = y
        self.blur = blur
        self.spread = spread
        self.ink = ink
        self.inset = inset
    }
}

/// A top-to-bottom `linear-gradient()` token: its stops, evenly spaced.
public struct Gradient: Sendable {
    public let stops: [Ink]

    public init(stops: [Ink]) {
        self.stops = stops
    }

    /// Its stops for a `CAGradientLayer`, under `traits`.
    public func colors(for traits: UITraitCollection) -> [CGColor] {
        stops.map { $0.color.resolvedColor(with: traits).cgColor }
    }
}

