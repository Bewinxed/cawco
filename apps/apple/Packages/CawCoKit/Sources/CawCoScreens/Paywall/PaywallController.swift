import CawCoCore
import CawCoDesign
import CawCoMascot
import OSLog
import UIKit

/// The paywall sheet and the notification setup it turns into (paywall
/// DESIGN.md §2, copy COPY.md): one house sheet, its hero band on top and its
/// panel under it. The panel morphs from screen to screen (P1, P2, S1 to S8,
/// R) as the sheet re-sizes; the hero cross-fades between the scene and Caw
/// alone on the field.
final class PaywallController: ObservedViewController {
    /// Where the sheet was opened from, and so where it starts.
    enum Entry: Equatable {
        /// E1, once, at the end of onboarding.
        case onboarding
        /// G's "What's included", and the launch over an ended week.
        case offer
        /// T and T6: the Get Pro form for a live week.
        case keep
        /// G's and T6's buttons: straight into Apple's sheet.
        case buy(ProProduct)
        /// G's restore found Pro or a live week.
        case restored(ProAccess)
        /// H2's "Turn on notifications": the setup alone.
        case setup
    }

    private enum Started: Equatable {
        case trial, bought, restoredPro, restoredTrial
    }

    private enum Screen: Equatable {
        /// P1, P1e, or T's Get Pro form, and their sub-states.
        case offer
        /// P2: Apple's sheet is up.
        case buying(ProProduct)
        /// S1.
        case started(Started)
        /// S2: iOS's permission prompt is up.
        case asking
        /// S3, S6, S7: the checklist.
        case setup
        /// S4.
        case on
        /// S4b.
        case late
        /// S5.
        case denied
        /// S8.
        case askToBuy(ProProduct)
    }

    private let entry: Entry
    private let variant = PaywallExperiment.variant
    private let hero: PaywallHeroView
    private let close: GhostIconButton
    let scroll = UIScrollView()
    private let panel = UIStackView()
    private var screen: Screen
    private var builtKey = ""
    private var restoring = false
    /// R2 to R4's line, and whether it is a failure's.
    private var restoreLine: (text: String, fails: Bool)?
    private var restoreLineClear: Task<Void, Never>?
    /// A purchase that failed (not a cancel), said under the buttons.
    private var purchaseFailed: String?
    private var ticker: Task<Void, Never>?
    private var testAsked = false
    private var foreground: (any NSObjectProtocol)?
    private let log = Logger(subsystem: "dev.cawco.app", category: "Paywall")

    // The parts of the panel kept to be updated in place.
    private var buttons: [ProProduct: SpinnerButton] = [:]
    private var restoreLink: LinkButton?
    private var linksRow: UIView?
    private var restoreLabel: KitLabel?
    private var failLabel: KitLabel?
    private var rows: [SetupRow] = []
    private var tokenRetry: UIButton?
    private var relayBlock: UIStackView?
    private var relayReason: KitLabel?
    private var turnOnButton: SpinnerButton?
    /// What S1 said, which S2 keeps saying under iOS's prompt.
    private var startedKind: Started = .trial

    private static let terms = URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!
    private static let privacy = URL(string: "https://cawco.dev/privacy")!

    init(entry: Entry, banners: [HeroBanner]) {
        self.entry = entry
        hero = PaywallHeroView(variant: variant, banners: banners)
        close = GhostIconButton(.close, label: "Close", tint: variant == .poster ? Palette.crowInk : Palette.paper)
        screen = switch entry {
        case .onboarding, .offer, .keep: .offer
        case let .buy(product): .buying(product)
        case let .restored(access): if case .trial = access { .started(.restoredTrial) } else { .started(.restoredPro) }
        // H2's setup runs as the checklist from its first row: iOS's prompt is row one.
        case .setup: .setup
        }
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("PaywallController is built in code")
    }

