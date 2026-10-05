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
    case archive = "archive-down-minimlistic-bold-duotone"
    // The transcript's (apps/dashboard/src/lib/icons.ts).
    case user = "user-bold-duotone"
    case cpu = "cpu-bold-duotone"
    case terminal = "code-square-bold-duotone"
    case toolRead = "document-text-bold-duotone"
    case toolEdit = "pen-2-bold-duotone"
    case toolWrite = "pen-new-square-bold-duotone"
    case toolFiles = "folder-with-files-bold-duotone"
    case toolMessage = "plain-2-bold-duotone"
    case toolScreen = "cursor-bold-duotone"
    case toolNavigate = "compass-bold-duotone"
    case toolCode = "code-2-bold-duotone"
    case toolMcp = "plug-circle-bold-duotone"
    case toolTask = "users-group-rounded-bold-duotone"
    case toolTodo = "checklist-bold-duotone"
    case toolNotebook = "notebook-bold-duotone"
    case ask = "question-circle-bold-duotone"
    case toolGeneric = "sledgehammer-bold-duotone"
    case info = "info-circle-bold-duotone"
    case stop = "stop-bold-duotone"
    case dot = "record-circle-bold-duotone"
    case hook = "routing-2-bold-duotone"
    case subagent = "branching-paths-down-bold-duotone"
    case jev = "scale-bold-duotone"
    case window = "window-frame-bold-duotone"
    case rules = "shield-check-bold-duotone"
    case report = "clipboard-check-bold-duotone"
    case reportFailed = "clipboard-remove-bold-duotone"
    case workflow = "share-circle-bold-duotone"
    case handoff = "inbox-in-bold-duotone"
    case check = "check-read-bold-duotone"
    case arrowDown = "arrow-down-bold-duotone"
    case external = "square-top-down-bold-duotone"
    case maximize = "maximize-bold-duotone"
    case alert = "danger-circle-bold-duotone"
    case chat = "chat-square-bold-duotone"
    case document = "file-text-bold-duotone"
    case copy = "copy-bold-duotone"
    case chevronBold = "alt-arrow-right-bold-duotone"
    // The session screen's chrome.
    case passed = "check-circle-bold-duotone"
    case sleeping = "moon-sleep-bold-duotone"
    case pause = "pause-circle-bold-duotone"
    case working = "refresh-circle-bold-duotone"
    case arrowUp = "arrow-up-linear"
    case chevronDown = "alt-arrow-down-linear"
    case chevronLeft = "alt-arrow-left-linear"
    // The shell's (bar, sidebar, projects, machines, jump, assistant, panes).
    case chevronUp = "alt-arrow-up-linear"
    case arrowRight = "arrow-right-linear"
    case alignLeft = "align-left-bold-duotone"
    case assistant = "eye-scan-bold-duotone"
    case folder = "folder-bold-duotone"
    case key = "key-bold-duotone"
    case laptop = "laptop-minimalistic-bold-duotone"
    case monitor = "monitor-bold-duotone"
    case moon = "moon-bold-duotone"
    case sun = "sun-bold-duotone"
    case pin = "pin-bold-duotone"
    case refresh = "refresh-bold-duotone"
    case settings = "settings-bold-duotone"
    case shield = "shield-bold-duotone"
    case sidebar = "sidebar-minimalistic-bold-duotone"
    case sort = "sort-bold-duotone"
    case unfold = "sort-vertical-bold-duotone"
    case trash = "trash-bin-minimalistic-bold-duotone"
    case download = "download-bold-duotone"
    case more = "menu-dots-bold-duotone"
    case machineLaptop = "laptop-bold-duotone"
    case machineServer = "server-square-bold-duotone"
    case documents = "documents-bold-duotone"
    case close
    case tick
    case plus
    case osApple = "os-apple"
    case osTux = "os-tux"
    case osWindows = "os-windows"
    // The new-session dialog (spawn/*.svelte).
    case chatRound = "chat-round-line-bold-duotone"
    case folderOpen = "folder-open-bold-duotone"
    case database = "database-bold-duotone"
    case tuning = "tuning-2-bold-duotone"
    case notes = "notes-bold-duotone"
    case closeSquare = "close-square-bold-duotone"
    case addCircle = "add-circle-linear"
    case addCircleSolid = "add-circle-bold-duotone"
    case cpuBolt = "cpu-bolt-bold-duotone"
    case arrowLeft = "arrow-left-linear"
    case stars = "stars-bold-duotone"
    case bookOpen = "book-2-bold-duotone"
    case link = "link-bold-duotone"
    /// ContextMeter.svelte's `IconWindow`.
    case layers = "layers-minimalistic-bold-duotone"
    case fork = "branching-paths-up-bold-duotone"
    /// PiLogo.svelte: one ink, drawn in the text colour.
    case logoPi = "logo-pi"

    /// The web's names for glyphs the transcript already carries under its own.
    public static let send = Glyph.toolMessage // plain-2-bold-duotone (IconSend)
    public static let answer = Glyph.check // check-read-bold-duotone (IconCheck)

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

/// A maker's or a harness's mark in its own colours (HarnessLogo.svelte,
/// ProviderLogo.svelte, the GitHub mark): never tinted, only placed.
public enum BrandLogo: String, Sendable {
    case claude = "logo-claude"
    case openai = "logo-openai"
    case github = "logo-github"
    case grok = "logo-grok"
    case mistral = "logo-mistral"
    case moonshot = "logo-moonshot"
    case qwen = "logo-qwen"
    case deepseek = "logo-deepseek"
    case gemini = "logo-gemini"
    case meta = "logo-meta"
    case minimax = "logo-minimax"
    case nvidia = "logo-nvidia"
    case zhipu = "logo-zhipu"
    case opencode = "logo-opencode"

    public var image: UIImage {
        guard let image = UIImage(named: rawValue, in: .module, with: nil) else {
            preconditionFailure("Icons.xcassets has no \(rawValue); run apps/apple/scripts/icons.ts")
        }
        return image.withRenderingMode(.alwaysOriginal)
    }

    /// ProviderLogo.svelte's LOGOS, by the lab `providerOf` names.
    public static func provider(_ lab: String?) -> BrandLogo? {
        switch lab {
        case "anthropic": .claude
        case "openai": .openai
        case "deepseek": .deepseek
        case "google": .gemini
        case "xai": .grok
        case "qwen": .qwen
        case "moonshot": .moonshot
        case "zhipu": .zhipu
        case "meta": .meta
        case "mistral": .mistral
        case "minimax": .minimax
        case "nvidia": .nvidia
        default: nil
        }
    }

    /// HarnessLogo.svelte: the harness's mark, as an image view at `side`.
    @MainActor
    public static func harnessView(_ harness: String, side: Double = 16) -> UIImageView {
        let view: UIImageView = switch harness {
        case "claude": UIImageView(image: BrandLogo.claude.image)
        case "opencode": UIImageView(image: BrandLogo.opencode.image)
        case "pi": GlyphView(.logoPi, size: side, tint: Palette.inkStrong)
        default: UIImageView(image: BrandLogo.openai.image)
        }
        view.contentMode = .scaleAspectFit
        view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            view.widthAnchor.constraint(equalToConstant: side),
            view.heightAnchor.constraint(equalToConstant: side),
        ])
        view.isAccessibilityElement = false
        return view
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
