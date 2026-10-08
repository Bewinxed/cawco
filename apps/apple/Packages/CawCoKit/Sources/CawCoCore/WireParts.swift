import Foundation

/// The hub's wire, as `@cawco/core/wire` defines it: no frame is larger than
/// `frameLimitBytes`, and a message whose JSON is longer than `partChars`
/// characters goes as parts, `{"part":{"id","seq","last"},"text":"…"}`, each
/// the next slice of the message's JSON, joined in order and read once.
/// The numbers mirror `WIRE_FRAME_LIMIT_BYTES` and `WIRE_PART_CHARS` there.
extension Wire {
    /// `WIRE_FRAME_LIMIT_BYTES`: the largest frame any end sends.
    static let frameLimitBytes = 4 << 20
    /// `WIRE_PART_CHARS`: UTF-16 units of a message's JSON per part.
    static let partChars = 1 << 20
    /// `WIRE_MESSAGE_LIMIT_BYTES`: the longest message, assembled.
    static let messageLimitChars = 512 << 20

    struct Failure: Error, CustomStringConvertible {
        let description: String
    }

    private struct Part: Codable {
        struct Head: Codable {
            let id: String
            let seq: Int
            let last: Bool
        }

        let part: Head
        let text: String
    }

    /// The frames `json` goes out as: itself, or its parts in order. A cut
    /// never falls between the halves of a surrogate pair.
    static func frames(_ json: String) -> [String] {
        let units = Array(json.utf16)
        guard units.count > partChars else { return [json] }
        let id = UUID().uuidString
        let encoder = JSONEncoder()
        var frames: [String] = []
        var seq = 0
        var at = 0
        while at < units.count {
            var end = min(at + partChars, units.count)
            if end < units.count, UTF16.isLeadSurrogate(units[end - 1]) {
                end += 1
            }
            let slice = String(decoding: units[at ..< end], as: UTF16.self)
            let part = Part(part: .init(id: id, seq: seq, last: end >= units.count), text: slice)
            if let data = try? encoder.encode(part) {
                frames.append(String(decoding: data, as: UTF8.self))
            }
            seq += 1
            at = end
        }
        return frames
    }

    /// Joins one socket's parts back into messages.
    struct Assembler {
        private static let partPrefix = Data(#"{"part":{"#.utf8)
        private var open: [String: (next: Int, chars: Int, text: String)] = [:]

        /// The message `frame` completes: the frame itself when it is not a
        /// part, the joined message on a message's last part, nil while its
        /// parts are still arriving. A part out of order throws.
        mutating func take(_ frame: Data) throws -> Data? {
            guard frame.starts(with: Self.partPrefix) else { return frame }
            let piece = try JSONDecoder().decode(Part.self, from: frame)
            var building = open[piece.part.id] ?? (next: 0, chars: 0, text: "")
            guard piece.part.seq == building.next else {
                open[piece.part.id] = nil
                throw Failure(description: "wire part \(piece.part.id)#\(piece.part.seq) arrived where #\(building.next) was expected")
            }
            building.text += piece.text
            building.next += 1
            building.chars += piece.text.utf16.count
            guard building.chars <= messageLimitChars else {
                open[piece.part.id] = nil
                throw Failure(description: "wire message \(piece.part.id) passed \(messageLimitChars) characters")
            }
            guard piece.part.last else {
                open[piece.part.id] = building
                return nil
            }
            open[piece.part.id] = nil
            return Data(building.text.utf8)
        }
    }
}
