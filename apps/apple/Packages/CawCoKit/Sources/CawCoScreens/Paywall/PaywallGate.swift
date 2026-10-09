import CawCoCore
import CawCoDesign
import CawCoMascot
import OSLog
import UIKit

/// One window's half of CawCo Pro (paywall DESIGN.md §1): it locks the board
/// when no entitlement holds, stands the gate bar over it, raises the
/// onboarding paywall once, opens P1e over an ended week at launch, and shows
/// the free week's day-6 card. The entitlement alone decides; the sheet only sells.
@MainActor
final class PaywallGate {
    private let hub: HubConnection
    private let home: HomeModel
    private let shell: ShellController
    /// Asks the window for another pass (a timer ran out).
    var onChange: () -> Void = {}

    private let bar = GateBar()
    private let card = TrialCard()
    /// When the hub's fleet was first read on this launch: the onboarding trigger's clock.
    private var firstRead: Date?
    private var triggerClock: Task<Void, Never>?
    /// The ask that was waiting when the trigger came due: the sheet waits for its answer.
    private var held: HomeModel.NeedsItem?
    private var heldAsk: ParkedAsk?
    private var endedOffered = false
    private var reminderKey = ""
    private var locked = false
    /// What the gate last saw, logged when it changes.
    private var seen = ""
    private let log = Logger(subsystem: "dev.cawco.app", category: "Paywall")

    /// `paywall-shown`: the onboarding sheet has risen once on this install.
    private static let shownKey = "paywall-shown"
    /// T6's card was put away for good.
    private static let cardKey = "paywall-trial-card-dismissed"
    /// The onboarding sheet rises 10 s after the first read when nothing is live.
    private static let quietWait: TimeInterval = 10

    init(hub: HubConnection, home: HomeModel, shell: ShellController) {
        self.hub = hub
        self.home = home
        self.shell = shell
        bar.onBuy = { [weak self] product in self?.present(.buy(product)) }
        bar.onIncluded = { [weak self] in self?.present(.offer) }
        bar.onRestore = { [weak self] in self?.restore() }
        bar.onChangeHub = { [weak self] in self?.shell.changeHub() }
        card.onBuy = { [weak self] in self?.present(.buy(.pro)) }
        card.onDismiss = { [weak self] in
            UserDefaults.standard.set(true, forKey: Self.cardKey)
            self?.onChange()
        }
    }

