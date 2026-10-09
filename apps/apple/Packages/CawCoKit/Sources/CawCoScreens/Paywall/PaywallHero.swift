import AVFoundation
import CawCoCore
import CawCoDesign
import CawCoMascot
import OSLog
import UIKit

/// What one of the hero's notification cards says: a real ask, or a real
/// machine with the example ask.
struct HeroBanner: Equatable {
    let title: String
    let body: String

    /// The hero's one card: the ask waiting (`held`, the one just answered,
    /// first), else the fleet's first live harness-and-machine pair with the
    /// example ask, else the first machine with Claude Code.
    @MainActor
    static func card(hub: HubConnection, home: HomeModel, held: ParkedAsk? = nil) -> HeroBanner {
        let fleet = hub.fleet
        let first = fleet.machines.first.map { fleet.machineName($0.machineId) } ?? "your machine"
        let waiting = home.needs.lazy.compactMap { item -> ParkedAsk? in
            if case let .ask(ask) = item.kind { return ask }
            return nil
        }.first
        if let ask = held ?? waiting {
            let row = fleet.byId[ask.instanceId]
            let machine = row.map { fleet.machineName($0.machineId) } ?? first
            let line = ask.summary.split(separator: "\n").first.map(String.init) ?? ask.summary
            return HeroBanner(title: PaywallCopy.bannerTitle(harness: ModelCatalog.harnessName(row?.harness ?? "claude"), machine: machine), body: line)
        }
        let pair = home.working.first.map { (harness: $0.harness ?? "claude", machine: fleet.machineName($0.machineId)) } ?? (harness: "claude", machine: first)
        return HeroBanner(title: PaywallCopy.bannerTitle(harness: ModelCatalog.harnessName(pair.harness), machine: pair.machine), body: PaywallCopy.bannerExample)
    }
}

/// The story still's notification group (`story-end.slots.json`, bundled
/// beside the still), in the still's pixels: its `cards`, front to back, each
/// with its whole hidden extent (`rect_px`) and the band of it that shows
/// past the cards in front (`visible_px`).
nonisolated struct StorySlots: Decodable {
    struct Rect: Decodable {
        let x: Double
        let y: Double
        let width: Double
        let height: Double

        var cg: CGRect { CGRect(x: x, y: y, width: width, height: height) }
    }

    struct Slot: Decodable {
        let full: Rect
        let visible: Rect

        var rect: CGRect { full.cg }

        private enum Keys: String, CodingKey {
            case full = "rect_px"
            case visible = "visible_px"
        }

        init(from decoder: any Decoder) throws {
            let keys = try decoder.container(keyedBy: Keys.self)
            full = try keys.decode(Rect.self, forKey: .full)
            visible = try keys.decode(Rect.self, forKey: .visible)
        }
    }

    /// The phone's yellow side rails, the full height of the still.
    struct Rails: Decodable {
        struct Column: Decodable {
            let x: Double
            let width: Double
        }

        let leading: Column
        let trailing: Column
    }

    let size: CGSize
    /// Front to back, the file's order.
    let slots: [Slot]
    let radius: Double
    let rails: Rails

    private enum Keys: String, CodingKey {
        case frame, cards
        case radius = "corner_radius_nominal_px"
        case rails = "rails_px"
    }

    init(from decoder: any Decoder) throws {
        let keys = try decoder.container(keyedBy: Keys.self)
        let frame = try keys.decode([Double].self, forKey: .frame)
        guard frame.count == 2 else {
            throw DecodingError.dataCorruptedError(forKey: .frame, in: keys, debugDescription: "frame is [width, height]")
        }
        size = CGSize(width: frame[0], height: frame[1])
        slots = try keys.decode([Slot].self, forKey: .cards)
        radius = try keys.decode(Double.self, forKey: .radius)
        rails = try keys.decode(Rails.self, forKey: .rails)
    }

    /// The one card the app draws over the still's group: the front card's
    /// width, from its top to the last band's bottom, so the bands of the
    /// cards behind never show as a tab under it.
    var group: CGRect? {
        guard let front = slots.first?.rect else { return nil }
        let bottom = slots.map(\.visible.cg.maxY).max() ?? front.maxY
        return CGRect(x: front.minX, y: front.minY, width: front.width, height: bottom - front.minY)
    }

    /// The bundled file, read once.
    static let bundled: StorySlots? = {
        guard let url = Bundle.module.url(forResource: "story-end.slots", withExtension: "json") else {
            Logger(subsystem: "dev.cawco.app", category: "Paywall").error("story-end.slots.json is not in the bundle")
            return nil
        }
        do {
            return try JSONDecoder().decode(StorySlots.self, from: Data(contentsOf: url))
        } catch {
            Logger(subsystem: "dev.cawco.app", category: "Paywall").error("story-end.slots.json unreadable: \(String(describing: error), privacy: .public)")
            return nil
        }
    }()
}

