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
    private let hero: PaywallHeroView
    private let close: GhostIconButton
    /// The close button's leading inset, set from the still's leading rail once the band is laid out.
    private let closeLeading: NSLayoutConstraint
    /// The band's edge in the sheet's appearance, and the disc the × stands on over the film.
    private let bandEdge = BandEdge()
    private let closeScrim = CloseScrim()
    let scroll = UIScrollView()
    private let panel = UIStackView()
    private var screen: Screen
    private var builtKey = ""
    private var restoring = false
    /// P1c's Try again is asking the App Store again: Caw works until it answers.
    private var retrying = false
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

    init(entry: Entry, banner: HeroBanner) {
        self.entry = entry
        let hero = PaywallHeroView(banner: banner)
        let close = GhostIconButton(.close, label: "Close", tint: Palette.paper, side: Size.cBtnHLg)
        self.hero = hero
        self.close = close
        closeLeading = close.leadingAnchor.constraint(equalTo: hero.leadingAnchor, constant: Space.space2)
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
    static func present(_ entry: Entry, banner: HeroBanner, from host: UIViewController) -> PaywallController {
        let paywall = PaywallController(entry: entry, banner: banner)
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
        // The close glyph stands `space3` inside the still's leading rail, wherever the
        // band's layout puts the still: its 44pt button centres a 16pt glyph. Up to the
        // device pixel, so snapping never brings the glyph closer to the rail.
        hero.onRail = { [weak self] rail in
            guard let self else { return }
            let pixel = max(1, traitCollection.displayScale)
            let inset = ((rail + Space.space3 - (Size.cBtnHLg - Size.iconMd) / 2) * pixel).rounded(.up) / pixel
            if closeLeading.constant != inset { closeLeading.constant = inset }
        }
        view.addSubview(hero)
        view.addSubview(bandEdge)
        view.addSubview(closeScrim)
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
            closeLeading,
            bandEdge.topAnchor.constraint(equalTo: hero.topAnchor),
            bandEdge.leadingAnchor.constraint(equalTo: hero.leadingAnchor),
            bandEdge.trailingAnchor.constraint(equalTo: hero.trailingAnchor),
            bandEdge.bottomAnchor.constraint(equalTo: hero.bottomAnchor),
            closeScrim.centerXAnchor.constraint(equalTo: close.centerXAnchor),
            closeScrim.centerYAnchor.constraint(equalTo: close.centerYAnchor),
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
            return "offer|\(form)|\(pro.catalog)|\(retrying)|\(pro.canMakePayments.map { "\($0)" } ?? "unread")|\(price)"
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
            // R and P1c's Try again: Caw works on the stage until the App Store answers.
            if restoring || retrying { return .stage(.working) }
            // P1c: the App Store didn't answer; Caw alone, awake and still (the owner's
            // "Neutral/concerned face": trying's furrowed loop read as blame here).
            if Pro.shared.catalog == .failed, Pro.shared.canMakePayments == true { return .stage(.ready) }
            // P1e: the scene stays, Caw over the card, awake and looking out: idle's
            // loops sleep, and a sleeping near-black bird read as nothing on the band.
            // P1 is the film alone.
            return .scene(form == .ended ? .ready : nil)
        case .buying: return .stage(.working)
        // S1, and S2 (S1 unchanged under iOS's prompt).
        case .started, .asking: return .scene(.done)
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

    /// P1 (and P1a, P1b, P1c), P1e and T's Get Pro form: the headline, the
    /// terms line T (duration, what is charged, no subscription: App Review
    /// R10, above the buttons in every state), the free week's rows, the
    /// buttons, and the links (R11).
    private func offerParts() -> [UIView] {
        let price = Pro.shared.displayPrice(.pro)
        let (headline, terms): (String, String) = switch form {
        case .trial: (PaywallCopy.P1.headline, PaywallCopy.P1.terms(price))
        case .ended: (PaywallCopy.P1e.headline, PaywallCopy.P1e.terms(price))
        case .keep: (PaywallCopy.Keep.headline, PaywallCopy.Keep.subline(price))
        }
        var parts: [UIView] = [column([title(headline), muted(terms)], spacing: Space.space2)]
        let store = storeBlock(price: price)
        if form == .trial, storeUnanswered {
            // P1c: the App Store's line and Try again stand apart from the rows, together.
            parts.append(column([timeline(), store], spacing: Space.space4))
        } else {
            if form == .trial { parts.append(timeline()) }
            parts.append(store)
        }
        let fail = KitLabel(TypeScale.typeMeta, ink: Palette.statusFailInk, lines: 0)
        failLabel = fail
        parts.append(fail)
        parts.append(links([restoreLinkMade(), LinkButton(PaywallCopy.Links.terms) { UIApplication.shared.open(Self.terms) },
                            LinkButton(PaywallCopy.Links.privacy) { UIApplication.shared.open(Self.privacy) }]))
        return parts
    }

    /// P1c: the App Store didn't answer, or Try again is asking it again.
    private var storeUnanswered: Bool {
        Pro.shared.canMakePayments != false && (Pro.shared.catalog == .failed || retrying)
    }

    /// P1b, P1c, P1a, or the two buttons.
    private func storeBlock(price: String?) -> UIView {
        let pro = Pro.shared
        if pro.canMakePayments == false {
            return muted(PaywallCopy.Store.restricted(price))
        }
        if storeUnanswered {
            // P1c: Try again works (Caw too, on the stage) until the App Store answers.
            let again = SpinnerButton(PaywallCopy.Store.tryAgain, variant: .outline) { [weak self] in self?.retry() }
            again.busy = retrying
            again.isEnabled = !retrying
            return column([muted(PaywallCopy.Store.unavailable, centred: true), again], spacing: Space.space2)
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
             UIApplication.shared.open(PushRegistry.settingsURL)
         },
         links([LinkButton(PaywallCopy.S5.later) { [weak self] in self?.finish() }])]
    }

    private func askToBuyParts(_ product: ProProduct) -> [UIView] {
        [column([title(PaywallCopy.S8.headline), muted(product == .trial ? PaywallCopy.S8.trialBody : PaywallCopy.S8.proBody)], spacing: Space.space1),
                KitButton.make(PaywallCopy.S8.done, variant: .action, height: .lg, stretch: true) { [weak self] in self?.finish() }]
    }

    // MARK: Updating in place

    private func update() {
        let push = PushRegistry.shared
        hero.show(mode(for: screen))
        // A sheet that opened on the stage (P1c) plays the film once the scene first shows.
        if case .scene = hero.mode, viewIfLoaded?.window != nil { hero.settleIn() }
        close.isHidden = screen == .asking
        closeScrim.isHidden = close.isHidden
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

    /// P1c's Try again: the catalogue is read again; the sheet shows P1 if it answers, P1c again if not.
    private func retry() {
        guard !retrying else { return }
        retrying = true
        requestRefresh()
        Task {
            await Pro.shared.loadProducts()
            retrying = false
            requestRefresh()
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

    private func title(_ text: String) -> KitLabel {
        let label = KitLabel(TypeScale.typeTitle, ink: Palette.inkStrong, lines: 0)
        label.text = text
        label.wrap = .balance
        label.accessibilityTraits = .header
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

    /// The free week, Today to Day 7: a Butter disc with its glyph on a
    /// hairline rail, the day, and its line.
    private func timeline() -> UIView {
        let glyphs: [Glyph] = [.unlock, .bell, .lock]
        var discs: [TimelineDisc] = []
        let rows = zip(PaywallCopy.P1.timeline, glyphs).map { step, glyph -> UIView in
            let disc = TimelineDisc(glyph)
            discs.append(disc)
            let day = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong)
            day.text = step.day
            day.widthAnchor.constraint(equalToConstant: 48).isActive = true
            let text = KitLabel(TypeScale.typeBody, ink: Palette.inkMuted, lines: 0)
            text.text = step.text
            text.wrap = .pretty
            let words = UIStackView(arrangedSubviews: [day, text])
            words.spacing = Space.space2
            words.alignment = .firstBaseline
            // The first line stands centred on the disc.
            words.isLayoutMarginsRelativeArrangement = true
            words.directionalLayoutMargins = NSDirectionalEdgeInsets(top: ((TimelineDisc.side - TypeScale.typeBody.lineHeight) / 2).rounded(), leading: 0, bottom: 0, trailing: 0)
            let row = UIStackView(arrangedSubviews: [disc, words])
            row.spacing = Space.space3
            row.alignment = .top
            row.isAccessibilityElement = true
            row.accessibilityLabel = "\(step.day): \(step.text)"
            return row
        }
        let list = column(rows, spacing: Space.space2)
        // A group of its own: a little more air above and below than between the panel's parts.
        list.isLayoutMarginsRelativeArrangement = true
        list.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Space.space2, leading: 0, bottom: Space.space2, trailing: 0)
        let rail = UIView()
        rail.backgroundColor = Palette.borderHairline
        rail.translatesAutoresizingMaskIntoConstraints = false
        list.insertSubview(rail, at: 0)
        if let first = discs.first, let last = discs.last {
            NSLayoutConstraint.activate([
                rail.widthAnchor.constraint(equalToConstant: 1),
                rail.centerXAnchor.constraint(equalTo: first.centerXAnchor),
                rail.topAnchor.constraint(equalTo: first.bottomAnchor),
                rail.bottomAnchor.constraint(equalTo: last.topAnchor),
            ])
        }
        return list
    }

    private func restoreLinkMade() -> LinkButton {
        let link = LinkButton(PaywallCopy.Links.restore) { [weak self] in self?.restore() }
        restoreLink = link
        return link
    }

    /// Links centred on one line, a middle dot between each; the restore line
    /// under them. Every piece hugs its own width, so the row is as wide as
    /// its words and stands centred, never spread to the panel's edges.
    private func links(_ items: [UIView]) -> UIView {
        let row = UIStackView()
        row.spacing = Space.space1
        row.alignment = .center
        for (index, item) in items.enumerated() {
            if index > 0 {
                let dot = KitLabel(TypeScale.typeMeta, ink: Palette.inkSubtle)
                dot.text = "·"
                dot.isAccessibilityElement = false
                dot.setContentHuggingPriority(.required, for: .horizontal)
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
        // Busy, the button waits at its full look with the spinner: the kit's
        // disabled half-alpha would wash the coral under its white label
        // (DESIGN.md, The White On Coral Rule).
        let kit = button.configurationUpdateHandler
        button.configurationUpdateHandler = { [weak self] button in
            kit?(button)
            if self?.busy == true { button.alpha = 1 }
        }
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
            button.setNeedsUpdateConfiguration()
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
        // One line: under the default word wrap a hugging button fits to its
        // longest word, and "Restore purchase" stood in three lines.
        config.titleLineBreakMode = .byTruncatingTail
        configuration = config
        houseStyle()
        // As wide as its words: a row of links centres as a whole.
        setContentHuggingPriority(.required, for: .horizontal)
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
        configuration?.attributedTitle = AttributedString(title, attributes: TypeScale.typeMeta.container(color: Palette.inkMuted))
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

/// The free week's round Butter disc, its Solar duotone glyph in Ink at the
/// centre: the same Butter and Ink day and night, outlined as an image is.
private final class TimelineDisc: UIView {
    static let side = 28.0

    init(_ glyph: Glyph) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.spark
        layer.cornerRadius = Self.side / 2
        layer.borderWidth = 1
        let mark = GlyphView(glyph, size: Size.iconMd, tint: Palette.crowInk)
        addSubview(mark)
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: Self.side),
            heightAnchor.constraint(equalToConstant: Self.side),
            mark.centerXAnchor.constraint(equalTo: centerXAnchor),
            mark.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (disc: TimelineDisc, _: UITraitCollection) in disc.paint() }
        paint()
        isAccessibilityElement = false
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TimelineDisc is built in code")
    }

    private func paint() {
        layer.borderColor = Palette.imageOutline.resolvedColor(with: traitCollection).cgColor
    }
}

/// The band's 1pt edge, DESIGN.md's image-outline: a raster band keeps its shape on any surface.
/// It sits over the band as a sibling so it takes the sheet's appearance, not the band's night:
/// at night it is the white edge that parts the film's near-black (and the stage's field) from
/// the raised sheet.
private final class BandEdge: UIView {
    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        layer.borderWidth = 1
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (edge: BandEdge, _: UITraitCollection) in edge.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("BandEdge is built in code")
    }

    private func paint() {
        layer.borderColor = Palette.imageOutline.resolvedColor(with: traitCollection).cgColor
    }
}

/// The disc the close glyph stands on over the band: the night scrim, so the white × reads
/// over the film's lit laptop screen as well as over the dark rest frame.
private final class CloseScrim: UIView {
    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        // The band is night whatever the appearance, so the disc is too.
        overrideUserInterfaceStyle = .dark
        backgroundColor = Palette.scrim
        layer.cornerRadius = Size.cBarItem / 2
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: Size.cBarItem),
            heightAnchor.constraint(equalToConstant: Size.cBarItem),
        ])
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("CloseScrim is built in code")
    }
}

