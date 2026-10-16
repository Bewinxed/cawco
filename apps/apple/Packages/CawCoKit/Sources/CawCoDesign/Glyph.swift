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
    case zoomIn = "minimalistic-magnifer-zoom-in-bold-duotone"
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
    case artifactSheet = "widget-4-bold-duotone"
    case rules = "shield-check-bold-duotone"
    case report = "clipboard-check-bold-duotone"
    case reportFailed = "clipboard-remove-bold-duotone"
    case workflow = "share-circle-bold-duotone"
    case handoff = "inbox-in-bold-duotone"
    case check = "check-read-bold-duotone"
    case arrowDown = "arrow-down-bold-duotone"
    case external = "square-top-down-bold-duotone"
    case maximize = "maximize-bold-duotone"
    case minimize = "minimize-bold-duotone"
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
    // The shell's (bar, sidebar, projects, machines, jump, panes).
    case chevronUp = "alt-arrow-up-linear"
    case arrowRight = "arrow-right-linear"
    case alignLeft = "align-left-bold-duotone"
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
    case sidebar = "sidebar-minimalistic-line-duotone"
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
    // The Sound switch.
    case soundOn = "volume-loud-bold-duotone"
    case soundOff = "volume-cross-bold-duotone"
    /// TaskSheet.svelte's `IconLock`: a task that waits on others.
    case lock = "lock-keyhole-minimalistic-bold-duotone"
    // The paywall's free-week rows: Today, Day 6 (Day 7 is `lock`).
    case unlock = "lock-keyhole-minimalistic-unlocked-bold-duotone"
    case bell = "bell-bold-duotone"
    // Configure (config/sections.ts, updates/UpdateCell.svelte, updates/ReleaseNotes.svelte).
    case phone = "smartphone-bold-duotone"
    /// Spend's (IconDollar).
    case dollar = "dollar-bold-duotone"
    case clock = "clock-circle-bold-duotone"
    case graphUp = "graph-up-bold-duotone"
    case bug = "bug-bold-duotone"
    /// StopTray.svelte's `Away`: a session whose machine is away stops when it is back.
    case away = "cloud-cross-bold-duotone"
    /// The preview's Comment (PreviewPane.svelte `IconComment`).
    case comment = "chat-round-dots-bold-duotone"
    /// The preview's Draw (PreviewPane.svelte `IconPen`).
    case pen = "pen-bold-duotone"
    /// A pin's Reopen (PinCard.svelte `IconReopen`).
    case reopen = "restart-bold-duotone"
    /// The pins' moved tray (PinList.svelte `IconMapPoint`).
    case mapPoint = "map-point-bold-duotone"
    // Configure → Accounts (AccountEditor.svelte, AccountMachines.svelte, KeyPanel.svelte).
    case logout = "logout-2-bold-duotone"
    case eye = "eye-bold-duotone"
    case eyeClosed = "eye-closed-bold-duotone"
    case usage = "chart-2-bold-duotone"
    // The task sheet's result kinds (tasks/ResultView.svelte).
    case dataLayers = "layers-bold-duotone" // IconLayers
    case fileTable = "clipboard-list-bold-duotone" // IconFileTable

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

