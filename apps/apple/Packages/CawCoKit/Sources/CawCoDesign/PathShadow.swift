import UIKit

/// A shadow token (`BoxShadow`'s rules) cast by any outline rather than a
/// rounded rect: for a surface whose shape changes every frame. Outer shadows
/// are the path offset and blurred, clipped away inside it; an inset ring
/// (blur 0) is a stroke of its spread just inside the path. Add `layer` under
/// the surface; `update` with each new path; `paint` on an appearance change.
@MainActor
public final class PathShadow {
    public let layer = CALayer()
    private let token: [ShadowLayer]
    private var casts: [(layer: CALayer, shadow: ShadowLayer)] = []
    private let outerMask = CAShapeLayer()
    private let outer = CALayer()
    private let ring = CAShapeLayer()
    private let ringMask = CAShapeLayer()
    private var ringShadow: ShadowLayer?

    public init(_ token: [ShadowLayer]) {
        self.token = token
        for part in [layer, outer, outerMask, ring, ringMask] {
            part.actions = Self.still
        }
        outer.mask = outerMask
        layer.addSublayer(outer)
        ring.fillColor = UIColor.clear.cgColor
        ring.mask = ringMask
        layer.addSublayer(ring)
        for shadow in token.reversed() {
            if shadow.inset {
                ringShadow = shadow
                continue
            }
            let cast = CALayer()
            cast.actions = Self.still
            cast.shadowOpacity = 1
            cast.shadowOffset = CGSize(width: shadow.x, height: shadow.y)
            cast.shadowRadius = shadow.blur * BoxShadow.blurScale
            outer.addSublayer(cast)
            casts.append((cast, shadow))
        }
        ring.lineWidth = 2 * (ringShadow?.spread ?? 0)
    }

    private static let still: [String: any CAAction] = [
        "bounds": NSNull(), "position": NSNull(), "path": NSNull(), "shadowPath": NSNull(),
        "shadowColor": NSNull(), "strokeColor": NSNull(), "frame": NSNull(), "opacity": NSNull(),
    ]

    /// The outline, in `layer`'s coordinates, within `bounds`.
    public func update(_ path: CGPath, in bounds: CGRect) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        for part in [layer, outer, outerMask, ring, ringMask] {
            part.frame = bounds
        }
        let outside = UIBezierPath(rect: bounds.insetBy(dx: -200, dy: -200))
        outside.append(UIBezierPath(cgPath: path).reversing())
        outerMask.path = outside.cgPath
        for (cast, _) in casts {
            cast.frame = bounds
            cast.shadowPath = path
        }
        ring.path = path
        ringMask.path = path
    }

    /// The colours for `traits`.
    public func paint(_ traits: UITraitCollection) {
        for (cast, shadow) in casts {
            cast.shadowColor = shadow.ink.color.resolvedColor(with: traits).cgColor
        }
        ring.strokeColor = ringShadow?.ink.color.resolvedColor(with: traits).cgColor
        if traits.displayScale > 0 {
            for part in [layer, outer, outerMask, ring, ringMask] + casts.map(\.layer) {
                part.contentsScale = traits.displayScale
            }
        }
    }
}