    /// Stands the bar and the card over `view`, the window's root.
    func attach(to view: UIView) {
        bar.isHidden = true
        card.isHidden = true
        view.addSubview(bar)
        view.addSubview(card)
        let guide = view.safeAreaLayoutGuide
        let cardWide = card.widthAnchor.constraint(equalToConstant: 540)
        cardWide.priority = .defaultHigh
        NSLayoutConstraint.activate([
            bar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            bar.content.bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: -Space.space3),
            card.topAnchor.constraint(equalTo: guide.topAnchor, constant: Size.cTopBarH + Space.space2),
            card.centerXAnchor.constraint(equalTo: guide.centerXAnchor),
            card.leadingAnchor.constraint(greaterThanOrEqualTo: guide.leadingAnchor, constant: Space.space3),
            card.trailingAnchor.constraint(lessThanOrEqualTo: guide.trailingAnchor, constant: -Space.space3),
            cardWide,
        ])
    }

    /// Whether the board is locked now: menu commands and keys stand down too.
    var isLocked: Bool { locked }

    /// One pass, from the window's `refreshContent` (so everything read here is
    /// observed): `onBoard` when the board is what the window shows, `read`
    /// once the hub's fleet was read.
    func update(onBoard: Bool, read: Bool) {
        let pro = Pro.shared
        let state = "board \(onBoard) read \(read) access \(pro.access.map { String(describing: $0) } ?? "unread") shown \(UserDefaults.standard.bool(forKey: Self.shownKey)) open \(pro.boardOpen) locked \(locked)"
        if state != seen {
            seen = state
            log.notice("gate: \(state, privacy: .public)")
        }
        // `Pro.boardOpen` (TestFlight before the App Store has products):
        // the board stays open and nothing below shows.
        guard onBoard, let access = pro.access, !pro.boardOpen else {
            lock(false)
            bar.isHidden = true
            card.isHidden = true
            return
        }
        let shown = UserDefaults.standard.bool(forKey: Self.shownKey)
        let pending = access.entitled ? nil : pro.pending
        lock(!access.entitled && (access == .ended || shown || pending != nil))
        let price = pro.displayPrice(.pro)
        bar.configure(pending != nil ? .askToBuy : access == .none ? .trial : .ended, price: price)
        bar.isHidden = !locked
        bar.superview?.bringSubviewToFront(bar)

        if access == .none, !shown, pending == nil, read { onboarding() }
        if access == .ended, read, !endedOffered {
            if presentable {
                endedOffered = true
                present(.offer)
            } else {
                passAgain()
            }
        }

        var daysLeft: Int?
        if case let .trial(endsAt) = access {
            _ = home.now
            daysLeft = Int((endsAt.timeIntervalSinceNow / 86400).rounded(.up))
        }
        card.configure(price: price)
        card.isHidden = !(daysLeft.map { $0 <= 2 } ?? false) || UserDefaults.standard.bool(forKey: Self.cardKey)
        card.superview?.bringSubviewToFront(card)
        remind(access: access, price: price)
    }

    /// The board as it stands, dimmed and deaf to touches, while locked.
    private func lock(_ next: Bool) {
        guard next != locked else { return }
        locked = next
        let board = shell.view
        Motion.easeOut.animator(Motion.durFade) {
            board?.alpha = next ? 0.4 : 1
        }.startAnimation()
        board?.isUserInteractionEnabled = !next
        board?.accessibilityElementsHidden = next
    }

    /// E1: once, when the first live session row is on screen, or 10 s after
    /// the first read on a quiet hub; never over a waiting ask, which it
    /// waits out and then shows in the hero.
    private func onboarding() {
        if firstRead == nil {
            firstRead = .now
            triggerClock = Task { [weak self] in
                try? await Task.sleep(for: .seconds(Self.quietWait))
                self?.onChange()
            }
        }
        let asks = home.needs.filter { if case .ask = $0.kind { true } else { false } }
        if let held {
            guard !asks.contains(where: { $0.id == held.id }) else { return }
            fire(with: heldAsk)
            return
        }
        let live = !home.working.isEmpty || !home.needs.isEmpty
        guard live || Date.now.timeIntervalSince(firstRead ?? .now) >= Self.quietWait else { return }
        if let first = asks.first, case let .ask(ask) = first.kind {
            held = first
            heldAsk = ask
            return
        }
        fire(with: nil)
    }

    /// The shell stands in its window. Before that, UIKit drops a sheet
    /// presented over it ("whose view is not in the window hierarchy").
    private var presentable: Bool { shell.viewIfLoaded?.window != nil }

    /// Another pass shortly, for a sheet that couldn't be presented yet.
    private func passAgain() {
        Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            self?.onChange()
        }
    }

    private func fire(with ask: ParkedAsk?) {
        // `paywall-shown` is kept only once the sheet can really show.
        guard presentable else {
            passAgain()
            return
        }
        log.notice("gate: the onboarding paywall rises (\(ask == nil ? "no ask waiting" : "after the ask was answered", privacy: .public))")
        UserDefaults.standard.set(true, forKey: Self.shownKey)
        held = nil
        triggerClock?.cancel()
        PaywallController.present(.onboarding, banners: HeroBanner.cards(hub: hub, home: home, held: ask), from: shell.dialogPresenter)
        onChange()
    }

    /// The paywall over whatever the window shows.
    func present(_ entry: PaywallController.Entry) {
        PaywallController.present(entry, banners: HeroBanner.cards(hub: hub, home: home), from: shell.dialogPresenter)
    }

    /// T's tap and T6's push: the Get Pro form for a live week; the offer otherwise.
    func keepPro() {
        guard !Pro.shared.boardOpen, let access = Pro.shared.access, access != .owned else { return }
        present(access.entitled ? .keep : .offer)
    }

    /// G's Restore purchase.
    private func restore() {
        bar.restoring = true
        Task {
            let outcome = await Pro.shared.restore()
            bar.restoring = false
            switch outcome {
            case let .found(access) where access.entitled: present(.restored(access))
            case .found: present(.offer)
            case .nothing: bar.say(PaywallCopy.Restore.nothing, fails: false)
            case .failed: bar.say(PaywallCopy.Restore.failed, fails: true)
            case .unverified: bar.say(PaywallCopy.Restore.unverified, fails: true)
            }
        }
    }

    /// T6's local notification, scheduled while the week is live, notifications
    /// are allowed and H5 is on; taken down when any of those stops holding.
    private func remind(access: ProAccess, price: String?) {
        var endsAt: Date?
        if case let .trial(end) = access { endsAt = end }
        let allowed = PushRegistry.shared.allowed
        let on = PushRegistry.shared.trialReminder
        let key = "\(endsAt?.timeIntervalSince1970 ?? 0)|\(allowed)|\(on)|\(price ?? "")"
        guard key != reminderKey else { return }
        reminderKey = key
        Task {
            await TrialReminder.schedule(endsAt: endsAt, title: PaywallCopy.Trial.pushTitle, body: PaywallCopy.Trial.pushBody)
        }
    }
}

