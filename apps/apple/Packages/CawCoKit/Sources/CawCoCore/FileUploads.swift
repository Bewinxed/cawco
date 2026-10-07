import Foundation

/// A file the hub's file store took (`POST /api/files`): what a send names it by.
public struct UploadedFile: Sendable, Equatable {
    /// `/api/files/<sha256>`.
    public let ref: String
    public let size: Int
    public let mediaType: String
}

/// A file a send carries (core `FileAttachment`): the hub holds its bytes,
/// and the session's machine fetches them by `ref`.
public struct SentFile: Sendable, Equatable {
    public let name: String
    public let mediaType: String
    public let size: Int
    public let ref: String

    public init(name: String, mediaType: String, size: Int, ref: String) {
        self.name = name
        self.mediaType = mediaType
        self.size = size
        self.ref = ref
    }
}

/// How a file's size is said everywhere (core `humanSize`): "14 B",
/// "2.3 KB", "1.2 MB", "1.0 GB".
public func humanSize(_ bytes: Int) -> String {
    let kb = 1024.0
    let value = Double(bytes)
    if value >= kb * kb * kb { return String(format: "%.1f GB", value / kb / kb / kb) }
    if value >= kb * kb { return String(format: "%.1f MB", value / kb / kb) }
    if value >= kb { return String(format: "%.1f KB", value / kb) }
    return "\(bytes) B"
}

/// Says how far an upload has gone, from URLSession's delegate queue.
private final class UploadProgress: NSObject, URLSessionTaskDelegate, Sendable {
    let report: @Sendable (Double) -> Void

    init(_ report: @escaping @Sendable (Double) -> Void) {
        self.report = report
    }

    func urlSession(_: URLSession, task _: URLSessionTask, didSendBodyData _: Int64,
                    totalBytesSent sent: Int64, totalBytesExpectedToSend total: Int64) {
        guard total > 0 else { return }
        report(Double(sent) / Double(total))
    }
}

extension HubConnection {
    /// Sends a file the reader attached to the hub's file store (Composer.svelte
    /// `uploadFile`): its bytes as the body, its type, its name URI-encoded in
    /// `X-File-Name`. Raw over URLSession rather than the generated client,
    /// because only a task delegate hears how far the body has gone;
    /// `progress` is called on the delegate's queue.
    public func uploadFile(at file: URL, name: String, mediaType: String,
                           progress: @escaping @Sendable (Double) -> Void) async throws -> UploadedFile {
        guard let address else { throw TaskRefusal(message: "No hub is connected.") }
        var request = URLRequest(url: address.appending(path: "api/files"))
        request.httpMethod = "POST"
        request.setValue(mediaType, forHTTPHeaderField: "Content-Type")
        request.setValue(name.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "file", forHTTPHeaderField: "X-File-Name")
        let (data, response) = try await URLSession.shared.upload(for: request, fromFile: file, delegate: UploadProgress(progress))
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            let text = String(decoding: data, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
            throw TaskRefusal(message: text.isEmpty ? "The hub refused that file." : text)
        }
        struct Answer: Decodable { let ref: String; let size: Int; let mediaType: String }
        let answer = try JSONDecoder().decode(Answer.self, from: data)
        return UploadedFile(ref: answer.ref, size: answer.size, mediaType: answer.mediaType)
    }
}
