import AuthenticationServices
import CawCoCore
import CawCoDesign
import Observation
import UIKit

// MARK: Sign-in flows

/// One account signing in on one machine with Claude Code's own login
/// (accounts/signin.svelte.ts): the hub asks the machine for the link, the
/// link opens (`SignInBrowser`), the code it shows is pasted back, and the
/// machine says who it signed in as. The account page's machine rows and the
/// setup's both draw this.
@MainActor
@Observable
final class PasteSignin {
    enum Phase: Equatable { case idle, opening, ready, checking, signedIn, mismatch }

    private(set) var phase = Phase.idle
    /// The link Claude Code's login answered, once it has.
    private(set) var url: URL?
    var code = ""
    /// The hub's refusal, in its own words, for the field to show.
    private(set) var problem: String?
    /// Who the machine signed in as, once it has.
    private(set) var email: String?

    @ObservationIgnored private weak var hub: HubConnection?
    @ObservationIgnored private let account: () async throws -> String
    @ObservationIgnored let machineId: String

    /// `account` answers the account's id, creating the account first where
    /// the setup has not yet (it is made when its first link is asked for).
    init(hub: HubConnection, machineId: String, account: @escaping () async throws -> String) {
        self.hub = hub
        self.machineId = machineId
        self.account = account
    }

    var busy: Bool { phase == .opening || phase == .checking }

    /// Asks the machine for the link; true once there is one to open.
    func open() async -> Bool {
        guard !busy, let hub else { return false }
        phase = .opening
        problem = nil
        do {
            let id = try await account()
            let start = try await hub.beginSignin(id, machineId: machineId)
            guard let link = start.url.flatMap(URL.init(string:)) else {
                throw HubSaid(Words.Accounts.Signin.notALink)
            }
            url = link
            phase = .ready
            return true
        } catch {
            phase = url == nil ? .idle : .ready
            problem = error.localizedDescription
            return false
        }
    }

    /// Types the pasted code into the machine's login.
    func done() async {
        let code = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !busy, !code.isEmpty, let hub else { return }
        phase = .checking
        problem = nil
        do {
            let id = try await account()
            let answer = try await hub.completeSignin(id, machineId: machineId, code: code)
            email = answer.who
            self.code = ""
            switch answer.state {
            case "signed-in": phase = .signedIn
            case "mismatch": phase = .mismatch
            default:
                phase = .ready
                problem = Words.Accounts.Signin.refused
            }
        } catch {
            phase = .ready
            problem = error.localizedDescription
        }
    }
}

/// One account signing in on one machine with its provider's device code
/// (accounts/device.svelte.ts): the machine starts the provider's own sign-in
/// and answers a code, the person enters it on any device, and the hub waits
/// (a minute at a time) for the machine to say who it signed in as. A code is
/// only ever minted by a press: nothing starts on open.
@MainActor
@Observable
final class DeviceSignin {
    enum Phase: Equatable { case idle, starting, waiting, expired, signedIn, mismatch }

    private(set) var phase = Phase.idle
    private(set) var code: String?
    private(set) var url: URL?
    /// When the code lapses, epoch ms.
    private(set) var expiresAt = 0.0
    private(set) var email: String?
    /// The hub's refusal, in its own words.
    private(set) var problem: String?
    /// The clock the countdown reads, ticking each second while a code waits.
    private(set) var now = Date.now.timeIntervalSince1970 * 1000

    @ObservationIgnored private weak var hub: HubConnection?
    @ObservationIgnored private let account: () async throws -> String
    @ObservationIgnored let machineId: String
    /// Bumped by every start and by dispose: an older wait stops asking.
    @ObservationIgnored private var round = 0
    @ObservationIgnored private var tick: Task<Void, Never>?

    init(hub: HubConnection, machineId: String, account: @escaping () async throws -> String) {
        self.hub = hub
        self.machineId = machineId
        self.account = account
    }

