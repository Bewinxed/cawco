import Foundation

/// The four verbs the helper answers, and nothing else. There is no generic
/// click: a compromised agent can only ask for an approval the allowlist
/// already describes.
nonisolated enum Verb: String, Decodable, Sendable {
  case status
  case requestAccessibility = "request_accessibility"
  case approvePending = "approve_pending"
  case verify
}

/// The prompt families the helper may ever approve.
nonisolated enum Kind: String, Codable, Sendable {
  /// "“S” wants access to control “T”." (kTCCServiceAppleEvents)
  case automation
  /// "“S” would like to access files in your F folder." (Files & Folders)
  case files
}

/// What the agent expects to be pending: the prompt's kind, the subject's
/// code-signing identifier, and the target (an app's bundle id for
/// Automation, a folder name for Files & Folders).
nonisolated struct Ask: Sendable, Hashable {
  let kind: Kind
  let subject: String
  let target: String
}

/// One request: a single line of JSON, for example
/// `{"verb":"approve_pending","kind":"automation","expected_subject":"dev.cawco.agent","expected_target":"com.apple.dt.Xcode"}`.
nonisolated struct Request: Decodable, Sendable {
  let verb: Verb
  let kind: Kind?
  let expectedSubject: String?
  let expectedTarget: String?
  /// For `verify`: the Unix time from which the unified log is read.
  let since: Double?

  enum CodingKeys: String, CodingKey {
    case verb, kind, since
    case expectedSubject = "expected_subject"
    case expectedTarget = "expected_target"
  }

  var ask: Ask? {
    guard let kind, let expectedSubject, let expectedTarget else { return nil }
    return Ask(kind: kind, subject: expectedSubject, target: expectedTarget)
  }
}

/// A value for a reply field: JSON null when absent.
func orNull(_ value: String?) -> Any {
  if let value { return value }
  return NSNull()
}

/// One reply: a single line of JSON with `ok` and the verb's fields.
struct Reply {
  let body: [String: Any]

  static func ok(_ fields: [String: Any] = [:]) -> Reply {
    Reply(body: fields.merging(["ok": true]) { _, new in new })
  }

  static func failure(_ error: String, _ fields: [String: Any] = [:]) -> Reply {
    Reply(body: fields.merging(["ok": false, "error": error]) { _, new in new })
  }

  var line: Data {
    let json = (try? JSONSerialization.data(withJSONObject: body, options: [.sortedKeys]))
      ?? Data(#"{"ok":false,"error":"reply could not be encoded"}"#.utf8)
    return json + Data("\n".utf8)
  }
}
