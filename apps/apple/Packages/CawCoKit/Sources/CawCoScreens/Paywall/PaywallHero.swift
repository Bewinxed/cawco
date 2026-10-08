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

/// The story still's notification slots (`story-end.slots.json`, bundled
/// beside the still), in the still's pixels: any number of cards, each with
/// its place in the stack (`order`, 0 in front) and the part of it that shows.
nonisolated struct StorySlots: Decodable {
    struct Rect: Decodable {
        let x: Double
        let y: Double
        let width: Double
        let height: Double

        var cg: CGRect { CGRect(x: x, y: y, width: width, height: height) }
    }

    struct Slot: Decodable {
        let x: Double
        let y: Double
        let width: Double
        let height: Double
        /// 0 is the front card, a higher number further back; absent, the file's order.
        let order: Int?
        /// The part that shows past the cards in front of it; absent, all of it.
        let visible: Rect?
        /// Its drawn corner; absent, the file's nominal corner.
        let radius: Double?

        var rect: CGRect { CGRect(x: x, y: y, width: width, height: height) }
        /// A card mostly behind another shows its edge only, as iOS stacks a group.
        var showsContent: Bool { visible.map { $0.height >= height * 0.9 } ?? true }
    }

    let size: CGSize
    /// Front to back; without `order`, the file's own order.
    let slots: [Slot]
    /// The file says how the cards stack, rather than listing equal slots.
    var stacked: Bool { slots.contains { $0.order != nil } }
    let radius: Double

    private enum Keys: String, CodingKey {
        case frame, slots, cards
        case slotsPx = "slots_px"
        case radius = "corner_radius_nominal_px"
    }

    init(from decoder: any Decoder) throws {
        let keys = try decoder.container(keyedBy: Keys.self)
        let frame = try keys.decode([Double].self, forKey: .frame)
        guard frame.count == 2 else {
            throw DecodingError.dataCorruptedError(forKey: .frame, in: keys, debugDescription: "frame is [width, height]")
        }
        size = CGSize(width: frame[0], height: frame[1])
        let listed = try keys.decodeIfPresent([Slot].self, forKey: .slotsPx)
            ?? keys.decodeIfPresent([Slot].self, forKey: .slots)
            ?? keys.decode([Slot].self, forKey: .cards)
        slots = listed.enumerated()
            .sorted { ($0.element.order ?? $0.offset) < ($1.element.order ?? $1.offset) }
            .map(\.element)
        radius = try keys.decodeIfPresent(Double.self, forKey: .radius) ?? 36
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

/// The paywall's hero band (DESIGN.md §2 and §4, ruling 6). Brand art, so it
/// keeps its look in both appearances: the story is a night scene, the poster
/// a daylight one.
///
/// - `story`: the desk scene's move (`paywall-story.mp4`, once, muted) from
///   `PaywallStoryStart` to `PaywallStoryRest`, the phone's lock screen with
///   empty card slots; native cards then come into them. The slots, their
///   number and their stacking are the still's `story-end.slots.json`, read
///   from the bundle, so a new still and its file need no code. Under Reduce
///   Motion the band is the rest frame with the cards already in it.
/// - `poster`: Butter above an exact horizon, Ivory below, a code-made grain
///   at 3%, the headline set huge; three native cards drop in, staggered, and
///   Caw climbs up and peeks over them (climb.riv), resting there.
///
/// The stage is Caw alone at `HomeViewController.cawSide` on the plain field,
/// while the sheet works or sets notifications up.
final class PaywallHeroView: UIView {
    enum Mode: Equatable {
        /// The art and the cards; Caw (the poster's) at this status.
        case scene(CawStatus)
        /// Caw alone on the field.
        case stage(CawStatus)
    }

    let variant: PaywallExperiment.Variant
    private(set) var mode: Mode = .scene(.ready)
    private let field = PosterField()
    /// The story's stills and move, laid on the slot stack.
    private let art = UIView()
    private let rest = UIImageView()
    private let start = UIImageView()
    private let movie = UIView()
    private let video = AVPlayerLayer()
    private var player: AVPlayer?
    /// The words, the cards and the poster's Caw.
    private let scene = UIView()
    private let headline = UILabel()
    private let cards: [NotificationCard]
    private let climber: CawView?
    private let stageCaw: CawView
    private var settledIn = false
    private var cardsShown = false
    private var ended: (any NSObjectProtocol)?

    /// The story's stills and move, in the paywall's asset catalog.
    static let storyRest = "PaywallStoryRest"
    static let storyStart = "PaywallStoryStart"
    static let storyMove = "paywall-story"
    /// Caw's climb box on the poster (the poster's 120pt, a little smaller in a phone's band).
    static let climbSide = 104.0
    /// The poster's stack.
    private static let posterCards = 3

    /// How many cards a hero needs: the story still's slots, or the poster's stack.
    static var cardCount: Int { max(posterCards, StorySlots.bundled?.slots.count ?? 0) }

    /// The story still's slots, front to back; `cards` holds the card for each.
    private let story: StorySlots?

    init(variant: PaywallExperiment.Variant, banners: [HeroBanner]) {
        self.variant = variant
        let story = variant == .story
        if story {
            self.story = StorySlots.bundled
            cards = zip(self.story?.slots ?? [], banners).map { NotificationCard($1, compact: true, front: $0.showsContent) }
        } else {
            self.story = nil
            cards = banners.prefix(Self.posterCards).enumerated().map { NotificationCard($0.element, compact: false, front: $0.offset == 0) }
        }
        climber = story ? nil : CawView(status: .ready, ledge: .climb)
        stageCaw = CawView(status: .loading)
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        clipsToBounds = true
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous
        isAccessibilityElement = false
        // The story is night on a lock screen; the poster is day on paper.
        overrideUserInterfaceStyle = story ? .dark : .light

        field.poster = !story
        addSubview(field)
        addSubview(art)
        art.isHidden = !story
        rest.image = UIImage(named: Self.storyRest, in: .module, compatibleWith: nil)
        rest.contentMode = .scaleToFill
        art.addSubview(rest)
        if story, !UIAccessibility.isReduceMotionEnabled,
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
        // The poster's huge type; the story's words are all in the panel.
        headline.font = TypeScale.typeTitle.font(30, weight: .semibold)
        headline.textColor = Palette.crowInk
        headline.numberOfLines = 3
        headline.adjustsFontSizeToFitWidth = true
        headline.minimumScaleFactor = 0.6
        headline.isHidden = story
        headline.isAccessibilityElement = false
        headline.translatesAutoresizingMaskIntoConstraints = false
        scene.addSubview(headline)
        if let climber { scene.addSubview(climber) }
        // The front card last: it stands in front of the others and of Caw's body.
        for card in cards.reversed() { scene.addSubview(card) }
        stageCaw.present = false
        addSubview(stageCaw)

        var pinned = [
            scene.leadingAnchor.constraint(equalTo: leadingAnchor),
            scene.trailingAnchor.constraint(equalTo: trailingAnchor),
            scene.topAnchor.constraint(equalTo: topAnchor),
            scene.bottomAnchor.constraint(equalTo: bottomAnchor),
            stageCaw.widthAnchor.constraint(equalToConstant: HomeViewController.cawSide),
            stageCaw.heightAnchor.constraint(equalToConstant: HomeViewController.cawSide),
            stageCaw.centerXAnchor.constraint(equalTo: centerXAnchor),
            stageCaw.centerYAnchor.constraint(equalTo: centerYAnchor),
        ]
        if let climber, let front = cards.first {
            // The poster: the stack stands on the band's foot, the cards behind
            // peeking under the front one as iOS stacks them; Caw's ledge is the
            // front card's top edge, toward its trailing end.
            pinned += [
                // Under the sheet's ×, which stands at the band's top-leading corner.
                headline.topAnchor.constraint(equalTo: topAnchor, constant: Space.space8 + Space.space3),
                headline.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space5),
                headline.trailingAnchor.constraint(lessThanOrEqualTo: climber.leadingAnchor, constant: -Space.space2),
                front.widthAnchor.constraint(equalTo: widthAnchor, multiplier: 0.84),
                front.centerXAnchor.constraint(equalTo: centerXAnchor),
                front.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -(Space.space4 + Self.stackStep * Double(cards.count - 1))),
                climber.widthAnchor.constraint(equalToConstant: Self.climbSide),
                climber.heightAnchor.constraint(equalToConstant: Self.climbSide * CawView.ledgeLine),
                climber.bottomAnchor.constraint(equalTo: front.topAnchor, constant: 1),
                climber.trailingAnchor.constraint(equalTo: front.trailingAnchor, constant: -Space.space3),
            ]
            for (index, card) in cards.enumerated().dropFirst() {
                let inset = Self.stackInset * Double(index)
                pinned += [
                    card.leadingAnchor.constraint(equalTo: front.leadingAnchor, constant: inset),
                    card.trailingAnchor.constraint(equalTo: front.trailingAnchor, constant: -inset),
                    card.bottomAnchor.constraint(equalTo: front.bottomAnchor, constant: Self.stackStep * Double(index)),
                    card.heightAnchor.constraint(equalTo: front.heightAnchor),
                ]
            }
        }
        NSLayoutConstraint.activate(pinned)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("PaywallHeroView is built in code")
    }

    /// The poster's stack: each card behind shows this much under the one in front, this much narrower a side.
    private static let stackStep = 7.0
    private static let stackInset = 10.0

    var headlineText: String? {
        get { headline.text }
        set { headline.text = newValue }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        field.frame = bounds
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
            card.corner = (slot.radius ?? story.radius) * scale
        }
    }

    /// The scene arrives once the sheet is up: the story's move plays once and
    /// the cards stack into its slots; the poster's cards drop in and Caw climbs
    /// up after them. Reduce Motion puts everything at rest at once.
    func settleIn() {
        guard !settledIn else { return }
        settledIn = true
        let still = UIAccessibility.isReduceMotionEnabled
        for card in cards { card.alpha = 0 }
        climber?.present = false
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
        cardsIn(still: still)
    }

    /// The cards come in one after another, the app's stagger apart (the
    /// poster's drop from above, back to front; the story's rise into their
    /// slots, top to bottom), then the poster's Caw climbs up over them.
    private func cardsIn(still: Bool) {
        cardsShown = true
        guard !still else {
            for card in cards { card.alpha = 1 }
            climber?.present = true
            return
        }
        // A stack comes in back to front, as notifications arrive; equal slots top to bottom.
        let order = variant == .poster || story?.stacked == true ? Array(cards.reversed()) : cards
        for (index, card) in order.enumerated() {
            card.transform = CGAffineTransform(translationX: 0, y: variant == .poster ? -Space.space5 : Space.space2)
            let drop = Motion.easeOut.animator(Motion.durPop) {
                card.alpha = 1
                card.transform = .identity
            }
            if index == order.count - 1 {
                drop.addCompletion { [weak self] _ in
                    guard let self, case .scene = mode else { return }
                    climber?.present = true
                }
            }
            drop.startAnimation(afterDelay: Motion.durStagger * Double(index + 1))
        }
    }

    /// Changes what the band shows: the scene and the stage cross-fade over
    /// `durControl`; within either, Caw changes by his own leave and enter.
    func show(_ next: Mode) {
        guard next != mode else { return }
        let before = mode
        mode = next
        switch next {
        case let .scene(status):
            climber?.status = status
            stageCaw.present = false
            if case .stage = before {
                if cardsShown { climber?.present = true }
                Motion.easeOut.animator(Motion.durControl) { self.scene.alpha = 1; self.art.alpha = 1 }.startAnimation()
            }
        case let .stage(status):
            stageCaw.status = status
            stageCaw.present = true
            if case .scene = before {
                climber?.present = false
                Motion.easeOut.animator(Motion.durControl) { self.scene.alpha = 0; self.art.alpha = 0 }.startAnimation()
            }
        }
    }

    /// The front card's Approve flashes pressed (S1's beat); the story's
    /// compact card presses as a whole.
    func flashApprove() {
        cards.first?.flashApprove()
    }
}

