import Foundation
import Observation

/// A live list's order, held still (motion/held-order.svelte.ts). Lists sorted
/// by recency re-sort on every pulse; the rule: a row never moves because of
/// ongoing activity.
///
/// - Rows that arrive or leave do so at once, at their computed slot.
/// - A reorder of rows already shown is held until the new order has stood
///   for `settle`, and at most once every `gap`.
/// - Never while the operator's finger is on the list (`holding`); it lands
///   when they let go.
@MainActor
@Observable
final class HeldOrder {
    static let settle = 2000.0
    static let gap = 5000.0

    private struct Held {
        /// The order on screen.
        var shown: [String]
        /// The newest computed order not yet shown, and since when it has stood.
        var pending: String
        var since: Double
        /// When a reorder last landed.
        var committed: Double
    }

    @ObservationIgnored private var lists: [String: Held] = [:]
    @ObservationIgnored private var timers: [String: Task<Void, Never>] = [:]
    /// Bumped when a held reorder falls due, so the lists reading it re-run.
    private var due = 0
    /// The operator's finger is on the list: its order stays.
    var holding = false {
        didSet {
            if oldValue, !holding {
                due += 1
            }
        }
    }

    /// `rows` in the order on screen for the list `key`: the computed order
    /// once it has settled, else the held one with arrivals and departures applied.
    func order<Row>(_ key: String, _ rows: [Row], id: (Row) -> String) -> [Row] {
        let stop = due >= 0 && holding
        let computed = rows.map(id)
        let at = Date.now.timeIntervalSince1970 * 1000
        guard var list = lists[key] else {
            lists[key] = Held(shown: computed, pending: "", since: at, committed: 0)
            return rows
        }
        let present = Set(computed)
        let held = Self.withArrivals(list.shown.filter { present.contains($0) }, computed)
        let target = computed.joined(separator: "\n")
        timers[key]?.cancel()
        if held == computed {
            list.shown = computed
            list.pending = ""
            lists[key] = list
            return rows
        }
        if list.pending != target {
            list.pending = target
            list.since = at
        }
        let ready = max(list.since + Self.settle, list.committed + Self.gap)
        if !stop, at >= ready {
            list.shown = computed
            list.pending = ""
            list.committed = at
            lists[key] = list
            return rows
        }
        if !stop {
            timers[key] = Task { [weak self] in
                try? await Task.sleep(for: .milliseconds(ready - at))
                guard !Task.isCancelled else {
                    return
                }
                self?.due += 1
            }
        }
        list.shown = held
        lists[key] = list
        var byId: [String: Row] = [:]
        for row in rows {
            byId[id(row)] = row
        }
        return held.compactMap { byId[$0] }
    }

    /// Where a row that just arrived goes in the held order: after the row
    /// that precedes it in the computed order, else first.
    private static func withArrivals(_ kept: [String], _ computed: [String]) -> [String] {
        var out = kept
        var present = Set(kept)
        for (at, id) in computed.enumerated() where !present.contains(id) {
            var slot = 0
            for back in stride(from: at - 1, through: 0, by: -1) {
                if let before = out.firstIndex(of: computed[back]) {
                    slot = before + 1
                    break
                }
            }
            out.insert(id, at: slot)
            present.insert(id)
        }
        return out
    }
}
