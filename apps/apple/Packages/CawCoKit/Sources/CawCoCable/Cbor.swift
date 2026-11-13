import Foundation

// A minimal CBOR codec for the types FIDO caBLE and CTAP2 use: maps, arrays,
// byte strings, text strings, unsigned integers, negative integers and
// booleans. A full CBOR library is not needed: the protocol's messages are
// small and use a fixed set of types.

// MARK: - Value type

/// One CBOR value, as CTAP2 and caBLE messages carry them.
public enum CborValue: Sendable, Equatable {
    case unsigned(UInt64)
    case negative(Int64)          // Encoded as -(1+n), decoded to -1-n
    case bytes(Data)
    case text(String)
    case array([CborValue])
    case map([(CborValue, CborValue)])
    case bool(Bool)
    case null
}

// MARK: - Decoder

public enum CborError: Error, Sendable {
    case truncated
    case unsupportedMajorType(UInt8)
    case invalidUtf8
    case reservedAdditionalInfo(UInt8)
    case indefiniteLengthNotSupported
}

public struct CborDecoder: Sendable {
    private var data: Data
    private var offset: Int

    public init(_ data: Data) {
        self.data = data
        self.offset = 0
    }

    public var remaining: Int { data.count - offset }

    public mutating func decode() throws -> CborValue {
        guard offset < data.count else { throw CborError.truncated }
        let initial = data[data.startIndex + offset]
        offset += 1
        let major = initial >> 5
        let info = initial & 0x1F

        switch major {
        case 0: // unsigned integer
            return .unsigned(try readArgument(info))
        case 1: // negative integer
            let n = try readArgument(info)
            return .negative(-1 - Int64(n))
        case 2: // byte string
            let len = Int(try readArgument(info))
            return .bytes(try readBytes(len))
        case 3: // text string
            let len = Int(try readArgument(info))
            let bytes = try readBytes(len)
            guard let text = String(data: bytes, encoding: .utf8) else {
                throw CborError.invalidUtf8
            }
            return .text(text)
        case 4: // array
            let count = Int(try readArgument(info))
            var items: [CborValue] = []
            items.reserveCapacity(count)
            for _ in 0 ..< count {
                items.append(try decode())
            }
            return .array(items)
        case 5: // map
            let count = Int(try readArgument(info))
            var pairs: [(CborValue, CborValue)] = []
            pairs.reserveCapacity(count)
            for _ in 0 ..< count {
                let key = try decode()
                let value = try decode()
                pairs.append((key, value))
            }
            return .map(pairs)
        case 7: // special
            switch info {
            case 20: return .bool(false)
            case 21: return .bool(true)
            case 22: return .null
            default:
                // Skip other simple values and floats for now.
                if info == 24 { offset += 1 }
                else if info == 25 { offset += 2 }
                else if info == 26 { offset += 4 }
                else if info == 27 { offset += 8 }
                return .null
            }
        default:
            throw CborError.unsupportedMajorType(major)
        }
    }

    private mutating func readArgument(_ info: UInt8) throws -> UInt64 {
        if info < 24 { return UInt64(info) }
        switch info {
        case 24:
            guard offset < data.count else { throw CborError.truncated }
            let v = data[data.startIndex + offset]
            offset += 1
            return UInt64(v)
        case 25:
            return UInt64(try readUInt16())
        case 26:
            return UInt64(try readUInt32())
        case 27:
            return try readUInt64()
        case 31:
            throw CborError.indefiniteLengthNotSupported
        default:
            throw CborError.reservedAdditionalInfo(info)
        }
    }

    private mutating func readBytes(_ count: Int) throws -> Data {
        guard offset + count <= data.count else { throw CborError.truncated }
        let start = data.startIndex + offset
        let bytes = data[start ..< start + count]
        offset += count
        return Data(bytes)
    }

    private mutating func readUInt16() throws -> UInt16 {
        let bytes = try readBytes(2)
        return UInt16(bytes[bytes.startIndex]) << 8 | UInt16(bytes[bytes.startIndex + 1])
    }

    private mutating func readUInt32() throws -> UInt32 {
        let bytes = try readBytes(4)
        var v: UInt32 = 0
        for i in 0 ..< 4 { v = v << 8 | UInt32(bytes[bytes.startIndex + i]) }
        return v
    }

    private mutating func readUInt64() throws -> UInt64 {
        let bytes = try readBytes(8)
        var v: UInt64 = 0
        for i in 0 ..< 8 { v = v << 8 | UInt64(bytes[bytes.startIndex + i]) }
        return v
    }
}

// MARK: - Encoder

public struct CborEncoder: Sendable {
    public private(set) var data = Data()

    public init() {}

    public mutating func encode(_ value: CborValue) {
        switch value {
        case let .unsigned(n):
            writeHead(0, n)
        case let .negative(n):
            // CBOR negative: -(1 + argument), so argument = -1 - n
            writeHead(1, UInt64(-1 - n))
        case let .bytes(b):
            writeHead(2, UInt64(b.count))
            data.append(b)
        case let .text(s):
            let utf8 = Data(s.utf8)
            writeHead(3, UInt64(utf8.count))
            data.append(utf8)
        case let .array(items):
            writeHead(4, UInt64(items.count))
            for item in items { encode(item) }
        case let .map(pairs):
            writeHead(5, UInt64(pairs.count))
            for (k, v) in pairs {
                encode(k)
                encode(v)
            }
        case let .bool(b):
            data.append(b ? 0xF5 : 0xF4)
        case .null:
            data.append(0xF6)
        }
    }

    private mutating func writeHead(_ major: UInt8, _ argument: UInt64) {
        let m = major << 5
        if argument < 24 {
            data.append(m | UInt8(argument))
        } else if argument <= UInt8.max {
            data.append(m | 24)
            data.append(UInt8(argument))
        } else if argument <= UInt16.max {
            data.append(m | 25)
            data.append(UInt8(argument >> 8))
            data.append(UInt8(argument & 0xFF))
        } else if argument <= UInt32.max {
            data.append(m | 26)
            for shift in stride(from: 24, through: 0, by: -8) {
                data.append(UInt8((argument >> shift) & 0xFF))
            }
        } else {
            data.append(m | 27)
            for shift in stride(from: 56, through: 0, by: -8) {
                data.append(UInt8((argument >> shift) & 0xFF))
            }
        }
    }
}

// MARK: - Map helpers

extension CborValue {
    /// The value for an integer key in a CBOR map, as CTAP2 parameters use.
    public func mapValue(forKey key: UInt64) -> CborValue? {
        guard case let .map(pairs) = self else { return nil }
        return pairs.first { $0.0 == .unsigned(key) }?.1
    }

    /// The value for a text key in a CBOR map.
    public func mapValue(forKey key: String) -> CborValue? {
        guard case let .map(pairs) = self else { return nil }
        return pairs.first { $0.0 == .text(key) }?.1
    }

    /// The bytes of a `.bytes` value.
    public var bytesValue: Data? {
        if case let .bytes(d) = self { return d }
        return nil
    }

    /// The string of a `.text` value.
    public var textValue: String? {
        if case let .text(s) = self { return s }
        return nil
    }

    /// The integer of an `.unsigned` value.
    public var unsignedValue: UInt64? {
        if case let .unsigned(n) = self { return n }
        return nil
    }

    /// The array of an `.array` value.
    public var arrayValue: [CborValue]? {
        if case let .array(a) = self { return a }
        return nil
    }

    /// The bool of a `.bool` value.
    public var boolValue: Bool? {
        if case let .bool(b) = self { return b }
        return nil
    }
}
