public import CawCoAPI
import Foundation
import Observation

/// Configure › Models CawCo uses (routes/config/models/+page.svelte): the
/// models the hub itself talks to. Jev is reached one of two ways: a
/// TypeSafe key the hub holds (straight to TypeSafe), or OpenRouter,
/// connected by OAuth PKCE (the hub holds the verifier and the key; the
/// dashboard's own page takes OpenRouter's `code` back to the hub). A held
/// TypeSafe key is the route; neither is Jev off. Fleet watch is the hub's
/// watch over every session for a loop or a stall: its switch, and what
/// opens a signal, as facts.
///
/// Nothing is optimistic: each group shows what the hub answered, and a
/// refusal is kept on its group in the hub's words, as the web keeps it.
@MainActor
@Observable
public final class ModelsSettings {
    public typealias OpenRouter = Components.Schemas.GetApiOpenrouter200
    public typealias Jev = Components.Schemas.GetApiJev200
    public typealias Watch = Components.Schemas.FleetWatchSettings

    public private(set) var openRouter: OpenRouter?
    public private(set) var jev: Jev?
    public private(set) var watch: Watch?

    /// Why the OpenRouter group's last step failed, in the hub's words.
    public private(set) var openRouterError: String?
    /// Why the Jev group's last step failed (a read, the key, the switch).
    public private(set) var jevError: String?
    /// Why fleet watch's last step failed.
    public private(set) var watchError: String?

    public private(set) var connecting = false
    public private(set) var disconnecting = false
    public private(set) var savingKey = false
    public private(set) var removingKey = false
    public private(set) var savingSuggest = false
    public private(set) var savingWatch = false

    @ObservationIgnored private weak var hub: HubConnection?

    public init(hub: HubConnection) {
        self.hub = hub
    }

    /// The section shows once its three reads are in, so its first paint is
    /// the state it keeps.
    public var ready: Bool { openRouter != nil && jev != nil && watch != nil }

    /// Why the section could not be read at all, before it is ready.
    public var readProblem: String? { ready ? nil : openRouterError ?? jevError ?? watchError }

    private func api() throws -> HubAPI {
        guard let hub else { throw URLError(.notConnectedToInternet) }
        return try hub.api
    }

    // MARK: Reads

    public func read() async {
        async let route: Void = readOpenRouter()
        async let jev: Void = readJev()
        async let watch: Void = readWatch()
        _ = await (route, jev, watch)
    }

    public func readOpenRouter() async {
        do {
            openRouter = try await api().models.openRouter().ok.body.json
        } catch {
            openRouterError = "Could not read the OpenRouter connection — \(error.localizedDescription)."
        }
    }

    public func readJev() async {
        do {
            jev = try await api().models.jev().ok.body.json
        } catch {
            jevError = "Could not read Jev's settings — \(error.localizedDescription)."
        }
    }

    public func readWatch() async {
        do {
            watch = try await api().models.fleetWatch().ok.body.json
        } catch {
            watchError = "Could not read fleet watch — \(error.localizedDescription)."
        }
    }

    // MARK: OpenRouter

    /// Where OpenRouter asks the operator to authorise the hub, its callback
    /// the dashboard's own Models page (the web's `callbackUrl`), which hands
    /// the `code` back to the hub. Nil, with the refusal said, when the hub
    /// would not start it.
    public func connectAddress() async -> URL? {
        guard let hub, !connecting else { return nil }
        connecting = true
        openRouterError = nil
        defer { connecting = false }
        do {
            let page = try await hub.dashboardAddress().appending(path: "config/models")
            switch try await api().models.connect(.init(body: .json(.init(callbackUrl: page.absoluteString)))) {
            case let .ok(answer):
                guard let url = URL(string: try answer.body.json.authUrl) else {
                    openRouterError = "The hub's OpenRouter address did not read as a link."
                    return nil
                }
                return url
            case let .unprocessableContent(refused):
                openRouterError = "422 \((try? refused.body.applicationProblemJson).flatMap { Wire.words(problem: $0) } ?? "")"
            case let .undocumented(status, payload):
                openRouterError = "\(status) \(await Wire.words(payload.body) ?? "")"
            }
        } catch {
            openRouterError = error.localizedDescription
        }
        return nil
    }

