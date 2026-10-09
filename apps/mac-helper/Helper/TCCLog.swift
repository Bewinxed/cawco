import Foundation

/// The unified log's own record of TCC grants: an audit that does not depend
/// on the helper's Accessibility reading. tccd writes
/// `TCCDEvent: type=Create, service=<service>, identifier_type=…, identifier=<subject>`
/// when a grant is stored.
nonisolated enum TCCLog {
  /// The first matching Create event since `since`, polling once a second
  /// until `wait` runs out (log writes land a moment after the grant).
  static func createEvent(service: String, recordedAs keys: [String], since: Date, wait: Duration) async -> String? {
    let deadline = ContinuousClock.now + wait
    while true {
      if let line = await find(service: service, recordedAs: keys, since: since) { return line }
      guard ContinuousClock.now < deadline else { return nil }
      try? await Task.sleep(for: .seconds(1))
    }
  }

  @concurrent
  private static func find(service: String, recordedAs keys: [String], since: Date) async -> String? {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = .current
    formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/log")
    process.arguments = [
      "show", "--style", "ndjson", "--info", "--start", formatter.string(from: since),
      "--predicate", #"subsystem == "com.apple.TCC" AND eventMessage CONTAINS "TCCDEvent: type=Create""#,
    ]
    let output = Pipe()
    process.standardOutput = output
    process.standardError = FileHandle.nullDevice
    do {
      try process.run()
    } catch {
      log.error("cannot run log show: \(error, privacy: .public)")
      return nil
    }
    let data = output.fileHandleForReading.readDataToEndOfFile()
    process.waitUntilExit()
    for line in data.split(separator: UInt8(ascii: "\n")) {
      guard let record = try? JSONSerialization.jsonObject(with: Data(line)) as? [String: Any],
        let message = record["eventMessage"] as? String
      else { continue }
      let event = fields(message)
      if event["service"] == service, let identifier = event["identifier"], keys.contains(identifier) {
        return message
      }
    }
    return nil
  }

  /// `TCCDEvent: type=Create, service=S, identifier_type=T, identifier=I` as
  /// exact key-value pairs, so a key never matches a longer identifier.
  private static func fields(_ message: String) -> [String: String] {
    var fields: [String: String] = [:]
    for part in message.components(separatedBy: ", ") {
      guard let equals = part.firstIndex(of: "=") else { continue }
      let key = part[..<equals].split(separator: " ").last.map(String.init) ?? ""
      fields[key] = fields[key] ?? String(part[part.index(after: equals)...])
    }
    return fields
  }
}
