import CawCoCore
import CawCoDesign
import OSLog
import UIKit

/// The line every other line on the home is believed by
/// (home/StatusLine.svelte): is the hub there. Live and read is the quiet
/// default: the home draws no line then. A dead hub says so with its retry
/// clock and Reconnect: a quiet fleet and an unreachable hub never read the
/// same. Local Network privacy refusing the hub is said here and only here,
/// with Open Settings, the one action that changes it: coming back from
/// Settings reconnects by itself (`HubConnection.becameActive`), so there is
/// no Reconnect beside it. Each change of phase cross-fades.
final class StatusLineView: UIView {
    enum Phase: Equatable {
        case refused, unreachable, connecting, reading, connected
    }

    private let glyph = GlyphView(.warning, size: Size.iconSm, tint: Palette.statusFailInk)
    private let words = KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted)
    private var reconnect: UIButton!
    private let row = UIStackView()
    private var phase: Phase?
    private var clock: Timer?
    private weak var hub: HubConnection?

    init() {
        super.init(frame: .zero)
        reconnect = KitButton.make("Reconnect", variant: .outline, height: .xs) { [weak self] in
            self?.hub?.reconnectNow()
        }
        words.tabular = true
        row.addArrangedSubview(glyph)
        row.addArrangedSubview(words)
        row.addArrangedSubview(reconnect)
        row.addArrangedSubview(UIView())
        row.spacing = Space.space1
        row.setCustomSpacing(Space.space2, after: words)
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            row.leadingAnchor.constraint(equalTo: leadingAnchor),
            row.trailingAnchor.constraint(equalTo: trailingAnchor),
            row.topAnchor.constraint(equalTo: topAnchor),
            row.bottomAnchor.constraint(equalTo: bottomAnchor),
            heightAnchor.constraint(greaterThanOrEqualToConstant: 28),
        ])
        words.accessibilityTraits = .updatesFrequently
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("StatusLineView is built in code")
    }

    /// `localNetworkDenied`: the screen's own word that Local Network privacy
    /// refuses this app (a first run's search), beside the hub socket's.
    func configure(hub: HubConnection, ready: Bool, localNetworkDenied: Bool = false) {
        self.hub = hub
        let next: Phase = if hub.localNetworkDenied || localNetworkDenied { .refused } else {
            switch hub.state {
            case .unreachable: .unreachable
            case .connecting: .connecting
            case .connected: ready ? .connected : .reading
            }
        }
        let changed = phase != nil && phase != next
        phase = next
        // Opacity only, so it runs with or without motion, as the web's does.
        if changed {
            UIView.transition(with: row, duration: Motion.durControl, options: [.transitionCrossDissolve, .allowUserInteraction]) {
                self.render()
            }
        } else {
            render()
        }
        clock?.invalidate()
        clock = nil
        if next == .unreachable {
            // The retry countdown is a clock: a quarter second is never seen stuck.
            clock = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
                MainActor.assumeIsolated { self?.render() }
            }
        }
    }

    private func render() {
        guard let hub, let phase else {
            return
        }
        let down = phase == .unreachable || phase == .refused
        glyph.isHidden = !down
        reconnect.isHidden = !down
        reconnect.isEnabled = phase == .refused || hub.socket != .connecting
        words.ink = down ? Palette.statusFailInk : Palette.inkMuted
        switch phase {
        case .refused:
            // Not the hub away: this app is not let onto its network. Open Settings is the fix.
            words.text = "CawCo isn't allowed on the local network"
        case .unreachable:
            if hub.socket == .connecting {
                words.text = "Hub unreachable, retrying now"
            } else {
                let seconds = hub.retryAt.map { max(0, Int($0.timeIntervalSinceNow.rounded(.up))) } ?? 0
                words.text = "Hub unreachable, retrying in \(seconds)s"
            }
        case .connecting:
            words.text = "Connecting…"
        case .reading:
            words.text = "Connected · reading the fleet…"
        case .connected:
            // Live and read is the quiet default: the home draws no line then.
            words.text = nil
        }
        let action = phase == .refused ? "Open Settings" : hub.socket == .connecting ? "Connecting…" : "Reconnect"
        KitButton.setTitle(action, of: reconnect, variant: .outline, height: .xs)
        #if DEBUG
        // What the line says, for a simulator pass to read (probe-ios-catchup.ts `--local-network`).
        let said = "\(words.text ?? "")|\(down ? action : "")"
        if said != lastSaid {
            lastSaid = said
            Logger(subsystem: "dev.cawco.app", category: "Transcript").notice("status line: \(said, privacy: .public)")
        }
        #endif
    }

    #if DEBUG
    private var lastSaid = ""
    #endif

    override func willMove(toWindow newWindow: UIWindow?) {
        super.willMove(toWindow: newWindow)
        if newWindow == nil {
            clock?.invalidate()
            clock = nil
        }
    }
}