/// The poster's field (DESIGN.md §4): Butter above an exact horizon, Ivory
/// below, as two fills, and a 256×256 monochrome grain made here and tiled
/// at 3%. Off, the story's flat Ink.
private final class PosterField: UIView {
    var poster = false {
        didSet { setNeedsLayout() }
    }

    /// Where the horizon runs, as a share of the band's height.
    static let horizon = 0.62
    private let sky = CALayer()
    private let ground = CALayer()
    private let grain = CALayer()

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        for part in [sky, ground, grain] { layer.addSublayer(part) }
        grain.opacity = 0.03
        grain.backgroundColor = UIColor(patternImage: Self.grainTile).cgColor
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("PosterField is built in code")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        // The brand fills have no dark value: the same Butter, Ivory and Ink day and night.
        if poster {
            let line = (bounds.height * Self.horizon).rounded()
            sky.frame = CGRect(x: 0, y: 0, width: bounds.width, height: line)
            ground.frame = CGRect(x: 0, y: line, width: bounds.width, height: bounds.height - line)
            sky.backgroundColor = Palette.spark.resolvedColor(with: traitCollection).cgColor
            ground.backgroundColor = Palette.paper.resolvedColor(with: traitCollection).cgColor
            grain.frame = bounds
            grain.isHidden = false
        } else {
            sky.frame = bounds
            sky.backgroundColor = Palette.crowInk.resolvedColor(with: traitCollection).cgColor
            ground.frame = .zero
            grain.isHidden = true
        }
        CATransaction.commit()
    }

    /// A 256×256 tile of grey noise from a fixed seed: the same grain on every launch.
    static let grainTile: UIImage = {
        let side = 256
        var state: UInt64 = 0x9E37_79B9_7F4A_7C15
        var pixels = [UInt8](repeating: 0, count: side * side)
        for index in pixels.indices {
            // SplitMix64.
            state &+= 0x9E37_79B9_7F4A_7C15
            var z = state
            z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
            z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
            pixels[index] = UInt8(truncatingIfNeeded: z ^ (z >> 31))
        }
        let provider = CGDataProvider(data: Data(pixels) as CFData)!
        let image = CGImage(width: side, height: side, bitsPerComponent: 8, bitsPerPixel: 8, bytesPerRow: side,
                            space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue),
                            provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)!
        return UIImage(cgImage: image, scale: 2, orientation: .up)
    }()
}

