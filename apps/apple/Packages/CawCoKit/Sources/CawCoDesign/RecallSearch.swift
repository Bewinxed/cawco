// This file is a port of MiniSearch 7.2.0 (https://github.com/lucaong/minisearch),
// src/MiniSearch.ts and src/SearchableMap/{SearchableMap,TreeIterator,fuzzySearch}.ts:
// its default tokenizer and term processing, its radix tree, its prefix and
// fuzzy lookups, its BM25+ scoring and its AND combination, for the one text
// field the composer's recall wheel searches.
//
// Copyright 2022 Luca Ongaro
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//
// The same notice ships in the app as Resources/Licenses/MiniSearch.txt.

import Foundation

/// What the reader sent in one conversation, searched as the web's composer
/// searches it: `new MiniSearch({ fields: ["text"] })` over the messages in
/// the wheel's order (newest first), queried with `prefix: true, fuzzy: 0.2,
/// combineWith: "AND"` and the library's BM25+ defaults (k 1.2, b 0.7,
/// d 0.5), so one query ranks the same messages on both clients.
///
/// Everything is measured as JavaScript measures it: a term is its UTF-16
/// code units (`term.length`, `key[pos]`), the tokenizer splits on runs of
/// newlines, Unicode separators and punctuation (`/[\n\r\p{Z}\p{P}]+/u`, so
/// a symbol such as `+` or `$` stays inside its word), and a field's length
/// is its count of distinct raw tokens, the empty token at either end of a
/// split included, exactly as `new Set(tokens).size` counts them. The radix
/// tree keeps JavaScript `Map`'s insertion order, which decides the order
/// results of equal score come back in.
struct RecallSearch {
    /// One match: the message's place in the list it was built from, its
    /// score as `search()` returns it, and the message's own terms that
    /// matched (lowercased), for marking them.
    struct Result {
        let index: Int
        let score: Double
        let terms: Set<[UInt16]>
    }

    // MiniSearch's defaults: `defaultSearchOptions` and `defaultBM25params`.
    private static let k = 1.2
    private static let b = 0.7
    private static let d = 0.5
    private static let maxFuzzy = 6
    private static let fuzzyWeight = 0.45
    private static let prefixWeight = 0.375
    /// What the composer asks for: `fuzzy: 0.2`.
    private static let fuzziness = 0.2

    private let root = Node()
    private var fieldLength: [Int] = []
    private var averageFieldLength = 0.0
    private var documentCount: Int { fieldLength.count }

    init(_ texts: [String]) {
        for text in texts { add(text) }
    }

    // MARK: Indexing (MiniSearch `add`)

    private mutating func add(_ text: String) {
        let id = fieldLength.count
        let tokens = Self.tokenize(text)
        // `new Set(tokens).size`: raw tokens, before processing, compared by code unit.
        let unique = Set(tokens.map { Array($0.utf16) }).count
        // `addFieldLength`: the running mean, as MiniSearch keeps it.
        averageFieldLength = (averageFieldLength * Double(id) + Double(unique)) / Double(id + 1)
        fieldLength.append(unique)
        for token in tokens {
            guard let term = Self.process(token) else { continue }
            let data = root.fetch(term)
            // Documents arrive in order, so a term's last document is this one or an earlier one.
            if data.docs.last == id {
                data.freqs[data.freqs.count - 1] += 1
            } else {
                data.docs.append(id)
                data.freqs.append(1)
            }
        }
    }

    /// `text.split(SPACE_OR_PUNCTUATION)`, `/[\n\r\p{Z}\p{P}]+/u`: a run of
    /// separators is one cut, and a separator at either end leaves an empty
    /// token there.
    static func tokenize(_ text: String) -> [String] {
        var tokens: [String] = []
        var current = String.UnicodeScalarView()
        var inRun = false
        for scalar in text.unicodeScalars {
            if separates(scalar) {
                if !inRun {
                    tokens.append(String(current))
                    current = String.UnicodeScalarView()
                    inRun = true
                }
            } else {
                current.append(scalar)
                inRun = false
            }
        }
        tokens.append(String(current))
        return tokens
    }

