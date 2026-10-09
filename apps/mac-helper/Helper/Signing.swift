import Foundation
import Security

/// A running process to check, named the way the Security framework accepts it.
nonisolated enum Guest: Sendable {
  /// From a socket peer (LOCAL_PEERTOKEN): immune to pid reuse.
  case auditToken(audit_token_t)
  /// From a process list (NSRunningApplication, proc_listallpids, CGWindowList).
  case pid(pid_t)
}

/// Code requirements and the checks against them.
nonisolated enum Signing {
  /// Petra Solutions LLC, the team that signs everything CawCo ships.
  static let team = "FN5LJSPX2R"

  /// The designated requirement codesign gives Developer ID Application code:
  /// Apple's anchor, the Developer ID intermediate (6.2.6), a Developer ID leaf
  /// (6.1.13), and our team as the leaf's OU. A grant or a check keyed on it
  /// survives every rebuild, because the cdhash is not part of it.
  static func developerID(_ identifier: String) -> String {
    #"identifier "\#(identifier)" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] and certificate leaf[field.1.2.840.113635.100.6.1.13] and certificate leaf[subject.OU] = "\#(team)""#
  }

  /// Code Apple ships in the OS itself: the only processes whose windows the
  /// helper reads as a system prompt.
  static let apple = "anchor apple"

  nonisolated enum Verdict: Sendable {
    case satisfied
    /// Why not, with what the code actually is, for the log.
    case unsatisfied(String)
  }

  static func check(_ guest: Guest, against requirement: String) -> Verdict {
    var parsed: SecRequirement?
    let made = SecRequirementCreateWithString(requirement as CFString, [], &parsed)
    guard made == errSecSuccess, let parsed else {
      return .unsatisfied("requirement does not parse (\(made)): \(requirement)")
    }
    let code: SecCode
    switch self.code(guest) {
    case .success(let found): code = found
    case .failure(let reason): return .unsatisfied(reason.description)
    }
    let status = SecCodeCheckValidity(code, [], parsed)
    if status == errSecSuccess { return .satisfied }
    return .unsatisfied("\(describe(code)) fails the requirement (\(status))")
  }

  /// The signing identifier, team and executable, for logs and refusals.
  static func describe(_ guest: Guest) -> String {
    switch code(guest) {
    case .success(let code): describe(code)
    case .failure(let reason): reason.description
    }
  }

  private static func code(_ guest: Guest) -> Result<SecCode, Failure> {
    let attributes: [CFString: Any]
    switch guest {
    case .auditToken(var token):
      let data = Data(bytes: &token, count: MemoryLayout<audit_token_t>.size)
      attributes = [kSecGuestAttributeAudit: data]
    case .pid(let pid):
      attributes = [kSecGuestAttributePid: NSNumber(value: pid)]
    }
    var code: SecCode?
    let status = SecCodeCopyGuestWithAttributes(nil, attributes as CFDictionary, [], &code)
    guard status == errSecSuccess, let code else {
      return .failure(Failure("no code for \(guest) (\(status))"))
    }
    return .success(code)
  }

  private static func describe(_ code: SecCode) -> String {
    var staticCode: SecStaticCode?
    guard SecCodeCopyStaticCode(code, [], &staticCode) == errSecSuccess, let staticCode else {
      return "code with no static signature"
    }
    var info: CFDictionary?
    let flags = SecCSFlags(rawValue: kSecCSSigningInformation)
    guard SecCodeCopySigningInformation(staticCode, flags, &info) == errSecSuccess,
      let info = info as? [String: Any]
    else { return "code with unreadable signing information" }
    let identifier = info[kSecCodeInfoIdentifier as String] as? String ?? "unsigned"
    let team = info[kSecCodeInfoTeamIdentifier as String] as? String ?? "no team"
    let path = (info[kSecCodeInfoMainExecutable as String] as? URL)?.path ?? "?"
    return "\(identifier) (team \(team), \(path))"
  }

  nonisolated struct Failure: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
  }
}
