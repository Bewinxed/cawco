public import CawCoAPI
import Foundation
import Observation

/// Configure › Phone (routes/config/phone/+page.svelte): the devices the hub
/// pushes to. Devices register themselves from the app; here each can be made
/// quiet or removed, and every one sent a test. This device is one of the
/// rows: removing it is H7 (`PushRegistry.removeFromRelay`), which forgets
/// its pairing so it stays out until notifications are turned on again.
///
/// Every step runs on its device's row (The Stay In Context Rule): what is
/// on its way, what the hub answered, and why a step failed, each kept by
/// device, so a row shows done only on the hub's word and a failure stays
/// on its row with what Try again repeats.
@MainActor
@Observable
public final class PushDevices {
    public typealias Device = Components.Schemas.GetApiPush200.DevicesPayloadPayload

    /// A step on its way to the hub for one device.
    public enum Work: Equatable, Sendable {
        case quiet(Bool)
        case removing
        case testing
    }

    /// A step the hub refused, kept on its row with what Try again repeats.
    public struct Failure: Equatable, Sendable {
        public let text: String
        public let retry: Work
    }

    /// One device's answer to the test, as its row says it (`testLines`).
    public struct Line: Equatable, Sendable {
        public let ok: Bool
        public let text: String
        /// The hub dropped the device: its pairing is gone.
        public var pruned = false
    }

    public private(set) var devices: [Device] = []
    /// The devices were read once.
    public private(set) var loaded = false
    /// Why the first read failed.
    public private(set) var readError: String?
    /// What is on its way for each device, by id.
    public private(set) var working: [String: Work] = [:]
    /// Why each device's last step was refused, by id.
    public private(set) var failures: [String: Failure] = [:]
    /// The last test's answer for each device, by id.
    public private(set) var results: [String: Line] = [:]
    /// Why the test as a whole was refused (no device registered, the hub unreachable).
    public private(set) var testError: String?
    /// Devices the test found gone, which the hub dropped: their rows stay,
    /// saying so, until the devices are read again.
    public private(set) var gone: Set<String> = []
    @ObservationIgnored private weak var hub: HubConnection?

    public init(hub: HubConnection) {
        self.hub = hub
    }

    public var testing: Bool { working.values.contains(.testing) }

    /// This device's row, by its pairing.
    public func isThisDevice(_ device: Device) -> Bool {
        device.id == PushRegistry.shared.pairingId
    }

    public func read() async {
        do {
            guard let hub else { throw URLError(.notConnectedToInternet) }
            devices = try await hub.api.push.devices().ok.body.json.devices
            gone = []
            loaded = true
            readError = nil
        } catch {
            readError = "Could not read the push settings — \(error.localizedDescription)."
        }
    }

    /// Repeats what a row's failure was for.
    public func retry(_ device: Device) async {
        guard let failure = failures[device.id] else { return }
        switch failure.retry {
        case let .quiet(next): await setQuiet(device, next)
        case .removing: await remove(device)
        case .testing: await test()
        }
    }

    /// A push to every registered device, quiet ones too: each row says
    /// "Sending…" until the hub answers for it, then its own outcome.
    public func test() async {
        guard let hub, !testing else { return }
        let ids = devices.map(\.id)
        testError = nil
        for id in ids {
            working[id] = .testing
            results[id] = nil
            if failures[id]?.retry == .testing { failures[id] = nil }
        }
        defer { for id in ids where working[id] == .testing { working[id] = nil } }
        do {
            switch try await hub.api.push.test(.init(body: .json(.init()))) {
            case let .ok(answer):
                var outcomes = try answer.body.json.outcomes
                // The hub answers by device name, in the order it sent them.
                for device in devices {
                    guard let at = outcomes.firstIndex(where: { $0.name == device.name }) else { continue }
                    results[device.id] = Self.line(outcomes.remove(at: at))
                }
                let dropped = devices.enumerated().filter { results[$0.element.id]?.pruned == true }
                await read()
                // A device the hub dropped keeps its row, in its place, saying why.
                for (at, device) in dropped where !devices.contains(where: { $0.id == device.id }) {
                    devices.insert(device, at: min(at, devices.count))
                    gone.insert(device.id)
                }
            case let .notFound(refused): testError = await Wire.words(try? refused.body.plainText) ?? "The hub answered 404."
            case let .conflict(refused): testError = await Wire.words(try? refused.body.plainText) ?? "The hub answered 409."
            case .unprocessableContent: testError = "The hub answered 422."
            case let .undocumented(status, payload): testError = await Wire.words(payload.body) ?? "The hub answered \(status)."
            }
        } catch {
            testError = error.localizedDescription
        }
    }

    /// The test's word for one device (`testLines`).
    static func line(_ outcome: Components.Schemas.PushOutcome) -> Line {
        if outcome.status == 200 { return Line(ok: true, text: "Sent.") }
        if outcome.pruned { return Line(ok: false, text: "No longer registered. Removed until the app opens again.", pruned: true) }
        let why = outcome.reason ?? (outcome.status != 0 ? "Cawrier answered \(Int(outcome.status))" : "Cawrier not reached")
        return Line(ok: false, text: "\(why).")
    }

    /// Quiet at the hub; the row's switch shows it once the hub has it.
    public func setQuiet(_ device: Device, _ quiet: Bool) async {
        guard let hub, working[device.id] == nil else { return }
        working[device.id] = .quiet(quiet)
        failures[device.id] = nil
        defer { working[device.id] = nil }
        let refused: String?
        do {
            switch try await hub.api.push.setQuiet(.init(path: .init(id: device.id), body: .json(.init(quiet: quiet)))) {
            case .ok:
                refused = nil
                if let at = devices.firstIndex(where: { $0.id == device.id }) { devices[at].quiet = quiet }
                if isThisDevice(device) { PushRegistry.shared.heard(quiet: quiet) }
            case let .notFound(answer): refused = await Wire.words(try? answer.body.plainText) ?? "The hub answered 404."
            case .unprocessableContent: refused = "The hub answered 422."
            case let .undocumented(status, payload): refused = await Wire.words(payload.body) ?? "The hub answered \(status)."
            }
        } catch {
            refused = error.localizedDescription
        }
        if let refused {
            failures[device.id] = Failure(text: "Quiet didn't change. \(refused)", retry: .quiet(quiet))
        }
    }

    /// Removes a device (`forget`); this device leaves the relay (H7). The
    /// row leaves the list only once the hub has removed it.
    public func remove(_ device: Device) async {
        guard let hub, working[device.id] == nil else { return }
        working[device.id] = .removing
        failures[device.id] = nil
        defer { working[device.id] = nil }
        var refused: String?
        if isThisDevice(device) {
            await PushRegistry.shared.removeFromRelay()
            refused = PushRegistry.shared.removeProblem
        } else {
            do {
                switch try await hub.api.push.remove(.init(path: .init(id: device.id))) {
                case .ok: break
                case let .notFound(answer): refused = await Wire.words(try? answer.body.plainText) ?? "The hub answered 404."
                case let .undocumented(status, payload): refused = await Wire.words(payload.body) ?? "The hub answered \(status)."
                }
            } catch {
                refused = error.localizedDescription
            }
        }
        if let refused {
            failures[device.id] = Failure(text: "It wasn't removed. \(refused)", retry: .removing)
        } else {
            devices.removeAll { $0.id == device.id }
            results[device.id] = nil
        }
    }

    /// What kind of device it is (`platformName`).
    public static func platformName(_ platform: String) -> String {
        ["ios": "iPhone", "ipados": "iPad", "macos": "Mac"][platform] ?? platform
    }
}
