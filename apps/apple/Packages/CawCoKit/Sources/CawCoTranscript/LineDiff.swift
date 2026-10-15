/// Lines and the line diff of two texts, as a diff draws them: the native
/// copy of packages/core/src/line-diff.ts, so a tool row's "+2 −1" counts
/// exactly the rows DiffView draws.
///
/// A line keeps its terminator. A trailing newline therefore ends the last
/// line rather than opening an empty one ("a\nb\n" is two lines, as "a\nb"
/// is), and a last line without one differs from the same line with one.
/// Pure data work, so it is nonisolated: ToolDescriptor reads it off the main actor.
nonisolated enum LineDiff {
    enum Step {
        case context(old: Int, new: Int)
        case deletion(old: Int)
        case addition(new: Int)
    }

    /// Past this many cells the line table is not built: every line on each side counts as changed.
    static let tableCap = 4_000_000

    /// A text's lines, each with its newline when it has one. Split on the
    /// scalar, so a "\r\n" (one Character) still ends its line.
    static func lines(_ text: String) -> [String] {
        let scalars = text.unicodeScalars
        var lines: [String] = []
        var start = scalars.startIndex
        while start < scalars.endIndex {
            guard let newline = scalars[start...].firstIndex(of: "\n") else {
                lines.append(String(scalars[start...]))
                break
            }
            let end = scalars.index(after: newline)
            lines.append(String(scalars[start ..< end]))
            start = end
        }
        return lines
    }

    /// The line script from `a` to `b`: an LCS over the lines between the
    /// common head and tail. On a tie the old line goes first, as
    /// @pierre/diffs orders a replacement: what was there, then what replaces it.
    static func script(_ a: [String], _ b: [String]) -> [Step] {
        var head = 0
        while head < a.count, head < b.count, a[head] == b[head] { head += 1 }
        var tail = 0
        while tail < a.count - head, tail < b.count - head, a[a.count - 1 - tail] == b[b.count - 1 - tail] { tail += 1 }
        let n = a.count - head - tail, m = b.count - head - tail
        var steps: [Step] = (0 ..< head).map { Step.context(old: $0, new: $0) }
        if n * m > tableCap || n == 0 || m == 0 {
            steps += (0 ..< n).map { Step.deletion(old: head + $0) }
            steps += (0 ..< m).map { Step.addition(new: head + $0) }
        } else {
            var table = [[Int32]](repeating: [Int32](repeating: 0, count: m + 1), count: n + 1)
            for i in stride(from: n - 1, through: 0, by: -1) {
                for j in stride(from: m - 1, through: 0, by: -1) {
                    table[i][j] = a[head + i] == b[head + j] ? table[i + 1][j + 1] + 1 : max(table[i + 1][j], table[i][j + 1])
                }
            }
            var i = 0, j = 0
            while i < n || j < m {
                if i < n, j < m, a[head + i] == b[head + j] {
                    steps.append(.context(old: head + i, new: head + j)); i += 1; j += 1
                } else if i < n, j == m || table[i + 1][j] >= table[i][j + 1] {
                    steps.append(.deletion(old: head + i)); i += 1
                } else {
                    steps.append(.addition(new: head + j)); j += 1
                }
            }
        }
        steps += (0 ..< tail).map { Step.context(old: a.count - tail + $0, new: b.count - tail + $0) }
        return steps
    }

    /// How many lines going from `old` to `new` adds and removes.
    static func counts(old: String, new: String) -> (added: Int, removed: Int) {
        var added = 0, removed = 0
        for step in script(lines(old), lines(new)) {
            switch step {
            case .addition: added += 1
            case .deletion: removed += 1
            case .context: break
            }
        }
        return (added, removed)
    }
}