    /// The paywall in the house sheet over `host`: 90% of a phone's height,
    /// a 540pt form centred on a wide screen.
    @discardableResult
    static func present(_ entry: Entry, banners: [HeroBanner], from host: UIViewController) -> PaywallController {
        let paywall = PaywallController(entry: entry, banners: banners)
        paywall.loadViewIfNeeded()
        let sheet = HouseSheetController(paywall, style: .card, scroller: paywall.scroll, cap: 0.9)
        sheet.formWidth = 540
        host.present(sheet, animated: true)
        return paywall
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        close.addAction(UIAction { [weak self] _ in self?.finish() }, for: .primaryActionTriggered)
        view.addSubview(hero)
        view.addSubview(close)
        panel.axis = .vertical
        panel.spacing = Space.space3
        panel.translatesAutoresizingMaskIntoConstraints = false
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.alwaysBounceVertical = false
        scroll.addSubview(panel)
        view.addSubview(scroll)
        let tall = hero.heightAnchor.constraint(equalTo: hero.widthAnchor, multiplier: 1 / 1.5)
        tall.priority = .defaultHigh
        let fit = scroll.heightAnchor.constraint(equalTo: panel.heightAnchor, constant: Space.space3)
        fit.priority = .defaultLow
        NSLayoutConstraint.activate([
            hero.topAnchor.constraint(equalTo: view.topAnchor, constant: Space.space2),
            hero.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hero.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tall,
            hero.heightAnchor.constraint(lessThanOrEqualToConstant: 300),
            close.topAnchor.constraint(equalTo: hero.topAnchor, constant: Space.space2),
            close.leadingAnchor.constraint(equalTo: hero.leadingAnchor, constant: Space.space2),
            scroll.topAnchor.constraint(equalTo: hero.bottomAnchor, constant: Space.space4),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            panel.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            panel.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -Space.space3),
            panel.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: Space.space1),
            panel.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -Space.space1),
            fit,
        ])
        foreground = NotificationCenter.default.addObserver(forName: UIScene.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.cameBack() }
        }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if case .scene = mode(for: screen) { hero.settleIn() }
        switch screen {
        case let .buying(product): buy(product)
        case .setup where entry == .setup: turnOn()
        case .started: hero.flashApprove()
        default: break
        }
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                self?.requestRefresh()
            }
        }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        ticker?.cancel()
        ticker = nil
    }

    /// Closes the sheet: the board under it is locked or not by the entitlement alone.
    private func finish() {
        (presentingViewController ?? parent)?.dismiss(animated: true)
    }

    // MARK: Reading the state

    override func refreshContent() {
        let pro = Pro.shared
        let push = PushRegistry.shared
        // Read so a change redraws: the catalogue, the entitlement and every setup step.
        _ = (pro.access, pro.catalog, pro.canMakePayments, pro.pending)
        _ = (push.authorization, push.token, push.tokenFailed, push.relay, push.testArrived, push.testSent, push.testProblem, push.testSending)
        advance()
        let key = key(for: screen)
        if key != builtKey {
            let first = builtKey.isEmpty
            builtKey = key
            rebuild(animated: !first)
        }
        update()
    }

    /// The setup moves on by what iOS, APNs, Cawrier and the hub said.
    private func advance() {
        let push = PushRegistry.shared
        let now = Date.now
        switch screen {
        case .setup:
            if push.authorization == .denied {
                screen = .denied
            } else if push.ready, !testAsked {
                testAsked = true
                Task { await push.sendTest() }
            } else if testAsked, push.testArrived != nil {
                screen = .on
            } else if testAsked, !push.testSending, let sent = push.testSent,
                      push.testProblem != nil || now.timeIntervalSince(sent) > 10 {
                screen = .late
            }
        case .late:
            if push.testArrived != nil { screen = .on }
        default:
            break
        }
    }

    /// What the panel is made of: a change rebuilds it.
    private func key(for screen: Screen) -> String {
        let pro = Pro.shared
        switch screen {
        case .offer:
            let price = pro.displayPrice(.pro) ?? "-"
            return "offer|\(form)|\(pro.catalog)|\(pro.canMakePayments)|\(price)"
        case .late:
            return "late|\(PushRegistry.shared.testProblem ?? "")"
        case .asking:
            // S2 is S1 unchanged under iOS's prompt.
            return key(for: .started(startedKind))
        default:
            return "\(screen)|\(pro.displayPrice(.pro) ?? "-")"
        }
    }

    private enum Form: Equatable {
        /// P1: the free week is on offer.
        case trial
        /// P1e.
        case ended
        /// T's tap: a live week, Get Pro only.
        case keep
    }

    private var form: Form {
        switch Pro.shared.access {
        case .ended: .ended
        case .trial, .owned: .keep
        // `.some(.none)`: a bare `.none` here would be the Optional's.
        case .some(.none), nil: entry == .keep ? .keep : .trial
        }
    }

    private func mode(for screen: Screen) -> PaywallHeroView.Mode {
        let push = PushRegistry.shared
        switch screen {
        case .offer:
            if restoring { return .stage(.loading) }
            return Pro.shared.catalog == .failed && Pro.shared.canMakePayments ? .stage(.reconnecting) : .scene(.ready)
        case .buying: return .stage(.working)
        case .started: return .scene(.done)
        case .asking: return .scene(.ready)
        case .setup:
            if push.tokenFailed { return .stage(.reconnecting) }
            if case .failed = push.relay { return .stage(.reconnecting) }
            return .stage(.loading)
        case .on: return .stage(.done)
        case .late: return .stage(.trying)
        case .denied: return .stage(.sleeping)
        case .askToBuy: return .stage(.idle)
        }
    }

    // MARK: Building the panel

    /// The panel for the screen, cross-faded in over the old one as the sheet re-sizes.
    private func rebuild(animated: Bool) {
        let old = panel.arrangedSubviews
        buttons = [:]
        restoreLink = nil
        linksRow = nil
        restoreLabel = nil
        failLabel = nil
        rows = []
        tokenRetry = nil
        relayBlock = nil
        relayReason = nil
        turnOnButton = nil
        let parts: [UIView] = switch screen {
        case .offer, .buying: offerParts()
        case let .started(kind): startedParts(kind)
        case .asking: startedParts(startedKind)
        case .setup: setupParts()
        case .on: onParts()
        case .late: lateParts()
        case .denied: deniedParts()
        case let .askToBuy(product): askToBuyParts(product)
        }
        for view in old { view.removeFromSuperview() }
        for part in parts { panel.addArrangedSubview(part) }
        guard animated, let sheet = view.window else { return }
        let still = UIAccessibility.isReduceMotionEnabled
        for part in parts {
            part.alpha = 0
            if !still { part.transform = CGAffineTransform(translationX: 0, y: Space.space2) }
        }
        Motion.easeOut.animator(Motion.durPanel) {
            for part in parts {
                part.alpha = 1
                part.transform = .identity
            }
            sheet.layoutIfNeeded()
        }.startAnimation()
        scroll.setContentOffset(.zero, animated: false)
        UIAccessibility.post(notification: .screenChanged, argument: parts.first)
    }

    private func offerParts() -> [UIView] {
        let pro = Pro.shared
        let price = pro.displayPrice(.pro)
        let pitch = PaywallCopy.P1.pitch(variant)
        let (headline, body): (String, String) = switch form {
        case .trial: (pitch.headline, pitch.subline)
        case .ended: (PaywallCopy.P1e.headline, PaywallCopy.P1e.body(price))
        case .keep: (PaywallCopy.Keep.headline, PaywallCopy.Keep.subline(price))
        }
        var parts: [UIView] = []
        let words = column([eyebrow(pitch.eyebrow)], spacing: Space.space1)
        // The poster sets its headline huge in the hero; the story's stands here.
        hero.headlineText = variant == .poster ? headline : nil
        if variant == .poster {
            hero.accessibilityElements = nil
            words.addArrangedSubview(title(headline, hiddenVisually: true))
        } else {
            words.addArrangedSubview(title(headline))
        }
        words.addArrangedSubview(muted(body))
        parts.append(words)
        parts.append(column(pitch.ticks.map { tick($0, ink: Palette.inkStrong) }, spacing: Space.space2))
        if form == .trial {
            parts.append(timeline(price: price))
        }
        parts.append(tick(PaywallCopy.P1.price(price), ink: Palette.inkStrong))
        parts.append(storeBlock(price: price))
        let fail = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)
        failLabel = fail
        parts.append(fail)
        parts.append(links([restoreLinkMade(), LinkButton(PaywallCopy.Links.terms) { UIApplication.shared.open(Self.terms) },
                            LinkButton(PaywallCopy.Links.privacy) { UIApplication.shared.open(Self.privacy) }]))
        return parts
    }

    /// P1b, P1c, P1a, or the two buttons.
    private func storeBlock(price: String?) -> UIView {
        let pro = Pro.shared
        if !pro.canMakePayments {
            return muted(PaywallCopy.Store.restricted(price))
        }
        if pro.catalog == .failed {
            return column([muted(PaywallCopy.Store.unavailable),
                           KitButton.make(PaywallCopy.Store.tryAgain, variant: .outline, height: .lg, stretch: true) {
                               Task { await Pro.shared.loadProducts() }
                           }], spacing: Space.space2)
        }
        var stack: [UIView] = []
        if form == .trial {
            let start = SpinnerButton(PaywallCopy.P1.primary, variant: .action) { [weak self] in self?.buy(.trial) }
            buttons[.trial] = start
            stack.append(start)
        }
        let get = SpinnerButton(PaywallCopy.P1.secondary(price), variant: form == .trial ? .outline : .action) { [weak self] in self?.buy(.pro) }
        buttons[.pro] = get
        stack.append(get)
        if pro.catalog == .loading {
            stack.append(muted(PaywallCopy.Store.loading, centred: true))
        }
        return column(stack, spacing: Space.space2)
    }

    private func startedParts(_ kind: Started) -> [UIView] {
        let price = Pro.shared.displayPrice(.pro)
        let (headline, body): (String, String) = switch kind {
        case .trial: (PaywallCopy.S1.startedHeadline, PaywallCopy.S1.startedBody(price))
        case .bought: (PaywallCopy.S1.boughtHeadline, PaywallCopy.S1.boughtBody)
        case .restoredPro: (PaywallCopy.S1.restoredProHeadline, PaywallCopy.S1.boughtBody)
        case .restoredTrial: (PaywallCopy.S1.restoredTrialHeadline, PaywallCopy.S1.startedBody(price))
        }
        hero.headlineText = nil
        startedKind = kind
        let turnOn = SpinnerButton(PaywallCopy.S1.primary, variant: .action) { [weak self] in self?.turnOn() }
        turnOnButton = turnOn
        return [
            column([eyebrow("CawCo Pro"), title(headline), muted(body)], spacing: Space.space1),
            muted(PaywallCopy.S1.notifyLine),
            turnOn,
            links([LinkButton(PaywallCopy.S1.later) { [weak self] in self?.finish() }]),
        ]
    }

    private func setupParts() -> [UIView] {
        hero.headlineText = nil
        rows = (0 ..< 4).map { _ in SetupRow() }
        let retry = KitButton.make(PaywallCopy.Setup.tryAgain, variant: .outline, height: .lg, stretch: true) {
            PushRegistry.shared.retry()
        }
        tokenRetry = retry
        let reason = KitLabel(TypeScale.typeBody, ink: Palette.statusFailInk, lines: 0)
        relayReason = reason
        let block = column([muted(PaywallCopy.Setup.relayBody), reason,
                            KitButton.make(PaywallCopy.Setup.tryAgain, variant: .action, height: .lg, stretch: true) {
                                PushRegistry.shared.retry()
                            }], spacing: Space.space2)
        relayBlock = block
        return [title(PaywallCopy.Setup.headline), column(rows, spacing: Space.space2), retry, block]
    }

    private func onParts() -> [UIView] {
        [column([title(PaywallCopy.S4.headline), muted(PaywallCopy.S4.body)], spacing: Space.space1),
         KitButton.make(PaywallCopy.S4.done, variant: .action, height: .lg, stretch: true) { [weak self] in self?.finish() }]
    }

    private func lateParts() -> [UIView] {
        var words: [UIView] = [title(PaywallCopy.S4.lateHeadline), muted(PaywallCopy.S4.lateBody)]
        if let problem = PushRegistry.shared.testProblem {
            let line = KitLabel(TypeScale.typeBody, ink: Palette.statusFailInk, lines: 0)
            line.text = problem
            words.append(line)
        }
        return [column(words, spacing: Space.space1),
                KitButton.make(PaywallCopy.S4.sendAgain, variant: .action, height: .lg, stretch: true) { [weak self] in
                    guard let self else { return }
                    testAsked = true
                    screen = .setup
                    Task { await PushRegistry.shared.sendTest() }
                    requestRefresh()
                },
                links([LinkButton(PaywallCopy.S4.done) { [weak self] in self?.finish() }])]
    }

    private func deniedParts() -> [UIView] {
        [column([title(PaywallCopy.S5.headline), muted(PaywallCopy.S5.body)], spacing: Space.space1),
         KitButton.make(PaywallCopy.S5.openSettings, variant: .outline, height: .lg, stretch: true) {
             UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!)
         },
         links([LinkButton(PaywallCopy.S5.later) { [weak self] in self?.finish() }])]
    }

    private func askToBuyParts(_ product: ProProduct) -> [UIView] {
        hero.headlineText = nil
        return [column([title(PaywallCopy.S8.headline), muted(product == .trial ? PaywallCopy.S8.trialBody : PaywallCopy.S8.proBody)], spacing: Space.space1),
                KitButton.make(PaywallCopy.S8.done, variant: .action, height: .lg, stretch: true) { [weak self] in self?.finish() }]
    }

    // MARK: Updating in place

    private func update() {
        let push = PushRegistry.shared
        hero.show(mode(for: screen))
        close.isHidden = screen == .asking
        turnOnButton?.busy = screen == .asking
        turnOnButton?.isEnabled = screen != .asking
        switch screen {
        case .offer, .buying:
            let loading = Pro.shared.catalog == .loading
            let buying: ProProduct? = if case let .buying(product) = screen { product } else { nil }
            for (product, button) in buttons {
                button.busy = loading || buying == product
                button.isEnabled = !loading && buying == nil && !restoring
            }
            failLabel?.text = purchaseFailed
            failLabel?.isHidden = purchaseFailed == nil
            restoreLink?.busy = restoring
            restoreLink?.title = restoring ? PaywallCopy.Restore.checking : PaywallCopy.Links.restore
            if let line = restoreLine {
                restoreLabel?.text = line.text
                restoreLabel?.ink = line.fails ? Palette.statusFailInk : Palette.inkMuted
            }
            restoreLabel?.isHidden = restoreLine == nil
            linksRow?.isHidden = restoreLine != nil && restoreLine?.fails == false
        case .setup:
            guard rows.count == 4 else { return }
            let now = Date.now
            guard push.allowed else {
                // iOS's prompt is up (H2's setup): nothing after it has started.
                rows[0].set(.working, PaywallCopy.Setup.allowed)
                rows[1].set(.waiting, Self.settled(PaywallCopy.Setup.registering))
                rows[2].set(.waiting, Self.settled(PaywallCopy.Setup.relay))
                rows[3].set(.waiting, Self.settled(PaywallCopy.Setup.test))
                tokenRetry?.isHidden = true
                relayBlock?.isHidden = true
                return
            }
            rows[0].set(.done, PaywallCopy.Setup.allowed)
            let waited = push.tokenAsked.map { now.timeIntervalSince($0) } ?? 0
            if push.token != nil {
                rows[1].set(.done, Self.settled(PaywallCopy.Setup.registering))
            } else if push.tokenFailed {
                rows[1].set(.failed, PaywallCopy.Setup.registerFailed)
            } else {
                rows[1].set(.working, waited > 15 ? PaywallCopy.Setup.registeringSlow : PaywallCopy.Setup.registering)
            }
            tokenRetry?.isHidden = push.token != nil || !(push.tokenFailed || waited > 30)
            var relayFailure: String?
            switch push.relay {
            case .done: rows[2].set(.done, Self.settled(PaywallCopy.Setup.relay))
            case let .failed(reason):
                relayFailure = reason
                rows[2].set(.failed, PaywallCopy.Setup.relayFailed)
            case .working: rows[2].set(.working, PaywallCopy.Setup.relay)
            case .idle: rows[2].set(push.token == nil ? .waiting : .working, push.token == nil ? Self.settled(PaywallCopy.Setup.relay) : PaywallCopy.Setup.relay)
            }
            relayReason?.text = relayFailure
            relayBlock?.isHidden = relayFailure == nil
            rows[3].set(push.ready ? .working : .waiting, push.ready ? PaywallCopy.Setup.test : Self.settled(PaywallCopy.Setup.test))
        default:
            break
        }
    }

    /// A step's words without its "…" once it is done, or before it starts.
    private static func settled(_ text: String) -> String {
        text.hasSuffix("…") ? String(text.dropLast()) : text
    }

    // MARK: Doing

    /// P2: Apple's sheet over this one; the entitlement decides what comes next.
    private func buy(_ product: ProProduct) {
        guard let scene = view.window?.windowScene else { return }
        purchaseFailed = nil
        restoreLine = nil
        screen = .buying(product)
        requestRefresh()
        Task {
            let outcome = await Pro.shared.purchase(product, in: scene)
            log.notice("purchase \(product.rawValue, privacy: .public): \(String(describing: outcome), privacy: .public)")
            switch outcome {
            case .done:
                switch Pro.shared.access {
                case .owned:
                    screen = .started(.bought)
                case .trial:
                    screen = .started(.trial)
                default:
                    // The week was already used on this Apple Account: P1e.
                    screen = .offer
                }
            case .pending:
                screen = .askToBuy(product)
            case .cancelled:
                if case .buy = entry {
                    finish()
                    return
                }
                screen = .offer
            case .failed:
                purchaseFailed = PaywallCopy.Store.failed
                screen = .offer
            case .unverified:
                purchaseFailed = PaywallCopy.Restore.unverified
                screen = .offer
            }
            requestRefresh()
            if case .started = screen { hero.flashApprove() }
        }
    }

    private func restore() {
        guard !restoring else { return }
        restoring = true
        restoreLine = nil
        purchaseFailed = nil
        requestRefresh()
        Task {
            let outcome = await Pro.shared.restore()
            restoring = false
            switch outcome {
            case .found(.owned): screen = .started(.restoredPro)
            case .found(.trial): screen = .started(.restoredTrial)
            case .found: screen = .offer
            case .nothing: say(PaywallCopy.Restore.nothing, fails: false)
            case .failed: say(PaywallCopy.Restore.failed, fails: true)
            case .unverified: say(PaywallCopy.Restore.unverified, fails: true)
            }
            requestRefresh()
            if case .started = screen { hero.flashApprove() }
        }
    }

    /// R2's muted line stands in the links' place for 4 s; R3's and R4's stay until the next try.
    private func say(_ text: String, fails: Bool) {
        restoreLine = (text, fails)
        restoreLineClear?.cancel()
        guard !fails else { return }
        restoreLineClear = Task { [weak self] in
            try? await Task.sleep(for: .seconds(4))
            guard !Task.isCancelled, let self else { return }
            restoreLine = nil
            requestRefresh()
        }
    }

    /// S1's Turn on: iOS's prompt (S2), then the checklist or S5.
    private func turnOn() {
        if entry != .setup { screen = .asking }
        testAsked = false
        requestRefresh()
        Task {
            await PushRegistry.shared.turnOn()
            screen = PushRegistry.shared.allowed ? .setup : .denied
            requestRefresh()
        }
    }

    /// Back from Settings: allowed now, the setup runs.
    private func cameBack() {
        guard screen == .denied else { return }
        Task {
            await PushRegistry.shared.readAuthorization()
            if PushRegistry.shared.allowed { turnOn() }
        }
    }

    // MARK: Pieces

    private func eyebrow(_ text: String) -> KitLabel {
        let label = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        label.text = text
        return label
    }

    private func title(_ text: String, hiddenVisually: Bool = false) -> KitLabel {
        let label = KitLabel(TypeScale.typeTitle, ink: Palette.inkStrong, lines: 0)
        label.text = text
        label.wrap = .balance
        label.accessibilityTraits = .header
        if hiddenVisually {
            // The poster's hero draws it; VoiceOver reads it here, in order.
            label.alpha = 0
            label.heightAnchor.constraint(equalToConstant: 1).isActive = true
        }
        return label
    }

    private func muted(_ text: String, centred: Bool = false) -> KitLabel {
        let label = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
        label.text = text
        label.wrap = .pretty
        if centred { label.textAlignment = .center }
        return label
    }

    private func column(_ views: [UIView], spacing: Double) -> UIStackView {
        let stack = UIStackView(arrangedSubviews: views)
        stack.axis = .vertical
        stack.spacing = spacing
        return stack
    }

    /// A Butter tick (Solar duotone check-circle) before its line.
    private func tick(_ text: String, ink: UIColor) -> UIView {
        let mark = GlyphView(.passed, size: Size.iconMd, tint: Palette.spark)
        let label = KitLabel(TypeScale.typeBody, ink: ink, lines: 0)
        label.text = text
        let row = UIStackView(arrangedSubviews: [mark, label])
        row.spacing = Space.space2
        row.alignment = .firstBaseline
        mark.setContentHuggingPriority(.required, for: .horizontal)
        return row
    }

    /// "The free week, day by day": round Butter markers on a hairline rail.
    private func timeline(price: String?) -> UIView {
        let head = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
        head.text = PaywallCopy.P1.timelineTitle
        head.accessibilityTraits = .header
        let rows = PaywallCopy.P1.timeline(price: price).map { step -> UIView in
            let day = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
            day.text = step.day
            day.widthAnchor.constraint(equalToConstant: 48).isActive = true
            let text = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
            text.text = step.text
            text.wrap = .pretty
            let row = UIStackView(arrangedSubviews: [TimelineMarker(), day, text])
            row.spacing = Space.space2
            row.alignment = .firstBaseline
            row.isAccessibilityElement = true
            row.accessibilityLabel = "\(step.day): \(step.text)"
            return row
        }
        let list = column(rows, spacing: Space.space3)
        let rail = UIView()
        rail.backgroundColor = Palette.borderHairline
        rail.translatesAutoresizingMaskIntoConstraints = false
        list.insertSubview(rail, at: 0)
        if let first = rows.first, let last = rows.last {
            NSLayoutConstraint.activate([
                rail.widthAnchor.constraint(equalToConstant: 1),
                rail.centerXAnchor.constraint(equalTo: list.leadingAnchor, constant: TimelineMarker.side / 2),
                rail.topAnchor.constraint(equalTo: first.topAnchor, constant: Space.space2),
                rail.bottomAnchor.constraint(equalTo: last.topAnchor, constant: Space.space2),
            ])
        }
        return column([head, list], spacing: Space.space2)
    }

    private func restoreLinkMade() -> LinkButton {
        let link = LinkButton(PaywallCopy.Links.restore) { [weak self] in self?.restore() }
        restoreLink = link
        return link
    }

    /// Links centred on one line, a middle dot between each; the restore line under them.
    private func links(_ items: [UIView]) -> UIView {
        let row = UIStackView()
        row.spacing = Space.space1
        row.alignment = .center
        for (index, item) in items.enumerated() {
            if index > 0 {
                let dot = KitLabel(TypeScale.typeMeta, ink: Palette.inkSubtle)
                dot.text = "·"
                dot.isAccessibilityElement = false
                row.addArrangedSubview(dot)
            }
            row.addArrangedSubview(item)
        }
        let line = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
        line.textAlignment = .center
        line.isHidden = true
        restoreLabel = line
        linksRow = row
        let holder = UIStackView(arrangedSubviews: [row, line])
        holder.axis = .vertical
        holder.alignment = .center
        holder.spacing = Space.space1
        return holder
    }
}

