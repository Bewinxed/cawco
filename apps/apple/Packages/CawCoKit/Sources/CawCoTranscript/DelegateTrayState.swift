public import CawCoAPI
public import CawCoCore
public import Foundation
import Observation
public import UIKit

/// What the delegate tray above the composer knows beyond the work items
/// themselves (tray.svelte.ts): whether each delegate's card is on screen,
/// which delegates have already entered the tray, and how each one did.
///
/// The owner's rule: a delegate's chip enters the tray the first time its
/// card in the transcript leaves the view, its mark flying from the card to
/// the chip. From then on the chip stays (until its work is done, or its
/// failure dismissed) and never flies again, even with the card back on
/// screen. A delegate whose card was never on screen when it started simply
/// appears in the tray, and one already running when the screen opened is
/// just there.
///
/// One for the app, not one a tray: a composer is handed from conversation
/// to conversation, but "has this chip entered yet" is a fact about the delegate.
@MainActor @Observable
public final class DelegateTrayState {
    public static let shared = DelegateTrayState()

    /// How a chip entered the tray: its mark flew in, it faded in, or it was simply there.
    public enum Entry: Sendable { case fly, fade, none }

    /// What the tray says out loud: one polite and one assertive line per parent, each replaced by the next.
    public struct News: Equatable, Sendable {
        public var polite: String
        public var assertive: String
        public var at: Date

        public init(polite: String, assertive: String, at: Date) {
            self.polite = polite
            self.assertive = assertive
            self.at = at
        }
    }

    /// Chips that have entered the tray, by delegate instance id.
    public private(set) var entered: [String: Entry] = [:]
    /// Work items whose chip has had its time on screen as done or cancelled, and left.
    public private(set) var left: Set<String> = []
    /// A report the tray asks its parent's transcript to bring into view: block id, by parent.
    public var reveal: [String: String] = [:]
    public var news: [String: News] = [:]
    /// Each parent's transcript, asked for the row a block is drawn in right
    /// now (nil when it is not on screen): where a finished chip flies home to.
    @ObservationIgnored public var reportRow: [String: (String) -> UIView?] = [:]

    /// The delegate's newest report among a transcript's blocks, by block id
    /// (DelegateTray.svelte `reportOf`): a peer turn that carries a report
    /// and names the delegate, whole or by the eight characters it is known by.
    public static func report(of instanceId: String, in blocks: [Components.Schemas.TranscriptBlock]) -> String? {
        for raw in blocks.reversed() {
            guard let block = Block(raw), block.type == "user.peer", block.string("reportKind") != nil,
                  let peer = block.string("peerSession") else { continue }
            if peer == instanceId || (peer.count >= 8 && instanceId.hasPrefix(peer)) { return block.id }
        }
        return nil
    }

    /// Each registered card's visibility, by delegate instance id.
    @ObservationIgnored private var cards: [String: Bool] = [:]
    /// Where a card's mark stood, in its window, when it left for the tray: the chip's mark lands from there.
    @ObservationIgnored private var departures: [String: CGRect] = [:]
    @ObservationIgnored private var burst = (at: Date.distantPast, count: 0)

    /// Admissions in one burst go 50ms apart, so several chips never land as one block.
    private func stagger(_ run: @escaping @MainActor () -> Void) {
        let now = Date()
        burst = now.timeIntervalSince(burst.at) < 0.05 ? (now, burst.count + 1) : (now, 0)
        if burst.count == 0 {
            run()
        } else {
            let wait = Double(burst.count) * 0.05
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(wait))
                run()
            }
        }
    }

    /// A chip enters without flying: faded in, or (on load) simply there.
    public func admit(_ instanceId: String, _ entry: Entry) {
        guard entered[instanceId] == nil else { return }
        if entry == .none {
            entered[instanceId] = entry
            return
        }
        stagger { [self] in
            if entered[instanceId] == nil { entered[instanceId] = entry }
        }
    }

    /// The chip has had its time and goes.
    public func leave(_ itemId: String) {
        left.insert(itemId)
    }

    /// Whether a delegate's card is on screen right now.
    public func cardVisible(_ instanceId: String) -> Bool {
        cards[instanceId] == true
    }

    /// Where the card's mark stood when it left for the tray, taken once by the chip that lands it.
    public func takeDeparture(_ instanceId: String) -> CGRect? {
        departures.removeValue(forKey: instanceId)
    }

    /// Whether a delegate may enter the tray now: live work, or a failure not yet dismissed.
    private func admissible(_ instanceId: String, hub: HubConnection) -> Bool {
        guard let item = hub.workItems.item(for: instanceId) else { return false }
        return item.state == .starting || item.state == .running || (item.state == .failed && item.dismissedAt == nil)
    }

    /// A delegate's card says whether it is in view (tray.svelte.ts
    /// `trayCard`). The first time it leaves while the delegate may enter the
    /// tray, its mark departs for the chip, from `mark` (its frame in the
    /// window as it was last drawn), and the chip enters. A card taken off
    /// the screen altogether passes `visible: nil`: that is the card leaving
    /// too, and it is forgotten.
    public func card(_ instanceId: String, visible: Bool?, mark: CGRect?, hub: HubConnection) {
        let was = cards[instanceId]
        cards[instanceId] = visible
        guard was == true, visible != true, entered[instanceId] == nil, admissible(instanceId, hub: hub) else { return }
        if let mark { departures[instanceId] = mark }
        stagger { [self] in
            if entered[instanceId] == nil { entered[instanceId] = .fly }
        }
    }
}