    /// `[\n\r\p{Z}\p{P}]`: a newline, a separator (Zs, Zl, Zp) or punctuation
    /// (Pc, Pd, Ps, Pe, Pi, Pf, Po). A tab is neither.
    static func separates(_ scalar: Unicode.Scalar) -> Bool {
        if scalar == "\n" || scalar == "\r" { return true }
        switch scalar.properties.generalCategory {
        case .spaceSeparator, .lineSeparator, .paragraphSeparator,
             .connectorPunctuation, .dashPunctuation, .openPunctuation, .closePunctuation,
             .initialPunctuation, .finalPunctuation, .otherPunctuation:
            return true
        default:
            return false
        }
    }

    /// `processTerm`: `term.toLowerCase()`, and an empty term is none.
    static func process(_ token: String) -> [UInt16]? {
        let term = Array(token.lowercased().utf16)
        return term.isEmpty ? nil : term
    }

    // MARK: Searching (MiniSearch `search`, `executeQuery`, `executeQuerySpec`)

    /// The messages matching every term of `query`, best first.
    func search(_ query: String) -> [Result] {
        let terms = Self.tokenize(query).compactMap(Self.process)
        guard var combined = terms.first.map(spec) else { return [] }
        // `combineResults(results, "AND")`: `results.reduce(combinators.and)`.
        for term in terms.dropFirst() {
            let next = spec(term)
            var both = Hits()
            for doc in next.order {
                guard let existing = combined.hits[doc], let other = next.hits[doc] else { continue }
                var hit = existing
                hit.score = existing.score + other.score
                for term in other.queryTerms where !hit.queryTerms.contains(term) { hit.queryTerms.append(term) }
                hit.matched.formUnion(other.matched)
                both.insert(doc, hit)
            }
            combined = both
        }
        // The score times how many of the query's terms the message matched.
        // Equal scores keep the newer first, as the dashboard's SentIndex
        // sorts them: documents are added newest first, so the lower index.
        let results = combined.order.compactMap { doc -> Result? in
            guard let hit = combined.hits[doc] else { return nil }
            let quality = Double(max(1, hit.queryTerms.count))
            return Result(index: doc, score: hit.score * quality, terms: hit.matched)
        }
        return results.sorted { $0.score != $1.score ? $0.score > $1.score : $0.index < $1.index }
    }

    /// One document's hit, as `RawResult` holds it.
    private struct Hit {
        var score: Double
        var queryTerms: [[UInt16]]
        var matched: Set<[UInt16]>
    }

    /// `RawResult`: a `Map` from document to hit, in insertion order.
    private struct Hits {
        var order: [Int] = []
        var hits: [Int: Hit] = [:]

        mutating func insert(_ doc: Int, _ hit: Hit) {
            if hits[doc] == nil { order.append(doc) }
            hits[doc] = hit
        }
    }

    /// `executeQuerySpec` for one processed query term: its exact match,
    /// then every longer term it begins, then every term within its edit
    /// distance that is not one of those.
    private func spec(_ term: [UInt16]) -> Hits {
        var results = Hits()
        if let data = root.get(term) {
            termResults(term, derived: term, weight: 1, data: data, into: &results)
        }
        let prefixed = root.atPrefix(term)
        let maxDistance = min(Self.maxFuzzy, Int((Double(term.count) * Self.fuzziness).rounded(.toNearestOrAwayFromZero)))
        var fuzzy = maxDistance > 0 ? root.fuzzy(term, maxDistance: maxDistance) : []
        for (found, data) in prefixed {
            let distance = found.count - term.count
            if distance == 0 { continue }
            // A term that is both is always scored as a prefix match.
            fuzzy.removeAll { $0.term == found }
            let weight = Self.prefixWeight * Double(found.count) / (Double(found.count) + 0.3 * Double(distance))
            termResults(term, derived: found, weight: weight, data: data, into: &results)
        }
        for (found, data, distance) in fuzzy where distance != 0 {
            let weight = Self.fuzzyWeight * Double(found.count) / (Double(found.count) + Double(distance))
            termResults(term, derived: found, weight: weight, data: data, into: &results)
        }
        return results
    }

