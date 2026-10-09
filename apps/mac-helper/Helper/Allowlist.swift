import AppKit
import Darwin

/// Everything the helper may ever approve, compiled in. The policy file can
/// only switch entries of this list on; it cannot widen it.
///
/// Never approved, whatever the policy says: Accessibility, Screen Recording,
/// Input Monitoring, Full Disk Access, Developer Tools, any password or
/// Touch ID sheet, and any prompt whose subject is not a CawCo identity.
nonisolated enum Allowlist {
  /// How a CawCo identity shows up as the subject of a prompt.
  nonisolated enum Form: Sendable {
    /// A bundled app: macOS names it by its display name.
    case app
    /// A bare executable: macOS names it by its file name.
    case tool(executable: String)
  }

  /// CawCo identities, by code-signing identifier. Each must also carry
  /// CawCo's Developer ID signature (Signing.developerID) when resolved.
  static let subjects: [String: Form] = {
    var subjects: [String: Form] = ["dev.cawco.agent": .tool(executable: "cawco")]
    #if DEBUG
    // The throwaway probe app that tests one press on the owner's Mac.
    subjects["dev.cawco.probe"] = .app
    #endif
    return subjects
  }()

  /// Apps CawCo may ask to control with Apple Events.
  static let automationTargets: Set<String> = ["com.apple.dt.Xcode", "com.apple.iphonesimulator"]

  /// Folders CawCo may ask to read, with the TCC service each one's grant is recorded under.
  static let folders: [String: String] = [
    "Documents": "kTCCServiceSystemPolicyDocumentsFolder",
    "Desktop": "kTCCServiceSystemPolicyDesktopFolder",
    "Downloads": "kTCCServiceSystemPolicyDownloadsFolder",
  ]

  /// The two button sets a consent alert of these families shows, refusal
  /// first. The grant is the second; a refusal or a neutral button is never pressed.
  static let buttonPairs: [(refuse: String, grant: String)] = [
    ("Don't Allow", "Allow"),
    ("Don't Allow", "OK"),
  ]

  /// Words that mark a prompt the helper must never press, matched
  /// case-insensitively against every text in the window.
  static let forbidden = [
    "accessibility", "screen recording", "record this computer", "input monitoring",
    "keystrokes", "full disk access", "developer tool", "password", "touch id",
    "control this computer", "administrator",
  ]
}

/// A request checked against the allowlist and resolved against what is
/// running: the names the prompt must show, and where its grant is recorded.
struct Rule {
  let ask: Ask
  /// The subject's name as the prompt shows it.
  let subjectName: String
  /// The target's name as the prompt shows it: the app's or the folder's.
  let targetName: String
  /// The TCC service the grant is recorded under.
  let service: String
  /// What TCC records the grant's subject as: a bundle id for an app, the
  /// executable's path for a bare tool.
  let recordedAs: [String]

  /// The prompt's first sentence, exactly, with the curly quotes macOS uses.
  var sentence: String {
    switch ask.kind {
    case .automation: "“\(subjectName)” wants access to control “\(targetName)”."
    case .files: "“\(subjectName)” would like to access files in your \(targetName) folder."
    }
  }

  static func make(_ ask: Ask) -> Result<Rule, Refusal> {
    guard let form = Allowlist.subjects[ask.subject] else {
      return .failure(Refusal("\(ask.subject) is not a CawCo identity"))
    }
    let subject: (name: String, recordedAs: [String])
    switch resolveSubject(ask.subject, form: form) {
    case .success(let resolved): subject = resolved
    case .failure(let refusal): return .failure(refusal)
    }
    switch ask.kind {
    case .automation:
      guard Allowlist.automationTargets.contains(ask.target) else {
        return .failure(Refusal("\(ask.target) is not an app CawCo may control"))
      }
      // "The target must refer to an already running application": a prompt
      // for an app that is not running cannot be pending.
      guard let target = NSRunningApplication.runningApplications(withBundleIdentifier: ask.target).first,
        let targetName = target.localizedName
      else { return .failure(Refusal("\(ask.target) is not running")) }
      return .success(
        Rule(
          ask: ask, subjectName: subject.name, targetName: targetName, service: "kTCCServiceAppleEvents",
          recordedAs: subject.recordedAs))
    case .files:
      guard let service = Allowlist.folders[ask.target] else {
        return .failure(Refusal("\(ask.target) is not a folder CawCo may read"))
      }
      return .success(
        Rule(
          ask: ask, subjectName: subject.name, targetName: ask.target, service: service,
          recordedAs: subject.recordedAs))
    }
  }