#if DEBUG
/// A simulator pass at the paywall alone, with no hub: `-paywall-probe` makes
/// the window's root a plain board-coloured screen that raises the sheet,
/// with `-paywall-banners long` for a long ask on the hero's card (the
/// example copy otherwise). `-paywall-catalog` and `-paywall-access` (Pro)
/// pick P1a, P1c and P1e. Once the film has ended and the card and Caw are in
/// (or `-paywall-evidence-after <s>` after the sheet is up), it writes its
/// evidence to Documents: the laid out labels, the links row, the sheet's
/// visible height, the film's time, Caw's box and the close glyph's place,
/// read from the views themselves rather than from a screenshot.
public enum PaywallProbe {
    public static var asked: Bool { ProcessInfo.processInfo.arguments.contains("-paywall-probe") }

    public static func root() -> UIViewController { ProbeRoot() }

    private final class ProbeRoot: UIViewController {
        private var raised = false

        override func viewDidLoad() {
            super.viewDidLoad()
            view.backgroundColor = Palette.surfacePage
        }

        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            guard !raised else { return }
            raised = true
            let long = UserDefaults.standard.string(forKey: "paywall-banners") == "long"
            let banner = long
                ? HeroBanner(title: PaywallCopy.bannerTitle(harness: "Claude Code", machine: "obelisk-of-light-build-runner-02"),
                             body: "Run bash: cd apps/apple && xcodebuild -project CawCo.xcodeproj -scheme CawCo -destination generic/platform=iOS build")
                : HeroBanner(title: PaywallCopy.bannerTitle(harness: "Claude Code", machine: "your machine"), body: PaywallCopy.bannerExample)
            let paywall = PaywallController.present(.onboarding, banner: banner, from: self)
            let log = Logger(subsystem: "dev.cawco.app", category: "Paywall")
            log.notice("probe: the sheet is presented")
            // `-paywall-evidence-after <s>`: that long after the sheet is up, for a frame mid-film.
            // Without it, once the film has played to its end and the cards and Caw have come.
            let after = UserDefaults.standard.object(forKey: "paywall-evidence-after").map { _ in
                UserDefaults.standard.double(forKey: "paywall-evidence-after")
            }
            Task { @MainActor [weak paywall] in
                if let after {
                    try? await Task.sleep(for: .seconds(after))
                } else {
                    while let paywall, !paywall.probeAtRest {
                        try? await Task.sleep(for: .milliseconds(250))
                    }
                    log.notice("probe: at rest")
                    try? await Task.sleep(for: .seconds(5))
                }
                guard let paywall else {
                    log.error("probe: the sheet is gone before its evidence")
                    return
                }
                paywall.printEvidence()
            }
        }
    }
}

