public import CawCoAPI
public import Foundation
import HTTPTypes
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
            transport: URLSessionTransport(),
            middlewares: [LossyReads()]
        )
    }
}

/// The connect-time reads (`HubConnection.readFleet`), a transcript's page and a Caw thread, read as the socket's
/// frames are (`Wire.lossy`): a machine, a row or a project this app's types
/// refuse is left out of its list, and the list is read, where the generated
/// client alone would refuse the whole answer and the board would not read.
/// A body that reads as it came passes untouched; one that does not is read
/// without what it cannot, and handed on as the JSON of what was read.
private struct LossyReads: ClientMiddleware {
    private typealias Prune = @Sendable (Data) throws -> Data

    private static let reads: [String: Prune] = [
        Operations.GetApiAgents.id: prune(Components.Schemas.GetApiAgents200.self),
        Operations.GetApiInstances.id: prune(Components.Schemas.GetApiInstances200.self),
        Operations.GetApiProjects.id: prune(Components.Schemas.GetApiProjects200.self),
        Operations.GetApiPending.id: prune(Components.Schemas.GetApiPending200.self),
        Operations.GetApiContinuations.id: prune(Components.Schemas.GetApiContinuations200.self),
        Operations.GetApiMoves.id: prune(Components.Schemas.GetApiMoves200.self),
        Operations.GetApiFleetWatchNotices.id: prune(Components.Schemas.GetApiFleetWatchNotices200.self),
        Operations.GetApiActionsWaiting.id: prune(Components.Schemas.GetApiActionsWaiting200.self),
        Operations.GetApiUsageLimits.id: prune(Components.Schemas.UsageLimitsResponse.self),
        Operations.GetApiUsageSpend.id: prune(Components.Schemas.UsageSpend.self),
        // A transcript's page: the read again an unreadable stream event asks
        // for (`SessionsStore.apply`) reads without what it cannot, and ends.
        Operations.GetApiInstancesByIdTranscript.id: prune(Components.Schemas.TranscriptPage.self),
        // A Caw thread, as its `thread.message` frames already read: a note
        // whose event is of a kind this build does not know keeps its line,
        // its event read as absent, and the thread reads.
        Operations.GetApiProjectsByIdThreadsByThreadId.id: prune(Components.Schemas.ThreadRead.self),
    ]

    private static func prune<T: Codable & Sendable>(_: T.Type) -> Prune {
        { data in
            if (try? Wire.decoder().decode(T.self, from: data)) != nil { return data }
            return try Wire.encoder().encode(try Wire.lossy(T.self, from: data))
        }
    }

    /// Off the caller's actor (`@concurrent`, as the protocol has it): a board's worth of rows is decoded here.
    @concurrent
    func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @concurrent @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        let (response, answer) = try await next(request, body, baseURL)
        guard response.status == .ok, let prune = Self.reads[operationID], let answer else {
            return (response, answer)
        }
        let data = try await Data(collecting: answer, upTo: .max)
        // Unreadable even so: the generated client says why, as it always has.
        return (response, HTTPBody((try? prune(data)) ?? data))
    }
}
