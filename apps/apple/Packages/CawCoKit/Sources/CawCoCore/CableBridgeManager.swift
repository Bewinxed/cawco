import CawCoAPI
import CoreBluetooth
import CryptoKit
import Foundation
import OSLog

/// Bridges FIDO2 hybrid transport (caBLE) between a machine's browser and the
/// phone's authenticator: the hub relays a `passkey_qr` frame here, and this
/// manager derives the 20-byte BLE advert from the FIDO URI's tunnel
/// parameters, advertises over BLE, and sends the advert back through the hub
/// so the machine's browser can complete the WebAuthn ceremony.
///
/// One session at a time: a new QR replaces any running advertisement.
@MainActor
final class CableBridgeManager: NSObject {
    private let log = Logger(subsystem: "co.caw", category: "cable-bridge")

    /// The callback that POSTs the advert to the hub (set by HubConnection).
    var sendAdvert: ((_ key: String, _ advert: String, _ machineId: String) async -> Void)?

    private var peripheral: CBPeripheralManager?
    /// The current caBLE session, nil when idle.
    private var session: CableSession?

    struct CableSession {
        let key: String
        let machineId: String
        let advert: Data
        let serviceData: Data
    }

    // MARK: - Receiving a passkey QR frame

    /// A `passkey_qr` frame arrived from the hub: extract the tunnel parameters
    /// from the FIDO URI, derive the 20-byte advert, start BLE advertising, and
    /// send the advert back to the hub for the machine.
    func handle(_ frame: Components.Schemas.PasskeyQrFrame) {
        stopAdvertising()

        guard let advert = deriveAdvert(from: frame.fidoUri) else {
            log.error("cable-bridge: could not derive advert from FIDO URI")
            return
        }

        let serviceData = advert.prefix(16)
        session = CableSession(
            key: frame.key,
            machineId: frame.machineId,
            advert: advert,
            serviceData: serviceData
        )

        // Start BLE peripheral if needed.
        if peripheral == nil {
            peripheral = CBPeripheralManager(delegate: self, queue: nil)
            // Advertising starts once `peripheralManagerDidUpdateState` fires
            // with `.poweredOn`.
        } else if peripheral?.state == .poweredOn {
            startAdvertising()
        }

        // Send the advert to the hub immediately: the machine needs it to know
        // what BLE advert to listen for, whether or not BLE advertising has
        // started on this phone yet.
        let base64Advert = advert.base64EncodedString()
        let key = frame.key
        let machineId = frame.machineId
        Task { [weak self] in
            await self?.sendAdvert?(key, base64Advert, machineId)
        }
    }

    /// Stop any running caBLE advertisement and tear down the session.
    func stopAdvertising() {
        if peripheral?.isAdvertising == true {
            peripheral?.stopAdvertising()
        }
        session = nil
    }

    // MARK: - FIDO URI parsing and advert derivation

    /// The FIDO caBLE URI encodes tunnel parameters as a single CBOR-encoded
    /// payload in the fragment. The 20-byte advert is derived from the tunnel
    /// service identifier and the routing ID encoded in those parameters.
    ///
    /// URI format: `FIDO:/1/<base64url-encoded-payload>`
    /// The payload's first 16 bytes are the tunnel service ID (used as BLE
    /// service data), and the next 4 are the routing ID; together they form
    /// the 20-byte advert.
    private func deriveAdvert(from fidoUri: String) -> Data? {
        // The FIDO URI is `FIDO:/1/<base64url>` — the payload is after the
        // second slash-separated component.
        let upper = fidoUri.uppercased()
        guard upper.hasPrefix("FIDO:/") else { return nil }
        let parts = fidoUri.dropFirst(6).split(separator: "/", maxSplits: 1)
        guard parts.count == 2 else { return nil }
        let encoded = String(parts[1])

        // base64url → base64
        var base64 = encoded
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let remainder = base64.count % 4
        if remainder != 0 { base64 += String(repeating: "=", count: 4 - remainder) }

        guard let payload = Data(base64Encoded: base64), payload.count >= 20 else {
            return nil
        }

        // First 20 bytes: 16-byte tunnel service ID + 4-byte routing ID.
        return payload.prefix(20)
    }

    // MARK: - BLE advertising

    /// The caBLE BLE service UUID: the FIDO CTAP2 caBLE service.
    private static let cableServiceUUID = CBUUID(string: "FDE2")

    private func startAdvertising() {
        guard let session, peripheral?.state == .poweredOn else { return }
        peripheral?.startAdvertising([
            CBAdvertisementDataServiceUUIDsKey: [Self.cableServiceUUID],
            CBAdvertisementDataServiceDataKey: [Self.cableServiceUUID: session.serviceData],
        ])
        log.info("cable-bridge: advertising caBLE advert for key \(session.key)")
    }
}

// MARK: - CBPeripheralManagerDelegate

extension CableBridgeManager: CBPeripheralManagerDelegate {
    nonisolated func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            if peripheral.state == .poweredOn, self.session != nil {
                self.startAdvertising()
            }
        }
    }
}