extension PaywallController {
    /// The sheet is up and, where the band plays the film, it has played to its end.
    fileprivate var probeAtRest: Bool {
        guard viewIfLoaded?.window != nil else { return false }
        if case .scene = mode(for: screen) { return hero.probeCardsShown }
        return true
    }

    /// One line of JSON on stdout: every label that shows, in the sheet's
    /// space, the height its words need at its width against the height it
    /// has, and the links row's insets.
    fileprivate func printEvidence() {
        let sheet = parent?.view ?? view!
        guard let window = sheet.window else {
            log.error("probe: the sheet is not in a window")
            return
        }
        let inWindow = sheet.convert(sheet.bounds, to: window)
        let visible = min(inWindow.maxY, window.bounds.maxY) - inWindow.minY
        func showing(_ node: UIView) -> Bool {
            var at: UIView? = node
            while let view = at, view !== sheet {
                if view.isHidden || view.alpha < 0.01 { return false }
                at = view.superview
            }
            return true
        }
        func labels(_ node: UIView) -> [UILabel] {
            node.subviews.flatMap { sub -> [UILabel] in (sub as? UILabel).map { [$0] } ?? labels(sub) }
        }
        var rows: [[String: Any]] = []
        var words = 0
        for label in labels(sheet) where showing(label) {
            let text = label.text ?? ""
            guard !text.isEmpty else { continue }
            let frame = label.convert(label.bounds, to: sheet)
            // Measured wrapped by word: the kit's paragraph truncates its
            // tail, which measures any text as one line.
            let wrapped = NSMutableAttributedString(attributedString: label.attributedText ?? NSAttributedString())
            wrapped.enumerateAttribute(.paragraphStyle, in: NSRange(location: 0, length: wrapped.length)) { value, range, _ in
                guard let style = (value as? NSParagraphStyle)?.mutableCopy() as? NSMutableParagraphStyle else { return }
                style.lineBreakMode = .byWordWrapping
                wrapped.addAttribute(.paragraphStyle, value: style, range: range)
            }
            let needed = wrapped.boundingRect(with: CGSize(width: label.bounds.width, height: .greatestFiniteMagnitude),
                                              options: [.usesLineFragmentOrigin], context: nil).height
            let lineHeight = (label.font.lineHeight * 10).rounded() / 10
            let inHero = label.isDescendant(of: hero)
            let prose = !inHero && label.superview is UIStackView && text != "·"
            if prose { words += text.split(whereSeparator: \.isWhitespace).count }
            rows.append(["text": text, "y": frame.minY, "maxY": frame.maxY, "x": frame.minX, "width": frame.width,
                         "height": frame.height, "needed": (needed * 10).rounded() / 10, "lines": label.numberOfLines,
                         "shownLines": Int((frame.height / max(lineHeight, 1)).rounded(.down)),
                         "fits": needed <= frame.height + 0.5, "hero": inHero, "prose": prose])
        }
        var links: [String: Any] = [:]
        if let row = linksRow, showing(row) {
            let frame = row.convert(row.bounds, to: sheet)
            links = ["minX": frame.minX, "maxX": frame.maxX, "maxY": frame.maxY,
                     "leading": frame.minX, "trailing": sheet.bounds.width - frame.maxX,
                     "aboveFold": frame.maxY < visible]
        }
        let buttons = panel.subviews.flatMap { labelsOrButtons($0) }
        let evidence: [String: Any] = ["screen": builtKey, "sheet": ["width": sheet.bounds.width, "visible": visible, "top": inWindow.minY],
                                       "hero": hero.convert(hero.bounds, to: sheet).debugDescription,
                                       "proseWords": words, "links": links, "buttons": buttons, "labels": rows,
                                       "heroState": hero.probeState, "close": closeEvidence(in: sheet)]
        // Into the app's Documents (`simctl get_app_container … data`), where the pass reads it.
        guard let data = try? JSONSerialization.data(withJSONObject: evidence, options: [.sortedKeys]),
              let folder = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
        let file = folder.appendingPathComponent("paywall-evidence.json")
        do {
            try data.write(to: file)
            log.notice("probe: evidence written to \(file.path, privacy: .public)")
        } catch {
            log.error("probe: evidence not written: \(String(describing: error), privacy: .public)")
        }
    }

    /// The close glyph's box and the leading rail's inner edge, in the sheet's
    /// space, and how far inside the rail the glyph stands.
    private func closeEvidence(in sheet: UIView) -> [String: Any] {
        guard let glyph = close.imageView, let rail = hero.leadingRailEdge else { return [:] }
        let box = glyph.convert(glyph.bounds, to: sheet)
        let edge = hero.convert(CGPoint(x: rail, y: 0), to: sheet).x
        return ["glyph": box.debugDescription, "button": close.convert(close.bounds, to: sheet).debugDescription,
                "railEdge": edge, "insideRail": box.minX - edge, "hidden": close.isHidden]
    }

    private func labelsOrButtons(_ node: UIView) -> [String] {
        if let button = node as? UIButton, !(button is LinkButton), !button.isHidden {
            return [button.configuration?.attributedTitle.map { String($0.characters) } ?? ""]
        }
        return node.subviews.flatMap { labelsOrButtons($0) }
    }
}
#endif
