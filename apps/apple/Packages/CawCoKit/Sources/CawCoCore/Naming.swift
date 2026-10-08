import Foundation
import CawCoAPI
import OpenAPIRuntime

/// How the fleet names things out loud, as the web says them
/// (packages/core `machineLabel`, `deriveTitleFromFirstMessage`;
/// apps/dashboard links.ts, home.svelte.ts, permission-summary.ts).
public enum Naming {
    private static let localSuffixes = [".local", ".lan", ".home"]

    /// A hostname without its local-network suffix.
    public static func machineLabel(_ hostname: String) -> String {
        let name = hostname.trimmingCharacters(in: .whitespaces)
        if let suffix = localSuffixes.first(where: { name.lowercased().hasSuffix($0) }) {
            return String(name.dropLast(suffix.count))
        }
        return name
    }

    private static let titleLimit = 80

    /// A session's first message as a title: a slash command's echo shows the
    /// command; anything else has its markup stripped and folded onto one line.
    public static func titleFromFirstMessage(_ raw: String) -> String {
        let command = raw.firstMatch(of: /<command-(?:message|name)>([\s\S]*?)<\/command-(?:message|name)>/)
            .map { String($0.output.1).trimmingCharacters(in: .whitespacesAndNewlines) }
        let base = command ?? raw.replacing(/<[^>]+>/, with: " ")
        let cleaned = base.replacing(/\s+/, with: " ").trimmingCharacters(in: .whitespaces)
        return String(cleaned.prefix(titleLimit))
    }

    /// A named title, else the first message, else the folder's leaf, else the id's first eight.
    public static func sessionTitle(title: String?, firstMessage: String? = nil, cwd: String?, id: String?) -> String {
        if let named = title?.trimmingCharacters(in: .whitespacesAndNewlines), !named.isEmpty {
            return named
        }
        if let first = firstMessage?.trimmingCharacters(in: .whitespacesAndNewlines), !first.isEmpty {
            let derived = titleFromFirstMessage(first)
            if !derived.isEmpty {
                return derived
            }
        }
        if let leaf = leaf(cwd) {
            return leaf
        }
        return id.map { String($0.prefix(8)) } ?? "session"
    }

    static func leaf(_ path: String?) -> String? {
        (path ?? "").split(separator: "/").last.map(String.init)
    }

    /// "4m", "1h 12m", "2d": how long, at the grain a glance needs.
    public static func span(ms: Double) -> String {
        let minutes = max(0, Int(floor(ms / 60_000)))
        if minutes < 1 {
            return "now"
        }
        if minutes < 60 {
            return "\(minutes)m"
        }
        let hours = minutes / 60
        if hours < 24 {
            return minutes % 60 == 0 ? "\(hours)h" : "\(hours)h \(minutes % 60)m"
        }
        return "\(hours / 24)d"
    }

    static let askUserQuestion = "AskUserQuestion"

    /// The questions an AskUserQuestion-shaped ask carries, or nil when it is a permission.
    static func questions(_ toolName: String, _ input: [String: (any Sendable)?]) -> [Components.Schemas.UserQuestion]? {
        guard toolName == askUserQuestion, let list = input["questions"] as? [(any Sendable)?], !list.isEmpty else {
            return nil
        }
        guard let value = try? OpenAPIValueContainer(unvalidatedValue: list),
              let bytes = try? Wire.encoder().encode(value),
              let asked = try? Wire.decoder().decode([Components.Schemas.UserQuestion].self, from: bytes) else { return nil }
        return asked
    }
}
