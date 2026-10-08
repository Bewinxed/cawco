public import Foundation
import Observation
import OSLog
public import StoreKit
public import UIKit

// CawCo Pro (paywall DESIGN.md §1): the native app runs on one StoreKit
// non-consumable, or on a live free week started from a $0 non-consumable.
// The entitlement is read at launch and on every `Transaction.updates`, from
// `Transaction.currentEntitlements`; nothing here keeps its own record of a
// purchase.

/// The two products, as App Store Connect and CawCo.storekit name them.
public enum ProProduct: String, CaseIterable, Sendable {
    /// CawCo Pro: one purchase, every device on the Apple Account.
    case pro = "dev.cawco.app.pro"
    /// "7-Day Trial", the $0 free week (App Review 3.1.1).
    case trial = "dev.cawco.app.trial7"

    /// How long the free week runs from its first purchase (Cawrier's `TRIAL_DAYS`).
    public static let trialLength: TimeInterval = 7 * 24 * 60 * 60
}

/// What this Apple Account holds.
public enum ProAccess: Equatable, Sendable {
    /// Pro: everything on, no selling surface anywhere.
    case owned
    /// The free week, live until `endsAt`.
    case trial(endsAt: Date)
    /// The free week was taken and has ended, and Pro wasn't bought.
    case ended
    /// Neither product.
    case none

    /// The app runs.
    public var entitled: Bool {
        switch self {
        case .owned, .trial: true
        case .ended, .none: false
        }
    }

    /// Whether the free week can still be started on this account.
    public var trialAvailable: Bool { self == .none }
}

/// The App Store's catalogue as this launch read it.
public enum ProCatalog: Equatable, Sendable {
    case loading
    case loaded
    /// The App Store didn't answer, or answered without both products.
    case failed
}

/// What one purchase came to.
public enum ProPurchaseOutcome: Sendable {
    /// Apple's signature holds; the entitlement was read again.
    case done
    /// Ask to Buy: a family organizer decides; `Transaction.updates` brings the answer.
    case pending
    case cancelled
    case failed
    /// The transaction came back, but its signature doesn't hold.
    case unverified
}

/// What a restore came to.
public enum ProRestoreOutcome: Sendable {
    case found(ProAccess)
    case nothing
    /// `AppStore.sync()` failed, or the sign-in was cancelled.
    case failed
    /// Only transactions whose signature doesn't hold came back.
    case unverified
}

/// The one reader of CawCo Pro for the whole app: every window gates on it.
@MainActor
@Observable
public final class Pro {
    public static let shared = Pro()

    /// Nil until the entitlements were read once on this launch: no gate fires before then.
    public private(set) var access: ProAccess?
    public private(set) var catalog: ProCatalog = .loading
    /// `AppStore.canMakePayments`: Screen Time or a management profile can turn purchases off.
    public private(set) var canMakePayments = AppStore.canMakePayments
    /// An Ask to Buy request still with a family organizer, kept across launches.
    public private(set) var pending: ProProduct? {
        didSet { UserDefaults.standard.set(pending?.rawValue, forKey: Self.pendingKey) }
    }

    /// When the free week started: its first purchase (a restore gets a new
    /// `purchaseDate`; Cawrier counts from the earlier of the two as well).
    public private(set) var trialStart: Date?
    /// The signed transaction Cawrier enrols a device on: Pro's, else the live free week's.
    @ObservationIgnored public private(set) var proof: String?

    @ObservationIgnored private var products: [ProProduct: Product] = [:]
    @ObservationIgnored private var updates: Task<Void, Never>?
    @ObservationIgnored private var trialClock: Task<Void, Never>?
    private let log = Logger(subsystem: "dev.cawco.app", category: "Pro")
    private static let pendingKey = "paywall-pending"

    private init() {
        pending = UserDefaults.standard.string(forKey: Self.pendingKey).flatMap(ProProduct.init(rawValue:))
    }

