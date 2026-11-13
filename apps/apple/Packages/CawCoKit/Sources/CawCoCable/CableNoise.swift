import CryptoKit
import Foundation

/// The Noise KNpsk0 handshake with P-256/AES-256-GCM/SHA-256, as the caBLE
/// hybrid transport (CTAP 2.2 §11.5.6) defines it. The protocol name is
/// `Noise_KNpsk0_P256_AESGCM_SHA256`.
///
/// The trancee/noise-protocol library supports only X25519; caBLE mandates
/// P-256 ECDH, so the handshake is implemented here with CryptoKit.

// MARK: - Transport cipher

/// An AES-256-GCM cipher state after the Noise handshake completes.
/// Each direction (send, receive) gets its own cipher with its own nonce
/// counter that starts at zero.
public struct NoiseCipherState: Sendable {
    private let key: SymmetricKey
    private var nonce: UInt64 = 0

    init(key: Data) {
        precondition(key.count == 32)
        self.key = SymmetricKey(data: key)
    }

    /// Encrypts `plaintext` with the current nonce and increments. The
    /// output is `ciphertext ‖ tag(16)`.
    public mutating func encrypt(plaintext: Data, ad: Data = Data()) throws -> Data {
        let sealed = try AES.GCM.seal(
            plaintext,
            using: key,
            nonce: nonceBytes(),
            authenticating: ad)
        nonce += 1
        return sealed.ciphertext + sealed.tag
    }

    /// Decrypts `ciphertext ‖ tag(16)` with the current nonce and increments.
    public mutating func decrypt(ciphertext: Data, ad: Data = Data()) throws -> Data {
        guard ciphertext.count >= 16 else { throw NoiseError.truncated }
        let ct = ciphertext.prefix(ciphertext.count - 16)
        let tag = ciphertext.suffix(16)
        let box = try AES.GCM.SealedBox(nonce: nonceBytes(), ciphertext: ct, tag: tag)
        let plaintext = try AES.GCM.open(box, using: key, authenticating: ad)
        nonce += 1
        return plaintext
    }

    /// Noise nonce format: 4 bytes zero ‖ 8 bytes little-endian counter.
    private func nonceBytes() -> AES.GCM.Nonce {
        var bytes = Data(count: 4) // 4 zero bytes
        withUnsafeBytes(of: nonce.littleEndian) { bytes.append(contentsOf: $0) }
        return try! AES.GCM.Nonce(data: bytes)
    }
}

// MARK: - Handshake state

public enum NoiseError: Error, Sendable {
    case truncated
    case decryptionFailed
    case handshakeIncomplete
    case invalidPublicKey
}

/// The Noise symmetric state that accumulates the handshake's hash and
/// chaining key, driving MixHash, MixKey, MixKeyAndHash, and Split.
struct NoiseSymmetricState {
    /// The handshake hash (HASHLEN = 32 for SHA-256).
    var h: Data
    /// The chaining key (HASHLEN = 32).
    var ck: Data
    /// The cipher key, nil until the first MixKey or MixKeyAndHash.
    var k: Data?
    /// The cipher nonce, reset on each new key.
    var n: UInt64 = 0

    private static let protocolName = "Noise_KNpsk0_P256_AESGCM_SHA256"

    /// Initialize per Noise spec §5.2.
    init() {
        let name = Data(Self.protocolName.utf8)
        // 31 bytes ≤ HASHLEN(32): zero-pad to 32 bytes.
        h = name + Data(count: 32 - name.count)
        ck = h
        k = nil
        n = 0
    }

    mutating func mixHash(_ data: Data) {
        h = sha256(h + data)
    }

    mutating func mixKey(_ inputKeyMaterial: Data) {
        let (out1, out2) = noiseHkdf2(ck: ck, ikm: inputKeyMaterial)
        ck = out1
        k = out2.prefix(32)
        n = 0
    }

