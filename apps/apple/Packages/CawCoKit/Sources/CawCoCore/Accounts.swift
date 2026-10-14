public import CawCoAPI
public import Foundation

/// Configure → Accounts, as data (accounts/model.svelte.ts): the providers the
/// fleet knows, what an account is called and drawn in, where it is signed in
/// and what is wrong with that, how a provider's routing reads in a line, and
/// which accounts the list counts as faults. Everything here is read from what
/// `/api/accounts` and `/api/accounts/providers` answered (`fleet.accounts`,
/// `fleet.accountProviders`) and the fleet's machines.
public enum FleetAccounts {
    public static let claude = "anthropic"

    /// Whether CawCo reads a provider's limits (core `LIMITED_PROVIDERS`):
    /// reserves, Spread, Soonest reset and the at-limit moves apply.
    public static func limits(_ provider: String) -> Bool {
        Words.Accounts.Rules.limitedProviders.contains(provider)
    }

    /// Whether a provider with this many accounts has a routing to choose
    /// (core `hasRouting`): the list's Routing, and the routing editor's page.
    public static func hasRouting(_ accounts: Int) -> Bool {
        accounts >= Words.Accounts.Rules.routingFrom
    }

    // MARK: Wire

    /// One account (core `Account`), the parts these screens read.
    public struct Account: Codable, Equatable, Sendable, Identifiable {
        public let id: String
        public let provider: String
        /// `subscription`, `console`, `oauth` or `api_key`.
        public let kind: String
        public let label: String?
        public let email: String?
        public let hue: String
        public let order: Double
        public let neverBackup: Bool
        public let reservePct: Double?
    }

    /// One account signed in (or not) on one machine (core `AccountSignin`).
    public struct Signin: Codable, Equatable, Sendable {
        public let accountId: String
        public let machineId: String
        /// `signed-in`, `signed-out` or `mismatch`.
        public let state: String
    }

    /// How a kind of session chooses its account (core `StrategyChoice`).
    public struct StrategyChoice: Codable, Equatable, Sendable {
        /// `pinned`, `fill-first`, `spread` or `soonest-reset`.
        public var strategy: String
        /// The account `pinned` names; ignored by the others.
        public var pinnedAccountId: String?

        public init(strategy: String, pinnedAccountId: String? = nil) {
            self.strategy = strategy
            self.pinnedAccountId = pinnedAccountId
        }
    }

    /// What a running session does at its limit (core `AtLimit`).
    public struct AtLimit: Codable, Equatable, Sendable {
        public var move: Bool
        public var waitMinutes: Int
        public var moveWholeUnderK: Int
        public var prepareAtPct: Int

        /// core `DEFAULT_AT_LIMIT`.
        public static let standard = AtLimit(move: Words.Accounts.Rules.AtLimit.move, waitMinutes: Words.Accounts.Rules.AtLimit.waitMinutes,
                                             moveWholeUnderK: Words.Accounts.Rules.AtLimit.moveWholeUnderK,
                                             prepareAtPct: Words.Accounts.Rules.AtLimit.prepareAtPct)
    }

    /// One provider's routing (core `ProviderRouting`).
    public struct Routing: Codable, Equatable, Sendable {
        public let provider: String
        public var yours: StrategyChoice
        public var delegates: StrategyChoice
        public var atLimit: AtLimit

        /// A provider's routing until it is saved (core `defaultRouting`).
        public static func standard(_ provider: String) -> Routing {
            limits(provider)
                ? Routing(provider: provider, yours: .init(strategy: Words.Accounts.Rules.LimitedDefaults.yours),
                          delegates: .init(strategy: Words.Accounts.Rules.LimitedDefaults.delegates), atLimit: .standard)
                : Routing(provider: provider, yours: .init(strategy: Words.Accounts.Rules.UnlimitedDefaults.yours),
                          delegates: .init(strategy: Words.Accounts.Rules.UnlimitedDefaults.delegates), atLimit: .standard)
        }
    }

