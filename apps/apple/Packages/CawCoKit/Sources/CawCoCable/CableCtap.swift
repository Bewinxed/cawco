import Foundation

/// CTAP2 command parsing and response encoding for the caBLE authenticator.
/// Only `authenticatorGetAssertion` (0x02) is needed: the caBLE bridge
/// handles signing into existing accounts, not creating new credentials.

// MARK: - Message padding

/// ISO/IEC 7816-4 padding to a multiple of the caBLE block size (32 bytes):
/// 0x80 followed by zeros. Applied before Noise encryption, removed after
/// decryption (CTAP 2.2 §11.5.6).
enum CablePadding {
    static let blockSize = 32

    static func pad(_ data: Data) -> Data {
        var padded = data
        padded.append(0x80)
        let remainder = padded.count % blockSize
        if remainder != 0 {
            padded.append(Data(count: blockSize - remainder))
        }
        return padded
    }

    static func unpad(_ data: Data) -> Data {
        // Walk backwards past zeros, then past the 0x80 marker.
        var end = data.count - 1
        while end >= 0 && data[data.startIndex + end] == 0x00 { end -= 1 }
        guard end >= 0 && data[data.startIndex + end] == 0x80 else { return data }
        return data.prefix(end)
    }
}

// MARK: - Post-handshake message

/// The post-handshake message from the authenticator to the client:
/// a CBOR map containing authenticatorGetInfo results (CTAP 2.2 §11.5.6).
enum CablePostHandshake {
    /// A CawCo device's AAGUID (all zeros for a software authenticator).
    private static let aaguid = Data(count: 16)

    /// Builds the post-handshake message (CBOR map, key 1 = getInfo response).
    static func build() -> Data {
        var getInfo: [(CborValue, CborValue)] = []
        // 1: versions
        getInfo.append((.unsigned(1), .array([.text("FIDO_2_0"), .text("FIDO_2_1")])))
        // 3: aaguid
        getInfo.append((.unsigned(3), .bytes(aaguid)))
        // 4: options
        getInfo.append((.unsigned(4), .map([
            (.text("rk"), .bool(true)),
            (.text("up"), .bool(true)),
            (.text("uv"), .bool(true)),
            (.text("plat"), .bool(true)),
        ])))

        // Wrap in the post-handshake envelope: {1: getInfoResponse}
        let envelope: CborValue = .map([(.unsigned(1), .map(getInfo))])
        var encoder = CborEncoder()
        encoder.encode(envelope)
        return encoder.data
    }
}

// MARK: - CTAP2 getAssertion request

/// A parsed `authenticatorGetAssertion` command (CTAP 2.2 §6.2).
public struct CtapGetAssertionRequest: Sendable {
    /// The RP ID (e.g. "github.com").
    public let rpId: String
    /// The SHA-256 hash of the client data JSON (32 bytes).
    public let clientDataHash: Data
    /// Credential IDs the client will accept, if any.
    public let allowList: [Data]
    /// Whether the authenticator should collect user verification.
    public let requireUserVerification: Bool

    public enum ParseError: Error, Sendable {
        case notGetAssertion
        case missingRpId
        case missingClientDataHash
    }

    /// Parses from the raw CTAP2 command bytes (after the 0x01 message-type
    /// prefix that the caBLE tunnel adds).
    public init(ctapBytes: Data) throws {
        guard ctapBytes.count >= 2 else { throw ParseError.missingRpId }
        let commandByte = ctapBytes[ctapBytes.startIndex]
        guard commandByte == 0x02 else { throw ParseError.notGetAssertion }

        let cborData = ctapBytes.suffix(from: ctapBytes.startIndex + 1)
        var decoder = CborDecoder(cborData)
        let params = try decoder.decode()

        // Parameter 1: rpId (text string)
        guard let rpId = params.mapValue(forKey: 1)?.textValue else {
            throw ParseError.missingRpId
        }
        self.rpId = rpId

        // Parameter 2: clientDataHash (byte string, 32 bytes)
        guard let hash = params.mapValue(forKey: 2)?.bytesValue, hash.count == 32 else {
            throw ParseError.missingClientDataHash
        }
        clientDataHash = hash

        // Parameter 3: allowList (optional array of credential descriptors)
        var credentials: [Data] = []
        if let list = params.mapValue(forKey: 3)?.arrayValue {
            for item in list {
                if let id = item.mapValue(forKey: "id")?.bytesValue {
                    credentials.append(id)
                }
            }
        }
        allowList = credentials

        // Parameter 5: options map (optional)
        let uv = params.mapValue(forKey: 5)?.mapValue(forKey: "uv")?.boolValue ?? false
        requireUserVerification = uv
    }
}

// MARK: - CTAP2 getAssertion response

/// An authenticator assertion, ready to encode as a CTAP2 response.
public struct CtapGetAssertionResponse: Sendable {
    public let credentialId: Data
    public let authenticatorData: Data
    public let signature: Data
    public let userHandle: Data?

    public init(credentialId: Data, authenticatorData: Data, signature: Data, userHandle: Data?) {
        self.credentialId = credentialId
        self.authenticatorData = authenticatorData
        self.signature = signature
        self.userHandle = userHandle
    }

    /// Encodes as CTAP2 response bytes: status(0x00 = success) + CBOR map.
    public func encode() -> Data {
        var pairs: [(CborValue, CborValue)] = []

        // 1: credential (PublicKeyCredentialDescriptor)
        pairs.append((.unsigned(1), .map([
            (.text("id"), .bytes(credentialId)),
            (.text("type"), .text("public-key")),
        ])))

        // 2: authData
        pairs.append((.unsigned(2), .bytes(authenticatorData)))

        // 3: signature
        pairs.append((.unsigned(3), .bytes(signature)))

        // 4: user (optional, if userHandle is present)
        if let userHandle, !userHandle.isEmpty {
            pairs.append((.unsigned(4), .map([
                (.text("id"), .bytes(userHandle)),
            ])))
        }

        var encoder = CborEncoder()
        encoder.encode(.map(pairs))

        // Prepend the success status byte.
        return Data([0x00]) + encoder.data
    }
}
