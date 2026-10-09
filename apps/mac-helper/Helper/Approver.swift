import ApplicationServices
import Foundation

/// Approves one pending CawCo prompt the allowlist describes, or explains why not.
///
/// The order is fixed: the ask must be inside the compiled allowlist, its
/// subject must be CawCo's signed code, exactly one OS-hosted window must show
/// the prompt's exact first sentence, with no forbidden word, no password
/// field, and exactly a known button pair. Then the policy must switch the
/// entry on (otherwise notify-only), the dialog must not have been pressed
/// before, and the global rate must allow it. One press, then verification.
final class Approver {
  /// At most one press every 5 s, and 20 in any hour.
  private static let spacing: Duration = .seconds(5)
  private static let hourlyLimit = 20

  private let trust: Trust
  private var busy = false
  private var pressed: Set<String> = []
  private var pressTimes: [ContinuousClock.Instant] = []

  init(trust: Trust) {
    self.trust = trust
  }

  func approve(_ ask: Ask) async -> Reply {
    guard trust.trusted else {
      return .failure("CawCo Helper is not trusted for Accessibility", ["trusted": false])
    }
    // Decisions are serial: a second request while one is verifying waits for the next call.
    guard !busy else { return .failure("another approval is in progress") }
    busy = true
    defer { busy = false }

    let rule: Rule
    switch Rule.make(ask) {
    case .success(let made): rule = made
    case .failure(let refusal): return refuse(ask, refusal.reason)
    }
    guard !Dialogs.screenLocked else {
      return refuse(ask, "the screen is locked: macOS shows no prompt until it is unlocked", ["screen_locked": true])
    }

    let scan = Dialogs.scan()
    let matches = scan.dialogs.filter { $0.shows(rule.sentence) }
    guard matches.count == 1, let dialog = matches.first else {
      let reason =
        matches.isEmpty
        ? "no window of the OS shows \(rule.sentence)"
        : "\(matches.count) windows show \(rule.sentence); an ambiguous prompt is not pressed"
      return refuse(
        ask, reason,
        [
          "expected": rule.sentence,
          "mentioning_subject": scan.dialogs.filter { $0.mentions(rule.subjectName) }.map(\.described),
          "hosts": scan.hosts,
        ])
    }
    if let word = dialog.forbiddenWord {
      return refuse(ask, "the prompt mentions “\(word)”, which is never approved", ["dialog": dialog.described])
    }
    if dialog.hasSecureField {
      return refuse(ask, "the prompt asks for a password", ["dialog": dialog.described])
    }
    guard let grant = dialog.grantButton else {
      return refuse(ask, "the prompt's buttons are not exactly a known pair", ["dialog": dialog.described])
    }
    guard Policy.load().approves(ask) else {
      PressLog.append(record(ask, rule, dialog, event: "notify", ["reason": "notify-only"]))
      return .ok([
        "action": "notify",
        "reason": "notify-only: no policy entry approves \(ask.kind.rawValue) \(ask.subject) → \(ask.target)",
        "dialog": dialog.described,
      ])
    }
    let fingerprint = dialog.fingerprint
    guard !pressed.contains(fingerprint) else {
      return refuse(ask, "this dialog was pressed once already and is still there; not pressing again", ["dialog": dialog.described])
    }
    let now = ContinuousClock.now
    pressTimes.removeAll { now - $0 > .seconds(3600) }
    if let last = pressTimes.last, now - last < Self.spacing {
      return refuse(ask, "rate limit: one press every \(Self.spacing)")
    }
    guard pressTimes.count < Self.hourlyLimit else {
      return refuse(ask, "rate limit: \(Self.hourlyLimit) presses in the last hour")
    }

    // The intent is on disk before the button is touched.
    guard PressLog.append(record(ask, rule, dialog, event: "press", ["button": grant.title])) else {
      return .failure("the press log could not be written; nothing was pressed")
    }
    pressed.insert(fingerprint)
    pressTimes.append(now)
    let pressedAt = Date()
    let result = AXUIElementPerformAction(grant.element, kAXPressAction as CFString)
    log.notice(
      "pressed \(grant.title, privacy: .public) on \(rule.sentence, privacy: .public) in \(dialog.hostName, privacy: .public): AXError \(result.rawValue)"
    )
    guard result == .success else {
      PressLog.append(record(ask, rule, dialog, event: "result", ["ax_result": Int(result.rawValue), "verified": false]))
      return .failure("the press was refused: AXError \(result.rawValue)", ["action": "pressed", "dialog": dialog.described])
    }

    let check = await verifyPress(dialog, rule: rule, since: pressedAt)
    let verified = check.gone && check.created != nil
    PressLog.append(
      record(
        ask, rule, dialog, event: "result",
        [
          "ax_result": Int(result.rawValue), "dialog_gone": check.gone,
          "tcc_create": orNull(check.created), "verified": verified,
        ]))
    let verification: [String: Any] = [
      "dialog_gone": check.gone,
      "tcc_create": orNull(check.created),
      "preflight": "the subject reads its own grant: AEDeterminePermissionToAutomateTarget runs as the code it asks about",
    ]
    let fields: [String: Any] = [
      "action": "pressed", "button": grant.title, "fingerprint": fingerprint, "verification": verification,
    ]
    if verified { return .ok(fields) }
    let why =
      !check.gone
      ? "pressed once, and the dialog is still there: macOS ignored the press; not retrying"
      : "pressed once and the dialog closed, but TCC recorded no grant"
    return .failure(why, fields)
  }