    mutating func mixKeyAndHash(_ inputKeyMaterial: Data) {
        let (out1, out2, out3) = noiseHkdf3(ck: ck, ikm: inputKeyMaterial)
        ck = out1
        mixHash(out2)
        k = out3.prefix(32)
        n = 0
    }

    mutating func encryptAndHash(_ plaintext: Data) throws -> Data {
        guard let k else {
            mixHash(plaintext)
            return plaintext
        }
        let ciphertext = try aesGcmEncrypt(key: k, nonce: n, ad: h, plaintext: plaintext)
        mixHash(ciphertext)
        n += 1
        return ciphertext
    }

    mutating func decryptAndHash(_ ciphertext: Data) throws -> Data {
        guard let k else {
            mixHash(ciphertext)
            return ciphertext
        }
        let plaintext = try aesGcmDecrypt(key: k, nonce: n, ad: h, ciphertext: ciphertext)
        mixHash(ciphertext)
        n += 1
        return plaintext
    }

    /// Split into two transport ciphers: (initiator-sends, responder-sends).
    func split() -> (NoiseCipherState, NoiseCipherState) {
        let (out1, out2) = noiseHkdf2(ck: ck, ikm: Data())
        return (NoiseCipherState(key: out1), NoiseCipherState(key: out2))
    }
}

// MARK: - KNpsk0 responder

/// Runs the KNpsk0 handshake as the responder (authenticator).
///
/// Pre-message:  `-> s`  (initiator's static key known to responder)
/// Message 1:    `-> psk, e`
/// Message 2:    `<- e, ee, se`
///
/// After message 2, `split()` yields the transport ciphers. The responder
/// sends with `c2` (second cipher) and receives with `c1` (first cipher).
public struct CableNoiseResponder: Sendable {
    private var state: NoiseSymmetricState
    /// The initiator's static public key (from the QR code).
    private let rs: P256.KeyAgreement.PublicKey
    /// The initiator's ephemeral public key (read from message 1).
    private var re: P256.KeyAgreement.PublicKey?
    /// Our ephemeral keypair, generated at write time.
    private var e: P256.KeyAgreement.PrivateKey?
    /// The PSK derived from the QR secret and decrypted advert.
    private let psk: Data

    /// Compressed P-256 public key (33 bytes), the DH length for caBLE's Noise.
    static let dhLen = 33

    /// - Parameters:
    ///   - initiatorStaticPublicKey: The P-256 public key from the QR code.
    ///   - psk: The 32-byte PSK derived from the QR secret and advert plaintext.
    public init(initiatorStaticPublicKey: P256.KeyAgreement.PublicKey, psk: Data) {
        precondition(psk.count == 32)
        self.rs = initiatorStaticPublicKey
        self.psk = psk

        // Initialize + pre-message: MixHash(rs_compressed)
        state = NoiseSymmetricState()
        state.mixHash(Data(rs.compressedRepresentation))
    }

    /// Processes the initiator's first message (`-> psk, e`).
    /// Returns the decrypted payload (typically empty).
    public mutating func readMessage1(_ message: Data) throws -> Data {
        guard message.count >= Self.dhLen else { throw NoiseError.truncated }

        // psk token
        state.mixKeyAndHash(psk)

        // e token: read initiator's ephemeral public key
        let reBytes = message.prefix(Self.dhLen)
        do {
            re = try P256.KeyAgreement.PublicKey(compressedRepresentation: reBytes)
        } catch {
            throw NoiseError.invalidPublicKey
        }
        state.mixHash(reBytes)

        // Decrypt and return any payload after the ephemeral key.
        let payload = message.suffix(from: message.startIndex + Self.dhLen)
        return try state.decryptAndHash(payload)
    }

