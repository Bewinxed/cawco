import AppKit
import ApplicationServices
import CryptoKit

/// A window shown by a process of the OS itself, as the Accessibility API reads it.
struct Dialog {
  let hostPID: pid_t
  let hostName: String
  let window: AXUIElement
  /// The window title and every static text, text area and text field value.
  let texts: [String]
  let buttons: [(title: String, element: AXUIElement)]
  /// A password field anywhere in the window.
  let hasSecureField: Bool

  /// One press per fingerprint: this window of this process, with this text.
  var fingerprint: String {
    let parts = ["\(hostPID)", "\(CFHash(window))"] + texts + buttons.map(\.title)
    return Self.sha256(parts.joined(separator: "\u{1F}"))
  }

  var textHash: String { Self.sha256(texts.joined(separator: "\u{1F}")) }

  /// Whether one of its texts begins with the prompt's exact first sentence.
  func shows(_ sentence: String) -> Bool {
    texts.contains { $0.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix(sentence) }
  }

  /// Whether it names the subject at all, quoted or not: what a refusal may
  /// describe, so a prompt worded differently still shows up.
  func mentions(_ name: String) -> Bool {
    texts.contains { $0.contains(name) }
  }

  /// A forbidden word anywhere in the window, if there is one.
  var forbiddenWord: String? {
    let lowered = texts.map { $0.lowercased() }
    return Allowlist.forbidden.first { word in lowered.contains { $0.contains(word) } }
  }

  /// The grant button, when the buttons are exactly one known pair.
  var grantButton: (title: String, element: AXUIElement)? {
    let titles = buttons.map { Self.normalized($0.title) }
    guard titles.count == 2 else { return nil }
    for pair in Allowlist.buttonPairs where Set(titles) == [pair.refuse, pair.grant] {
      return buttons.first { Self.normalized($0.title) == pair.grant }
    }
    return nil
  }

  var described: [String: Any] {
    [
      "host": hostName, "host_pid": Int(hostPID), "texts": texts,
      "buttons": buttons.map(\.title), "secure_field": hasSecureField,
    ]
  }

  /// Button titles use a typographic apostrophe ("Don’t Allow").
  private static func normalized(_ title: String) -> String {
    title.replacingOccurrences(of: "’", with: "'").trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private static func sha256(_ text: String) -> String {
    SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
  }
}

/// What one scan saw: the windows read, and for each process of the OS that
/// owns an on-screen window, how many windows Accessibility gave back. A host
/// with on-screen windows and none through Accessibility is the "empty AX
/// tree" case.
struct Scan {
  let dialogs: [Dialog]
  let hosts: [[String: Any]]
}

enum Dialogs {
  /// Ceiling on the elements read per window, and on nesting depth.
  private static let elementBudget = 400
  private static let maximumDepth = 10
  /// A window's title-bar buttons: part of the frame, not of the prompt.
  private static let chrome: Set<String> = [
    kAXCloseButtonSubrole, kAXMinimizeButtonSubrole, kAXZoomButtonSubrole, kAXFullScreenButtonSubrole,
  ]

  /// Whether this login session's screen is locked. While it is, macOS keeps
  /// its prompts off screen, so there is nothing to read or press.
  static var screenLocked: Bool {
    let session = CGSessionCopyCurrentDictionary() as? [String: Any]
    return session?["CGSSessionScreenIsLocked"] as? Bool ?? false
  }