/// The paywall's hero band (DESIGN.md §2 and §4, ruling 6): brand art, a
/// night scene in both appearances.
///
/// The scene is the desk film (`paywall-story.mp4`, once, muted) from
/// `PaywallStoryStart` to `PaywallStoryRest`, the phone's screen with its
/// stacked notification group; one native card then comes over the whole
/// group (`StorySlots.group`, from the still's `story-end.slots.json`, read
/// from the bundle, so a new still and its file need no code). Under Reduce
/// Motion the band is the rest frame with the card already on it. Where the
/// sheet asks for him, Caw climbs up over the card's top edge (climb.riv) and
/// stays there at that status.
///
/// The stage is Caw alone at `HomeViewController.cawSide` on the plain field,
/// while the sheet works or waits.
final class PaywallHeroView: UIView {
    enum Mode: Equatable {
        /// The film's scene and its cards; Caw over the front card at this status, or no Caw.
        case scene(CawStatus?)
        /// Caw alone on the field.
        case stage(CawStatus)
    }

    private(set) var mode: Mode = .scene(nil)
    /// The story's stills and move, laid on the slot stack.
    private let art = UIView()
    private let rest = UIImageView()
    private let start = UIImageView()
    private let movie = UIView()
    private let video = AVPlayerLayer()
    private var player: AVPlayer?
    /// The card and Caw over it.
    private let scene = UIView()
    private let card: NotificationCard
    private let climber = CawView(status: .idle, ledge: .climb)
    private let stageCaw: CawView
    private var settledIn = false
    private var cardsShown = false
    private var ended: (any NSObjectProtocol)?

    /// The story's stills and move, in the paywall's asset catalog.
    static let storyRest = "PaywallStoryRest"
    static let storyStart = "PaywallStoryStart"
    static let storyMove = "paywall-story"
    /// Caw's climb box at most; less where the band has less room above the front card.
    static let climbSide = 140.0

    /// The story still's slots, front to back; `card` covers their group.
    private let story: StorySlots?

    /// Told the inner edge of the still's leading rail, in the band's space,
    /// each time a layout moves it (the close button stands inside it).
    var onRail: ((Double) -> Void)?

