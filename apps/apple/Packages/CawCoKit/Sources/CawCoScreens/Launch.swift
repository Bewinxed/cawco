import CawCoDesign
import CawCoTranscript
import Foundation
import UIKit

/// What the first window otherwise pays for on the main thread, once an
/// app's life, done as the app starts on a task of its own: UIKit's
/// attribute scope, the board's and the transcript's cell types, and the
/// code grammars (TranscriptView `prepare`). At utility priority the launch
/// starved it (its samples ran on for 1.9 s), and a restored session's list
/// was built before it finished.
public enum Launch {
    /// From `application(_:didFinishLaunchingWithOptions:)`, before any scene connects.
    public nonisolated static func prepare() {
        // The task's value holds each type, so each is built.
        Task.detached(priority: .userInitiated) { () -> [ObjectIdentifier] in
            // A button's attributed title reaches UIKit as an NSAttributedString
            // in UIKit's scope, and the first such conversion reads the scope by
            // reflection: 35 ms under the board's first button (Release). Read
            // once for the process, so it is read here.
            TypeRole.registerFaces()
            _ = try? NSAttributedString(AttributedString("Caw"), including: \.uiKit)
            UIImage.prepareBlur()
            return HomeViewController.cellTypes() + TranscriptView.prepare()
        }
    }
}