    /// At launch: the listener first, so nothing that arrives meanwhile is
    /// missed, then whatever was left unfinished, the entitlements and the catalogue.
    public func start() {
        guard updates == nil else { return }
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                await self?.settle(result)
            }
        }
        Task {
            for await result in Transaction.unfinished {
                await settle(result)
            }
            await refresh()
        }
        Task { await loadProducts() }
    }

    /// The price StoreKit gives, or nil until it arrives. Never a price of our own.
    public func displayPrice(_ product: ProProduct) -> String? {
        products[product]?.displayPrice
    }

    /// Reads the catalogue again (P1c's Try again).
    public func loadProducts() async {
        catalog = .loading
        canMakePayments = AppStore.canMakePayments
        do {
            let found = try await Product.products(for: ProProduct.allCases.map(\.rawValue))
            var byId: [ProProduct: Product] = [:]
            for product in found {
                if let id = ProProduct(rawValue: product.id) { byId[id] = product }
            }
            products = byId
            catalog = byId.count == ProProduct.allCases.count ? .loaded : .failed
            if catalog == .failed {
                let missing = Set(ProProduct.allCases).subtracting(byId.keys).map(\.rawValue)
                log.error("App Store catalogue is missing \(missing.joined(separator: ","), privacy: .public)")
            }
        } catch {
            log.error("App Store catalogue failed: \(String(describing: error), privacy: .public)")
            catalog = .failed
        }
    }

    /// Buys `product` with Apple's sheet over `scene`. The entitlement is read
    /// again before this returns, so `access` already says what it came to.
    public func purchase(_ product: ProProduct, in scene: UIWindowScene) async -> ProPurchaseOutcome {
        guard let item = products[product] else { return .failed }
        let result: Product.PurchaseResult
        do {
            result = try await item.purchase(confirmIn: scene)
        } catch StoreKitError.userCancelled {
            return .cancelled
        } catch {
            log.error("purchase \(product.rawValue, privacy: .public) failed: \(String(describing: error), privacy: .public)")
            return .failed
        }
        switch result {
        case let .success(verification):
            guard case let .verified(transaction) = verification else {
                log.error("purchase \(product.rawValue, privacy: .public): the transaction isn't verified")
                return .unverified
            }
            await transaction.finish()
            await refresh()
            log.notice("purchase \(product.rawValue, privacy: .public) verified, access \(String(describing: self.access), privacy: .public)")
            return .done
        case .pending:
            pending = product
            log.notice("purchase \(product.rawValue, privacy: .public) is waiting for Ask to Buy")
            return .pending
        case .userCancelled:
            return .cancelled
        @unknown default:
            return .failed
        }
    }

    /// Restore purchase: the App Store is asked again, then the entitlements are read.
    public func restore() async -> ProRestoreOutcome {
        do {
            try await AppStore.sync()
        } catch {
            log.error("restore failed: \(String(describing: error), privacy: .public)")
            return .failed
        }
        let unverified = await refresh()
        guard let access else { return .failed }
        if access == .none {
            return unverified ? .unverified : .nothing
        }
        return .found(access)
    }

    /// Reads `Transaction.currentEntitlements` and sets `access` from it.
    /// Returns whether an entitlement for our products came back unverified.
    @discardableResult
    public func refresh() async -> Bool {
        var pro: (transaction: Transaction, jws: String)?
        var trial: (transaction: Transaction, jws: String)?
        var unverified = false
        for await result in Transaction.currentEntitlements {
            switch result {
            case let .verified(transaction):
                guard transaction.revocationDate == nil, let product = ProProduct(rawValue: transaction.productID) else { continue }
                switch product {
                case .pro: pro = (transaction, result.jwsRepresentation)
                case .trial: trial = (transaction, result.jwsRepresentation)
                }
            case let .unverified(transaction, error):
                guard ProProduct(rawValue: transaction.productID) != nil else { continue }
                unverified = true
                log.error("entitlement \(transaction.productID, privacy: .public) unverified: \(String(describing: error), privacy: .public)")
            }
        }
        let start = trial.map { min($0.transaction.purchaseDate, $0.transaction.originalPurchaseDate) }
        let endsAt = start.map { $0.addingTimeInterval(ProProduct.trialLength) }
        let next: ProAccess = if pro != nil {
            .owned
        } else if let endsAt {
            endsAt > .now ? .trial(endsAt: endsAt) : .ended
        } else {
            .none
        }
        trialStart = start
        proof = pro?.jws ?? (next.entitled ? trial?.jws : nil)
        if next.entitled { pending = nil }
        canMakePayments = AppStore.canMakePayments
        let changed = access != next
        access = next
        watchTrialEnd(next)
        if changed {
            log.notice("access \(String(describing: next), privacy: .public)")
            PushRegistry.shared.entitlementChanged()
        }
        return unverified
    }

    /// A transaction from elsewhere (another device, Ask to Buy approved, a
    /// refund): finished, then the entitlements are read again.
    private func settle(_ result: VerificationResult<Transaction>) async {
        switch result {
        case let .verified(transaction):
            await transaction.finish()
        case let .unverified(transaction, error):
            log.error("update \(transaction.productID, privacy: .public) unverified: \(String(describing: error), privacy: .public)")
            await transaction.finish()
        }
        await refresh()
    }

    /// The free week ends at its own time even while the app stays open.
    private func watchTrialEnd(_ access: ProAccess) {
        trialClock?.cancel()
        trialClock = nil
        guard case let .trial(endsAt) = access else { return }
        trialClock = Task { [weak self] in
            try? await Task.sleep(for: .seconds(max(0, endsAt.timeIntervalSinceNow) + 1))
            guard !Task.isCancelled else { return }
            await self?.refresh()
        }
    }
}

