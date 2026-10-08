import AVFoundation
import CawCoCore
import CawCoDesign
import CawCoMascot
import UIKit

/// What the hero's notification card says: a real ask, or a real machine
/// with the example ask.
struct HeroBanner: Equatable {
    let title: String
    let body: String

    /// The first ask waiting (or `held`, the one just answered), else the first machine with the example.
    @MainActor
    static func from(hub: HubConnection, home: HomeModel, held: ParkedAsk? = nil) -> HeroBanner {
        let fleet = hub.fleet
        let asks = home.needs.compactMap { item -> ParkedAsk? in
            if case let .ask(ask) = item.kind { return ask }
            return nil
        }
        if let ask = held ?? asks.first {
            let row = fleet.byId[ask.instanceId]
            let harness = ModelCatalog.harnessName(row?.harness ?? "claude")
            let machine = row.map { fleet.machineName($0.machineId) } ?? fleet.machines.first?.name ?? "your machine"
            let line = ask.summary.split(separator: "\n").first.map(String.init) ?? ask.summary
            return HeroBanner(title: PaywallCopy.bannerTitle(harness: harness, machine: machine), body: line)
        }
        let machine = fleet.machines.first?.name ?? "your machine"
        return HeroBanner(title: PaywallCopy.bannerTitle(harness: ModelCatalog.harnessName("claude"), machine: machine),
                          body: PaywallCopy.bannerExample)
    }
}

/// The paywall's hero band (DESIGN.md §2 and §4, ruling 6): the variant's
/// field, the art slot, a native notification card with Caw peeking over it
/// (the scene), or Caw alone on the plain field (the stage) while the sheet
/// works or sets notifications up.
///
/// The art slot: `story` plays `paywall-story.mp4` once and rests on
/// `PaywallStoryRest`; the card then stands in the still's slot. Until those
/// assets are in the bundle the slot is empty and the band is the field with
/// the card and Caw's peek on it. `poster` is drawn here: Butter above an
/// exact horizon, Ivory below, a code-made grain at 3%, and the headline set huge.
final class PaywallHeroView: UIView {
    enum Mode: Equatable {
        /// The card and Caw over its top edge, Caw at this status.
        case scene(CawStatus)
        /// Caw alone at `HomeViewController.cawSide`, centred on the field.
        case stage(CawStatus)
    }

    let variant: PaywallExperiment.Variant
    private(set) var mode: Mode = .scene(.ready)
    private let field = PosterField()
    private let still = UIImageView()
    private var player: AVPlayer?
    private let video = AVPlayerLayer()
    private let headline = UILabel()
    private let scene = UIView()
    private let card: NotificationCard
    private let peek: CawView
    private let stageCaw: CawView
    private var settledIn = false

    /// The story's rest frame and its move. Not in the bundle yet: the art arrives by handoff.
    static let storyRest = "PaywallStoryRest"
    static let storyMove = "paywall-story"
    /// Where the native card stands on `PaywallStoryRest`, as a share of the
    /// still (story-end.slots.json's first slot); with no still, the band's lower middle.
    static let storySlot = CGRect(x: 0.08, y: 0.5, width: 0.84, height: 0.4)

    /// The band is 3:2, no taller than 300pt (DESIGN.md §2, "iPad and Mac").
    static func height(for width: Double) -> Double { min(300, (width / 1.5).rounded()) }

