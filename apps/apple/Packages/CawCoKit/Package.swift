// swift-tools-version: 6.4
import PackageDescription

// Every line of the apps' shared code. The app target (apps/apple/project.yml)
// holds only scenes and platform chrome.
let concurrency: [SwiftSetting] = [
    .enableUpcomingFeature("NonisolatedNonsendingByDefault"),
    .enableUpcomingFeature("InferIsolatedConformances"),
]

let package = Package(
    name: "CawCoKit",
    platforms: [.iOS("27.1"), .macOS("27.0")],
    products: [
        .library(name: "CawCoCore", targets: ["CawCoCore"]),
        .library(name: "CawCoDesign", targets: ["CawCoDesign"]),
        .library(name: "CawCoTranscript", targets: ["CawCoTranscript"]),
        .library(name: "CawCoMascot", targets: ["CawCoMascot"]),
    ],
    targets: [
        .target(name: "CawCoCore", swiftSettings: concurrency),
        .target(
            name: "CawCoDesign",
            dependencies: ["CawCoCore"],
            resources: [.process("Resources")],
            swiftSettings: concurrency
        ),
        .target(name: "CawCoTranscript", dependencies: ["CawCoDesign"], swiftSettings: concurrency),
        .target(name: "CawCoMascot", dependencies: ["CawCoDesign"], swiftSettings: concurrency),
    ]
)
