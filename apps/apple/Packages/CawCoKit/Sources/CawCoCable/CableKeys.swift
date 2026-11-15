import CryptoKit
import Foundation

/// Key derivation and BLE advert construction for the caBLE hybrid transport
/// (CTAP 2.2 §11.5). Every key comes from the 16-byte QR secret through
/// HKDF-SHA-256, with an empty salt and a 4-byte little-endian purpose tag.
public enum CableKeys {
    // MARK: - HKDF derivations

    /// Purpose tags for HKDF info (CTAP 2.2 §11.5.4).
    private enum Purpose: UInt32 {
        case eidKey = 1
        case tunnelId = 2
        case psk = 3
    }

    private static func info(_ purpose: Purpose) -> Data {
        withUnsafeBytes(of: purpose.rawValue.littleEndian) { Data($0) }
    }

    /// The 64-byte EID key: its first 32 bytes are the AES-256 key for
    /// encrypting the BLE advert, its last 32 are the HMAC-SHA-256 key
    /// for the advert's 4-byte tag.
    public static func eidKey(qrSecret: Data) -> Data {
        let derived = HKDF<SHA256>.deriveKey(
            inputKeyMaterial: SymmetricKey(data: qrSecret),
            salt: Data(),
            info: info(.eidKey),
            outputByteCount: 64)
        return derived.withUnsafeBytes { Data($0) }
    }

    /// The 16-byte tunnel ID that names this exchange on the tunnel server.
    public static func tunnelId(qrSecret: Data) -> Data {
        let derived = HKDF<SHA256>.deriveKey(
            inputKeyMaterial: SymmetricKey(data: qrSecret),
            salt: Data(),
            info: info(.tunnelId),
            outputByteCount: 16)
        return derived.withUnsafeBytes { Data($0) }
    }

    /// The 32-byte PSK for the Noise KNpsk0 handshake, derived from the
    /// QR secret with the decrypted BLE advert as salt.
    public static func psk(qrSecret: Data, decryptedAdvert: Data) -> Data {
        let derived = HKDF<SHA256>.deriveKey(
            inputKeyMaterial: SymmetricKey(data: qrSecret),
            salt: decryptedAdvert,
            info: info(.psk),
            outputByteCount: 32)
        return derived.withUnsafeBytes { Data($0) }
    }

    // MARK: - BLE advert

    /// Builds the 20-byte encrypted BLE advert that the hub injects into
    /// the machine's VHCI so Chromium sees it as a nearby authenticator.
    ///
    /// Plaintext (16 bytes): flags(1) + nonce(10) + routingId(3) + tunnelServerId(2)
    /// Ciphertext: AES-256-ECB(eidKey[0..32], plaintext) + HMAC-SHA-256(eidKey[32..64], ciphertext)[0..4]
    public static func buildAdvert(
        eidKey: Data,
        routingId: Data,
        tunnelServerId: UInt16
    ) -> (advert: Data, plaintext: Data) {
        precondition(eidKey.count == 64)
        precondition(routingId.count == 3)

        // Random 10-byte nonce, via CryptoKit's secure random.
        let nonce = SymmetricKey(size: .init(bitCount: 80)).withUnsafeBytes { Data($0) }

        // Plaintext: flags(1) + nonce(10) + routingId(3) + tunnelServerId(2) = 16
        var plaintext = Data(capacity: 16)
        plaintext.append(0x00) // flags
        plaintext.append(nonce)
        plaintext.append(routingId)
        plaintext.append(UInt8(tunnelServerId & 0xFF))
        plaintext.append(UInt8(tunnelServerId >> 8))

        // AES-256-ECB encrypt one 16-byte block.
        let aesKey = eidKey.prefix(32)
        let hmacKey = eidKey.suffix(32)
        let encrypted = aesEcbEncrypt(key: aesKey, block: plaintext)

        // HMAC-SHA-256 tag, truncated to 4 bytes.
        let tag = Data(
            HMAC<SHA256>.authenticationCode(
                for: encrypted,
                using: SymmetricKey(data: hmacKey)
            )
        ).prefix(4)

        return (encrypted + tag, plaintext)
    }

    /// AES-256-ECB encryption of exactly one 16-byte block. CryptoKit has no
    /// raw AES-ECB, so this goes through CommonCrypto's `CCCrypt` via
    /// `@_silgen_name` (the function is a stable C symbol on every Apple
    /// platform, used by many open-source Swift packages the same way).
    private static func aesEcbEncrypt(key: Data, block: Data) -> Data {
        precondition(key.count == 32 && block.count == 16)
        // kCCEncrypt = 0, kCCAlgorithmAES = 0, kCCOptionECBMode = 2.
        // No padding: the input is exactly one AES block.
        var outBuffer = Data(count: 32) // one block + room
        var outLength = 0
        let status = key.withUnsafeBytes { keyBytes in
            block.withUnsafeBytes { blockBytes in
                outBuffer.withUnsafeMutableBytes { outBytes in
                    CCCrypt(
                        /* op        */ UInt32(0), // kCCEncrypt
                        /* alg       */ UInt32(0), // kCCAlgorithmAES
                        /* options   */ UInt32(2), // kCCOptionECBMode (no padding)
                        /* key       */ keyBytes.baseAddress, key.count,
                        /* iv        */ nil,
                        /* dataIn    */ blockBytes.baseAddress, block.count,
                        /* dataOut   */ outBytes.baseAddress, outBytes.count,
                        /* outMoved  */ &outLength)
                }
            }
        }
        precondition(status == 0, "CCCrypt failed with status \(status)")
        return outBuffer.prefix(outLength)
    }
}

// CommonCrypto bridge — the library is a system dylib on every Apple platform.
@_silgen_name("CCCrypt")
private func CCCrypt(
    _ op: UInt32,
    _ alg: UInt32,
    _ options: UInt32,
    _ key: UnsafeRawPointer?,
    _ keyLength: Int,
    _ iv: UnsafeRawPointer?,
    _ dataIn: UnsafeRawPointer?,
    _ dataInLength: Int,
    _ dataOut: UnsafeMutableRawPointer?,
    _ dataOutAvailable: Int,
    _ dataOutMoved: UnsafeMutablePointer<Int>
) -> Int32
