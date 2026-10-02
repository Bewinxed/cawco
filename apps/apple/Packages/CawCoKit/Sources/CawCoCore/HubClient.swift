public import CawCoAPI
public import Foundation
import OpenAPIRuntime
import OpenAPIURLSession

extension Client {
    /// The generated client for the hub at `url`, over URLSession.
    ///
    /// The hub writes dates with JavaScript's `Date.toISOString()`, which
    /// always carries milliseconds; the runtime's default transcoder rejects
    /// them, so every hub client decodes fractional seconds.
    public init(hub url: URL) {
        self.init(
            serverURL: url,
            configuration: Configuration(dateTranscoder: .iso8601WithFractionalSeconds),
            transport: URLSessionTransport()
        )
    }
}