/// A lock-screen notification drawn natively: the app's icon and name, the
/// ask's title and first line, and on the poster's front card its two actions
/// (push.ts `PUSH_CATEGORIES`: Approve and Open). The story's cards are
/// compact, sized to the still's slots.
private final class NotificationCard: UIView {
    private let approve = UILabel()
    private let column = UIStackView()
    private let compact: Bool

    var corner: Double = Radius.radiusPanel {
        didSet { layer.cornerRadius = corner }
    }

    init(_ banner: HeroBanner, compact: Bool, front: Bool) {
        self.compact = compact
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = compact ? true : false
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = corner
        layer.cornerCurve = .continuous
        if !compact { boxShadow = Shadow.shadowDrawer }

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
        let head = UIStackView(arrangedSubviews: [icon, app, UIView(), now])
        head.spacing = Space.space2
        head.alignment = .center
        let title = KitLabel(compact ? TypeScale.typeMeta : TypeScale.typeLabel, ink: Palette.inkStrong, lines: compact ? 1 : 2)
        title.text = banner.title
        let body = KitLabel(compact ? TypeScale.typeMeta : TypeScale.typeBody, ink: Palette.inkMuted, lines: 1)
        body.text = banner.body
        for part in [head, title, body] { column.addArrangedSubview(part) }
        column.axis = .vertical
        column.spacing = compact ? 0 : Space.space1
        if !compact, front {
            column.setCustomSpacing(Space.space2, after: body)
            let actions = UIStackView(arrangedSubviews: [Self.action("Approve", into: approve), Self.action("Open", into: UILabel())])
            actions.spacing = Space.space2
            actions.distribution = .fillEqually
            column.addArrangedSubview(actions)
        }
        // A card behind the front one shows only its edge, as iOS stacks them.
        column.isHidden = !front
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        let inset = compact ? Space.space2 : Space.space3
        NSLayoutConstraint.activate([
            icon.widthAnchor.constraint(equalToConstant: compact ? 14 : 18),
            icon.heightAnchor.constraint(equalToConstant: compact ? 14 : 18),
            column.leadingAnchor.constraint(equalTo: leadingAnchor, constant: inset),
            column.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -inset),
            compact ? column.centerYAnchor.constraint(equalTo: centerYAnchor) : column.topAnchor.constraint(equalTo: topAnchor, constant: inset),
            compact ? column.topAnchor.constraint(greaterThanOrEqualTo: topAnchor) : column.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -inset),
        ])
        isAccessibilityElement = front
        accessibilityLabel = "\(banner.title). \(banner.body)"
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("NotificationCard is built in code")
    }

    private static func action(_ word: String, into label: UILabel) -> UIView {
        label.text = word
        label.font = TypeScale.typeLabel.font
        label.textColor = Palette.inkStrong
        label.textAlignment = .center
        label.backgroundColor = Palette.surfaceFill
        label.layer.cornerRadius = Radius.radiusSm
        label.layer.cornerCurve = .continuous
        label.clipsToBounds = true
        label.translatesAutoresizingMaskIntoConstraints = false
        label.heightAnchor.constraint(equalToConstant: Size.cBtnHXs + 2).isActive = true
        return label
    }

    /// Approve pressed and let go; a compact card has no buttons, so it presses as a whole.
    func flashApprove() {
        let target: UIView = compact ? self : approve
        let still = UIAccessibility.isReduceMotionEnabled
        let pressed = Motion.easeOut.animator(Motion.durControl) {
            if !self.compact { self.approve.backgroundColor = Palette.surfaceFillStrong }
            if !still { target.transform = CGAffineTransform(scaleX: Motion.pressScale, y: Motion.pressScale) }
        }
        pressed.addCompletion { _ in
            Motion.easeOut.animator(Motion.durFade) {
                if !self.compact { self.approve.backgroundColor = Palette.surfaceFill }
                target.transform = .identity
            }.startAnimation(afterDelay: Motion.durControl)
        }
        pressed.startAnimation(afterDelay: Motion.durPop)
    }
}
