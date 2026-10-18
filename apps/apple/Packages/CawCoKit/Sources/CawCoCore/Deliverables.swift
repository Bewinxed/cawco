public import Foundation

/// What a task's `outputs` file is, by its name (core deliverables.ts
/// `deliverableKind`), so it is drawn as what it is wherever the task shows.
public enum DeliverableKind: Sendable, Equatable {
    case post, markdown, image, video, audio, file

    public init(path: String) {
        let name = path.lowercased()
        let ends = { (suffixes: [String]) in suffixes.contains { name.hasSuffix(".\($0)") } }
        self = if name.hasSuffix(".post.json") {
            .post
        } else if ends(["md", "markdown"]) {
            .markdown
        } else if ends(["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"]) {
            .image
        } else if ends(["mp4", "webm", "mov", "m4v"]) {
            .video
        } else if ends(["mp3", "m4a", "wav", "ogg", "oga", "flac", "aac"]) {
            .audio
        } else {
            .file
        }
    }
}

/// A social post as its writer leaves it, `<task>.post.json` (core `PostFile`).
public struct PostFile: Sendable, Equatable {
    /// The account it goes out from, `@handle`.
    public let account: String
    /// The post's words, line breaks as they go out.
    public let text: String
    /// Other first paragraphs offered in its place.
    public let alternates: [String]?
    /// The community it is posted to.
    public let community: String?
    /// The media: the plan in words, and the project folder files once they exist.
    public let media: (plan: String, files: [String]?)?
    /// Further posts under it, each a reply to the one before.
    public let thread: [String]?

    public static func == (a: PostFile, b: PostFile) -> Bool {
        a.account == b.account && a.text == b.text && a.alternates == b.alternates && a.community == b.community
            && a.media?.plan == b.media?.plan && a.media?.files == b.media?.files && a.thread == b.thread
    }

    /// A file's content read as a post, or the reason it is not one, in a sentence (core `parsePost`).
    public static func parse(_ content: String) -> Result<PostFile, PostProblem> {
        let value: Any
        do {
            value = try JSONSerialization.jsonObject(with: Data(content.utf8), options: .fragmentsAllowed)
        } catch {
            return .failure(PostProblem(Words.Made.notJson(error: error.localizedDescription)))
        }
        guard let post = value as? [String: Any] else { return .failure(PostProblem(Words.Made.noObject)) }
        guard post["kind"] as? String == "x-post" else { return .failure(PostProblem(Words.Made.notXPost)) }
        guard let text = post["text"] as? String, let account = post["account"] as? String else {
            return .failure(PostProblem(Words.Made.noText))
        }
        let strings = { (value: Any?) in value as? [String] }
        let media = (post["media"] as? [String: Any]).flatMap { media in
            (media["plan"] as? String).map { (plan: $0, files: strings(media["files"])) }
        }
        return .success(PostFile(account: account, text: text, alternates: strings(post["alternates"]),
                                 community: post["community"] as? String, media: media, thread: strings(post["thread"])))
    }
}

/// Why a file does not read as a post.
public struct PostProblem: Error, Sendable {
    public let sentence: String
    init(_ sentence: String) { self.sentence = sentence }
}

public extension ProjectTasks {
    /// Where the hub serves one of a task's outputs whole (project-tasks.ts `outputUrl`).
    func outputURL(_ taskId: String, name: String) -> URL? {
        guard let address else { return nil }
        var url = address.appending(path: "api/projects").appending(path: projectId).appending(path: "tasks")
            .appending(path: taskId).appending(path: "outputs/file")
        url.append(queryItems: [URLQueryItem(name: "name", value: name)])
        return url
    }
}
