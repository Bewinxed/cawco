import UIKit

/// The web dashboard's glyphs: Solar bold duotone, and the few it draws itself
/// (Resources/Icons.xcassets, written by apps/apple/scripts/icons.ts). Each
/// is a template image, so it takes the tint it is drawn in; the duotone's
/// second tone is its own opacity.
public enum Glyph: String, CaseIterable, Sendable {
    case ghost = "ghost-smile-bold-duotone"
    case rocket = "rocket-2-bold-duotone"
    case box = "box-bold-duotone"
    case globe = "global-bold-duotone"
    case book = "book-bold-duotone"
    case lab = "test-tube-bold-duotone"
    case bolt = "bolt-bold-duotone"
    case leaf = "leaf-bold-duotone"
    case planet = "planet-bold-duotone"
    case fire = "fire-bold-duotone"
    case palette = "pallete-2-bold-duotone"
    case sparkles = "magic-stick-3-bold-duotone"
    case attention = "hand-shake-bold-duotone"
    case warning = "danger-triangle-bold-duotone"
    case structure = "structure-bold-duotone"
    case structureOn = "structure-bold"
    case chevronRight = "alt-arrow-right-linear"
    case search = "magnifer-bold-duotone"
    case server = "server-2-bold-duotone"
    case failed = "close-circle-bold-duotone"
    case close
    case tick
    case plus
    case osApple = "os-apple"
    case osTux = "os-tux"
    case osWindows = "os-windows"

    public var image: UIImage {
        guard let image = UIImage(named: rawValue, in: .module, with: nil) else {
            preconditionFailure("Icons.xcassets has no \(rawValue); run apps/apple/scripts/icons.ts")
        }
        return image.withRenderingMode(.alwaysTemplate)
    }

    /// The session sprites, in apps/dashboard/src/lib/cawco/mark.ts's order.
    static let sprites: [Glyph] = [.ghost, .rocket, .box, .globe, .book, .lab, .bolt, .leaf, .planet, .fire, .palette, .sparkles]

    /// The operating system's own mark, from the daemon's `platform-arch`
    /// fingerprint (OsMark.svelte); a server for anything else.
    public static func os(_ fingerprint: String) -> Glyph {
        switch fingerprint.trimmingCharacters(in: .whitespaces).lowercased().split(separator: "-").first {
        case "darwin": .osApple
        case "linux": .osTux
        case "win32", "windows": .osWindows
        default: .server
        }
    }
}

/// A glyph at a fixed size, in its tint. Decorative: hidden from VoiceOver.
public final class GlyphView: UIImageView {
    private let side: Double

    public init(_ glyph: Glyph, size: Double = Size.iconMd, tint: UIColor = Palette.inkMuted) {
        side = size
        super.init(image: glyph.image)
        tintColor = tint
        contentMode = .scaleAspectFit
        isAccessibilityElement = false
        translatesAutoresizingMaskIntoConstraints = false
        setContentHuggingPriority(.required, for: .horizontal)
        setContentCompressionResistancePriority(.required, for: .horizontal)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("GlyphView is built in code")
    }

    public var glyph: Glyph? {
        didSet { image = glyph?.image }
    }

    override public var intrinsicContentSize: CGSize {
        CGSize(width: side, height: side)
    }
}

/// Text in a type role: its font, line height, tracking and ink, set again
/// when Dynamic Type changes.
public final class KitLabel: UILabel {
    public var role: TypeRole { didSet { render() } }
    public var ink: UIColor { didSet { render() } }
    public var tracking: Double { didSet { render() } }
    /// Tabular figures, for times and counts that line up down a list.
    public var tabular = false { didSet { render() } }

    override public var text: String? {
        get { attributedText?.string }
        set { content = newValue ?? ""; render() }
    }

    private var content = ""

    public init(_ role: TypeRole, ink: UIColor = Palette.inkStrong, tracking: Double = 0, lines: Int = 1) {
        self.role = role
        self.ink = ink
        self.tracking = tracking
        super.init(frame: .zero)
        numberOfLines = lines
        translatesAutoresizingMaskIntoConstraints = false
        registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) { (label: KitLabel, _: UITraitCollection) in
            label.render()
        }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("KitLabel is built in code")
    }

    private func render() {
        var attributes = role.attributes(color: ink, tracking: tracking, alignment: textAlignment)
        if tabular, let font = attributes[.font] as? UIFont {
            let descriptor = font.fontDescriptor.addingAttributes([
                .featureSettings: [[UIFontDescriptor.FeatureKey.type: kNumberSpacingType, UIFontDescriptor.FeatureKey.selector: kMonospacedNumbersSelector]],
            ])
            attributes[.font] = UIFont(descriptor: descriptor, size: font.pointSize)
        }
        super.attributedText = NSAttributedString(string: content, attributes: attributes)
    }
}