    public func disconnect() async {
        guard !disconnecting else { return }
        disconnecting = true
        openRouterError = nil
        defer { disconnecting = false }
        do {
            switch try await api().models.disconnect() {
            case .ok:
                await readOpenRouter()
                await readJev()
            case let .undocumented(status, payload):
                openRouterError = "\(status) \(await Wire.words(payload.body) ?? "")"
            }
        } catch {
            openRouterError = error.localizedDescription
        }
    }

    /// The connection, read again after OpenRouter's page (the dashboard's
    /// exchange may have connected it), and Jev's route with it.
    public func readRoute() async {
        await readOpenRouter()
        await readJev()
        await readWatch()
    }

    // MARK: Jev

    /// Saves the key; true once the hub holds it (the field then clears).
    public func saveKey(_ key: String) async -> Bool {
        let key = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty else {
            jevError = "Paste a TypeSafe API key first. Nothing was saved, and Jev's route is unchanged."
            return false
        }
        guard !savingKey, !removingKey else { return false }
        savingKey = true
        jevError = nil
        defer { savingKey = false }
        do {
            switch try await api().models.setTypeSafeKey(.init(body: .json(.init(key: key)))) {
            case let .ok(answer):
                jev = try Wire.transcode(answer.body.json, as: Jev.self)
                await readWatch()
                return true
            case let .badRequest(refused):
                jevError = "The hub did not save the key (400): \(await Wire.words(try? refused.body.plainText) ?? ""). Jev's route is unchanged."
            case let .unprocessableContent(refused):
                let said = (try? refused.body.applicationProblemJson).flatMap { Wire.words(problem: $0) } ?? ""
                jevError = "The hub did not save the key (422): \(said). Jev's route is unchanged."
            case let .undocumented(status, payload):
                jevError = "The hub did not save the key (\(status)): \(await Wire.words(payload.body) ?? ""). Jev's route is unchanged."
            }
        } catch {
            jevError = "The hub did not save the key: \(error.localizedDescription). Jev's route is unchanged."
        }
        return false
    }

    public func removeKey() async {
        guard !savingKey, !removingKey else { return }
        removingKey = true
        jevError = nil
        defer { removingKey = false }
        do {
            switch try await api().models.removeTypeSafeKey() {
            case let .ok(answer):
                jev = try Wire.transcode(answer.body.json, as: Jev.self)
                await readWatch()
            case let .undocumented(status, payload):
                jevError = "The hub did not remove the key (\(status)): \(await Wire.words(payload.body) ?? ""). It is still held."
            }
        } catch {
            jevError = "The hub did not remove the key: \(error.localizedDescription). It is still held."
        }
    }

    /// "Suggest skills and MCP servers while typing", at the hub.
    public func setSuggest(_ on: Bool) async {
        guard jev != nil, !savingSuggest else { return }
        savingSuggest = true
        jevError = nil
        defer { savingSuggest = false }
        do {
            switch try await api().models.setSuggest(.init(body: .json(.init(enabled: on)))) {
            case .ok:
                jev?.suggestWhileTyping = on
            case let .conflict(refused):
                jevError = "409 \(await Wire.words(try? refused.body.plainText) ?? "")"
            case let .unprocessableContent(refused):
                jevError = "422 \((try? refused.body.applicationProblemJson).flatMap { Wire.words(problem: $0) } ?? "")"
            case let .undocumented(status, payload):
                jevError = "\(status) \(await Wire.words(payload.body) ?? "")"
            }
        } catch {
            jevError = error.localizedDescription
        }
    }

    // MARK: Fleet watch

    public func setWatch(_ on: Bool) async {
        guard !savingWatch else { return }
        savingWatch = true
        watchError = nil
        defer { savingWatch = false }
        do {
            switch try await api().models.setFleetWatch(.init(body: .json(.init(on: on)))) {
            case let .ok(answer):
                watch = try answer.body.json
            case let .unprocessableContent(refused):
                watchError = "422 \((try? refused.body.applicationProblemJson).flatMap { Wire.words(problem: $0) } ?? "")"
            case let .undocumented(status, payload):
                watchError = "\(status) \(await Wire.words(payload.body) ?? "")"
            }
        } catch {
            watchError = error.localizedDescription
        }
    }
}