    /// `termResults`: each document holding `derived`, scored by BM25+ and
    /// weighted, added to what the query term has already found.
    private func termResults(_ source: [UInt16], derived: [UInt16], weight: Double, data: TermData, into results: inout Hits) {
        let matching = data.docs.count
        for (doc, freq) in zip(data.docs, data.freqs) {
            let score = weight * Self.bm25(freq: Double(freq), matching: Double(matching), total: Double(documentCount),
                                           length: Double(fieldLength[doc]), average: averageFieldLength)
            if var hit = results.hits[doc] {
                hit.score += score
                if !hit.queryTerms.contains(source) { hit.queryTerms.append(source) }
                hit.matched.insert(derived)
                results.hits[doc] = hit
            } else {
                results.insert(doc, Hit(score: score, queryTerms: [source], matched: [derived]))
            }
        }
    }

    /// `calcBM25Score`, operation for operation.
    private static func bm25(freq: Double, matching: Double, total: Double, length: Double, average: Double) -> Double {
        let idf = log(1 + (total - matching + 0.5) / (matching + 0.5))
        return idf * (d + freq * (k + 1) / (freq + k * (1 - b + b * length / average)))
    }
}

// MARK: The radix tree (SearchableMap)

/// The documents a term is in, and how often, in the order they joined.
private final class TermData {
    var docs: [Int] = []
    var freqs: [Int] = []
}

/// One node of `SearchableMap`'s radix tree: a JavaScript `Map` from edge
/// labels to child nodes, with the leaf (the empty label) among them, all in
/// insertion order. Setting a label already there keeps its place; a new
/// label goes last.
private final class Node {
    struct Entry {
        let key: [UInt16]
        var child: Node?
        var data: TermData?
    }

    var entries: [Entry] = []

    private func index(of key: [UInt16]) -> Int? {
        entries.firstIndex { $0.key == key }
    }

    func set(_ key: [UInt16], child: Node) {
        if let at = index(of: key) { entries[at].child = child } else { entries.append(Entry(key: key, child: child, data: nil)) }
    }

    func delete(_ key: [UInt16]) {
        if let at = index(of: key) { entries.remove(at: at) }
    }

    var leaf: TermData? {
        entries.first { $0.key.isEmpty }?.data
    }

    /// `fetch(key, createMap)`: the term's data, made where it is not.
    func fetch(_ key: [UInt16]) -> TermData {
        let node = createPath(key)
        if let data = node.leaf { return data }
        let data = TermData()
        node.entries.append(Entry(key: [], child: nil, data: data))
        return data
    }

    func get(_ key: [UInt16]) -> TermData? {
        lookup(key[...])?.leaf
    }

    private func lookup(_ key: ArraySlice<UInt16>) -> Node? {
        if key.isEmpty { return self }
        for entry in entries where !entry.key.isEmpty && key.starts(with: entry.key) {
            return entry.child?.lookup(key.dropFirst(entry.key.count))
        }
        return nil
    }

    /// `createPath`: the node for `key`, splitting an edge where the key
    /// leaves it (the split edge is set before the old one is deleted, so
    /// it goes last).
    private func createPath(_ key: [UInt16]) -> Node {
        var node = self
        var pos = 0
        outer: while pos < key.count {
            for entry in node.entries where !entry.key.isEmpty && key[pos] == entry.key[0] {
                let edge = entry.key
                let length = min(key.count - pos, edge.count)
                var offset = 1
                while offset < length, key[pos + offset] == edge[offset] { offset += 1 }
                guard let child = entry.child else { break outer }
                if offset == edge.count {
                    node = child
                } else {
                    let intermediate = Node()
                    intermediate.set(Array(edge[offset...]), child: child)
                    node.set(Array(key[pos ..< pos + offset]), child: intermediate)
                    node.delete(edge)
                    node = intermediate
                }
                pos += offset
                continue outer
            }
            let child = Node()
            node.set(Array(key[pos...]), child: child)
            return child
        }
        return node
    }