    /// One row of the account picker (core `ProviderChoice`).
    public struct Choice: Codable, Equatable, Sendable {
        public let provider: String
        public let kind: String
        public let name: String
        /// `paste-code`, `device-code` or `api-key`.
        public let signin: String
        public let harnesses: [String]
        public let limits: Bool

        /// The row's key: a provider and how it signs in.
        public var key: String { "\(provider):\(kind)" }
    }

    /// What `/api/accounts` answered, the parts these screens read.
    public struct View: Equatable, Sendable {
        public let accounts: [Account]
        public let signins: [Signin]
        public let routing: [Routing]
    }

    /// The hub's accounts, read off `fleet.accounts`; nil until read.
    @MainActor
    public static func view(_ hub: HubConnection) -> View? {
        guard let read = hub.fleet.accounts,
              let accounts = try? Wire.transcode(read.accounts, as: [Account].self),
              let signins = try? Wire.transcode(read.signins, as: [Signin].self),
              let routing = try? Wire.transcode(read.routing, as: [Routing].self) else { return nil }
        return View(accounts: accounts, signins: signins, routing: routing)
    }

    /// The picker's rows, as the hub serves them; nil until read.
    @MainActor
    public static func choices(_ hub: HubConnection) -> [Choice]? {
        hub.fleet.accountProviders.flatMap { try? Wire.transcode($0, as: [Choice].self) }
    }

    // MARK: Names

    /// The colours an account can take, in the order the swatches offer them.
    public static let swatches = Words.Accounts.swatches.map(\.hue)

    /// Each colour's name, as a swatch is read out.
    public static let hueNames = Dictionary(uniqueKeysWithValues: Words.Accounts.swatches.map { ($0.hue, $0.name) })

    /// A new account's colour: the first swatch none of its provider's accounts wears.
    public static func nextHue(_ accounts: [Account]) -> String {
        swatches.first { hue in !accounts.contains { $0.hue == hue } } ?? swatches[accounts.count % swatches.count]
    }

    /// The name it goes by: its nickname, else its email; a key with no
    /// nickname goes by its last four characters (its identity's email is `…a1b2`).
    public static func name(label: String?, email: String?, kind: String?) -> String {
        if kind == "api_key", label == nil, let email {
            // Its identity's email is `…a1b2`: the ellipsis is not one of the four.
            let tail = email.drop { $0 == "\u{2026}" }
            return Words.Accounts.keyTail(tail: String(tail.suffix(4)))
        }
        return label ?? email ?? Words.Accounts.unnamed
    }

    public static func name(_ account: Account) -> String {
        name(label: account.label, email: account.email, kind: account.kind)
    }

    /// A provider row as the picker names it: "OpenRouter API key", "Anthropic Console".
    public static func choiceLabel(_ choice: Choice) -> String {
        guard choice.provider == claude else { return choice.name }
        return choice.kind == "console" ? Words.Accounts.anthropicConsole : Words.Accounts.claude
    }

    /// What a provider is called: its first picker row's name ("Claude" for Anthropic).
    @MainActor
    public static func providerName(_ provider: String, hub: HubConnection) -> String {
        choices(hub)?.first { $0.provider == provider }?.name ?? (provider == claude ? Words.Accounts.claude : provider)
    }

    /// The harnesses that use an account of a provider.
    @MainActor
    static func harnesses(_ provider: String, hub: HubConnection) -> [String] {
        if provider == claude { return ["claude"] }
        var seen: [String] = []
        for harness in (choices(hub) ?? []).filter({ $0.provider == provider }).flatMap(\.harnesses) where !seen.contains(harness) {
            seen.append(harness)
        }
        return seen
    }

    /// A harness as a sentence names it ("Claude Code"), by its kind.
    public static let harnessWords = Words.Accounts.Harnesses.byKey

    /// The order harnesses are named in: "OpenCode and pi".
    private static let harnessOrder = ["claude", "opencode", "pi"]

    /// "Claude Code", "OpenCode and pi": the harnesses that use a provider's accounts.
    @MainActor
    public static func harnessWords(_ provider: String, hub: HubConnection) -> String {
        let uses = harnesses(provider, hub: hub)
        return Words.Accounts.harnessList(names: harnessOrder.filter(uses.contains).compactMap { harnessWords[$0] })
    }