    /// Mints a code on the machine and waits for it to be entered.
    func start() async {
        guard phase != .starting, phase != .waiting, let hub else { return }
        round += 1
        let mine = round
        phase = .starting
        problem = nil
        do {
            let id = try await account()
            let challenge = try await hub.beginSignin(id, machineId: machineId)
            guard mine == round else { return }
            guard let userCode = challenge.userCode, let expires = challenge.expiresAt else {
                phase = .idle
                problem = Words.Accounts.Device.notACode
                return
            }
            code = userCode
            url = challenge.verificationUrl.flatMap(URL.init(string:))
            expiresAt = expires
            phase = .waiting
            clock(true)
            while mine == round {
                let answer = try await hub.completeSignin(id, machineId: machineId)
                guard mine == round else { return }
                if answer.state == "pending" {
                    if Date.now.timeIntervalSince1970 * 1000 >= expiresAt {
                        end(.expired)
                        return
                    }
                    continue
                }
                if answer.state == "signed-in" || answer.state == "mismatch" { email = answer.who }
                end(answer.state == "signed-in" ? .signedIn : answer.state == "mismatch" ? .mismatch : .expired)
                return
            }
        } catch {
            guard mine == round else { return }
            clock(false)
            code = nil
            phase = .idle
            problem = error.localizedDescription
        }
    }

    private func end(_ next: Phase) {
        clock(false)
        phase = next
    }

    private func clock(_ on: Bool) {
        tick?.cancel()
        tick = nil
        guard on else { return }
        now = Date.now.timeIntervalSince1970 * 1000
        tick = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                guard let self, !Task.isCancelled else { return }
                now = Date.now.timeIntervalSince1970 * 1000
                if phase == .waiting, now >= expiresAt {
                    round += 1
                    end(.expired)
                }
            }
        }
    }

    /// Stops waiting (the row went away); the code lapses on its own.
    func dispose() {
        round += 1
        clock(false)
    }
}

/// A refusal written here, in the words a person reads.
struct HubSaid: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

// MARK: The sign-in page

/// The provider's own sign-in page, for the one step that needs a browser:
/// the platform's authentication session over the app (HIG "Sign in with a
/// web service"), sharing Safari's sign-ins, so the page a person is already
/// signed in to opens signed in. Nothing comes back through it: Claude
/// Code's page shows a code to paste, and a device code is waited for by the
/// hub, so the page is closed by the person or, once the machine has signed
/// in, here.
@MainActor
final class SignInBrowser: NSObject, ASWebAuthenticationPresentationContextProviding {
    private static var current: (session: ASWebAuthenticationSession, provider: SignInBrowser)?
    private weak var window: UIWindow?
    #if DEBUG
    /// What the last open asked for, for the probe.
    static private(set) var lastOpened: URL?
    #endif

    private init(window: UIWindow?) {
        self.window = window
    }

    /// Opens `url` over `view`'s window, closing one already open.
    static func open(_ url: URL, from view: UIView) {
        close()
        #if DEBUG
        lastOpened = url
        if AccountsProbe.on {
            AccountsProbe.log.notice("sign-in page opens \(url.absoluteString, privacy: .public)")
            return
        }
        #endif
        let provider = SignInBrowser(window: view.window)
        let session = ASWebAuthenticationSession(url: url, callback: .customScheme("cawco-signin")) { _, _ in
            MainActor.assumeIsolated { current = nil }
        }
        session.presentationContextProvider = provider
        session.prefersEphemeralWebBrowserSession = false
        current = (session, provider)
        session.start()
    }

    static func close() {
        current?.session.cancel()
        current = nil
    }

    nonisolated func presentationAnchor(for _: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated { window ?? ASPresentationAnchor() }
    }
}

// MARK: Marks

/// A provider's mark (ProviderMark.svelte): its logo as it ships, or, `mono`,
/// its silhouette in `tint` (an account's tile tints it in the account's
/// hue). A provider with no mark draws the accounts glyph.
func providerMark(_ provider: String, side: Double = 16, mono: UIColor? = nil) -> UIImageView {
    let view: UIImageView
    if let logo = BrandLogo.account(provider) {
        view = UIImageView(image: mono == nil ? logo.image : logo.image.withRenderingMode(.alwaysTemplate))
        view.tintColor = mono ?? Palette.inkStrong
    } else {
        view = GlyphView(.toolTask, size: side, tint: mono ?? Palette.inkMuted)
    }
    view.contentMode = .scaleAspectFit
    view.translatesAutoresizingMaskIntoConstraints = false
    view.isAccessibilityElement = false
    NSLayoutConstraint.activate([view.widthAnchor.constraint(equalToConstant: side), view.heightAnchor.constraint(equalToConstant: side)])
    return view
}

