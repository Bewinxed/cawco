import Darwin
import Foundation

/// The process at the other end of a connection, from the kernel: its uid
/// (getpeereid), pid (LOCAL_PEERPID) and audit token (LOCAL_PEERTOKEN).
nonisolated struct Peer: Sendable {
  let uid: uid_t
  let pid: pid_t
  let token: audit_token_t

  init(socket fd: Int32) throws {
    var uid: uid_t = 0
    var gid: gid_t = 0
    guard getpeereid(fd, &uid, &gid) == 0 else { throw Server.Failure.posix("getpeereid", errno) }
    var pid: pid_t = 0
    var length = socklen_t(MemoryLayout<pid_t>.size)
    guard getsockopt(fd, SOL_LOCAL, LOCAL_PEERPID, &pid, &length) == 0 else {
      throw Server.Failure.posix("LOCAL_PEERPID", errno)
    }
    var token = audit_token_t()
    length = socklen_t(MemoryLayout<audit_token_t>.size)
    guard getsockopt(fd, SOL_LOCAL, LOCAL_PEERTOKEN, &token, &length) == 0 else {
      throw Server.Failure.posix("LOCAL_PEERTOKEN", errno)
    }
    self.uid = uid
    self.pid = pid
    self.token = token
  }
}

/// Who may talk to the helper: the CawCo agent, as the release pipeline signs
/// it (Developer ID, team FN5LJSPX2R, identifier `dev.cawco.agent`), running
/// as this same user.
///
/// The uid check always holds. The signature check is enforced in Release; a
/// DEBUG build logs the mismatch and admits the peer, because the agent is
/// still ad-hoc signed while the helper is being probed.
nonisolated enum PeerCheck {
  static let agentRequirement = Signing.developerID("dev.cawco.agent")

  #if DEBUG
  static let enforced = false
  #else
  static let enforced = true
  #endif

  static func admits(_ peer: Peer) -> Bool {
    guard peer.uid == getuid() else {
      log.error("refused peer pid \(peer.pid): uid \(peer.uid) is not this user's")
      return false
    }
    switch Signing.check(.auditToken(peer.token), against: agentRequirement) {
    case .satisfied:
      return true
    case .unsatisfied(let why):
      if enforced {
        log.error("refused peer pid \(peer.pid): \(why, privacy: .public)")
        return false
      }
      log.error("DEBUG build admits peer pid \(peer.pid) that Release refuses: \(why, privacy: .public)")
      return true
    }
  }
}

/// A Unix socket server in the user-only `~/.cawco`. One request line per
/// connection, answered with one reply line, then closed.
final class Server {
  typealias Handler = @MainActor (Request, Peer) async -> Reply

  nonisolated enum Failure: Error, CustomStringConvertible {
    case alreadyServed
    case unsafeDirectory(String)
    case posix(String, Int32)

    var description: String {
      switch self {
      case .alreadyServed: "another helper answers on the socket"
      case .unsafeDirectory(let why): why
      case .posix(let call, let code): "\(call): \(String(cString: strerror(code)))"
      }
    }
  }

  /// A request line longer than this is refused.
  private static let maximumRequest = 16 * 1024
  /// A client that has not sent its line by then is dropped.
  private static let requestTimeout: Duration = .seconds(10)

  private let path: String
  private let listener: Int32
  private let accepting: DispatchSourceRead
  private let handler: Handler
  private var reading: [Int32: DispatchSourceRead] = [:]
  private var buffers: [Int32: Data] = [:]

  init(path: String, handler: @escaping Handler) throws {
    try Self.checkDirectory(of: path)
    if Self.answers(path) { throw Failure.alreadyServed }
    unlink(path)

    var address = sockaddr_un()
    address.sun_family = sa_family_t(AF_UNIX)
    let bytes = Array(path.utf8)
    let capacity = MemoryLayout.size(ofValue: address.sun_path)
    guard bytes.count < capacity else { throw Failure.posix("socket path too long", ENAMETOOLONG) }
    withUnsafeMutableBytes(of: &address.sun_path) { raw in
      raw.copyBytes(from: bytes)
      raw[bytes.count] = 0
    }

    let fd = socket(AF_UNIX, SOCK_STREAM, 0)
    guard fd >= 0 else { throw Failure.posix("socket", errno) }
    _ = fcntl(fd, F_SETFD, FD_CLOEXEC)
    let bound = withUnsafePointer(to: &address) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        bind(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
      }
    }
    guard bound == 0 else {
      let code = errno
      close(fd)
      throw Failure.posix("bind \(path)", code)
    }
    // ~/.cawco is 0700 already; the socket itself is user-only as well.
    guard chmod(path, 0o600) == 0, listen(fd, 16) == 0, fcntl(fd, F_SETFL, O_NONBLOCK) == 0 else {
      let code = errno
      close(fd)
      unlink(path)
      throw Failure.posix("listen \(path)", code)
    }