    init(variant: PaywallExperiment.Variant, banner: HeroBanner) {
        self.variant = variant
        card = NotificationCard(banner)
        peek = CawView(status: .ready, ledge: true)
        stageCaw = CawView(status: .loading)
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        clipsToBounds = true
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous
        isAccessibilityElement = false

        field.poster = variant == .poster
        addSubview(field)
        still.contentMode = .scaleAspectFill
        still.image = variant == .story ? UIImage(named: Self.storyRest) : nil
        still.isHidden = still.image == nil
        addSubview(still)
        if variant == .story, let url = Bundle.main.url(forResource: Self.storyMove, withExtension: "mp4"),
           !UIAccessibility.isReduceMotionEnabled {
            let player = AVPlayer(url: url)
            player.isMuted = true
            player.actionAtItemEnd = .pause
            video.player = player
            video.videoGravity = .resizeAspectFill
            layer.addSublayer(video)
            self.player = player
        }

        // The poster's huge type; the story's words are all in the panel.
        headline.font = TypeScale.typeTitle.font(30, weight: .semibold)
        headline.textColor = Palette.crowInk
        headline.numberOfLines = 3
        headline.adjustsFontSizeToFitWidth = true
        headline.minimumScaleFactor = 0.6
        headline.isHidden = variant != .poster
        headline.translatesAutoresizingMaskIntoConstraints = false
        addSubview(headline)

        scene.translatesAutoresizingMaskIntoConstraints = false
        addSubview(scene)
        scene.addSubview(card)
        scene.addSubview(peek)
        stageCaw.present = false
        addSubview(stageCaw)

        let cardWide = card.widthAnchor.constraint(equalTo: widthAnchor, multiplier: Self.storySlot.width)
        NSLayoutConstraint.activate([
            scene.leadingAnchor.constraint(equalTo: leadingAnchor),
            scene.trailingAnchor.constraint(equalTo: trailingAnchor),
            scene.topAnchor.constraint(equalTo: topAnchor),
            scene.bottomAnchor.constraint(equalTo: bottomAnchor),
            headline.topAnchor.constraint(equalTo: topAnchor, constant: Space.space8 + Space.space3),
            headline.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space5),
            headline.trailingAnchor.constraint(lessThanOrEqualTo: peek.leadingAnchor, constant: -Space.space2),
            cardWide,
            card.centerXAnchor.constraint(equalTo: centerXAnchor),
            card.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space5),
            // Caw stands behind the card, his ledge on its top edge, toward its trailing end.
            peek.widthAnchor.constraint(equalToConstant: Self.peekSide),
            peek.heightAnchor.constraint(equalToConstant: Self.peekSide * CawView.ledgeLine),
            peek.bottomAnchor.constraint(equalTo: card.topAnchor, constant: 1),
            peek.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -Space.space3),
            stageCaw.widthAnchor.constraint(equalToConstant: HomeViewController.cawSide),
            stageCaw.heightAnchor.constraint(equalToConstant: HomeViewController.cawSide),
            stageCaw.centerXAnchor.constraint(equalTo: centerXAnchor),
            stageCaw.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        // The card in front of Caw's body: he peeks over its top edge.
        scene.bringSubviewToFront(card)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("PaywallHeroView is built in code")
    }

    /// Caw's peek box (the poster's 120pt, a little smaller in a phone's band).
    static let peekSide = 104.0

    var headlineText: String? {
        get { headline.text }
        set { headline.text = newValue }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        field.frame = bounds
        still.frame = bounds
        video.frame = bounds
    }

    /// The scene arrives once the sheet is up: the story's move plays once,
    /// the poster's card drops in and Caw peeks after it. Reduce Motion puts
    /// everything at rest at once.
    func settleIn() {
        guard !settledIn else { return }
        settledIn = true
        let still = UIAccessibility.isReduceMotionEnabled
        if let player {
            card.alpha = 0
            peek.present = false
            NotificationCenter.default.addObserver(forName: AVPlayerItem.didPlayToEndTimeNotification, object: player.currentItem, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.cardsIn(still: false) }
            }
            player.play()
            return
        }
        cardsIn(still: still)
    }

    /// The card comes in (the poster's drops from above, the story's rises
    /// into its slot), then Caw peeks over it.
    private func cardsIn(still: Bool) {
        video.isHidden = player != nil
        guard !still else {
            card.alpha = 1
            peek.present = true
            return
        }
        peek.present = false
        card.alpha = 0
        card.transform = CGAffineTransform(translationX: 0, y: variant == .poster ? -Space.space5 : Space.space2)
        let drop = Motion.easeOut.animator(Motion.durPop) {
            self.card.alpha = 1
            self.card.transform = .identity
        }
        drop.addCompletion { [weak self] _ in
            guard let self, case .scene = mode else { return }
            peek.present = true
        }
        drop.startAnimation(afterDelay: Motion.durStagger)
    }

    /// Changes what the band shows: the scene and the stage cross-fade over
    /// `durControl`; within either, Caw changes by his own leave and enter.
    func show(_ next: Mode) {
        guard next != mode else { return }
        let before = mode
        mode = next
        switch next {
        case let .scene(status):
            peek.status = status
            stageCaw.present = false
            if case .stage = before {
                if settledIn { peek.present = true }
                Motion.easeOut.animator(Motion.durControl) { self.scene.alpha = 1; self.headline.alpha = 1 }.startAnimation()
            }
        case let .stage(status):
            stageCaw.status = status
            stageCaw.present = true
            if case .scene = before {
                peek.present = false
                Motion.easeOut.animator(Motion.durControl) { self.scene.alpha = 0; self.headline.alpha = 0 }.startAnimation()
            }
        }
    }

    /// The card's Approve flashes pressed (S1's beat).
    func flashApprove() {
        card.flashApprove()
    }
}

/// The poster's field (DESIGN.md §4): Butter above an exact horizon, Ivory
/// below, as two fills, and a 256×256 monochrome grain made here and tiled
/// at 3%. Off, the story's flat Ink, in both appearances.
private final class PosterField: UIView {
    var poster = false {
        didSet { setNeedsLayout() }
    }

    /// Where the horizon runs, as a share of the band's height: the cards stand on it.
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
/// ask's title and first line, and its two actions.
private final class NotificationCard: UIView {
    private let approve = UILabel()

    init(_ banner: HeroBanner) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Radius.radiusPanel
        layer.cornerCurve = .continuous
        boxShadow = Shadow.shadowDrawer

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
        let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 2)
        title.text = banner.title
        let body = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 1)
        body.text = banner.body
        // The push's own actions (push.ts `PUSH_CATEGORIES`): Approve, and Open.
        let actions = UIStackView(arrangedSubviews: [Self.action("Approve", into: approve), Self.action("Open", into: UILabel())])
        actions.spacing = Space.space2
        actions.distribution = .fillEqually
        let column = UIStackView(arrangedSubviews: [head, title, body, actions])
        column.axis = .vertical
        column.spacing = Space.space1
        column.setCustomSpacing(Space.space2, after: body)
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        NSLayoutConstraint.activate([
            icon.widthAnchor.constraint(equalToConstant: 18),
            icon.heightAnchor.constraint(equalToConstant: 18),
            column.topAnchor.constraint(equalTo: topAnchor, constant: Space.space3),
            column.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space3),
            column.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space3),
            column.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space3),
        ])
        isAccessibilityElement = true
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

    func flashApprove() {
        let pressed = Motion.easeOut.animator(Motion.durControl) {
            self.approve.backgroundColor = Palette.surfaceFillStrong
            if !UIAccessibility.isReduceMotionEnabled { self.approve.transform = CGAffineTransform(scaleX: Motion.pressScale, y: Motion.pressScale) }
        }
        pressed.addCompletion { _ in
            Motion.easeOut.animator(Motion.durFade) {
                self.approve.backgroundColor = Palette.surfaceFill
                self.approve.transform = .identity
            }.startAnimation(afterDelay: Motion.durControl)
        }
        pressed.startAnimation(afterDelay: Motion.durPop)
    }
}