/// A KitButton with the kit's spinner inline before its label while it works.
final class SpinnerButton: UIView {
    private let button: UIButton
    private let spinner = KitSpinner(side: 16)

    init(_ title: String, variant: KitButton.Variant, height: KitButton.Height = .lg, stretch: Bool = true, action: @escaping () -> Void) {
        button = KitButton.make(title, variant: variant, height: height, stretch: stretch, action: action)
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        spinner.tintColor = variant == .action ? Palette.onAction : Palette.inkMuted
        spinner.isHidden = true
        spinner.isAccessibilityElement = false
        addSubview(button)
        addSubview(spinner)
        NSLayoutConstraint.activate([
            button.topAnchor.constraint(equalTo: topAnchor),
            button.bottomAnchor.constraint(equalTo: bottomAnchor),
            button.leadingAnchor.constraint(equalTo: leadingAnchor),
            button.trailingAnchor.constraint(equalTo: trailingAnchor),
            spinner.centerYAnchor.constraint(equalTo: button.centerYAnchor),
            spinner.leadingAnchor.constraint(equalTo: button.leadingAnchor, constant: Space.space4),
        ])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("SpinnerButton is built in code")
    }

    var busy = false {
        didSet {
            spinner.isHidden = !busy
            button.accessibilityValue = busy ? "In progress" : nil
        }
    }

