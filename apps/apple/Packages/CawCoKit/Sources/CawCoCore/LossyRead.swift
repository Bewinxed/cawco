import CawCoAPI
import Foundation

/// Hub JSON read so that what this app cannot read costs only itself.
///
/// The hub ships nightly and the app through TestFlight later, so a hub newer
/// than its app is the normal case. Its string enums are open (OpenEnum.swift),
/// and fields it adds are ignored by the decoder. What is left is a value the
/// app's types refuse: a field this build requires that the hub no longer
/// sends (0.1.11's `PreviewFrame.path`, gone with preview ports), a value of
/// another JSON type, a date or discriminator the app does not know. Read
/// strictly, one such value inside one preview fails the whole board frame,
/// and the board never reads. So the decoder's own error says where it
/// stopped, that value is cut from the message, and the rest is read again:
///
/// - a value of the wrong type, a null, an unreadable value: the value goes
///   (an optional field then reads as absent);
/// - a container missing a key this build requires: the container goes.
///
/// A cut field the type requires is then missing from its container, so the
/// next pass cuts the container: the cut climbs to the first thing that may
/// go, an optional field or an element of an array, and the message reads
/// without it. The same defect at the same place in every element of every
/// array on the way (one missing key in all 1,200 rows) goes in the same
/// pass. Nothing is cut at the message's root: a message whose own fields do
/// not read still fails, with the decoder's first error, and its caller skips
/// it. Each cut is said once (`HubNewer.skipped`), the first raising the
/// update notice.
extension Wire {
    /// Passes before a message is given up as unreadable: each is a whole
    /// decode, and a map's entries (keyed by id, not by place) go one per pass.
    private static let cutPasses = 64

    static func lossy<T: Decodable>(_: T.Type, from data: Data) throws -> T {
        let decoder = decoder()
        let first: DecodingError
        do {
            return try decoder.decode(T.self, from: data)
        } catch let error as DecodingError {
            first = error
        }
        guard let tree = try? JSONSerialization.jsonObject(with: data, options: [.mutableContainers, .fragmentsAllowed]) else {
            throw first
        }
        var error = first
        var cuts: [(count: Int, cut: Cut)] = []
        for _ in 0 ..< cutPasses {
            guard let cut = Cut(error) else { throw first }
            let count = cut.apply(to: tree)
            guard count > 0 else { throw first }
            cuts.append((count, cut))
            do {
                let read = try decoder.decode(T.self, from: try JSONSerialization.data(withJSONObject: tree, options: [.fragmentsAllowed]))
                for (count, cut) in cuts {
                    HubNewer.skipped(count, of: String(describing: T.self), at: cut.place, because: cut.reason)
                }
                return read
            } catch let next as DecodingError {
                error = next
            }
        }
        throw first
    }
}

/// One cut: where the decoder stopped, matched over the JSON tree with every
/// array index a wildcard, and what is wrong there.
private struct Cut {
    private enum Fault {
        /// The container lacks this key: the container goes.
        case missing(String)
        /// A value of this JSON kind is refused here, whatever it holds.
        case kind
        /// This value is refused here: equal values go too.
        case value
    }

    private enum Defect {
        case missing(String)
        case kind(String)
        case value(NSObject)
    }

    /// A place a cut lands: an object's key or an array's element.
    private enum Hit {
        case key(NSMutableDictionary, String)
        case element(NSMutableArray, Int)
    }

    private let path: [any CodingKey]
    private let fault: Fault
    let reason: String

    init?(_ error: DecodingError) {
        let context: DecodingError.Context
        switch error {
        case let .keyNotFound(key, found):
            (context, fault, reason) = (found, .missing(key.stringValue), "no \(key.stringValue)")
        case let .typeMismatch(type, found):
            (context, fault, reason) = (found, .kind, "not \(type)")
        case let .valueNotFound(type, found):
            (context, fault, reason) = (found, .kind, "null, not \(type)")
        case let .dataCorrupted(found):
            (context, fault, reason) = (found, .value, found.debugDescription)
        @unknown default:
            return nil
        }
        guard !context.codingPath.isEmpty else { return nil }
        path = context.codingPath
    }

    /// Where the cut stands, every array index a wildcard: `.payload.previews[*]`.
    var place: String {
        path.map { $0.intValue != nil && $0.stringValue.hasPrefix("Index ") ? "[*]" : ".\($0.stringValue)" }.joined()
    }

    /// Cuts the defect wherever the path reaches in `root`, read by
    /// JSONSerialization with mutable containers. How many places it cut.
    func apply(to root: Any) -> Int {
        // The value the decoder stopped at says what the defect is.
        let defect: Defect
        switch fault {
        case let .missing(key):
            defect = .missing(key)
        case .kind:
            guard let value = Self.value(at: path[...], in: root) else { return 0 }
            defect = .kind(Self.kind(of: value))
        case .value:
            guard let value = Self.value(at: path[...], in: root) as? NSObject else { return 0 }
            defect = .value(value)
        }
        var hits: [Hit] = []
        Self.match(root, path[...], defect, into: &hits)
        // Elements go from the end, so the earlier indices stay where they are.
        var elements: [(NSMutableArray, Int)] = []
        for hit in hits {
            switch hit {
            case let .key(object, key): object.removeObject(forKey: key)
            case let .element(array, index): elements.append((array, index))
            }
        }
        for (array, index) in elements.sorted(by: { $0.1 > $1.1 }) {
            array.removeObject(at: index)
        }
        return hits.count
    }

    /// The value at `path`, following the decoder's keys exactly.
    private static func value(at path: ArraySlice<any CodingKey>, in root: Any) -> Any? {
        var current: Any = root
        for key in path {
            switch current {
            case let array as NSArray:
                guard let index = key.intValue, array.count > index else { return nil }
                current = array[index]
            case let object as NSDictionary:
                guard let next = object[key.stringValue] else { return nil }
                current = next
            default:
                return nil
            }
        }
        return current
    }

    /// Every place the path reaches, any index at an array's step, whose
    /// value shows the defect.
    private static func match(_ node: Any, _ path: ArraySlice<any CodingKey>, _ defect: Defect, into hits: inout [Hit]) {
        guard let key = path.first else { return }
        let rest = path.dropFirst()
        switch node {
        case let array as NSMutableArray:
            for (index, element) in array.enumerated() {
                if rest.isEmpty {
                    if shows(element, defect) { hits.append(.element(array, index)) }
                } else {
                    match(element, rest, defect, into: &hits)
                }
            }
        case let object as NSMutableDictionary:
            guard let value = object[key.stringValue] else { return }
            if rest.isEmpty {
                if shows(value, defect) { hits.append(.key(object, key.stringValue)) }
            } else {
                match(value, rest, defect, into: &hits)
            }
        default:
            return
        }
    }

    private static func shows(_ value: Any, _ defect: Defect) -> Bool {
        switch defect {
        case let .missing(key): (value as? NSDictionary).map { $0[key] == nil } ?? false
        case let .kind(kind): Self.kind(of: value) == kind
        case let .value(refused): (value as? NSObject)?.isEqual(refused) ?? false
        }
    }

    private static func kind(of value: Any) -> String {
        switch value {
        case is NSNull: "null"
        case let number as NSNumber: CFGetTypeID(number) == CFBooleanGetTypeID() ? "bool" : "number"
        case is NSString: "string"
        case is NSArray: "array"
        case is NSDictionary: "object"
        default: "other"
        }
    }
}