/// G: the bar over the locked board, pinned to the window's foot across
/// every column. Caw asleep, why it's locked, the ways out, and the links.
final class GateBar: UIView {
    enum Form: Equatable { case trial, ended, askToBuy }

    let content = UIStackView()
    var onBuy: (ProProduct) -> Void = { _ in }
    var onIncluded: () -> Void = {}
    var onRestore: () -> Void = {}
    var onChangeHub: () -> Void = {}

    private let caw = CawView(status: .sleeping)
    private let line = KitLabel(TypeScale.typeBody, ink: Palette.inkStrong, lines: 0)
    private let sub = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private let buttons = UIStackView()
    private let linksRow = UIStackView()
    private let said = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private var restoreLink: LinkButton!
    private var includedLink: LinkButton!
    private var drawn: (Form, String?)?
    private var clear: Task<Void, Never>?

    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.surfaceRaised
        let edge = UIView()
        edge.backgroundColor = Palette.borderHairline
        edge.translatesAutoresizingMaskIntoConstraints = false
        addSubview(edge)

        line.text = PaywallCopy.Gate.line
        line.accessibilityTraits = .header
        let words = UIStackView(arrangedSubviews: [line, sub])
        words.axis = .vertical
        words.spacing = 2
        let head = UIStackView(arrangedSubviews: [caw, words])
        head.spacing = Space.space3
        head.alignment = .center
        buttons.spacing = Space.space2
        buttons.distribution = .fillEqually

        restoreLink = LinkButton(PaywallCopy.Links.restore) { [weak self] in self?.onRestore() }
        includedLink = LinkButton(PaywallCopy.Links.included) { [weak self] in self?.onIncluded() }
        let change = LinkButton(PaywallCopy.Links.changeHub) { [weak self] in self?.onChangeHub() }
        for (index, link) in [includedLink!, restoreLink!, change].enumerated() {
            if index > 0 {
                let dot = KitLabel(TypeScale.typeMeta, ink: Palette.inkSubtle)
                dot.text = "·"
                dot.isAccessibilityElement = false
                linksRow.addArrangedSubview(dot)
            }
            linksRow.addArrangedSubview(link)
        }
        linksRow.spacing = Space.space1
        linksRow.alignment = .center
        said.textAlignment = .center
        said.isHidden = true
        let foot = UIStackView(arrangedSubviews: [linksRow, said])
        foot.axis = .vertical
        foot.alignment = .center