  /// The subject's displayed name, once every running process that carries
  /// its identifier is proven to be CawCo's signed code, and no other running
  /// app shows the same name (an impostor would make the prompt ambiguous).
  private static func resolveSubject(
    _ identifier: String, form: Allowlist.Form
  ) -> Result<(name: String, recordedAs: [String]), Refusal> {
    let requirement = Signing.developerID(identifier)
    let name: String
    let pids: [pid_t]
    let recordedAs: [String]
    switch form {
    case .app:
      let apps = NSRunningApplication.runningApplications(withBundleIdentifier: identifier)
      let names = Set(apps.compactMap(\.localizedName))
      guard !apps.isEmpty else { return .failure(Refusal("\(identifier) is not running")) }
      guard names.count == 1, let only = names.first else {
        return .failure(Refusal("\(identifier) runs under several names: \(names.sorted())"))
      }
      name = only
      pids = apps.map(\.processIdentifier)
      recordedAs = [identifier]
    case .tool(let executable):
      let paths = Processes.all().compactMap { pid in Processes.path(pid).map { (pid, $0) } }
        .filter { ($0.1 as NSString).lastPathComponent == executable }
      guard !paths.isEmpty else { return .failure(Refusal("no \(executable) process is running")) }
      name = executable
      pids = paths.map(\.0)
      recordedAs = Array(Set(paths.map(\.1))).sorted()
    }
    for pid in pids {
      if case .unsatisfied(let why) = Signing.check(.pid(pid), against: requirement) {
        return .failure(Refusal("pid \(pid) shows as \(name) but is not CawCo's signed code: \(why)"))
      }
    }
    let impostors = NSWorkspace.shared.runningApplications.filter {
      $0.localizedName == name && !pids.contains($0.processIdentifier)
    }
    guard impostors.isEmpty else {
      let described = impostors.map { "\($0.bundleIdentifier ?? "no bundle id") pid \($0.processIdentifier)" }
      return .failure(Refusal("other apps also show the name \(name): \(described)"))
    }
    return .success((name, recordedAs))
  }
}

nonisolated struct Refusal: Error, Sendable {
  let reason: String
  init(_ reason: String) { self.reason = reason }
}

/// Which allowlist entries the owner has switched on, from
/// `~/.cawco/helper-policy.json`:
/// `{"approve":[{"kind":"automation","subject":"dev.cawco.agent","target":"com.apple.dt.Xcode"}]}`.
/// No file, an unreadable file, or a file anyone but this user could have
/// written means notify-only: nothing is pressed.
nonisolated struct Policy: Sendable {
  let entries: Set<Ask>

  func approves(_ ask: Ask) -> Bool { entries.contains(ask) }

  var described: [[String: String]] {
    entries.sorted { ($0.kind.rawValue, $0.subject, $0.target) < ($1.kind.rawValue, $1.subject, $1.target) }
      .map { ["kind": $0.kind.rawValue, "subject": $0.subject, "target": $0.target] }
  }

  static func load() -> Policy {
    let path = Paths.policy
    var info = stat()
    guard lstat(path, &info) == 0 else { return Policy(entries: []) }
    guard (info.st_mode & S_IFMT) == S_IFREG, info.st_uid == getuid(), info.st_mode & 0o022 == 0 else {
      log.error("ignoring \(path, privacy: .public): not a regular file owned by this user and writable only by it")
      return Policy(entries: [])
    }
    nonisolated struct File: Decodable {
      nonisolated struct Entry: Decodable {
        let kind: Kind
        let subject: String
        let target: String
      }
      let approve: [Entry]
    }
    guard let data = FileManager.default.contents(atPath: path),
      let file = try? JSONDecoder().decode(File.self, from: data)
    else {
      log.error("ignoring \(path, privacy: .public): not {\"approve\":[{kind, subject, target}]}")
      return Policy(entries: [])
    }
    var entries: Set<Ask> = []
    for entry in file.approve {
      let ask = Ask(kind: entry.kind, subject: entry.subject, target: entry.target)
      let inside: Bool =
        switch entry.kind {
        case .automation: Allowlist.automationTargets.contains(entry.target)
        case .files: Allowlist.folders[entry.target] != nil
        }
      if inside, Allowlist.subjects[entry.subject] != nil {
        entries.insert(ask)
      } else {
        log.error("policy entry outside the allowlist, ignored: \(entry.kind.rawValue, privacy: .public) \(entry.subject, privacy: .public) → \(entry.target, privacy: .public)")
      }
    }
    return Policy(entries: entries)
  }
}

/// The process table, for subjects that are bare executables.
nonisolated enum Processes {
  static func all() -> [pid_t] {
    let count = proc_listallpids(nil, 0)
    guard count > 0 else { return [] }
    var pids = [pid_t](repeating: 0, count: Int(count) + 64)
    let filled = proc_listallpids(&pids, Int32(pids.count * MemoryLayout<pid_t>.size))
    guard filled > 0 else { return [] }
    return Array(pids.prefix(Int(filled))).filter { $0 > 0 }
  }

  static func path(_ pid: pid_t) -> String? {
    var buffer = [UInt8](repeating: 0, count: 4 * Int(MAXPATHLEN))
    // The path's length in bytes, without the terminating NUL.
    let length = proc_pidpath(pid, &buffer, UInt32(buffer.count))
    guard length > 0 else { return nil }
    return String(decoding: buffer.prefix(Int(length)), as: UTF8.self)
  }
}
