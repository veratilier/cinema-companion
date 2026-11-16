// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CinemaCompanion",
    platforms: [.iOS(.v16)],
    products: [.library(name: "CinemaCompanion", targets: ["CinemaCompanion"])],
    targets: [
        .target(name: "CinemaCompanion"),
        .testTarget(name: "CinemaCompanionTests", dependencies: ["CinemaCompanion"])
    ]
)
