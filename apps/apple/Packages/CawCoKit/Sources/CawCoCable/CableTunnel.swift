import Foundation

/// A WebSocket connection to a caBLE tunnel server. The authenticator connects
/// first to `/cable/new/<tunnelId>` and receives its 3-byte routing ID as the
/// first message. The client (Chromium) then connects at
/// `/cable/connect/<tunnelId>/<routingId>`, and the tunnel relays between them.
public actor CableTunnel {
    private let task: URLSessionWebSocketTask
    private let session: URLSession

    public enum TunnelError: Error, Sendable {
        case invalidRoutingId
        case connectionFailed(String)
        case unexpectedMessageType
    }

    /// Connects to the tunnel server as the authenticator (new session).
    /// - Parameters:
    ///   - domain: The tunnel server domain (e.g. `cable.ua5v.com`).
    ///   - tunnelId: The 16-byte tunnel ID derived from the QR secret.
    public init(domain: String, tunnelId: Data) {
        let urlString = "wss://\(domain)/cable/new/\(tunnelId.base64URLEncoded())"
        let url = URL(string: urlString)!
        let config = URLSessionConfiguration.default
        let session = URLSession(configuration: config)
        // Set subprotocol to "fido.cable" per the caBLE spec.
        self.task = session.webSocketTask(with: url, protocols: ["fido.cable"])
        self.session = session
    }

    /// Opens the tunnel and waits for the server's routing ID (3 bytes).
    public func connect() async throws -> Data {
        task.resume()
        // The tunnel server sends the routing ID as the first binary message.
        let message = try await task.receive()
        switch message {
        case let .data(data):
            guard data.count == 3 else { throw TunnelError.invalidRoutingId }
            return data
        case let .string(text):
            let data = Data(text.utf8)
            guard data.count == 3 else { throw TunnelError.invalidRoutingId }
            return data
        @unknown default:
            throw TunnelError.unexpectedMessageType
        }
    }

    /// Receives one binary message from the tunnel.
    public func receive() async throws -> Data {
        let message = try await task.receive()
        switch message {
        case let .data(data):
            return data
        case let .string(text):
            return Data(text.utf8)
        @unknown default:
            throw TunnelError.unexpectedMessageType
        }
    }

    /// Sends a binary message through the tunnel.
    public func send(_ data: Data) async throws {
        try await task.send(.data(data))
    }

    /// Closes the tunnel connection.
    public func close() {
        task.cancel(with: .goingAway, reason: nil)
        session.invalidateAndCancel()
    }
}