    // MARK: Machines

    /// The machines that run any of `harnesses`.
    @MainActor
    public static func machines(running harnesses: [String], hub: HubConnection) -> [MachineRow] {
        hub.fleet.machines.filter { machine in (machine.harnesses ?? []).contains { harnesses.contains($0.harness.rawValue) } }
    }

    /// The machines that run any of a provider's harnesses: those an account of it signs in on.
    @MainActor
    public static func machines(for provider: String, hub: HubConnection) -> [MachineRow] {
        machines(running: harnesses(provider, hub: hub), hub: hub)
    }

    /// A machine that can take a sign-in now: its daemon is connected.
    public static func online(_ machine: MachineRow) -> Bool { machine.status == "online" }

    // MARK: Accounts

    /// The accounts (one provider's, given one), in fill-first order.
    public static func accounts(_ view: View, provider: String? = nil) -> [Account] {
        view.accounts.filter { provider == nil || $0.provider == provider }.sorted { $0.order < $1.order }
    }

    /// One provider's accounts, as the list groups them.
    public struct Group: Equatable, Sendable {
        public let provider: String
        public let name: String
        public let accounts: [Account]
    }

    /// Each provider that has an account, in the picker's order; a provider no
    /// connected machine knows any more after them.
    @MainActor
    public static func groups(_ view: View, hub: HubConnection) -> [Group] {
        let all = accounts(view)
        var known: [String] = []
        for choice in choices(hub) ?? [] where !known.contains(choice.provider) { known.append(choice.provider) }
        let rest = Set(all.map(\.provider)).subtracting(known).sorted()
        return (known + rest).compactMap { provider in
            let mine = all.filter { $0.provider == provider }
            return mine.isEmpty ? nil : Group(provider: provider, name: providerName(provider, hub: hub), accounts: mine)
        }
    }

    /// Where the account stands on a machine; signed out when the hub has no row.
    public static func state(_ signins: [Signin], account: String, machine: String) -> String {
        signins.first { $0.accountId == account && $0.machineId == machine }?.state ?? "signed-out"
    }

    /// What is wrong with an account, in its row's one line, or nil: a machine
    /// signed it in as somebody else, it is signed in nowhere, or an online
    /// machine that runs its harnesses doesn't have it. An offline machine is
    /// not a problem.
    @MainActor
    public static func problem(_ account: Account, view: View, hub: HubConnection) -> String? {
        let mine = view.signins.filter { $0.accountId == account.id }
        let online = machines(for: account.provider, hub: hub).filter(Self.online)
        if let other = online.first(where: { state(mine, account: account.id, machine: $0.machineId) == "mismatch" }) {
            return Words.Accounts.Problem.someoneElse(machine: other.name)
        }
        if !mine.contains(where: { $0.state == "signed-in" }) { return Words.Accounts.Problem.nowhere }
        let missing = online.filter { state(mine, account: account.id, machine: $0.machineId) != "signed-in" }
        guard let first = missing.first else { return nil }
        return Words.Accounts.Problem.missingOn(machine: first.name, others: missing.count - 1)
    }

    /// The accounts the Accounts row flags: one a machine signed in as
    /// somebody else, or one signed in nowhere.
    public static func faults(_ view: View) -> Int {
        view.accounts.filter { account in
            let mine = view.signins.filter { $0.accountId == account.id }
            return mine.contains { $0.state == "mismatch" } || !mine.contains { $0.state == "signed-in" }
        }.count
    }

    // MARK: Routing

    /// A provider's routing as the hub holds it (its defaults until saved).
    public static func routing(_ view: View, provider: String) -> Routing? {
        view.routing.first { $0.provider == provider }
    }

    /// A strategy, as the picker draws it: its id, its card's name and line.
    public typealias Strategy = Words.Accounts.Strategy

    public static let strategies = Words.Accounts.strategies

