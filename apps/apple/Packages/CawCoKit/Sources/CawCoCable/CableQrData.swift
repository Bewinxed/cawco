import CryptoKit
import Foundation

/// What a caBLE client (Chromium) puts in a FIDO:/ QR code: the public key
/// for the Noise handshake, the secret every derived key comes from, and the
/// tunnel domain the client can reach.
public struct CableQrData: Sendable {
    /// The client's static P-256 public key (33 bytes compressed X9.62).
    public let publicKey: P256.KeyAgreement.PublicKey
    /// 16 bytes of random secret, the root of every derived key.
    public let qrSecret: Data
    /// Bitmask of tunnel domains the client supports.
    public let knownTunnelDomains: UInt16
    /// When the QR was made, if the client said.
    public let timestamp: Date?
    /// Whether the client supports state-assisted transactions (linking).
    public let supportsStateAssisted: Bool
    /// What the client is asking the authenticator to do.
    public let operationHint: OperationHint

    /// CTAP 2.2 §11.5.2: the operation the client wants.
    public enum OperationHint: UInt64, Sendable {
        case getAssertion = 0
        case makeCredential = 1
        case discoverableCredentialPreference = 2
        case discoverableCredentialInfo = 3
    }

    /// The tunnel domains Chromium and the spec name (CTAP 2.2 §11.5.3).
    static let tunnelDomains: [String] = [
        "cable.ua5v.com",
        "cable.auth.com",
    ]

    /// The tunnel domain to connect to, chosen from the QR's bitmask.
    public var tunnelDomain: String {
        for (index, domain) in Self.tunnelDomains.enumerated() {
            if knownTunnelDomains & (1 << index) != 0 { return domain }
        }
        // Fallback to the first known domain.
        return Self.tunnelDomains[0]
    }

    /// The 2-byte tunnel server ID for the BLE advert (the domain's index
    /// among the known domains, little-endian).
    public var tunnelServerId: UInt16 {
        for (index, domain) in Self.tunnelDomains.enumerated() {
            if tunnelDomain == domain { return UInt16(256 + index) }
        }
        return 256
    }

    public enum ParseError: Error, Sendable {
        case notFidoUri
        case invalidBase64
        case invalidCbor
        case missingPublicKey
        case invalidPublicKey
        case missingSecret
    }

    /// Parses a `FIDO:/` QR code URI. The payload after `FIDO:/` is a
    /// CBOR map encoded as digit pairs (each byte as two decimal digits,
    /// zero-padded), per CTAP 2.2 §11.5.1.
    public init(uri: String) throws {
        guard uri.uppercased().hasPrefix("FIDO:/") else { throw ParseError.notFidoUri }
        let digits = String(uri.dropFirst(6))
        // Each byte is encoded as two decimal digits, left-padded with zero.
        guard digits.count.isMultiple(of: 2) else { throw ParseError.invalidBase64 }
        var bytes = Data()
        bytes.reserveCapacity(digits.count / 2)
        var i = digits.startIndex
        while i < digits.endIndex {
            let next = digits.index(i, offsetBy: 2)
            guard let byte = UInt8(digits[i ..< next]) else { throw ParseError.invalidBase64 }
            bytes.append(byte)
            i = next
        }
        try self.init(cbor: bytes)
    }

    /// Parses from raw CBOR bytes (the payload inside a QR or a hub frame).
    public init(cbor data: Data) throws {
        var decoder = CborDecoder(data)
        let value = try decoder.decode()
        try self.init(value: value)
    }

    /// Parses from an already-decoded CBOR map.
    public init(value: CborValue) throws {
        guard case .map = value else { throw ParseError.invalidCbor }

        // Key 0: public key, compressed X9.62 (33 bytes) or uncompressed (65 bytes)
        guard let pkBytes = value.mapValue(forKey: 0)?.bytesValue else {
            throw ParseError.missingPublicKey
        }
        do {
            if pkBytes.count == 33 {
                publicKey = try P256.KeyAgreement.PublicKey(compressedRepresentation: pkBytes)
            } else if pkBytes.count == 65 {
                publicKey = try P256.KeyAgreement.PublicKey(x963Representation: pkBytes)
            } else {
                throw ParseError.invalidPublicKey
            }
        } catch is ParseError {
            throw ParseError.invalidPublicKey
        } catch {
            throw ParseError.invalidPublicKey
        }

        // Key 1: QR secret (16 bytes)
        guard let secret = value.mapValue(forKey: 1)?.bytesValue, secret.count == 16 else {
            throw ParseError.missingSecret
        }
        qrSecret = secret

        // Key 2: known tunnel server domains (bitmask)
        knownTunnelDomains = UInt16(value.mapValue(forKey: 2)?.unsignedValue ?? 1)

        // Key 3: timestamp (seconds since epoch)
        if let ts = value.mapValue(forKey: 3)?.unsignedValue {
            timestamp = Date(timeIntervalSince1970: Double(ts))
        } else {
            timestamp = nil
        }

        // Key 4: state-assisted transactions supported
        supportsStateAssisted = value.mapValue(forKey: 4)?.boolValue ?? false

        // Key 5: operation hint
        if let hint = value.mapValue(forKey: 5)?.unsignedValue,
           let op = OperationHint(rawValue: hint)
        {
            operationHint = op
        } else {
            operationHint = .getAssertion
        }
    }

    /// Builds from already-parsed components (when the hub sends them as
    /// separate fields rather than raw CBOR).
    public init(
        publicKey: P256.KeyAgreement.PublicKey,
        qrSecret: Data,
        knownTunnelDomains: UInt16 = 1,
        timestamp: Date? = nil,
        supportsStateAssisted: Bool = false,
        operationHint: OperationHint = .getAssertion
    ) {
        self.publicKey = publicKey
        self.qrSecret = qrSecret
        self.knownTunnelDomains = knownTunnelDomains
        self.timestamp = timestamp
        self.supportsStateAssisted = supportsStateAssisted
        self.operationHint = operationHint
    }
}