    var isEnabled: Bool {
        get { button.isEnabled }
        set { button.isEnabled = newValue }
    }
}

/// A text link in the meta role (Restore purchase, Terms, Privacy, Later),
/// with the kit spinner before it while it works.
final class LinkButton: UIButton {
    private let spinner = KitSpinner(side: 12)

    var title: String = "" {
        didSet { paint() }
    }

    var busy = false {
        didSet {
            spinner.isHidden = !busy
            isEnabled = !busy
            paint()
        }
    }

    init(_ title: String, action: @escaping () -> Void) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        var config = UIButton.Configuration.plain()
        config.contentInsets = NSDirectionalEdgeInsets(top: Space.space2, leading: Space.space1, bottom: Space.space2, trailing: Space.space1)
        configuration = config
        houseStyle()
        addAction(UIAction { _ in action() }, for: .primaryActionTriggered)
        spinner.isHidden = true
        spinner.isAccessibilityElement = false
        addSubview(spinner)
        NSLayoutConstraint.activate([
            spinner.centerYAnchor.constraint(equalTo: centerYAnchor),
            spinner.trailingAnchor.constraint(equalTo: leadingAnchor, constant: -2),
            heightAnchor.constraint(greaterThanOrEqualToConstant: Size.cBtnHLg),
        ])
        self.title = title
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("LinkButton is built in code")
    }

    private func paint() {
        configuration?.attributedTitle = AttributedString(title, attributes: AttributeContainer(TypeScale.typeMeta.attributes(color: Palette.inkMuted)))
        accessibilityLabel = title
    }
}