/// The paywall's A/B test (DESIGN.md ruling 6): two variants, assigned once
/// per install the first time the paywall is built, and three anonymous
/// counters at Cawrier. Fire and forget: no retries that could count twice, no ids.
@MainActor
public enum PaywallExperiment {
    public enum Variant: String, CaseIterable, Sendable {
        case story, poster
    }

    public enum Event: String, Sendable {
        case shown, trial, bought
    }

    static let name = "paywall-1"
    private static let variantKey = "paywall-1.variant"
    private static let shownKey = "paywall-1.shown-sent"
    private static let log = Logger(subsystem: "dev.cawco.app", category: "Experiment")

    /// This install's variant, drawn 50/50 the first time it is asked for.
    public static var variant: Variant {
        if let kept = UserDefaults.standard.string(forKey: variantKey).flatMap(Variant.init(rawValue:)) {
            return kept
        }
        let drawn = Variant.allCases.randomElement() ?? .story
        UserDefaults.standard.set(drawn.rawValue, forKey: variantKey)
        return drawn
    }

    /// `shown` goes once per install, the first time P1 appears.
    public static func shown() {
        guard !UserDefaults.standard.bool(forKey: shownKey) else { return }
        UserDefaults.standard.set(true, forKey: shownKey)
        post(.shown)
    }

    public static func post(_ event: Event) {
        let body = ["experiment": name, "variant": variant.rawValue, "event": event.rawValue]
        var request = URLRequest(url: Cawrier.origin.appending(path: "v1/experiment/event"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode(body)
        Task {
            do {
                let (_, response) = try await URLSession.shared.data(for: request)
                log.notice("\(event.rawValue, privacy: .public) posted: \((response as? HTTPURLResponse)?.statusCode ?? 0)")
            } catch {
                log.error("\(event.rawValue, privacy: .public) not posted: \(String(describing: error), privacy: .public)")
            }
        }
    }
}

/// Cawrier, the holder of CawCo's APNs key (apps/cawrier).
public enum Cawrier {
    public static let origin = URL(string: "https://cawrier.cawco.dev")!
}
