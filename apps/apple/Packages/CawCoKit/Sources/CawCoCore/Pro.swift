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

/// The signed proof Cawrier enrols a device on (`Pro.enrolmentProof`).
public enum EnrolmentProof: Equatable, Sendable {
    /// Pro's, else the live free week's transaction JWS.
    case transaction(String)
    /// A TestFlight install's AppTransaction JWS, while the board stands open.
    case appTransaction(String)
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
    /// `AppStore.canMakePayments`: Screen Time or a management profile can turn
    /// purchases off. Nil until StoreKit answered, which it does before the
    /// catalogue can load (`loadProducts`). Read off the main thread: the first
    /// read sets StoreKit up, 11 ms of the launch's main thread when this
    /// property's initial value read it (Release, simulator).
    public private(set) var canMakePayments: Bool?

    /// StoreKit's word on purchases, asked off the main thread.
    private nonisolated static func readCanMakePayments() async -> Bool {
        await Task.detached(priority: .userInitiated) { AppStore.canMakePayments }.value
    }
    /// An Ask to Buy request still with a family organizer, kept across launches.
    public private(set) var pending: ProProduct? {
        didSet { UserDefaults.standard.set(pending?.rawValue, forKey: Self.pendingKey) }
    }

    /// When the free week started: its first purchase (a restore gets a new
    /// `purchaseDate`; Cawrier counts from the earlier of the two as well).
    public private(set) var trialStart: Date?
    /// The purchase's signed transaction: Pro's, else the live free week's (`enrolmentProof`).
    @ObservationIgnored private var proof: String?

    /// Whether this install came from TestFlight: `AppTransaction` verified,
    /// with the sandbox environment. Nil until it answered on this launch;
    /// unverified, `.xcode`, `.production` or a throw are all false.
    public private(set) var testFlight: Bool?

    /// The board stands open with nothing paywall-related on it: a TestFlight
    /// install whose catalogue failed (owner: "Skip the paywall in TestFlight").
    /// The App Store serves no products until the Paid Apps Agreement is
    /// active; once they load, TestFlight gets the real paywall again.
    /// App Store and Xcode builds never get here.
    public var boardOpen: Bool { testFlight == true && catalog == .failed }

    /// Pro is on here, notifications included: an entitlement holds, or the board stands open.
    public var proOn: Bool { access?.entitled == true || boardOpen }

    /// What Cawrier enrols this device on. While the board stands open, the
    /// TestFlight install's signed AppTransaction; otherwise the purchase's
    /// signed transaction. Nil when there's neither.
    public var enrolmentProof: EnrolmentProof? {
        if boardOpen { return appTransaction.map(EnrolmentProof.appTransaction) }
        return proof.map(EnrolmentProof.transaction)
    }

    /// The verified AppTransaction's JWS, kept for `enrolmentProof`.
    @ObservationIgnored private var appTransaction: String?
    @ObservationIgnored private var products: [ProProduct: Product] = [:]
    @ObservationIgnored private var updates: Task<Void, Never>?
    @ObservationIgnored private var trialClock: Task<Void, Never>?
    @ObservationIgnored private var openNoted = false
    private let log = Logger(subsystem: "dev.cawco.app", category: "Pro")
    private static let pendingKey = "paywall-pending"

    /// The verified AppTransaction: its environment and its JWS.
    private struct Install: Sendable {
        let environment: AppStore.Environment
        /// Nil only when a DEBUG launch forced the environment.
        let jws: String?
    }