        for part in [head, buttons, foot] { content.addArrangedSubview(part) }
        content.axis = .vertical
        content.spacing = Space.space2
        content.translatesAutoresizingMaskIntoConstraints = false
        addSubview(content)
        let wide = content.widthAnchor.constraint(equalToConstant: 600)
        wide.priority = .defaultHigh
        NSLayoutConstraint.activate([
            edge.topAnchor.constraint(equalTo: topAnchor),
            edge.leadingAnchor.constraint(equalTo: leadingAnchor),
            edge.trailingAnchor.constraint(equalTo: trailingAnchor),
            edge.heightAnchor.constraint(equalToConstant: 1),
            caw.widthAnchor.constraint(equalToConstant: 44),
            caw.heightAnchor.constraint(equalToConstant: 44),
            content.topAnchor.constraint(equalTo: topAnchor, constant: Space.space4),
            content.centerXAnchor.constraint(equalTo: centerXAnchor),
            content.leadingAnchor.constraint(greaterThanOrEqualTo: safeAreaLayoutGuide.leadingAnchor, constant: Space.space4),
            content.trailingAnchor.constraint(lessThanOrEqualTo: safeAreaLayoutGuide.trailingAnchor, constant: -Space.space4),
            wide,
        ])
        accessibilityViewIsModal = false
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("GateBar is built in code")
    }

    func configure(_ form: Form, price: String?) {
        guard drawn.map({ $0.0 != form || $0.1 != price }) ?? true else { return }
        drawn = (form, price)
        sub.text = switch form {
        case .trial: PaywallCopy.Gate.trial(price)
        case .ended: PaywallCopy.Gate.ended(price)
        case .askToBuy: PaywallCopy.Gate.askToBuy
        }
        for view in buttons.arrangedSubviews { view.removeFromSuperview() }
        switch form {
        case .trial:
            buttons.addArrangedSubview(KitButton.make(PaywallCopy.P1.primary, variant: .action, stretch: true) { [weak self] in self?.onBuy(.trial) })
            buttons.addArrangedSubview(KitButton.make(PaywallCopy.P1.secondary(price), variant: .outline, stretch: true) { [weak self] in self?.onBuy(.pro) })
        case .ended:
            buttons.addArrangedSubview(KitButton.make(PaywallCopy.P1.secondary(price), variant: .action, stretch: true) { [weak self] in self?.onBuy(.pro) })
        case .askToBuy:
            break
        }
        buttons.isHidden = form == .askToBuy
        // Ask to Buy keeps Restore and Change hub only.
        includedLink.isHidden = form == .askToBuy
        linksRow.arrangedSubviews.first { !($0 is LinkButton) }?.isHidden = form == .askToBuy
        for button in buttons.arrangedSubviews.compactMap({ $0 as? UIButton }) {
            button.isEnabled = Pro.shared.catalog == .loaded && Pro.shared.canMakePayments == true
        }
    }

    var restoring = false {
        didSet {
            restoreLink.busy = restoring
            restoreLink.title = restoring ? PaywallCopy.Restore.checking : PaywallCopy.Links.restore
            if restoring { said.isHidden = true }
        }
    }

    /// R2's line stands in the links' place for 4 s; R3's and R4's stay under them.
    func say(_ text: String, fails: Bool) {
        said.text = text
        said.ink = fails ? Palette.statusFailInk : Palette.inkMuted
        said.isHidden = false
        linksRow.isHidden = !fails
        clear?.cancel()
        guard !fails else { return }
        clear = Task { [weak self] in
            try? await Task.sleep(for: .seconds(4))
            guard !Task.isCancelled, let self else { return }
            said.isHidden = true
            linksRow.isHidden = false
        }
    }
}

/// T, owned: the rail's small `Pro` tag, an ink tile in the meta role.
final class ProTag: UIView {
    init() {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = Palette.inkSolid
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        let label = KitLabel(TypeScale.typeMeta, ink: Palette.onInk)
        label.text = PaywallCopy.Trial.owned
        label.translatesAutoresizingMaskIntoConstraints = false
        addSubview(label)
        NSLayoutConstraint.activate([
            label.topAnchor.constraint(equalTo: topAnchor, constant: 2),
            label.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -2),
            label.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space2),
            label.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space2),
        ])
        setContentHuggingPriority(.required, for: .horizontal)
        isAccessibilityElement = false
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("ProTag is built in code")
    }
}

/// T6: the free week's one card at the top of the board on its last two days.
final class TrialCard: TileView {
    var onBuy: () -> Void = {}
    var onDismiss: () -> Void = {}
    private let body = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted, lines: 0)
    private let buttonSlot = UIStackView()
    private var price: String??

    init() {
        super.init(radius: Radius.radiusLg)
        let caw = CawView(status: .ready)
        let title = KitLabel(TypeScale.typeLabel, ink: Palette.inkStrong, lines: 0)
        title.text = PaywallCopy.Trial.cardTitle
        title.accessibilityTraits = .header
        let close = GhostIconButton(.close, label: "Close", tint: Palette.inkMuted)
        close.addAction(UIAction { [weak self] _ in self?.onDismiss() }, for: .primaryActionTriggered)
        let words = UIStackView(arrangedSubviews: [title, body, buttonSlot])
        words.axis = .vertical
        words.spacing = Space.space1
        words.setCustomSpacing(Space.space2, after: body)
        buttonSlot.alignment = .leading
        let row = UIStackView(arrangedSubviews: [caw, words, close])
        row.spacing = Space.space3
        row.alignment = .top
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            caw.widthAnchor.constraint(equalToConstant: 28),
            caw.heightAnchor.constraint(equalToConstant: 28),
            row.topAnchor.constraint(equalTo: topAnchor, constant: Space.space3),
            row.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Space.space3),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Space.space3),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Space.space2),
        ])
    }

    func configure(price: String?) {
        guard self.price != .some(price) else { return }
        self.price = .some(price)
        body.text = PaywallCopy.Trial.cardBody(price)
        for view in buttonSlot.arrangedSubviews { view.removeFromSuperview() }
        let buy = KitButton.make(PaywallCopy.P1.secondary(price), variant: .action) { [weak self] in self?.onBuy() }
        buy.isEnabled = price != nil
        buttonSlot.addArrangedSubview(buy)
    }
}
