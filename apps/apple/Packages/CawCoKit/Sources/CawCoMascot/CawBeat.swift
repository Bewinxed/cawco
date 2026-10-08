import UIKit

/// Caw's needs-you beat at the size of his head in the top bar: the wave of
/// `needs-you-hey` (drawings 21 to 36) seen through a box round his head and
/// raised wing, on a clear ground, in each scheme. It is drawn ahead from his
/// own file by the dashboard's `bun run tab-icon` (tab-icon-art.ts), so the
/// bar runs no Rive for it: the drawings are stepped through once at his
/// loops' pace, 12 a second, and he holds still again.
@MainActor
public enum CawBeat {
    /// Drawings a second: his loops are held on twos of 24.
    public static let pace = 12.0

    private static var cut: [Bool: [UIImage]] = [:]

    /// The beat's drawings for a scheme, cut from its strip once.
    public static func drawings(dark: Bool) -> [UIImage] {
        if let kept = cut[dark] { return kept }
        let name = "bar-beat-needs-you-\(dark ? "dark" : "light")"
        guard let url = Bundle.module.url(forResource: name, withExtension: "png", subdirectory: "beat"),
              let strip = UIImage(contentsOfFile: url.path)?.cgImage
        else {
            preconditionFailure("CawCoMascot has no beat/\(name).png; run `bun run tab-icon` in apps/dashboard")
        }
        let side = strip.height
        // The strip is drawn at 96 px for a 32-point box on a 3x display.
        let scale = Double(side) / 32
        let made = (0 ..< strip.width / side).compactMap { index in
            strip.cropping(to: CGRect(x: index * side, y: 0, width: side, height: side))
                .map { UIImage(cgImage: $0, scale: scale, orientation: .up) }
        }
        cut[dark] = made
        return made
    }

    /// The beat's length: every drawing once, at his pace.
    public static func duration(dark: Bool) -> TimeInterval {
        Double(drawings(dark: dark).count) / pace
    }
}