    /// `atPrefix(prefix).entries()`: every term that begins with `prefix`,
    /// in `TreeIterator`'s order, which takes each node's labels last first.
    func atPrefix(_ prefix: [UInt16]) -> [(term: [UInt16], data: TermData)] {
        // `trackDown`: the node the prefix ends at, or the edge it ends inside.
        var node = self
        var rest = prefix[...]
        var start: Node?
        var startPrefix = prefix
        while true {
            if rest.isEmpty { start = node; break }
            if let entry = node.entries.first(where: { !$0.key.isEmpty && rest.starts(with: $0.key) }), let child = entry.child {
                rest = rest.dropFirst(entry.key.count)
                node = child
                continue
            }
            // Inside an edge: a tree of that one edge, past the prefix's part of it.
            if let entry = node.entries.first(where: { !$0.key.isEmpty && $0.key.starts(with: rest) }), let child = entry.child {
                let synthetic = Node()
                synthetic.set(Array(entry.key.dropFirst(rest.count)), child: child)
                start = synthetic
                startPrefix = prefix
            }
            break
        }
        guard let start else { return [] }
        var out: [(term: [UInt16], data: TermData)] = []
        start.walk(startPrefix, into: &out)
        return out
    }

    /// `TreeIterator`: depth first, each node's labels from its last to its first.
    private func walk(_ prefix: [UInt16], into out: inout [(term: [UInt16], data: TermData)]) {
        for entry in entries.reversed() {
            if entry.key.isEmpty {
                if let data = entry.data { out.append((prefix, data)) }
            } else if let child = entry.child {
                child.walk(prefix + entry.key, into: &out)
            }
        }
    }

    /// `fuzzySearch`: every term within `maxDistance` edits of `query`, with
    /// its distance, found by keeping one Levenshtein matrix for the walk
    /// (Steve Hanov's method), in the tree's own label order. The matrix and
    /// its band are MiniSearch's to the cell, its unread cells included.
    func fuzzy(_ query: [UInt16], maxDistance: Int) -> [(term: [UInt16], data: TermData, distance: Int)] {
        let n = query.count + 1
        let m = n + maxDistance
        var matrix = [UInt8](repeating: UInt8(truncatingIfNeeded: maxDistance + 1), count: m * n)
        for j in 0 ..< n { matrix[j] = UInt8(truncatingIfNeeded: j) }
        for i in 1 ..< m { matrix[i * n] = UInt8(truncatingIfNeeded: i) }
        var out: [(term: [UInt16], data: TermData, distance: Int)] = []
        recurse(query, maxDistance, &matrix, 1, n, [], &out)
        return out
    }

    private func recurse(_ query: [UInt16], _ maxDistance: Int, _ matrix: inout [UInt8], _ m: Int, _ n: Int,
                         _ prefix: [UInt16], _ out: inout [(term: [UInt16], data: TermData, distance: Int)]) {
        let offset = m * n
        entries: for entry in entries {
            if entry.key.isEmpty {
                // A row past the matrix reads `undefined`, which is no distance at all.
                guard offset - 1 < matrix.count, let data = entry.data else { continue }
                let distance = Int(matrix[offset - 1])
                if distance <= maxDistance { out.append((prefix, data, distance)) }
                continue
            }
            var i = m
            for char in entry.key {
                let thisRow = n * i
                let prevRow = thisRow - n
                // Past the matrix the first column reads `undefined`: never more than the limit.
                guard thisRow < matrix.count else {
                    i += 1
                    continue
                }
                var minDistance = Int(matrix[thisRow])
                let jmin = max(0, i - maxDistance - 1)
                let jmax = min(n - 1, i + maxDistance)
                var j = jmin
                while j < jmax {
                    let different = char != query[j] ? 1 : 0
                    let rpl = Int(matrix[prevRow + j]) + different
                    let del = Int(matrix[prevRow + j + 1]) + 1
                    let ins = Int(matrix[thisRow + j]) + 1
                    let dist = min(rpl, del, ins)
                    matrix[thisRow + j + 1] = UInt8(truncatingIfNeeded: dist)
                    if dist < minDistance { minDistance = dist }
                    j += 1
                }
                if minDistance > maxDistance { continue entries }
                i += 1
            }
            entry.child?.recurse(query, maxDistance, &matrix, i, n, prefix + entry.key, &out)
        }
    }
}
