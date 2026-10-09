import Darwin
import Foundation

/// `~/.cawco/helper-presses.log`: one JSON line per decision, appended and
/// never rewritten. A press writes its intent before the button is touched;
/// when that line cannot be written, nothing is pressed.
enum PressLog {
  @discardableResult
  static func append(_ fields: [String: Any]) -> Bool {
    var record = fields
    record["time"] = ISO8601DateFormatter().string(from: Date())
    guard var line = try? JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]) else {
      log.error("press log record could not be encoded")
      return false
    }
    line.append(UInt8(ascii: "\n"))
    let fd = open(Paths.pressLog, O_WRONLY | O_APPEND | O_CREAT | O_NOFOLLOW | O_CLOEXEC, 0o600)
    guard fd >= 0 else {
      log.error("cannot open \(Paths.pressLog, privacy: .public): \(String(cString: strerror(errno)), privacy: .public)")
      return false
    }
    defer { close(fd) }
    var info = stat()
    guard fstat(fd, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG, info.st_uid == getuid() else {
      log.error("\(Paths.pressLog, privacy: .public) is not a regular file owned by this user")
      return false
    }
    // One write call: with O_APPEND the line lands whole at the end.
    let written = line.withUnsafeBytes { write(fd, $0.baseAddress, $0.count) }
    guard written == line.count else {
      log.error("short write to \(Paths.pressLog, privacy: .public)")
      return false
    }
    return true
  }
}