    /// The strategies a provider's routing offers (core `strategiesFor`): all
    /// four where CawCo reads its limits, Pinned and Fill first where it doesn't.
    public static func strategies(for provider: String) -> [Strategy] {
        limits(provider) ? strategies : strategies.filter { Words.Accounts.Rules.unlimitedStrategies.contains($0.id) }
    }

    public static func strategyLabel(_ id: String) -> String {
        strategies.first { $0.id == id }?.label ?? id
    }

    /// The account a pinned choice names: its own, else the first in order.
    public static func pinned(_ accounts: [Account], _ id: String?) -> Account? {
        accounts.first { $0.id == id } ?? accounts.min { $0.order < $1.order }
    }

    /// "Pinned to you@gmail.com" or "Soonest reset".
    static func choiceLine(_ accounts: [Account], _ choice: StrategyChoice) -> String {
        let label = strategyLabel(choice.strategy)
        guard choice.strategy == "pinned", let pin = pinned(accounts, choice.pinnedAccountId) else { return label }
        return Words.Accounts.RoutingEditor.pinnedTo(strategy: label, account: name(pin))
    }

    /// "You: Pinned to you@gmail.com · Delegates: Soonest reset".
    public static func routingLine(_ accounts: [Account], yours: StrategyChoice, delegates: StrategyChoice) -> String {
        Words.Accounts.RoutingEditor.line(yours: choiceLine(accounts, yours), delegates: choiceLine(accounts, delegates))
    }

    /// The terms that cover moving a conversation between subscriptions (core `ACCOUNT_RULES.termsUrl`).
    public static let termsURL = URL(string: Words.Accounts.Rules.termsUrl)!
}

// MARK: Writes (client.svelte.ts)

/// What starting a sign-in on a machine answered: Claude Code's link to
/// open, or a provider's device code, where to enter it, and until when.
public struct SigninStart: Decodable, Sendable {
    public let url: String?
    public let userCode: String?
    public let verificationUrl: String?
    /// Epoch ms.
    public let expiresAt: Double?
}

/// How a sign-in (or a key on one machine) ended: `signed-in`, `mismatch`,
/// `signed-out` (a code that didn't take), `expired` or `pending`, and as whom.
public struct SigninAnswer: Decodable, Sendable {
    public let state: String
    let email: String?
    let probe: Probe?

    struct Probe: Decodable, Sendable { let identity: Identity? }
    struct Identity: Decodable, Sendable { let email: String? }

    /// Who the machine signed in as, once it has.
    public var who: String? { email ?? probe?.identity?.email }
}

/// What sending a key came to on each machine: its result, or why it didn't arrive.
public struct KeyDeliveries: Decodable, Sendable {
    public struct Delivery: Decodable, Sendable {
        public let machineId: String
        public let error: String?
        public let result: SigninAnswer?
    }

    public let machines: [Delivery]
}

