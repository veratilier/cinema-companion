#if os(iOS)
import SwiftUI
import AVKit
import UniformTypeIdentifiers
import ReplayKit
import CoreImage

/// Information deliberately shared with the host's AI adapter.
public struct SharedScene: Sendable {
    public enum Source: String, Sendable { case movie, screen }
    public let source: Source
    public let jpeg: Data
    public let capturedAt: Date
    public let title: String?
    public let position: TimeInterval?
}

/// A self-contained foreground cinema. Your app decides how to send each scene to its AI.
public struct CinemaView: View {
    public typealias OnScene = @MainActor (SharedScene) async throws -> String?
    private let onScene: OnScene
    private let broadcastExtensionID: String?
    @StateObject private var movie = MovieController()
    @StateObject private var screen = ForegroundCapture()
    @Environment(\.scenePhase) private var phase
    @State private var mode = 0
    @State private var picker = false
    @State private var sending = false
    @State private var timedWatching = false
    @State private var intervalSeconds = 30
    @State private var reply = ""
    @State private var error = ""
    public init(broadcastExtensionID: String? = nil, onScene: @escaping OnScene) {
        self.broadcastExtensionID = broadcastExtensionID; self.onScene = onScene
    }
    public var body: some View {
        NavigationStack {
            Form {
                Picker("Mode", selection: $mode) { Text("Screen sharing").tag(0); Text("Import media").tag(1) }.pickerStyle(.segmented)
                if mode == 0 {
                    Section("Screen sharing") {
                        Text("Share a snapshot of this app while it is in the foreground. Cross-app sharing requires a broadcast extension.")
                        Button(screen.active ? "Stop sharing" : "Start sharing") { screen.active ? screen.stop() : screen.start() }
                        Button("Share current screen") { Task { await shareScreen() } }.disabled(!screen.active || sending)
                        if let message = screen.error { Text(message).foregroundStyle(.red) }
                        if let broadcastExtensionID {
                            Text("Share other apps using the system broadcast picker. Configure your extension's frame transport first.")
                            BroadcastPicker(extensionID: broadcastExtensionID).frame(height: 52)
                        }
                    }
                } else {
                    Section("Imported media") {
                        if movie.loaded { VideoPlayer(player: movie.player).frame(height: 220); Text(movie.title) }
                        Button(movie.loaded ? "Choose another video" : "Choose a video") { picker = true }
                        Button("Share this scene") { Task { await shareMovie() } }.disabled(!movie.loaded || sending)
                    }
                }
                Section("Timed watching") {
                    HStack {
                        Text("Interval")
                        Spacer()
                        TextField("Seconds", value: $intervalSeconds, format: .number)
                            .keyboardType(.numberPad).multilineTextAlignment(.trailing).frame(width: 80)
                            .accessibilityLabel("Interval in seconds")
                        Text("seconds").foregroundStyle(.secondary)
                    }.disabled(timedWatching)
                    Button(timedWatching ? "Stop timed watching" : "Start timed watching") {
                        timedWatching.toggle()
                    }.disabled(!timedWatching && (!(5...3600).contains(intervalSeconds) || (mode == 0 ? !screen.active : !movie.loaded)))
                    Text("Choose 5–3600 seconds. Shares only while this page is active; the next interval starts after the previous share finishes.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if sending { ProgressView("Sharing…") }
                if !reply.isEmpty { Section("Reply") { Text(reply).textSelection(.enabled) } }
                if !error.isEmpty { Section { Text(error).foregroundStyle(.red) } }
            }.navigationTitle("Cinema")
                .fileImporter(isPresented: $picker, allowedContentTypes: [.movie, .video]) { result in
                    do { let url = try result.get(); timedWatching = false; try movie.open(url); error = "" } catch { self.error = error.localizedDescription }
                }
                .task(id: timedWatching) {
                    guard timedWatching else { return }
                    while timedWatching && !Task.isCancelled {
                        do { try await Task.sleep(nanoseconds: UInt64(intervalSeconds) * 1_000_000_000) } catch { return }
                        guard timedWatching && phase == .active && !Task.isCancelled else { return }
                        if sending { continue }
                        if mode == 0 {
                            guard screen.active else { timedWatching = false; return }
                            await shareScreen()
                        } else if movie.loaded && movie.player.timeControlStatus == .playing {
                            await shareMovie()
                        }
                    }
                }
                .onChange(of: mode) { _ in timedWatching = false }
                .onChange(of: phase) { newPhase in if newPhase != .active { timedWatching = false; screen.stop(); movie.player.pause() } }
                .onDisappear { timedWatching = false; screen.stop(); movie.close() }
        }
    }
    private func deliver(_ scene: SharedScene) async {
        sending = true; defer { sending = false }
        do { reply = try await onScene(scene) ?? ""; error = "" } catch { self.error = error.localizedDescription }
    }
    private func shareScreen() async {
        guard let jpeg = screen.snapshot() else { error = "No recent frame is available yet."; return }
        await deliver(SharedScene(source: .screen, jpeg: jpeg, capturedAt: Date(), title: nil, position: nil))
    }
    private func shareMovie() async {
        do { await deliver(try await movie.scene()) } catch { self.error = error.localizedDescription }
    }
}

private struct BroadcastPicker: UIViewRepresentable {
    let extensionID: String
    func makeUIView(context: Context) -> RPSystemBroadcastPickerView {
        let picker = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 52, height: 52))
        picker.preferredExtension = extensionID; picker.showsMicrophoneButton = false
        return picker
    }
    func updateUIView(_ view: RPSystemBroadcastPickerView, context: Context) { view.preferredExtension = extensionID }
}

private struct CinemaError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

@MainActor private final class MovieController: ObservableObject {
    let player = AVPlayer()
    @Published var loaded = false
    @Published var title = ""
    private var scopedURL: URL?
    func open(_ url: URL) throws {
        close()
        if url.startAccessingSecurityScopedResource() { scopedURL = url }
        title = url.deletingPathExtension().lastPathComponent
        player.replaceCurrentItem(with: AVPlayerItem(url: url)); loaded = true
    }
    func close() {
        player.pause(); player.replaceCurrentItem(with: nil)
        scopedURL?.stopAccessingSecurityScopedResource(); scopedURL = nil; loaded = false
    }
    func scene() async throws -> SharedScene {
        guard let asset = player.currentItem?.asset else { throw CinemaError("Choose a video first.") }
        let time = player.currentTime()
        guard time.seconds.isFinite else { throw CinemaError("Playback position is unavailable.") }
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true; generator.maximumSize = CGSize(width: 1280, height: 1280)
        let frame = try await generator.image(at: time)
        guard let jpeg = UIImage(cgImage: frame.image).jpegData(compressionQuality: 0.8) else { throw CinemaError("Unable to read this frame.") }
        let position = max(0, frame.actualTime.seconds)
        return SharedScene(source: .movie, jpeg: jpeg, capturedAt: Date(), title: title, position: position)
    }
}
#endif