    self.path = path
    self.listener = fd
    self.handler = handler
    self.accepting = DispatchSource.makeReadSource(fileDescriptor: fd, queue: .main)
    accepting.setEventHandler { [unowned self] in
      MainActor.assumeIsolated { self.acceptAll() }
    }
    accepting.setCancelHandler { close(fd) }
    accepting.resume()
    log.notice("serving \(path, privacy: .public)")
  }

  func stop() {
    accepting.cancel()
    unlink(path)
  }

  /// The socket's directory must belong to this user and admit nobody else.
  private static func checkDirectory(of path: String) throws {
    let directory = (path as NSString).deletingLastPathComponent
    var info = stat()
    guard lstat(directory, &info) == 0 else { throw Failure.posix("stat \(directory)", errno) }
    guard (info.st_mode & S_IFMT) == S_IFDIR, info.st_uid == getuid(), info.st_mode & 0o077 == 0 else {
      throw Failure.unsafeDirectory(
        "\(directory) must be a directory owned by this user with mode 0700 (mode \(String(info.st_mode & 0o7777, radix: 8)))"
      )
    }
  }

  /// Whether a live helper already listens on the path.
  private static func answers(_ path: String) -> Bool {
    let fd = socket(AF_UNIX, SOCK_STREAM, 0)
    guard fd >= 0 else { return false }
    defer { close(fd) }
    var address = sockaddr_un()
    address.sun_family = sa_family_t(AF_UNIX)
    let bytes = Array(path.utf8)
    guard bytes.count < MemoryLayout.size(ofValue: address.sun_path) else { return false }
    withUnsafeMutableBytes(of: &address.sun_path) { raw in
      raw.copyBytes(from: bytes)
      raw[bytes.count] = 0
    }
    return withUnsafePointer(to: &address) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        connect(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) == 0
      }
    }
  }

  private func acceptAll() {
    while true {
      let client = accept(listener, nil, nil)
      guard client >= 0 else { return }  // EAGAIN: drained
      _ = fcntl(client, F_SETFD, FD_CLOEXEC)
      var on: Int32 = 1
      setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &on, socklen_t(MemoryLayout<Int32>.size))
      let peer: Peer
      do {
        peer = try Peer(socket: client)
      } catch {
        log.error("dropped a client with no credentials: \(String(describing: error), privacy: .public)")
        close(client)
        continue
      }
      guard PeerCheck.admits(peer) else {
        send(.failure("this peer is not the CawCo agent"), to: client)
        continue
      }
      receive(from: client, peer: peer)
    }
  }

  private func receive(from client: Int32, peer: Peer) {
    _ = fcntl(client, F_SETFL, O_NONBLOCK)
    buffers[client] = Data()
    let source = DispatchSource.makeReadSource(fileDescriptor: client, queue: .main)
    reading[client] = source
    source.setEventHandler { [unowned self] in
      MainActor.assumeIsolated { self.readAvailable(from: client, peer: peer) }
    }
    source.resume()
    Task { [weak self] in
      try? await Task.sleep(for: Self.requestTimeout)
      guard let self, let current = self.reading[client], (current as AnyObject) === (source as AnyObject) else {
        return
      }
      self.stopReading(client) { self.send(.failure("no request line within 10 s"), to: client) }
    }
  }

  private func readAvailable(from client: Int32, peer: Peer) {
    guard reading[client] != nil else { return }
    var chunk = [UInt8](repeating: 0, count: 4096)
    let count = read(client, &chunk, chunk.count)
    if count < 0, errno == EAGAIN || errno == EINTR { return }
    guard count > 0 else {
      stopReading(client) { close(client) }
      return
    }
    buffers[client, default: Data()].append(contentsOf: chunk[0..<count])
    let buffer = buffers[client] ?? Data()
    if let newline = buffer.firstIndex(of: UInt8(ascii: "\n")) {
      let line = Data(buffer[buffer.startIndex..<newline])
      stopReading(client) { [unowned self] in self.answer(line, from: peer, on: client) }
    } else if buffer.count > Self.maximumRequest {
      stopReading(client) { [unowned self] in
        self.send(.failure("request longer than \(Self.maximumRequest) bytes"), to: client)
      }
    }
  }

  /// Stops watching the client. `then` runs from the source's cancel handler,
  /// once dispatch has let go of the descriptor, so it may write and close it.
  private func stopReading(_ client: Int32, then: @escaping @MainActor () -> Void) {
    buffers.removeValue(forKey: client)
    guard let source = reading.removeValue(forKey: client) else { return }
    source.setCancelHandler { MainActor.assumeIsolated { then() } }
    source.cancel()
  }

  private func answer(_ line: Data, from peer: Peer, on client: Int32) {
    let request: Request
    do {
      request = try JSONDecoder().decode(Request.self, from: line)
    } catch {
      send(.failure("unreadable request: \(error)"), to: client)
      return
    }
    log.notice("peer pid \(peer.pid) asks \(request.verb.rawValue, privacy: .public)")
    Task {
      let reply = await handler(request, peer)
      send(reply, to: client)
    }
  }

  /// Writes the whole reply (blocking: replies are a few hundred bytes), then closes.
  private func send(_ reply: Reply, to client: Int32) {
    _ = fcntl(client, F_SETFL, 0)
    let data = reply.line
    data.withUnsafeBytes { raw in
      var offset = 0
      while offset < raw.count {
        let written = write(client, raw.baseAddress! + offset, raw.count - offset)
        if written < 0, errno == EINTR { continue }
        guard written > 0 else { break }
        offset += written
      }
    }
    close(client)
  }
}
