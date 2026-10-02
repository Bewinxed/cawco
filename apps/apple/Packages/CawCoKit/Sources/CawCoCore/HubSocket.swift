import Foundation

/// One `/ws/dashboard` socket as an `AsyncThrowingStream`: it says when it
/// has opened, then yields every message, and finishes (throwing when the
/// close was not asked for) when the socket is gone. Ending the stream's
/// iteration closes the socket.
struct HubSocket: Sendable {
    enum Event: Sendable {
        case opened
        case message(Data)
    }

    let events: AsyncThrowingStream<Event, any Error>
    private let task: URLSessionWebSocketTask

    /// `hub` is the hub's http(s) address; the socket is its `/ws/dashboard`.
    init(hub: URL) {
        var parts = URLComponents(url: hub, resolvingAgainstBaseURL: false) ?? URLComponents()
        parts.scheme = parts.scheme == "https" ? "wss" : "ws"
        parts.path = "/ws/dashboard"
        let (events, continuation) = AsyncThrowingStream<Event, any Error>.makeStream()
        let delegate = Delegate(continuation)
        let session = URLSession(configuration: .default, delegate: delegate, delegateQueue: nil)
        let task = session.webSocketTask(with: parts.url ?? hub)
        // A dashboard socket carries the whole board in one frame.
        task.maximumMessageSize = 64 << 20
        let reader = Task {
            do {
                while true {
                    switch try await task.receive() {
                    case let .data(data):
                        continuation.yield(.message(data))
                    case let .string(text):
                        continuation.yield(.message(Data(text.utf8)))
                    @unknown default:
                        break
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

    /// Puts one message on the socket. A write that fails takes the socket
    /// down with it, and the close is what every waiter hears.
    func post(_ data: Data) {
        let task = task
        task.send(.string(String(decoding: data, as: UTF8.self))) { error in
            if error != nil {
                task.cancel(with: .abnormalClosure, reason: nil)
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