    init(banner: HeroBanner) {
        story = StorySlots.bundled
        card = NotificationCard(banner)
        stageCaw = CawView(status: .loading)
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        clipsToBounds = true
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous
        isAccessibilityElement = false
        // Night on a lock screen, whatever the appearance.
        overrideUserInterfaceStyle = .dark
        backgroundColor = Palette.crowInk

        addSubview(art)
        rest.image = UIImage(named: Self.storyRest, in: .module, compatibleWith: nil)
        rest.contentMode = .scaleToFill
        art.addSubview(rest)
        if !UIAccessibility.isReduceMotionEnabled,
           let url = Bundle.module.url(forResource: Self.storyMove, withExtension: "mp4") {
            start.image = UIImage(named: Self.storyStart, in: .module, compatibleWith: nil)
            start.contentMode = .scaleToFill
            art.addSubview(start)
            let player = AVPlayer(url: url)
            player.isMuted = true
            player.actionAtItemEnd = .pause
            video.player = player
            video.videoGravity = .resizeAspectFill
            movie.layer.addSublayer(video)
            art.addSubview(movie)
            self.player = player
        }

        scene.translatesAutoresizingMaskIntoConstraints = false
        addSubview(scene)
        // Caw behind the card: its top edge is his ledge.
        climber.translatesAutoresizingMaskIntoConstraints = true
        climber.present = false
        scene.addSubview(climber)
        scene.addSubview(card)
        stageCaw.present = false
        addSubview(stageCaw)

        NSLayoutConstraint.activate([
            scene.leadingAnchor.constraint(equalTo: leadingAnchor),
            scene.trailingAnchor.constraint(equalTo: trailingAnchor),
            scene.topAnchor.constraint(equalTo: topAnchor),
            scene.bottomAnchor.constraint(equalTo: bottomAnchor),
            stageCaw.widthAnchor.constraint(equalToConstant: HomeViewController.cawSide),
            stageCaw.heightAnchor.constraint(equalToConstant: HomeViewController.cawSide),
            stageCaw.centerXAnchor.constraint(equalTo: centerXAnchor),
            stageCaw.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("PaywallHeroView is built in code")
    }

    /// Where the still stands in the band, and its scale. It is fitted so its
    /// group fills the band's height less a margin and centred; the phone's
    /// bezels frame it on the Ink field. Then it is lowered, as far as the
    /// room under the group allows, until a whole `climbSide` Caw stands over
    /// the card, in every mode, so the card never moves when he comes.
    private var still: (image: CGRect, scale: Double)? {
        guard let story, let stack = story.group else { return nil }
        let frame = story.size
        let scale = min(bounds.width / frame.width, (bounds.height - 2 * Space.space2) / stack.height)
        guard scale > 0 else { return nil }
        var y = bounds.midY - stack.midY * scale
        let headroom = Space.space2 + (Self.climbSide * CawView.ledgeLine).rounded(.up)
        let ledge = y + stack.minY * scale
        let below = bounds.maxY - Space.space2 - (y + stack.maxY * scale)
        y += max(0, min(headroom - ledge, below))
        return (CGRect(x: (bounds.width - frame.width * scale) / 2, y: y, width: frame.width * scale, height: frame.height * scale), scale)
    }

    /// The inner edge of the still's leading rail, in the band's space.
    var leadingRailEdge: Double? {
        guard let story, let still else { return nil }
        return still.image.minX + (story.rails.leading.x + story.rails.leading.width) * still.scale
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        art.frame = bounds
        guard let story, let still, let group = story.group else { return }
        let image = still.image
        let scale = still.scale
        for view in [rest, start, movie] { view.frame = image }
        video.frame = movie.bounds
        // By bounds and centre: the card rises and presses by its transform.
        card.bounds = CGRect(origin: .zero, size: CGSize(width: group.width * scale, height: group.height * scale))
        card.center = CGPoint(x: image.minX + group.midX * scale, y: image.minY + group.midY * scale)
        card.corner = story.radius * scale
        // Caw stands on the card's top edge toward its trailing end, as large
        // as the room above it allows, so the band never crops him.
        let ledge = card.center.y - card.bounds.height / 2
        let side = min(Self.climbSide, (ledge - Space.space2) / CawView.ledgeLine).rounded(.down)
        climber.frame = CGRect(x: card.center.x + card.bounds.width / 2 - Space.space3 - side, y: ledge + 1 - side * CawView.ledgeLine,
                               width: side, height: side * CawView.ledgeLine)
        if let rail = leadingRailEdge { onRail?(rail) }
    }

    /// The scene arrives once the sheet is up: the move plays once and the
    /// card comes over its group. Reduce Motion puts everything at rest at once.
    func settleIn() {
        guard !settledIn else { return }
        settledIn = true
        card.alpha = 0
        if let player {
            ended = NotificationCenter.default.addObserver(forName: AVPlayerItem.didPlayToEndTimeNotification, object: player.currentItem, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated {
                    self?.movie.isHidden = true
                    self?.start.isHidden = true
                    self?.cardIn(still: false)
                }
            }
            player.play()
            return
        }
        cardIn(still: UIAccessibility.isReduceMotionEnabled)
    }

    /// The card rises onto the group as a notification arrives, a stagger
    /// after the film ends; then Caw, where asked for, climbs up over it.
    private func cardIn(still: Bool) {
        cardsShown = true
        guard !still else {
            card.alpha = 1
            climb()
            return
        }
        card.transform = CGAffineTransform(translationX: 0, y: Space.space2)
        let rise = Motion.easeOut.animator(Motion.durPop) {
            self.card.alpha = 1
            self.card.transform = .identity
        }
        rise.addCompletion { [weak self] _ in self?.climb() }
        rise.startAnimation(afterDelay: Motion.durStagger)
    }

    /// Caw over the card, when the scene asks for him and the card is in.
    private func climb() {
        guard case let .scene(status) = mode else { return }
        if let status { climber.status = status }
        climber.present = status != nil && cardsShown
    }

    /// Changes what the band shows: the scene and the stage cross-fade over
    /// `durControl`; within either, Caw changes by his own leave and enter.
    func show(_ next: Mode) {
        guard next != mode else { return }
        let before = mode
        mode = next
        switch next {
        case .scene:
            stageCaw.present = false
            climb()
            if case .stage = before {
                Motion.easeOut.animator(Motion.durControl) { self.scene.alpha = 1; self.art.alpha = 1 }.startAnimation()
            }
        case let .stage(status):
            stageCaw.status = status
            stageCaw.present = true
            if case .scene = before {
                climber.present = false
                Motion.easeOut.animator(Motion.durControl) { self.scene.alpha = 0; self.art.alpha = 0 }.startAnimation()
            }
        }
    }

    /// The card presses as a whole (S1's beat).
    func flashApprove() {
        card.flashApprove()
    }
}

#if DEBUG
extension PaywallHeroView {
    /// For the paywall probe: the film has played to its end and the cards are coming.
    var probeCardsShown: Bool { cardsShown }

    /// For the paywall probe: where the film is, and Caw's climb box.
    var probeState: [String: Any] {
        let seconds = player.map { CMTimeGetSeconds($0.currentTime()) } ?? -1
        let duration = player?.currentItem.map { CMTimeGetSeconds($0.duration) } ?? -1
        return ["filmSeconds": seconds, "filmDuration": duration, "filmShowing": !movie.isHidden && player != nil,
                "startShowing": !start.isHidden && start.image != nil, "cardsShown": cardsShown,
                "climber": ["frame": climber.frame.debugDescription, "present": climber.present, "status": climber.status.rawValue,
                            "inWindow": climber.convert(climber.bounds, to: nil).debugDescription,
                            "dark": climber.traitCollection.userInterfaceStyle == .dark],
                "leadingRailEdge": leadingRailEdge ?? -1]
    }
}
#endif

/// A lock-screen notification drawn natively over the still's group: the
/// app's icon and name, the ask's title and first line.
///
/// Title and body take at most two lines each, as many as the card's height
/// leaves under the app line, in the kit's smallest body size (`typeMeta`);
/// text that still does not fit ends at a word, with an ellipsis.
private final class NotificationCard: UIView {
    private let head = UIStackView()
    private let title = KitLabel(TypeScale.typeMeta, ink: Palette.inkStrong, lines: 1)
    private let body = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 1)
    private let banner: HeroBanner
    /// Where the words were last fitted, to fit them again only when it changes.
    private var fitted: CGRect?

    var corner: Double = Radius.radiusPanel {
        didSet { layer.cornerRadius = corner }
    }

    init(_ banner: HeroBanner) {
        self.banner = banner
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = true
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = corner
        layer.cornerCurve = .continuous

        let icon = UIImageView(image: CawCoBrand.icon)
        icon.backgroundColor = Palette.spark
        icon.layer.cornerRadius = Radius.radiusXs
        icon.layer.cornerCurve = .continuous
        icon.clipsToBounds = true
        icon.translatesAutoresizingMaskIntoConstraints = false
        let app = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        app.text = "CawCo"
        let now = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        now.text = "now"
        now.setContentHuggingPriority(.required, for: .horizontal)
        for part in [icon, app, UIView(), now] { head.addArrangedSubview(part) }
        head.spacing = Space.space2
        head.alignment = .center
        for part in [head, title, body] {
            part.translatesAutoresizingMaskIntoConstraints = true
            addSubview(part)
        }
        NSLayoutConstraint.activate([
            icon.widthAnchor.constraint(equalToConstant: 14),
            icon.heightAnchor.constraint(equalToConstant: 14),
        ])
        isAccessibilityElement = true
        accessibilityLabel = "\(banner.title). \(banner.body)"
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("NotificationCard is built in code")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard bounds.width > 0 else { return }
        let box = bounds.insetBy(dx: Space.space3, dy: Space.space2)
        guard box != fitted else { return }
        fitted = box
        let line = TypeScale.typeMeta.lineHeight
        let headHeight = max(14, line).rounded(.up)
        // Whole lines under the app line, shared out: the title first, each at most two.
        let room = max(2, Int((box.height - headHeight) / line))
        let titleLines = max(1, min(2, Self.lines(banner.title, width: box.width), room - 1))
        let bodyLines = max(1, min(2, room - titleLines))
        title.numberOfLines = titleLines
        body.numberOfLines = bodyLines
        title.text = Self.fit(banner.title, width: box.width, lines: titleLines)
        body.text = Self.fit(banner.body, width: box.width, lines: bodyLines)
        let titleHeight = (Double(titleLines) * line).rounded(.up)
        let bodyHeight = (Double(max(1, min(bodyLines, Self.lines(body.text ?? "", width: box.width)))) * line).rounded(.up)
        // The three blocks as one, centred in what shows.
        let total = headHeight + titleHeight + bodyHeight
        var y = box.minY + max(0, (box.height - total) / 2)
        head.frame = CGRect(x: box.minX, y: y, width: box.width, height: headHeight)
        y += headHeight
        title.frame = CGRect(x: box.minX, y: y, width: box.width, height: titleHeight)
        y += titleHeight
        body.frame = CGRect(x: box.minX, y: y, width: box.width, height: bodyHeight)
    }

    /// How many lines `text` takes at `width` in the card's type.
    private static func lines(_ text: String, width: Double) -> Int {
        Int((height(text, width: width) / TypeScale.typeMeta.lineHeight).rounded())
    }

    /// The height `text` takes wrapped at `width`. The role's paragraph
    /// truncates its tail, which measures any text as one line, so the
    /// measure wraps by word instead.
    private static func height(_ text: String, width: Double) -> Double {
        var attributes = TypeScale.typeMeta.attributes(color: .label)
        if let style = (attributes[.paragraphStyle] as? NSParagraphStyle)?.mutableCopy() as? NSMutableParagraphStyle {
            style.lineBreakMode = .byWordWrapping
            attributes[.paragraphStyle] = style
        }
        return (text as NSString).boundingRect(with: CGSize(width: width, height: .greatestFiniteMagnitude), options: [.usesLineFragmentOrigin],
                                               attributes: attributes, context: nil).height
    }

    /// `text` whole if it fits `lines` at `width`, else cut after the last
    /// word that still fits with an ellipsis.
    private static func fit(_ text: String, width: Double, lines: Int) -> String {
        let most = Double(lines) * TypeScale.typeMeta.lineHeight + 0.5
        guard height(text, width: width) > most else { return text }
        var words = text.split(separator: " ")
        while words.count > 1 {
            words.removeLast()
            let cut = words.joined(separator: " ").trimmingCharacters(in: .punctuationCharacters) + "…"
            if height(cut, width: width) <= most { return cut }
        }
        // One word wider than the card: the label cuts its tail.
        return text
    }

    /// The card presses and lets go.
    func flashApprove() {
        let still = UIAccessibility.isReduceMotionEnabled
        let pressed = Motion.easeOut.animator(Motion.durControl) {
            if !still { self.transform = CGAffineTransform(scaleX: Motion.pressScale, y: Motion.pressScale) }
        }
        pressed.addCompletion { _ in
            Motion.easeOut.animator(Motion.durFade) {
                self.transform = .identity
            }.startAnimation(afterDelay: Motion.durControl)
        }
        pressed.startAnimation(afterDelay: Motion.durPop)
    }
}