/// A maker's or a harness's mark (HarnessLogo.svelte, ProviderLogo.svelte,
/// the GitHub mark): in its own colours, never tinted, only placed; but for
/// the one-ink marks (`inked`), which draw in the ink of wherever they stand.
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
    case copilot = "logo-copilot"
    case openrouter = "logo-openrouter"
    case groq = "logo-groq"
    case cerebras = "logo-cerebras"
    case huggingface = "logo-huggingface"
    case perplexity = "logo-perplexity"
    case together = "logo-together"
    case baseten = "logo-baseten"
    case bedrock = "logo-bedrock"
    case cloudflare = "logo-cloudflare"
    case fireworks = "logo-fireworks"
    case kimi = "logo-kimi"
    case vercel = "logo-vercel"
    case xiaomi = "logo-xiaomi"

    /// ProviderLogo.svelte's `INK` and accounts/marks.ts: upstream these carry
    /// a fixed dark fill that vanishes on the dark theme, or no colour of
    /// their own; they follow the ink, as glyphs do.
    public var inked: Bool { [.openai, .github, .grok, .moonshot, .copilot, .openrouter, .bedrock, .vercel].contains(self) }

    /// An account provider's mark (accounts/marks.ts `SOURCES`), by the
    /// account's provider id (pi-ai's, or OpenCode's own); nil when nobody
    /// draws one for it.
    public static func account(_ provider: String) -> BrandLogo? {
        switch provider {
        case "anthropic": .claude
        case "openai-codex", "openai", "azure-openai-responses": .openai
        case "github-copilot": .copilot
        case "openrouter": .openrouter
        case "zai", "zai-coding-cn", "zai-coding-plan": .zhipu
        case "xai": .grok
        case "groq": .groq
        case "cerebras": .cerebras
        case "google", "google-vertex", "google-gemini-cli": .gemini
        case "mistral": .mistral
        case "deepseek": .deepseek
        case "kimi-coding": .kimi
        case "moonshotai", "moonshotai-cn": .moonshot
        case "minimax", "minimax-cn": .minimax
        case "fireworks": .fireworks
        case "together": .together
        case "vercel-ai-gateway": .vercel
        case "amazon-bedrock": .bedrock
        case "opencode", "opencode-go": .opencode
        case "huggingface": .huggingface
        case "nvidia": .nvidia
        case "qwen-token-plan", "qwen-token-plan-cn", "qwen-token-plan-individual": .qwen
        case "meta": .meta
        case "perplexity": .perplexity
        case "baseten": .baseten
        case "cloudflare-workers-ai", "cloudflare-ai-gateway": .cloudflare
        case "xiaomi", "xiaomi-token-plan-cn", "xiaomi-token-plan-ams", "xiaomi-token-plan-sgp": .xiaomi
        default: nil
        }
    }

    public var image: UIImage {
        guard let image = UIImage(named: rawValue, in: .module, with: nil) else {
            preconditionFailure("Icons.xcassets has no \(rawValue); run apps/apple/scripts/icons.ts")
        }
        return image.withRenderingMode(inked ? .alwaysTemplate : .alwaysOriginal)
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
///
/// Drawn once into a bitmap in its tint, at the size it stands at and its
/// screen's scale (GlyphBitmaps), and shown as that bitmap: a template image
/// was drawn from its vector again each time its view came into a window
/// (every row a transcript scrolled to), most of what standing a row there
/// cost the main thread. It is drawn again only when what it is drawn from
/// changes: its glyph, its size, its tint as it resolves (a theme, a
/// contrast, a tint dimmed under a sheet), its scale.
open class GlyphView: UIImageView {
    private let side: Double
    /// The bitmap shown now, by what it was drawn from.
    private var drawn: GlyphBitmaps.Key?

    public init(_ glyph: Glyph, size: Double = Size.iconMd, tint: UIColor = Palette.inkMuted) {
        side = size
        self.glyph = glyph
        super.init(image: nil)
        tintColor = tint
        contentMode = .scaleAspectFit
        isAccessibilityElement = false
        translatesAutoresizingMaskIntoConstraints = false
        setContentHuggingPriority(.required, for: .horizontal)
        setContentCompressionResistancePriority(.required, for: .horizontal)
        registerForTraitChanges([UITraitUserInterfaceStyle.self, UITraitDisplayScale.self, UITraitAccessibilityContrast.self]) { (view: GlyphView, _: UITraitCollection) in
            view.paint()
        }
        paint()
    }

    @available(*, unavailable)
    public required init?(coder _: NSCoder) {
        fatalError("GlyphView is built in code")
    }

    public var glyph: Glyph? {
        didSet { if glyph != oldValue { paint() } }
    }

    override public var intrinsicContentSize: CGSize {
        CGSize(width: side, height: side)
    }

    override open func tintColorDidChange() {
        super.tintColorDidChange()
        paint()
    }

    override open func layoutSubviews() {
        super.layoutSubviews()
        paint()
    }

    /// Shows the bitmap for what the glyph is drawn from now, drawing it
    /// only when no view has before: the square it stands in (`side` until
    /// layout gives it one), its tint resolved for its traits, its scale.
    private func paint() {
        guard let glyph else {
            drawn = nil
            image = nil
            return
        }
        let square = bounds.width > 0 && bounds.height > 0 ? min(bounds.width, bounds.height) : side
        let ink = (tintColor ?? Palette.inkMuted).resolvedColor(with: traitCollection)
        let key = GlyphBitmaps.Key(glyph: glyph, side: square, scale: GlyphBitmaps.scale(of: traitCollection), ink: ink)
        guard key != drawn else { return }
        drawn = key
        image = GlyphBitmaps.image(key, ink: ink)
    }
}

/// Glyphs drawn into bitmaps (GlyphView), one per glyph, size, ink and scale.
@MainActor
enum GlyphBitmaps {
    struct Key: Hashable {
        let glyph: Glyph
        /// The square's side in points, to a hundredth.
        let side: Int
        let scale: Int
        /// The ink, its components to 1/255.
        let ink: [Int]

        init(glyph: Glyph, side: Double, scale: Double, ink: UIColor) {
            self.glyph = glyph
            self.side = Int((side * 100).rounded())
            self.scale = Int(scale.rounded())
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            ink.getRed(&r, green: &g, blue: &b, alpha: &a)
            self.ink = [r, g, b, a].map { Int(($0 * 255).rounded()) }
        }
    }

    private static var drawn: [Key: UIImage] = [:]
    /// The most bitmaps kept: every glyph at a few sizes in a few inks is far fewer.
    private static let most = 2048
    /// The scale a view out of every window draws at: the last a view in one had.
    private static var lastScale = 3.0

    /// The scale `traits` draw at; a view in no window yet has none of its own.
    static func scale(of traits: UITraitCollection) -> Double {
        guard traits.displayScale > 0 else { return lastScale }
        lastScale = traits.displayScale
        return traits.displayScale
    }

    /// The glyph `key` names, drawn in `ink`: its template's alpha in the ink,
    /// aspect-fit in its square, as an image view draws a template.
    static func image(_ key: Key, ink: UIColor) -> UIImage {
        if let image = drawn[key] { return image }
        let side = Double(key.side) / 100
        let format = UIGraphicsImageRendererFormat.preferred()
        format.scale = Double(key.scale)
        format.opaque = false
        let template = key.glyph.image
        let fit = Self.fit(template.size, in: side)
        let image = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { _ in
            template.withTintColor(ink, renderingMode: .alwaysOriginal).draw(in: fit)
        }.withRenderingMode(.alwaysOriginal)
        if drawn.count >= most { drawn.removeAll(keepingCapacity: true) }
        drawn[key] = image
        return image
    }

    /// `size` scaled to fit a square of `side`, centred in it.
    private static func fit(_ size: CGSize, in side: Double) -> CGRect {
        guard size.width > 0, size.height > 0 else { return CGRect(x: 0, y: 0, width: side, height: side) }
        let scale = min(side / size.width, side / size.height)
        let width = size.width * scale, height = size.height * scale
        return CGRect(x: (side - width) / 2, y: (side - height) / 2, width: width, height: height)
    }
}

/// Text in a type role: its font, line height, tracking and ink, set again
/// when Dynamic Type changes.
///
/// The label holds the string it was given: `text`, its size on one line and
/// what VoiceOver reads come from that. What it draws can differ in two ways,
/// both WebKit's rules (`TextWrap`), worked out for the width it is drawn at:
/// its lines under `wrap`, and where a tail that does not fit is cut.
public final class KitLabel: UILabel {
    public var role: TypeRole { didSet { render() } }
    public var ink: UIColor { didSet { render() } }
    /// Letter-spacing in em that the element this label ports sets over its
    /// role's; nil draws the role's own.
    public var tracking: Double? { didSet { render() } }
    /// Tabular figures, for times and counts that line up down a list.
    public var tabular = false { didSet { render() } }
    /// How a label of more than one line chooses its lines: the web's
    /// `text-wrap-style` on the element this label ports.
    public var wrap: TextWrap = .greedy {
        didSet {
            guard wrap != oldValue else { return }
            forget()
            invalidateIntrinsicContentSize()
            setNeedsDisplay()
        }
    }

    override public var text: String? {
        get { attributedText?.string }
        set { content = newValue ?? ""; given = false; render() }
    }

    /// A string of the caller's own making (two faces, a marked match): the
    /// label wraps and cuts it as it stands and no longer restyles it from
    /// its role; when Dynamic Type changes, its role faces are set again at
    /// the new setting (`textSizeChanged`).
    override public var attributedText: NSAttributedString? {
        get { super.attributedText }
        set { given = true; place(newValue) }
    }

    override public var numberOfLines: Int { didSet { forget() } }

    override public var lineBreakMode: NSLineBreakMode {
        get { super.lineBreakMode }
        set {
            super.lineBreakMode = newValue
            forget()
            // UIKit may restate the mode from a string's paragraph as the
            // string is set; only a caller's own choice counts, and it goes
            // into the label's own string: a string's paragraph decides how
            // a label cuts it, whatever the label's own mode says.
            guard !placing, newValue != chosenBreak else { return }
            chosenBreak = newValue
            render()
        }
    }

    private var content = ""
    /// Whether the label holds a string the caller attributed itself.
    private var given = false
    /// Where text that does not fit is cut, as the caller asked: its tail
    /// (cut here, by WebKit's rule), its head or its middle (cut by UIKit).
    private var chosenBreak: NSLineBreakMode = .byTruncatingTail
    /// Whether text that does not fit ends in an ellipsis at its tail.
    private var cutsTail: Bool { chosenBreak == .byTruncatingTail }
    private var placing = false
    private var paragraph: WrapParagraph?
    /// The string last drawn or measured in place of the label's own, and
    /// the width it was made for; a nil string is the label's own.
    private var shown: (width: Double, text: NSAttributedString?)?
    /// Draws and measures `shown` as a label does, so its lines sit where
    /// the label's own would.
    private static let canvas = UILabel()

    public init(_ role: TypeRole, ink: UIColor = Palette.inkStrong, tracking: Double? = nil, lines: Int = 1) {
        self.role = role
        self.ink = ink
        self.tracking = tracking
        super.init(frame: .zero)
        numberOfLines = lines
        translatesAutoresizingMaskIntoConstraints = false
        registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) { (label: KitLabel, _: UITraitCollection) in
            label.textSizeChanged()
        }
    }

    /// Dynamic Type changed: the label's own string is made again from its
    /// role; a caller's string keeps its runs, its role faces set again.
    private func textSizeChanged() {
        guard given else { return render() }
        guard let string = super.attributedText, string.length > 0 else { return }
        place(Self.rescaled(string))
    }

    /// `string` with every role face made again at the Dynamic Type setting
    /// now (`TypeRole.rescaled`), and what a role sets from its face's size
    /// moved with it: its tracking (em, so a kern of the size), its line
    /// height (a multiple of the size) and the baseline offset `LineBox`
    /// centres a line with. Runs in any other font stay as they are.
    static func rescaled(_ string: NSAttributedString) -> NSAttributedString {
        let whole = NSRange(location: 0, length: string.length)
        // A paragraph's line height follows the face it leads with.
        var lead: Double?
        string.enumerateAttribute(.font, in: whole) { value, _, stop in
            guard let old = value as? UIFont, let new = TypeRole.rescaled(old) else { return }
            lead = new.pointSize / old.pointSize
            stop.pointee = true
        }
        guard let lead else { return string }
        let out = NSMutableAttributedString(attributedString: string)
        string.enumerateAttributes(in: whole) { attributes, range, _ in
            var height: Double?
            if let paragraph = attributes[.paragraphStyle] as? NSParagraphStyle, paragraph.maximumLineHeight > 0 {
                let moved = paragraph.mutableCopy() as! NSMutableParagraphStyle
                moved.minimumLineHeight = paragraph.minimumLineHeight * lead
                moved.maximumLineHeight = paragraph.maximumLineHeight * lead
                out.addAttribute(.paragraphStyle, value: moved, range: range)
                height = moved.maximumLineHeight
            }
            guard let old = attributes[.font] as? UIFont, let new = TypeRole.rescaled(old) else { return }
            out.addAttribute(.font, value: new, range: range)
            if let kern = attributes[.kern] as? Double {
                out.addAttribute(.kern, value: kern * new.pointSize / old.pointSize, range: range)
            }
            if attributes[.baselineOffset] != nil, let height {
                out.addAttribute(.baselineOffset, value: LineBox.label(new, height: height).baselineOffset, range: range)
            }
        }
        return out
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("KitLabel is built in code")
    }

    private func render() {
        guard !given else { return }
        var attributes = role.attributes(color: ink, tracking: tracking, alignment: textAlignment)
        if tabular, let font = attributes[.font] as? UIFont {
            let descriptor = font.fontDescriptor.addingAttributes([
                .featureSettings: [[UIFontDescriptor.FeatureKey.type: kNumberSpacingType, UIFontDescriptor.FeatureKey.selector: kMonospacedNumbersSelector]],
            ])
            attributes[.font] = UIFont(descriptor: descriptor, size: font.pointSize)
        }
        if let style = (attributes[.paragraphStyle] as? NSParagraphStyle)?.mutableCopy() as? NSMutableParagraphStyle {
            style.lineBreakMode = chosenBreak
            attributes[.paragraphStyle] = style
        }
        place(NSAttributedString(string: content, attributes: attributes))
    }

    /// The cached lines go before the string changes: UIKit measures inside
    /// the setter (`textRect` from its baseline update), and lines kept from
    /// a longer old string index past the end of the new one.
    private func place(_ string: NSAttributedString?) {
        forget()
        placing = true
        super.attributedText = string
        placing = false
        forget()
    }

    private func forget() {
        paragraph = nil
        shown = nil
    }

    /// What the label draws when that is not its own string, and the width
    /// it was made for (" drawn at 352.0: \"…\""), or nothing: for reading a
    /// running app from a debugger (`[label drawnText]`). A method of its
    /// own, not an override of `description`: a nonisolated override on this
    /// main-actor class cost the class its Sendable conformance.
    @objc public func drawnText() -> String {
        guard let shown, let string = shown.text?.string else { return "" }
        return " drawn at \(shown.width): \(string.debugDescription)"
    }

    // MARK: Lines and the tail cut

    override public func textRect(forBounds bounds: CGRect, limitedToNumberOfLines lines: Int) -> CGRect {
        guard wrap != .greedy, lines != 1, let string = shown(bounds.width) else {
            return super.textRect(forBounds: bounds, limitedToNumberOfLines: lines)
        }
        return canvas(string).textRect(forBounds: bounds, limitedToNumberOfLines: lines)
    }

    override public func drawText(in rect: CGRect) {
        guard let string = shown(rect.width) else {
            super.drawText(in: rect)
            return
        }
        canvas(string).drawText(in: rect)
    }

    private func canvas(_ string: NSAttributedString) -> UILabel {
        let canvas = Self.canvas
        canvas.numberOfLines = numberOfLines
        canvas.attributedText = string
        canvas.lineBreakMode = .byClipping
        canvas.frame = bounds
        return canvas
    }

    private func shown(_ width: Double) -> NSAttributedString? {
        if let shown, shown.width == width { return shown.text }
        let string = compose(width)
        shown = (width, string)
        return string
    }

    /// The string to draw in a box `width` wide when it is not the label's
    /// own: its lines parted where `wrap` parts them, and its last visible
    /// line cut where it does not fit.
    private func compose(_ width: Double) -> NSAttributedString? {
        guard let full = super.attributedText, full.length > 0, width > 0 else { return nil }
        if numberOfLines == 1 {
            // Layout snaps a frame to whole pixels, so a label sized to its own
            // text can stand a fraction of one narrower than it: that still fits.
            let pixel = 1 / max(traitCollection.displayScale, 1)
            guard cutsTail, TextWrap.measure(full) > width + pixel, let kept = TextWrap.tailCut(full, width: width) else { return nil }
            return Self.set(full, starts: [], cut: kept)
        }
        let limit = cutsTail ? numberOfLines : 0
        guard wrap != .greedy || limit > 0 else { return nil }
        let paragraph = self.paragraph ?? WrapParagraph(full)
        self.paragraph = paragraph
        // Too many lines for the label: the rule sees only the lines that show.
        let greedy = limit > 0 ? paragraph.greedyStarts(width: width) : []
        let over = limit > 0 && greedy.count >= limit
        var starts: [Int]
        if let chosen = paragraph.lineStarts(width: width, wrap: wrap, limit: over ? limit : 0) {
            starts = chosen
        } else if over {
            starts = greedy
        } else {
            return nil
        }
        // Where the last line that shows ends: at the start of the line the
        // limit hides, whether the rule made that line or the text simply
        // runs on past the lines the rule was given.
        var end: Int
        if limit > 0, starts.count >= limit {
            end = starts[limit - 1]
            starts = Array(starts.prefix(limit - 1))
        } else if over {
            end = greedy[limit - 1]
        } else {
            return Self.set(full, starts: starts, cut: nil)
        }
        let string = full.string as NSString
        let start = starts.last ?? 0
        while end > start, let scalar = Unicode.Scalar(string.character(at: end - 1)), CharacterSet.whitespacesAndNewlines.contains(scalar) { end -= 1 }
        let line = full.attributedSubstring(from: NSRange(location: start, length: end - start))
        let kept = TextWrap.tailCut(line, width: width, continues: true) ?? line.length
        return Self.set(full, starts: starts, cut: start + kept)
    }

    /// `full` with a line separator where each of `starts` begins a line and,
    /// with a `cut`, U+2026 in place of everything from that offset on.
    private static func set(_ full: NSAttributedString, starts: [Int], cut: Int?) -> NSAttributedString {
        let string = full.string as NSString
        let text = NSMutableAttributedString(attributedString: full)
        if let cut {
            text.replaceCharacters(in: NSRange(location: cut, length: text.length - cut), with: "\u{2026}")
        }
        for start in starts.reversed() {
            // The spaces a line ends in go with the break, as the web hangs them.
            var from = start
            while from > 0, string.character(at: from - 1) == 0x20 { from -= 1 }
            if from > 0, let scalar = Unicode.Scalar(string.character(at: from - 1)), CharacterSet.newlines.contains(scalar) { continue }
            text.replaceCharacters(in: NSRange(location: from, length: start - from), with: "\u{2028}")
        }
        // Every line is already its own: nothing wraps and UIKit adds no ellipsis.
        text.enumerateAttribute(.paragraphStyle, in: NSRange(location: 0, length: text.length)) { value, range, _ in
            guard let style = (value as? NSParagraphStyle)?.mutableCopy() as? NSMutableParagraphStyle else { return }
            style.lineBreakMode = .byClipping
            text.addAttribute(.paragraphStyle, value: style, range: range)
        }
        return text
    }
}