public extension HubConnection {
    /// One write to the accounts routes (client.svelte.ts `accountsWrite`). A
    /// refusal is thrown in the hub's own sentence, which is written for
    /// people; the accounts are read again after every write that landed.
    /// `NSNull` in `body` is sent as `null` (a nickname cleared).
    private func accountsWrite(_ path: String, method: String, body: [String: Any]? = nil) async throws -> Data {
        guard let address else { throw URLError(.notConnectedToInternet) }
        var request = URLRequest(url: address.appending(path: path))
        request.httpMethod = method
        // A write can wait on a machine as long as the hub does (a code
        // exchanged, a device code waited for a minute at a time), and then on
        // the hub's answer: never URLSession's 60 s, which a minute's wait races.
        request.timeoutInterval = Double(Words.Accounts.Rules.signinWaitMs) / 1000 + Self.answerSeconds
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200 ..< 300).contains(status) else {
            // The hub's own sentence; one it did not write is what its status says (Wire.reason).
            throw ControlError(message: Wire.words(data) ?? Wire.reason(data, status: status))
        }
        await reloadAccounts()
        return data
    }

    /// What the hub's answer is given past its own wait on a machine.
    private static let answerSeconds: TimeInterval = 15

    private static func part(_ id: String) -> String {
        id.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-._~"))) ?? id
    }

    /// Adds an account; it goes last in its provider's fill-first order. Its id.
    func createAccount(provider: String, kind: String, hue: String) async throws -> String {
        let data = try await accountsWrite("api/accounts", method: "POST", body: ["provider": provider, "kind": kind, "hue": hue])
        struct Made: Decodable { let id: String }
        return try JSONDecoder().decode(Made.self, from: data).id
    }

    /// Changes an account's nickname (`.some(nil)`: its email), colour, order or limits.
    func patchAccount(_ id: String, label: String?? = .none, hue: String? = nil, neverBackup: Bool? = nil,
                      order: Int? = nil, reservePct: Int?? = .none) async throws {
        var body: [String: Any] = [:]
        if case let .some(label) = label { body["label"] = label ?? NSNull() }
        if let hue { body["hue"] = hue }
        if let neverBackup { body["neverBackup"] = neverBackup }
        if let order { body["order"] = order }
        if case let .some(reserve) = reservePct { body["reservePct"] = reserve ?? NSNull() }
        _ = try await accountsWrite("api/accounts/\(Self.part(id))", method: "PATCH", body: body)
    }

    /// Removes an account, signing it out on every machine signed in to it.
    func deleteAccount(_ id: String) async throws {
        _ = try await accountsWrite("api/accounts/\(Self.part(id))", method: "DELETE")
    }

    /// Sets how a provider's new sessions choose among its accounts.
    func putRouting(_ provider: String, yours: FleetAccounts.StrategyChoice, delegates: FleetAccounts.StrategyChoice,
                    atLimit: FleetAccounts.AtLimit) async throws {
        func choice(_ one: FleetAccounts.StrategyChoice) -> [String: Any] {
            var out: [String: Any] = ["strategy": one.strategy]
            if let pin = one.pinnedAccountId { out["pinnedAccountId"] = pin }
            return out
        }
        let limit: [String: Any] = ["move": atLimit.move, "waitMinutes": atLimit.waitMinutes,
                                    "moveWholeUnderK": atLimit.moveWholeUnderK, "prepareAtPct": atLimit.prepareAtPct]
        _ = try await accountsWrite("api/accounts/routing/\(Self.part(provider))", method: "PUT",
                                    body: ["yours": choice(yours), "delegates": choice(delegates), "atLimit": limit])
    }

    private static func signinPath(_ id: String, _ machineId: String) -> String {
        "api/accounts/\(part(id))/machines/\(part(machineId))/signin"
    }

    /// Starts the account's sign-in on a machine: Claude Code's link to open,
    /// or a provider's device code to enter on any device.
    func beginSignin(_ id: String, machineId: String) async throws -> SigninStart {
        try JSONDecoder().decode(SigninStart.self, from: try await accountsWrite(Self.signinPath(id, machineId), method: "POST"))
    }

    /// Types the pasted code into Claude Code's login (`code`), or waits up to
    /// a minute for a device code to be entered (no code).
    func completeSignin(_ id: String, machineId: String, code: String? = nil) async throws -> SigninAnswer {
        let body: [String: Any] = code.map { ["code": $0] } ?? [:]
        return try JSONDecoder().decode(SigninAnswer.self, from: try await accountsWrite(Self.signinPath(id, machineId) + "/complete", method: "POST", body: body))
    }

    /// Signs an account out on one machine and drops its store there; the hub
    /// refuses a machine that is offline (409) or not signed in (404).
    func signOut(_ id: String, machineId: String) async throws {
        _ = try await accountsWrite("api/accounts/\(Self.part(id))/machines/\(Self.part(machineId))", method: "DELETE")
    }

    /// Relays a key account's key to each machine named; the hub never keeps it.
    func sendAccountKey(_ id: String, key: String, machineIds: [String]) async throws -> KeyDeliveries {
        try JSONDecoder().decode(KeyDeliveries.self, from: try await accountsWrite("api/accounts/\(Self.part(id))/key", method: "POST",
                                                                                   body: ["key": key, "machineIds": machineIds]))
    }
}
