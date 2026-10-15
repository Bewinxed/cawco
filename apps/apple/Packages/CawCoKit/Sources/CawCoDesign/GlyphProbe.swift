#if DEBUG
import UIKit

/// What a simulator pass reads of the glyphs (probe-kit spec `ios-scroll-up`):
/// each of a few glyphs drawn twice in a window, as an image view draws its
/// template and as GlyphView draws its bitmap, in the light and the dark,
/// rasterized as the screen shows them and compared pixel by pixel. Solar
/// duotone is two inks of one tint (the second at half alpha); a bitmap that
/// drew it otherwise differs here.
@MainActor
public enum GlyphProbe {
    /// The glyphs compared: duotone and linear marks, at the sizes rows draw them, in their inks.
    private static let cases: [(Glyph, Double, UIColor)] = [
        (.toolGeneric, Size.iconMd, Palette.inkMuted),
        (.cpu, Size.iconMd, Palette.inkMuted),
        (.check, Size.iconSm, Palette.dataOk),
        (.bug, Size.iconMd, Palette.dataBad),
        (.chevronRight, Size.iconSm, Palette.inkMuted),
        (.ghost, Size.rowMarkGlyph, Palette.markGlyph),
        (.rocket, Size.iconMd, Palette.inkMuted),
        (.planet, Size.iconMd, Palette.dataOk),
    ]

    /// Compares every case in `window`: how many, the largest difference of
    /// one channel of one pixel (of 255), and the pixels differing by more than 1.
    public static func compare(in window: UIWindow) -> (compared: Int, worst: Int, differing: Int, pixels: Int) {
        var worst = 0, differing = 0, pixels = 0, compared = 0
        for style in [UIUserInterfaceStyle.light, .dark] {
            for (glyph, side, ink) in cases {
                let template = UIImageView(image: glyph.image)
                template.tintColor = ink
                let cached = GlyphView(glyph, size: side, tint: ink)
                let views: [UIImageView] = [template, cached]
                for view in views {
                    view.contentMode = .scaleAspectFit
                    view.translatesAutoresizingMaskIntoConstraints = true
                    view.overrideUserInterfaceStyle = style
                    view.frame = CGRect(x: 0, y: 0, width: side, height: side)
                    window.insertSubview(view, at: 0)
                    view.layoutIfNeeded()
                }
                let drawn = views.map { raster($0, scale: window.screen.scale) }
                views.forEach { $0.removeFromSuperview() }
                guard drawn[0].count == drawn[1].count, !drawn[0].isEmpty else { continue }
                compared += 1
                pixels += drawn[0].count / 4
                for pixel in stride(from: 0, to: drawn[0].count, by: 4) {
                    var most = 0
                    for channel in 0 ..< 4 { most = max(most, abs(Int(drawn[0][pixel + channel]) - Int(drawn[1][pixel + channel]))) }
                    worst = max(worst, most)
                    if most > 1 { differing += 1 }
                }
            }
        }
        return (compared, worst, differing, pixels)
    }

    /// `view` as the screen shows it, as premultiplied RGBA bytes.
    private static func raster(_ view: UIView, scale: Double) -> [UInt8] {
        let format = UIGraphicsImageRendererFormat()
        format.scale = scale
        format.opaque = false
        let image = UIGraphicsImageRenderer(bounds: view.bounds, format: format).image { _ in
            _ = view.drawHierarchy(in: view.bounds, afterScreenUpdates: true)
        }
        guard let cg = image.cgImage else { return [] }
        let width = cg.width, height = cg.height
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        let drew = bytes.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                                          space: CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB(),
                                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            context.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        return drew ? bytes : []
    }
}
#endif