    /// Writes the responder's second message (`<- e, ee, se`).
    /// Returns (message bytes, send cipher, receive cipher).
    public mutating func writeMessage2(payload: Data = Data()) throws -> (Data, NoiseCipherState, NoiseCipherState) {
        guard let re else { throw NoiseError.handshakeIncomplete }

        // e token: generate our ephemeral keypair
        let ephemeral = P256.KeyAgreement.PrivateKey()
        e = ephemeral
        let ePub = Data(ephemeral.publicKey.compressedRepresentation)
        state.mixHash(ePub)
        var message = ePub

        // ee: DH(e, re)
        let ee = try ephemeral.sharedSecretFromKeyAgreement(with: re)
        state.mixKey(ee.rawBytes)

        // se: DH(e, rs) — responder processing `se` uses DH(e, rs)
        let se = try ephemeral.sharedSecretFromKeyAgreement(with: rs)
        state.mixKey(se.rawBytes)

        // Encrypt payload
        let encrypted = try state.encryptAndHash(payload)
        message.append(encrypted)

        // Split: c1 = initiator-sends (our receive), c2 = responder-sends (our send)
        let (c1, c2) = state.split()
        return (message, c2, c1) // (message, sendCipher, receiveCipher)
    }
}

// MARK: - Noise HKDF (spec §4.3)

/// Noise's own HKDF with 2 outputs (not the general RFC 5869 HKDF).
private func noiseHkdf2(ck: Data, ikm: Data) -> (Data, Data) {
    let tempKey = hmacSha256(key: ck, data: ikm)
    let output1 = hmacSha256(key: tempKey, data: Data([0x01]))
    let output2 = hmacSha256(key: tempKey, data: output1 + Data([0x02]))
    return (output1, output2)
}

/// Noise's own HKDF with 3 outputs (for MixKeyAndHash).
private func noiseHkdf3(ck: Data, ikm: Data) -> (Data, Data, Data) {
    let tempKey = hmacSha256(key: ck, data: ikm)
    let output1 = hmacSha256(key: tempKey, data: Data([0x01]))
    let output2 = hmacSha256(key: tempKey, data: output1 + Data([0x02]))
    let output3 = hmacSha256(key: tempKey, data: output2 + Data([0x03]))
    return (output1, output2, output3)
}

// MARK: - Crypto helpers

private func sha256(_ data: Data) -> Data {
    Data(SHA256.hash(data: data))
}

private func hmacSha256(key: Data, data: Data) -> Data {
    Data(HMAC<SHA256>.authenticationCode(for: data, using: SymmetricKey(data: key)))
}

/// AES-256-GCM encrypt with Noise nonce format: 4 zero bytes ‖ 8 LE bytes.
private func aesGcmEncrypt(key: Data, nonce n: UInt64, ad: Data, plaintext: Data) throws -> Data {
    var nonceBytes = Data(count: 4)
    withUnsafeBytes(of: n.littleEndian) { nonceBytes.append(contentsOf: $0) }
    let sealed = try AES.GCM.seal(
        plaintext,
        using: SymmetricKey(data: key),
        nonce: try AES.GCM.Nonce(data: nonceBytes),
        authenticating: ad)
    return sealed.ciphertext + sealed.tag
}

/// AES-256-GCM decrypt (ciphertext includes the 16-byte tag at the end).
private func aesGcmDecrypt(key: Data, nonce n: UInt64, ad: Data, ciphertext: Data) throws -> Data {
    guard ciphertext.count >= 16 else { throw NoiseError.truncated }
    var nonceBytes = Data(count: 4)
    withUnsafeBytes(of: n.littleEndian) { nonceBytes.append(contentsOf: $0) }
    let ct = ciphertext.prefix(ciphertext.count - 16)
    let tag = ciphertext.suffix(16)
    let box = try AES.GCM.SealedBox(
        nonce: try AES.GCM.Nonce(data: nonceBytes),
        ciphertext: ct, tag: tag)
    return try AES.GCM.open(box, using: SymmetricKey(data: key), authenticating: ad)
}

// MARK: - SharedSecret raw bytes

extension SharedSecret {
    /// The raw ECDH output bytes. CryptoKit's `SharedSecret` conforms to
    /// `ContiguousBytes`, which the Noise state machine needs to feed into
    /// its own HKDF rather than CryptoKit's.
    var rawBytes: Data {
        withUnsafeBytes { Data($0) }
    }
}