/// An account's tile (AccountTile.svelte): its provider's mark in one ink,
/// the account's colour, on that colour at 18%, at the small radius.
final class AccountTileView: UIView {
    private var mark: UIImageView?
    private var side: Double

    init(provider: String, hue: String, side: Double) {
        self.side = side
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = Radius.radiusSm
        layer.cornerCurve = .continuous
        isAccessibilityElement = false
        NSLayoutConstraint.activate([widthAnchor.constraint(equalToConstant: side), heightAnchor.constraint(equalToConstant: side)])
        set(provider: provider, hue: hue)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("AccountTileView is built in code")
    }

    func set(provider: String, hue: String) {
        let ink = AccountInk.color(hue)
        mark?.removeFromSuperview()
        let next = providerMark(provider, side: side >= 32 ? 18 : 16, mono: ink)
        addSubview(next)
        NSLayoutConstraint.activate([next.centerXAnchor.constraint(equalTo: centerXAnchor), next.centerYAnchor.constraint(equalTo: centerYAnchor)])
        mark = next
        Motion.easeOut.animator(window == nil || UIAccessibility.isReduceMotionEnabled ? 0 : Motion.durFade) {
            self.backgroundColor = ink.withAlphaComponent(0.18)
        }.startAnimation()
    }
}

/// The seven account colours, the chosen one ringed (Swatches.svelte): 26pt
/// squares at the small radius, 12pt apart; chosen, a 2pt ring of the ground
/// then a 2pt ring of its colour.
final class SwatchesView: UIStackView {
    var onPick: ((String) -> Void)?
    private var buttons: [String: UIButton] = [:]
    private var rings: [String: CAShapeLayer] = [:]
    private(set) var value: String

    init(value: String, label: String = Words.Accounts.colour) {
        self.value = value
        super.init(frame: .zero)
        spacing = Space.space3
        alignment = .center
        accessibilityLabel = label
        for hue in FleetAccounts.swatches {
            let button = UIButton(type: .custom)
            button.backgroundColor = AccountInk.color(hue)
            button.layer.cornerRadius = Radius.radiusSm
            button.layer.cornerCurve = .continuous
            button.accessibilityLabel = FleetAccounts.hueNames[hue]
            button.accessibilityIdentifier = "swatch.\(hue)"
            button.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([button.widthAnchor.constraint(equalToConstant: 26), button.heightAnchor.constraint(equalToConstant: 26)])
            button.addAction(UIAction { [weak self] _ in self?.pick(hue) }, for: .primaryActionTriggered)
            let ring = CAShapeLayer()
            ring.fillColor = UIColor.clear.cgColor
            ring.lineWidth = 2
            button.layer.addSublayer(ring)
            rings[hue] = ring
            buttons[hue] = button
            addArrangedSubview(button)
        }
        addArrangedSubview(UIView())
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: SwatchesView, _: UITraitCollection) in view.paint() }
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("SwatchesView is built in code")
    }

    func set(_ hue: String) {
        value = hue
        paint()
    }

    private func pick(_ hue: String) {
        set(hue)
        onPick?(hue)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        paint()
    }

    private func paint() {
        for (hue, button) in buttons {
            let ring = rings[hue]
            // `0 0 0 2px ground, 0 0 0 4px colour`: the colour's ring stands 3pt out, 2pt wide.
            ring?.path = UIBezierPath(roundedRect: button.bounds.insetBy(dx: -3, dy: -3), cornerRadius: Radius.radiusSm + 3).cgPath
            ring?.strokeColor = AccountInk.color(hue).resolvedColor(with: traitCollection).cgColor
            ring?.opacity = hue == value ? 1 : 0
            button.accessibilityTraits = hue == value ? [.button, .selected] : .button
        }
    }
}

