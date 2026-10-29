// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CleanYourHarmony",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "CleanYourHarmony", targets: ["CleanYourHarmony"])],
    targets: [
        .executableTarget(name: "CleanYourHarmony", path: ".", exclude: ["Tests", "Package.swift"], sources: ["App.swift"], swiftSettings: [.swiftLanguageMode(.v5)]),
        .testTarget(name: "DesktopTests", dependencies: ["CleanYourHarmony"], path: "Tests", swiftSettings: [.swiftLanguageMode(.v5)])
    ]
)
