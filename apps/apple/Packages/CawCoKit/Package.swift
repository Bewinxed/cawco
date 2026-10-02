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
        .library(name: "CawCoAPI", targets: ["CawCoAPI"]),
        .library(name: "CawCoCore", targets: ["CawCoCore"]),
        .library(name: "CawCoDesign", targets: ["CawCoDesign"]),
        .library(name: "CawCoTranscript", targets: ["CawCoTranscript"]),
        .library(name: "CawCoMascot", targets: ["CawCoMascot"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-openapi-generator", from: "1.13.1"),
        .package(url: "https://github.com/apple/swift-openapi-runtime", from: "1.12.2"),
        .package(url: "https://github.com/apple/swift-openapi-urlsession", from: "1.3.2"),
    ],
    targets: [
        // The hub's wire types and client, generated at build time from
        // openapi.json (written by packages/hub/scripts/openapi.ts).
        .target(
            name: "CawCoAPI",
            dependencies: [.product(name: "OpenAPIRuntime", package: "swift-openapi-runtime")],
            swiftSettings: concurrency,
            plugins: [.plugin(name: "OpenAPIGenerator", package: "swift-openapi-generator")]
        ),
        .target(
            name: "CawCoCore",
            dependencies: [
                "CawCoAPI",
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
                .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession"),
            ],
            swiftSettings: concurrency
        ),
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