    /// The environment that signed this install, read once per launch:
    /// nil unless `AppTransaction` is verified. A DEBUG build takes
    /// `-paywall-env sandbox` to stand in for TestFlight.
    private static let install = Task<Install?, Never> {
        let log = Logger(subsystem: "dev.cawco.app", category: "Pro")
        #if DEBUG
        if UserDefaults.standard.string(forKey: "paywall-env") == "sandbox" {
            log.notice("install: sandbox, forced by -paywall-env")
            return Install(environment: .sandbox, jws: nil)
        }
        #endif
        do {
            let result = try await AppTransaction.shared
            switch result {
            case let .verified(transaction):
                log.notice("install: \(transaction.environment.rawValue, privacy: .public)")
                return Install(environment: transaction.environment, jws: result.jwsRepresentation)
            case let .unverified(_, error):
                log.error("install: AppTransaction unverified: \(String(describing: error), privacy: .public)")
                return nil
            }
        } catch {
            log.error("install: AppTransaction failed: \(String(describing: error), privacy: .public)")
            return nil
        }
    }

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
        Task {
            let install = await Self.install.value
            appTransaction = install?.jws
            testFlight = install?.environment == .sandbox
            noteOpen()
        }
    }

    /// The launch's one line when the board stands open; a device with its
    /// token enrols on the AppTransaction now.
    private func noteOpen() {
        guard boardOpen, !openNoted else { return }
        openNoted = true
        log.notice("TestFlight: the App Store has no products yet, so the board is open")
        PushRegistry.shared.entitlementChanged()
    }

    /// The price StoreKit gives, or nil until it arrives. Never a price of our own.
    public func displayPrice(_ product: ProProduct) -> String? {
        products[product]?.displayPrice
    }

    /// Reads the catalogue again (P1c's Try again).
    public func loadProducts() async {
        catalog = .loading
        canMakePayments = await Self.readCanMakePayments()
        #if DEBUG
        // The paywall probe's P1a and P1c: `-paywall-catalog loading|failed`.
        switch UserDefaults.standard.string(forKey: "paywall-catalog") {
        case "loading": return
        case "failed":
            try? await Task.sleep(for: .seconds(2))
            catalog = .failed
            return
        default: break
        }
        #endif
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
        noteOpen()
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
                // Nothing is granted on it, and it leaves the queue so it isn't delivered again.
                await verification.unsafePayloadValue.finish()
                return .unverified
            }
            await transaction.finish()
            // Apple-signed and just verified: the record of this purchase,
            // which `currentEntitlements` can lag behind for a moment.
            await refresh(bought: (transaction, verification.jwsRepresentation))
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
    /// `bought` is the verified transaction a purchase just returned, with its
    /// JWS: it counts as if `currentEntitlements` had returned it, since that
    /// read can lag right after a non-consumable purchase.
    /// Returns whether an entitlement for our products came back unverified.
    @discardableResult
    public func refresh(bought: (transaction: Transaction, jws: String)? = nil) async -> Bool {
        var pro: (transaction: Transaction, jws: String)?
        var trial: (transaction: Transaction, jws: String)?
        var unverified = false
        func hold(_ transaction: Transaction, jws: String) {
            guard transaction.revocationDate == nil, let product = ProProduct(rawValue: transaction.productID) else { return }
            switch product {
            case .pro: pro = (transaction, jws)
            case .trial: trial = (transaction, jws)
            }
        }
        if let bought { hold(bought.transaction, jws: bought.jws) }
        for await result in Transaction.currentEntitlements {
            switch result {
            case let .verified(transaction):
                hold(transaction, jws: result.jwsRepresentation)
            case let .unverified(transaction, error):
                guard ProProduct(rawValue: transaction.productID) != nil else { continue }
                unverified = true
                log.error("entitlement \(transaction.productID, privacy: .public) unverified: \(String(describing: error), privacy: .public)")
            }
        }
        let start = trial.map { min($0.transaction.purchaseDate, $0.transaction.originalPurchaseDate) }
        let endsAt = start.map { $0.addingTimeInterval(ProProduct.trialLength) }
        var next: ProAccess = if pro != nil {
            .owned
        } else if let endsAt {
            endsAt > .now ? .trial(endsAt: endsAt) : .ended
        } else {
            .none
        }
        #if DEBUG
        // The paywall probe's P1e: `-paywall-access ended`.
        if UserDefaults.standard.string(forKey: "paywall-access") == "ended" { next = .ended }
        #endif
        trialStart = start
        proof = pro?.jws ?? (next.entitled ? trial?.jws : nil)
        if next.entitled { pending = nil }
        let changed = access != next
        access = next
        // Bought, restored to Pro, or over: the day-6 reminder has nothing left to say.
        if case .trial = next {} else { TrialReminder.cancel() }
        watchTrialEnd(next)
        if changed {
            log.notice("access \(String(describing: next), privacy: .public)")
            PushRegistry.shared.entitlementChanged()
        }
        // After the entitlement is settled: nothing above waits on StoreKit.
        canMakePayments = await Self.readCanMakePayments()
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

/// Cawrier, the holder of CawCo's APNs key (apps/cawrier).
public enum Cawrier {
    public static let origin = URL(string: "https://cawrier.cawco.dev")!
}