/// "Signed in as you@x.com" behind the done check (Check.svelte): the tick
/// draws itself along its stroke as it arrives; with reduced motion it fades in.
final class SignedInLine: UIStackView {
    private let tick = CAShapeLayer()
    private let mark = UIView()
    private let words = KitLabel(TypeScale.typeMeta, ink: Palette.inkRow, lines: 0)

    init() {
        super.init(frame: .zero)
        spacing = Space.space2
        alignment = .center
        mark.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([mark.widthAnchor.constraint(equalToConstant: 16), mark.heightAnchor.constraint(equalToConstant: 16)])
        let path = UIBezierPath()
        path.move(to: CGPoint(x: 5 * 16 / 24.0, y: 12.5 * 16 / 24.0))
        path.addLine(to: CGPoint(x: 9.5 * 16 / 24.0, y: 17 * 16 / 24.0))
        path.addLine(to: CGPoint(x: 19 * 16 / 24.0, y: 7.5 * 16 / 24.0))
        tick.path = path.cgPath
        tick.fillColor = UIColor.clear.cgColor
        tick.lineWidth = 2 * 16 / 24.0
        tick.lineCap = .round
        tick.lineJoin = .round
        mark.layer.addSublayer(tick)
        addArrangedSubview(mark)
        addArrangedSubview(words)
        accessibilityTraits = .staticText
        isAccessibilityElement = true
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (line: SignedInLine, _: UITraitCollection) in line.paint() }
        paint()
    }

    @available(*, unavailable)
    required init(coder _: NSCoder) {
        fatalError("SignedInLine is built in code")
    }

    private func paint() {
        tick.strokeColor = Palette.statusDoneGlyph.resolvedColor(with: traitCollection).cgColor
    }

    /// Says who it signed in as and draws the tick.
    func say(_ who: String) {
        // "Signed in as" and who, the name in the strong weight (`.got b`), a space between as in the web's markup.
        let text = NSMutableAttributedString(string: Words.Accounts.Signin.signedInAs, attributes: [.font: TypeScale.typeMeta.font, .foregroundColor: Palette.inkRow])
        text.append(NSAttributedString(string: " ", attributes: [.font: TypeScale.typeMeta.font]))
        text.append(NSAttributedString(string: who, attributes: [.font: TypeScale.typeMeta.withWeight(.semibold).font, .foregroundColor: Palette.inkStrong]))
        words.attributedText = text
        accessibilityLabel = text.string
        tick.removeAllAnimations()
        let draw = CABasicAnimation(keyPath: UIAccessibility.isReduceMotionEnabled ? "opacity" : "strokeEnd")
        draw.fromValue = 0
        draw.toValue = 1
        draw.duration = Motion.durToggle
        draw.timingFunction = CAMediaTimingFunction(name: .easeOut)
        tick.add(draw, forKey: "in")
    }
}

/// An editor's part under its head (EditorSection.svelte): its glyph in its
/// hue, its name in the label role, then what it holds.
func editorSection(_ glyph: Glyph, hue: UIColor, _ name: String, _ body: [UIView]) -> UIStackView {
    let stack = UIStackView(arrangedSubviews: [nsSectionHeader(glyph, hue: hue, name)] + body)
    stack.axis = .vertical
    stack.spacing = Space.space3
    return stack
}

/// A line of meta words in an ink, wrapping (`.problem`, `.line`, `.warn`).
func metaLine(_ text: String? = nil, ink: UIColor = Palette.inkMuted) -> KitLabel {
    let label = KitLabel(TypeScale.typeMeta, ink: ink, lines: 0)
    label.text = text
    label.wrap = .pretty
    return label
}

/// Shows or hides `view`, folding the stack it stands in over `durControl`
/// (`unfold`); at once with reduced motion or off-screen.
func fold(_ view: UIView, open: Bool) {
    guard view.isHidden == open else { return }
    guard view.window != nil, !UIAccessibility.isReduceMotionEnabled else {
        view.isHidden = !open
        view.alpha = open ? 1 : 0
        return
    }
    if open { view.alpha = 0 }
    Motion.easeOut.animator(Motion.durControl) {
        view.isHidden = !open
        view.alpha = open ? 1 : 0
        view.superview?.layoutIfNeeded()
    }.startAnimation()
}
