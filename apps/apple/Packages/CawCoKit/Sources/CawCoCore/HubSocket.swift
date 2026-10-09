import CawCoAPI
import Foundation

/// One `/ws/dashboard` socket as an `AsyncThrowingStream`: it says when it
/// has opened, then yields every message, and finishes (throwing when the
/// close was not asked for) when the socket is gone. Ending the stream's
/// iteration closes the socket.
struct HubSocket: Sendable {
    enum Event: Sendable {
        case opened
        case message(Message)
    }

    /// One message off the socket, read where it arrived: decoding a whole
    /// board frame never runs on the main actor. The stream keeps the order.
    struct Message: Sendable {
        let read: Result<Inbound, any Error>
        /// A full board frame's pulses, which it carries beside its rows.
        let pulses: [String: Components.Schemas.SessionPulse]

        init(_ data: Data) {
            read = Result { try Inbound.read(data) }
            if case .frame(.instances) = try? read.get() {
                pulses = Inbound.pulses(data, enveloped: true)
            } else {
                pulses = [:]
            }
        }
    }

    let events: AsyncThrowingStream<Event, any Error>
    private let task: URLSessionWebSocketTask

    /// `hub` is the hub's http(s) address; the socket is its `/ws/dashboard`.
    init(hub: URL) {
        var parts = URLComponents(url: hub, resolvingAgainstBaseURL: false) ?? URLComponents()
        parts.scheme = parts.scheme == "https" ? "wss" : "ws"
        parts.path = "/ws/dashboard"
        // Names the wire this client reads (WIRE_PROTOCOL, 6): board deltas, not a snapshot per change.
        // Thread frames (6) are logged and skipped until the app draws threads.
        // And says it reads parts (`WIRE_PARTS_PARAM`): a large board then
        // comes as parts (`Wire.Assembler`) instead of one frame.
        parts.queryItems = [
            URLQueryItem(name: "protocol", value: "6"),
            URLQueryItem(name: "wire", value: "parts"),
        ]
        let (events, continuation) = AsyncThrowingStream<Event, any Error>.makeStream()
        let delegate = Delegate(continuation)
        let session = URLSession(configuration: .default, delegate: delegate, delegateQueue: nil)
        let task = session.webSocketTask(with: parts.url ?? hub)
        // No frame on the hub's sockets is larger (`WIRE_FRAME_LIMIT_BYTES`):
        // a longer message, a large board, comes as parts (`Wire.Assembler`).
        task.maximumMessageSize = Wire.frameLimitBytes
        let reader = Task {
            var assembler = Wire.Assembler()
            do {
                while true {
                    let frame: Data
                    switch try await task.receive() {
                    case let .data(data):
                        frame = data
                    case let .string(text):
                        frame = Data(text.utf8)
                    @unknown default:
                        continue
                    }
                    if let message = try assembler.take(frame) {
                        continuation.yield(.message(Message(message)))
                    }
                }
            } catch {
                continuation.finish(throwing: error)
            }
        }
        continuation.onTermination = { _ in
            reader.cancel()
            task.cancel(with: .goingAway, reason: nil)
            session.invalidateAndCancel()
        }
        task.resume()
        self.events = events
        self.task = task
    }

    /// Puts one message on the socket, as one frame or, past one frame, as
    /// its parts in order (`Wire.frames`). A write that fails takes the
    /// socket down with it, and the close is what every waiter hears.
    func post(_ data: Data) {
        let task = task
        for frame in Wire.frames(String(decoding: data, as: UTF8.self)) {
            task.send(.string(frame)) { error in
                if error != nil {
                    task.cancel(with: .abnormalClosure, reason: nil)
                }
            }
        }
    }

    private final class Delegate: NSObject, URLSessionWebSocketDelegate, Sendable {
        private let continuation: AsyncThrowingStream<Event, any Error>.Continuation

        init(_ continuation: AsyncThrowingStream<Event, any Error>.Continuation) {
            self.continuation = continuation
        }

        func urlSession(_: URLSession, webSocketTask _: URLSessionWebSocketTask, didOpenWithProtocol _: String?) {
            continuation.yield(.opened)
        }

        func urlSession(_: URLSession, webSocketTask _: URLSessionWebSocketTask, didCloseWith _: URLSessionWebSocketTask.CloseCode, reason _: Data?) {
            continuation.finish(throwing: URLError(.networkConnectionLost))
        }

        func urlSession(_: URLSession, task _: URLSessionTask, didCompleteWithError error: (any Error)?) {
            continuation.finish(throwing: error ?? URLError(.networkConnectionLost))
        }
    }
}