  /// Read-only: whether the prompt is pending, and whether TCC has recorded the grant since `since`.
  func verify(_ ask: Ask, since: Double?) async -> Reply {
    let rule: Rule
    switch Rule.make(ask) {
    case .success(let made): rule = made
    case .failure(let refusal): return .failure(refusal.reason)
    }
    // Unknown (null) until the helper may read other processes' windows.
    let pending: Any
    if trust.trusted {
      pending = Dialogs.scan().dialogs.contains { $0.shows(rule.sentence) }
    } else {
      pending = NSNull()
    }
    let start = since.map { Date(timeIntervalSince1970: $0) } ?? Date().addingTimeInterval(-15 * 60)
    let created = await TCCLog.createEvent(service: rule.service, recordedAs: rule.recordedAs, since: start, wait: .zero)
    return .ok([
      "prompt": rule.sentence,
      "prompt_pending": pending,
      "screen_locked": Dialogs.screenLocked,
      "tcc_create": orNull(created),
      "preflight": "the subject reads its own grant: AEDeterminePermissionToAutomateTarget runs as the code it asks about",
    ])
  }

  /// The dialog is gone (this host no longer shows its sentence), and the
  /// unified log holds TCC's Create event for the subject and service.
  private func verifyPress(_ dialog: Dialog, rule: Rule, since: Date) async -> (gone: Bool, created: String?) {
    var gone = false
    for _ in 0..<20 {
      let host = Dialogs.scan(pids: [dialog.hostPID])
      if !host.dialogs.contains(where: { $0.shows(rule.sentence) }) {
        gone = true
        break
      }
      try? await Task.sleep(for: .milliseconds(250))
    }
    let created = await TCCLog.createEvent(
      service: rule.service, recordedAs: rule.recordedAs, since: since.addingTimeInterval(-2), wait: .seconds(20))
    return (gone, created)
  }

  private func refuse(_ ask: Ask, _ reason: String, _ fields: [String: Any] = [:]) -> Reply {
    log.notice("refused \(ask.kind.rawValue, privacy: .public) \(ask.subject, privacy: .public) → \(ask.target, privacy: .public): \(reason, privacy: .public)")
    PressLog.append([
      "event": "refuse", "kind": ask.kind.rawValue, "subject": ask.subject, "target": ask.target, "reason": reason,
    ])
    return .failure(reason, fields.merging(["action": "refused"]) { _, new in new })
  }

  private func record(_ ask: Ask, _ rule: Rule, _ dialog: Dialog, event: String, _ extra: [String: Any]) -> [String: Any] {
    [
      "event": event, "kind": ask.kind.rawValue, "subject": ask.subject, "target": ask.target,
      "host": dialog.hostName, "host_pid": Int(dialog.hostPID), "fingerprint": dialog.fingerprint,
      "text_sha256": dialog.textHash,
    ].merging(extra) { _, new in new }
  }
}
