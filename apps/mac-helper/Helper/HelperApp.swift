import AppKit
import OSLog
import ServiceManagement

/// Diagnostics, readable over ssh with
/// `log show --predicate 'subsystem == "dev.cawco.helper"'`.
nonisolated let log = Logger(subsystem: "dev.cawco.helper", category: "helper")

/// The helper's files, all under the user-only `~/.cawco`.
nonisolated enum Paths {
  static let home = FileManager.default.homeDirectoryForCurrentUser.path
  static let directory = home + "/.cawco"
  static let socket = directory + "/helper.sock"
  static let pressLog = directory + "/helper-presses.log"
  static let policy = directory + "/helper-policy.json"
}

/// An LSUIElement agent app: no Dock icon, no windows. It serves the agent's
/// four verbs on the socket and keeps itself registered as a login item.
@main
final class HelperApp: NSObject, NSApplicationDelegate {
  /// NSApplication holds its delegate weakly; this keeps it for the process's life.
  private static let shared = HelperApp()

  private let trust = Trust()
  private lazy var approver = Approver(trust: trust)
  private var server: Server?

  static func main() {
    let app = NSApplication.shared
    app.delegate = shared
    app.setActivationPolicy(.accessory)
    app.run()
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    do {
      try FileManager.default.createDirectory(
        atPath: Paths.directory, withIntermediateDirectories: true,
        attributes: [.posixPermissions: 0o700])
      let server = try Server(path: Paths.socket) { [unowned self] request, peer in
        await self.handle(request, from: peer)
      }
      self.server = server
    } catch Server.Failure.alreadyServed {
      log.notice("another CawCo Helper already serves \(Paths.socket, privacy: .public); exiting")
      NSApp.terminate(nil)
      return
    } catch {
      log.fault("cannot serve \(Paths.socket, privacy: .public): \(error, privacy: .public)")
      NSApp.terminate(nil)
      return
    }
    LoginItem.ensureRegistered()
    trust.start()
    log.notice(
      "CawCo Helper \(Bundle.main.version, privacy: .public) up, pid \(getpid()), trusted \(self.trust.trusted)"
    )
  }

  func applicationWillTerminate(_ notification: Notification) {
    server?.stop()
  }

  private func handle(_ request: Request, from peer: Peer) async -> Reply {
    switch request.verb {
    case .status:
      return status()
    case .requestAccessibility:
      let trusted = trust.request()
      return .ok(["trusted": trusted, "prompted": !trusted])
    case .approvePending:
      guard let ask = request.ask else { return .failure("approve_pending needs kind, expected_subject and expected_target") }
      return await approver.approve(ask)
    case .verify:
      guard let ask = request.ask else { return .failure("verify needs kind, expected_subject and expected_target") }
      return await approver.verify(ask, since: request.since)
    }
  }

  private func status() -> Reply {
    .ok([
      "version": Bundle.main.version,
      "pid": Int(getpid()),
      "trusted": trust.trusted,
      "screen_locked": Dialogs.screenLocked,
      "login_item": LoginItem.status,
      "peer_check": PeerCheck.enforced ? "enforced" : "log-only",
      "policy": Policy.load().described,
    ])
  }
}

extension Bundle {
  var version: String {
    let short = infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
    let build = infoDictionary?["CFBundleVersion"] as? String ?? "?"
    return "\(short) (\(build))"
  }
}

/// The helper as a login item (SMAppService, macOS 13+). It appears in
/// System Settings › General › Login Items, where the owner can switch it off;
/// a helper the owner switched off reports `requiresApproval` and is never
/// re-registered behind their back.
enum LoginItem {
  static var status: String {
    switch SMAppService.mainApp.status {
    case .notRegistered: "notRegistered"
    case .enabled: "enabled"
    case .requiresApproval: "requiresApproval"
    case .notFound: "notFound"
    @unknown default: "unknown"
    }
  }

  static func ensureRegistered() {
    let service = SMAppService.mainApp
    switch service.status {
    case .notRegistered, .notFound:
      do {
        try service.register()
        log.notice("registered as a login item: \(status, privacy: .public)")
      } catch {
        log.error("login item registration failed: \(error, privacy: .public)")
      }
    case .enabled, .requiresApproval:
      log.notice("login item: \(status, privacy: .public)")
    @unknown default:
      log.error("login item status unknown: \(service.status.rawValue)")
    }
  }
}

/// Whether macOS trusts this process as an Accessibility client.
///
/// `AXIsProcessTrusted()` is re-read on every `com.apple.accessibility.api`
/// distributed notification and every 2 s while untrusted: the notification
/// alone is unreliable. TCC caches its decision per process, so a grant can
/// stay invisible until the helper restarts; `status` then reports the real
/// `trusted: false` and the agent restarts the helper once.
final class Trust {
  private(set) var trusted = AXIsProcessTrusted()
  private var polling: Task<Void, Never>?

  func start() {
    DistributedNotificationCenter.default().addObserver(
      forName: Notification.Name("com.apple.accessibility.api"), object: nil, queue: .main
    ) { [unowned self] _ in
      MainActor.assumeIsolated { self.recheck() }
    }
    poll()
  }

  /// Raises macOS's own Accessibility alert in this GUI session when the
  /// helper is not yet trusted. "Prompting occurs asynchronously and does not
  /// affect the return value" (AXIsProcessTrustedWithOptions).
  func request() -> Bool {
    recheck()
    if trusted { return true }
    // kAXTrustedCheckOptionPrompt's value, spelled out: the imported global is
    // a mutable Unmanaged<CFString> that Swift 6 refuses to read from here.
    let options = ["AXTrustedCheckOptionPrompt": true] as CFDictionary
    trusted = AXIsProcessTrustedWithOptions(options)
    log.notice("asked for Accessibility; trusted \(self.trusted)")
    poll()
    return trusted
  }

  private func recheck() {
    let now = AXIsProcessTrusted()
    if now != trusted {
      log.notice("Accessibility trust changed: \(self.trusted) → \(now)")
      trusted = now
    }
  }

  private func poll() {
    guard polling == nil, !trusted else { return }
    polling = Task { [unowned self] in
      while !self.trusted {
        try? await Task.sleep(for: .seconds(2))
        self.recheck()
      }
      self.polling = nil
    }
  }
}