  /// Reads the windows of every OS process that owns an on-screen window and
  /// is not a regular app, or only of `pids` when given. Needs Accessibility trust.
  static func scan(pids only: Set<pid_t>? = nil) -> Scan {
    // Any one Accessibility call waits at most this long for a busy app.
    AXUIElementSetMessagingTimeout(AXUIElementCreateSystemWide(), 1.0)
    var dialogs: [Dialog] = []
    var hosts: [[String: Any]] = []
    for owner in onScreenOwners() where only?.contains(owner.pid) ?? true {
      guard owner.pid != getpid() else { continue }
      // A consent prompt is hosted by an agent of the OS, never by a regular
      // app with a Dock icon; those (Messages, Notes, …) hold the user's own
      // content and are not read.
      guard NSRunningApplication(processIdentifier: owner.pid)?.activationPolicy != .regular else { continue }
      guard case .satisfied = Signing.check(.pid(owner.pid), against: Signing.apple) else { continue }
      let application = AXUIElementCreateApplication(owner.pid)
      let windows: [AXUIElement] = value(application, kAXWindowsAttribute) ?? []
      hosts.append([
        "owner": owner.name, "pid": Int(owner.pid), "top_layer": owner.topLayer,
        "onscreen_windows": owner.windows, "ax_windows": windows.count,
      ])
      for window in windows {
        dialogs.append(read(window, hostPID: owner.pid, hostName: owner.name))
      }
    }
    return Scan(dialogs: dialogs, hosts: hosts)
  }

  private struct Owner {
    let pid: pid_t
    let name: String
    var windows: Int
    var topLayer: Int
  }

  /// Owners of on-screen windows. Owner pid and name need no Screen Recording
  /// permission; window titles would, and are not read here.
  private static func onScreenOwners() -> [Owner] {
    let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
    let list = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] ?? []
    var owners: [pid_t: Owner] = [:]
    for entry in list {
      guard let pid = (entry[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value else { continue }
      let layer = (entry[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0
      let name = entry[kCGWindowOwnerName as String] as? String ?? "?"
      var owner = owners[pid] ?? Owner(pid: pid, name: name, windows: 0, topLayer: layer)
      owner.windows += 1
      owner.topLayer = max(owner.topLayer, layer)
      owners[pid] = owner
    }
    return owners.values.sorted { $0.topLayer > $1.topLayer }
  }

  private static func read(_ window: AXUIElement, hostPID: pid_t, hostName: String) -> Dialog {
    var texts: [String] = []
    if let title: String = value(window, kAXTitleAttribute), !title.isEmpty { texts.append(title) }
    var buttons: [(title: String, element: AXUIElement)] = []
    var secure = false
    var budget = elementBudget
    walk(window, depth: 0, budget: &budget, texts: &texts, buttons: &buttons, secure: &secure)
    return Dialog(
      hostPID: hostPID, hostName: hostName, window: window, texts: texts, buttons: buttons, hasSecureField: secure)
  }

  private static func walk(
    _ element: AXUIElement, depth: Int, budget: inout Int,
    texts: inout [String], buttons: inout [(title: String, element: AXUIElement)], secure: inout Bool
  ) {
    guard depth <= maximumDepth, budget > 0 else { return }
    budget -= 1
    let role: String? = value(element, kAXRoleAttribute)
    let subrole: String? = value(element, kAXSubroleAttribute)
    if subrole == kAXSecureTextFieldSubrole {
      secure = true
    } else if role == kAXStaticTextRole || role == kAXTextAreaRole || role == kAXTextFieldRole {
      if let text: String = value(element, kAXValueAttribute), !text.isEmpty { texts.append(text) }
    } else if role == kAXButtonRole, !chrome.contains(subrole ?? "") {
      // Every button counts, labelled or not, so an extra one fails the pair check.
      let title: String? = value(element, kAXTitleAttribute)
      let description: String? = value(element, kAXDescriptionAttribute)
      let label = [title, description].compactMap { $0 }.first { !$0.isEmpty } ?? ""
      buttons.append((label, element))
    }
    let children: [AXUIElement] = value(element, kAXChildrenAttribute) ?? []
    for child in children {
      walk(child, depth: depth + 1, budget: &budget, texts: &texts, buttons: &buttons, secure: &secure)
    }
  }

  private static func value<T>(_ element: AXUIElement, _ attribute: String) -> T? {
    var raw: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute as CFString, &raw) == .success, let raw else { return nil }
    return raw as? T
  }
}
