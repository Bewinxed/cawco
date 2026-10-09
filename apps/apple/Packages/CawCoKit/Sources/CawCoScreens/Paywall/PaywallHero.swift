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

    /// The hero's cards (`PaywallHeroView.cardCount` of them): the asks waiting
    /// (`held`, the one just answered, first), then the fleet's live
    /// harness-and-machine pairs with the example ask, then the first machine
    /// with each harness CawCo runs.
    @MainActor
    static func cards(hub: HubConnection, home: HomeModel, held: ParkedAsk? = nil) -> [HeroBanner] {
        let count = PaywallHeroView.cardCount
        let fleet = hub.fleet
        var asks = home.needs.compactMap { item -> ParkedAsk? in
            if case let .ask(ask) = item.kind { return ask }
            return nil
        }
        if let held {
            asks.removeAll { $0.requestId == held.requestId }
            asks.insert(held, at: 0)
        }
        var cards: [HeroBanner] = asks.prefix(count).map { ask in
            let row = fleet.byId[ask.instanceId]
            let machine = row.map { fleet.machineName($0.machineId) } ?? fleet.machines.first.map { fleet.machineName($0.machineId) } ?? "your machine"
            let line = ask.summary.split(separator: "\n").first.map(String.init) ?? ask.summary
            return HeroBanner(title: PaywallCopy.bannerTitle(harness: ModelCatalog.harnessName(row?.harness ?? "claude"), machine: machine), body: line)
        }
        var pairs: [(harness: String, machine: String)] = home.working.map { ($0.harness ?? "claude", fleet.machineName($0.machineId)) }
        let first = fleet.machines.first.map { fleet.machineName($0.machineId) } ?? "your machine"
        pairs += ["claude", "opencode", "pi"].map { ($0, first) }
        let examples = pairs.map { HeroBanner(title: PaywallCopy.bannerTitle(harness: ModelCatalog.harnessName($0.harness), machine: $0.machine),
                                              body: PaywallCopy.bannerExample) }
        for card in examples where cards.count < count && !cards.contains(card) {
            cards.append(card)
        }
        // A stack deeper than the fleet has pairs repeats them.
        while cards.count < count, let card = examples.first {
            cards.append(card)
        }
        return cards
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
        var width: Double { full.width }
        var height: Double { full.height }
        /// A card mostly behind another shows its edge only, as iOS stacks a group.
        var showsContent: Bool { visible.height >= full.height * 0.9 }

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

    let size: CGSize
    /// Front to back, the file's order.
    let slots: [Slot]
    let radius: Double

    private enum Keys: String, CodingKey {
        case frame, cards
        case radius = "corner_radius_nominal_px"
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
/// stacked notification group; native cards then come into it. The cards,
/// their number and their stacking are the still's `story-end.slots.json`,
/// read from the bundle, so a new still and its file need no code. Under
/// Reduce Motion the band is the rest frame with the cards already in it.
/// Where the sheet asks for him, Caw climbs up over the front card's top edge
/// (climb.riv) and stays there at that status.
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
    /// The cards and Caw over them.
    private let scene = UIView()
    private let cards: [NotificationCard]
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

    /// How many cards the hero needs: the story still's slots.
    static var cardCount: Int { StorySlots.bundled?.slots.count ?? 0 }

    /// The story still's slots, front to back; `cards` holds the card for each.
    private let story: StorySlots?

    init(banners: [HeroBanner]) {
        story = StorySlots.bundled
        cards = zip(story?.slots ?? [], banners).map { NotificationCard($1, front: $0.showsContent) }
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
        // Caw behind the front card: its top edge is his ledge.
        climber.translatesAutoresizingMaskIntoConstraints = true
        climber.present = false
        scene.addSubview(climber)
        // The front card last: it stands in front of the others and of Caw's body.
        for card in cards.reversed() { scene.addSubview(card) }
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

    override func layoutSubviews() {
        super.layoutSubviews()
        art.frame = bounds
        guard let story, let first = story.slots.first else { return }
        // The still is fitted so its cards fill the band's height less a
        // margin, centred; the phone's bezels frame it on the Ink field.
        let stack = story.slots.dropFirst().reduce(first.rect) { $0.union($1.rect) }
        let frame = story.size
        let scale = min(bounds.width / frame.width, (bounds.height - 2 * Space.space2) / stack.height)
        guard scale > 0 else { return }
        let image = CGRect(x: (bounds.width - frame.width * scale) / 2,
                           y: bounds.midY - stack.midY * scale,
                           width: frame.width * scale,
                           height: frame.height * scale)
        for view in [rest, start, movie] { view.frame = image }
        video.frame = movie.bounds
        for (card, slot) in zip(cards, story.slots) {
            card.bounds = CGRect(origin: .zero, size: CGSize(width: slot.width * scale, height: slot.height * scale))
            card.center = CGPoint(x: image.minX + slot.rect.midX * scale, y: image.minY + slot.rect.midY * scale)
            card.corner = story.radius * scale
            // The part of the card that shows past the ones in front, in the card's own space.
            card.visible = CGRect(x: (slot.visible.x - slot.full.x) * scale, y: (slot.visible.y - slot.full.y) * scale,
                                  width: slot.visible.width * scale, height: slot.visible.height * scale)
        }
        // Caw stands on the front card's top edge toward its trailing end, as
        // large as the room above it allows, so the band never crops him.
        if let front = cards.first {
            let ledge = front.frame.minY
            let side = min(Self.climbSide, (ledge - Space.space2) / CawView.ledgeLine).rounded(.down)
            climber.frame = CGRect(x: front.frame.maxX - Space.space3 - side, y: ledge + 1 - side * CawView.ledgeLine,
                                   width: side, height: side * CawView.ledgeLine)
        }
    }

    /// The scene arrives once the sheet is up: the move plays once and the
    /// cards stack into its slots. Reduce Motion puts everything at rest at once.
    func settleIn() {
        guard !settledIn else { return }
        settledIn = true
        for card in cards { card.alpha = 0 }
        if let player {
            ended = NotificationCenter.default.addObserver(forName: AVPlayerItem.didPlayToEndTimeNotification, object: player.currentItem, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated {
                    self?.movie.isHidden = true
                    self?.start.isHidden = true
                    self?.cardsIn(still: false)
                }
            }
            player.play()
            return
        }
        cardsIn(still: UIAccessibility.isReduceMotionEnabled)
    }

    /// The cards rise into their group one after another, the app's stagger
    /// apart, back to front as notifications arrive; then Caw, where asked
    /// for, climbs up over the front one.
    private func cardsIn(still: Bool) {
        cardsShown = true
        guard !still else {
            for card in cards { card.alpha = 1 }
            climb()
            return
        }
        let order = Array(cards.reversed())
        for (index, card) in order.enumerated() {
            card.transform = CGAffineTransform(translationX: 0, y: Space.space2)
            let rise = Motion.easeOut.animator(Motion.durPop) {
                card.alpha = 1
                card.transform = .identity
            }
            if index == order.count - 1 {
                rise.addCompletion { [weak self] _ in self?.climb() }
            }
            rise.startAnimation(afterDelay: Motion.durStagger * Double(index + 1))
        }
    }

    /// Caw over the front card, when the scene asks for him and its cards are in.
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

    /// The front card presses as a whole (S1's beat).
    func flashApprove() {
        cards.first?.flashApprove()
    }
}

/// A lock-screen notification drawn natively, sized to its slot in the
/// still: the app's icon and name, the ask's title and first line. A card
/// behind the front one shows its edge only, as iOS stacks a group.
///
/// Its words are laid out to the part of the slot that shows (`visible`):
/// title and body take at most two lines each, as many as the height leaves
/// under the app line, in the kit's smallest body size (`typeMeta`); text
/// that still does not fit ends at a word, with an ellipsis.
private final class NotificationCard: UIView {
    private let head = UIStackView()
    private let title = KitLabel(TypeScale.typeMeta, ink: Palette.inkStrong, lines: 1)
    private let body = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 1)
    private let banner: HeroBanner
    private let front: Bool
    /// Where the words were last fitted, to fit them again only when it changes.
    private var fitted: CGRect?

    var corner: Double = Radius.radiusPanel {
        didSet { layer.cornerRadius = corner }
    }

    /// The part of the card that shows, in its own space.
    var visible: CGRect = .zero {
        didSet { if visible != oldValue { setNeedsLayout() } }
    }

    init(_ banner: HeroBanner, front: Bool) {
        self.banner = banner
        self.front = front
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
            part.isHidden = !front
            part.translatesAutoresizingMaskIntoConstraints = true
            addSubview(part)
        }
        NSLayoutConstraint.activate([
            icon.widthAnchor.constraint(equalToConstant: 14),
            icon.heightAnchor.constraint(equalToConstant: 14),
        ])
        isAccessibilityElement = front
        accessibilityLabel = "\(banner.title). \(banner.body)"
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("NotificationCard is built in code")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard front, visible.width > 0 else { return }
        let box = visible.insetBy(dx: Space.space3, dy: Space.space2)
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