/// One line of the setup checklist: its mark (done, working, waiting or
/// failed) and its words.
final class SetupRow: UIStackView {
    enum State { case done, working, waiting, failed }

    private let slot = UIView()
    private let label = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong, lines: 0)
    private var state: State?

    init() {
        super.init(frame: .zero)
        spacing = Space.space2
        alignment = .center
        slot.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([slot.widthAnchor.constraint(equalToConstant: 16), slot.heightAnchor.constraint(equalToConstant: 16)])
        addArrangedSubview(slot)
        addArrangedSubview(label)
        isAccessibilityElement = true
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("SetupRow is built in code")
    }

    func set(_ next: State, _ text: String) {
        if label.text != text { label.text = text }
        label.ink = switch next {
        case .failed: Palette.statusFailInk
        case .waiting: Palette.inkMuted
        case .done, .working: Palette.inkStrong
        }
        accessibilityLabel = text
        accessibilityValue = switch next {
        case .done: "Done"
        case .working: "In progress"
        case .waiting: "Waiting"
        case .failed: "Failed"
        }
        guard next != state else { return }
        state = next
        for view in slot.subviews { view.removeFromSuperview() }
        let mark: UIView = switch next {
        case .done: GlyphView(.passed, size: 16, tint: Palette.statusDoneInk)
        case .working: KitSpinner(side: 16)
        case .waiting: GlyphView(.dot, size: 16, tint: Palette.inkSubtle)
        case .failed: GlyphView(.failed, size: 16, tint: Palette.statusFailInk)
        }
        mark.translatesAutoresizingMaskIntoConstraints = false
        slot.addSubview(mark)
        NSLayoutConstraint.activate([mark.centerXAnchor.constraint(equalTo: slot.centerXAnchor), mark.centerYAnchor.constraint(equalTo: slot.centerYAnchor)])
        guard !UIAccessibility.isReduceMotionEnabled else { return }
        mark.alpha = 0
        mark.transform = CGAffineTransform(scaleX: Motion.popScale, y: Motion.popScale)
        Motion.easeOut.animator(Motion.durPop) {
            mark.alpha = 1
            mark.transform = .identity
        }.startAnimation()
    }
}

/// The timeline's round Butter marker.
private final class TimelineMarker: UIView {
    static let side = 10.0

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.spark
        layer.cornerRadius = Self.side / 2
        layer.borderWidth = 1
        NSLayoutConstraint.activate([widthAnchor.constraint(equalToConstant: Self.side), heightAnchor.constraint(equalToConstant: Self.side)])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (marker: TimelineMarker, _: UITraitCollection) in marker.paint() }
        paint()
        isAccessibilityElement = false
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TimelineMarker is built in code")
    }

    private func paint() {
        layer.borderColor = Palette.imageOutline.resolvedColor(with: traitCollection).cgColor
    }
}
