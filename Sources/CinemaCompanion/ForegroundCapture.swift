#if os(iOS)
import ReplayKit
import UIKit
import CoreImage
import Combine

private final class FrameStore {
    private let lock = NSLock()
    private let context = CIContext()
    private var image: Data?
    private var date = Date.distantPast
    func accept(_ buffer: CMSampleBuffer) {
        lock.lock(); defer { lock.unlock() }
        guard Date().timeIntervalSince(date) >= 2, let pixel = CMSampleBufferGetImageBuffer(buffer) else { return }
        let source = CIImage(cvPixelBuffer: pixel)
        let scale = min(1, 1000 / max(source.extent.width, source.extent.height))
        guard let image = context.createCGImage(source.transformed(by: CGAffineTransform(scaleX: scale, y: scale)), from: source.extent.applying(CGAffineTransform(scaleX: scale, y: scale))) else { return }
        self.image = UIImage(cgImage: image).jpegData(compressionQuality: 0.65); date = Date()
    }
    func snapshot() -> Data? { lock.lock(); defer { lock.unlock() }; return Date().timeIntervalSince(date) < 5 ? image : nil }
    func clear() { lock.lock(); defer { lock.unlock() }; image = nil; date = .distantPast }
}

/// ReplayKit in-app capture, limited to the foreground host application.
@MainActor public final class ForegroundCapture: NSObject, ObservableObject, RPScreenRecorderDelegate {
    @Published public private(set) var active = false
    @Published public private(set) var starting = false
    @Published public var error: String?
    private let frames = FrameStore()
    private var generation = UUID()
    public func start() {
        guard !active, !starting else { return }
        let recorder = RPScreenRecorder.shared()
        guard recorder.isAvailable else { error = "Screen capture is unavailable."; return }
        error = nil; starting = true; generation = UUID(); let id = generation
        recorder.delegate = self; recorder.isMicrophoneEnabled = false
        let frames = frames
        recorder.startCapture(handler: { buffer, kind, error in if error == nil && kind == .video { frames.accept(buffer) } }, completionHandler: { [weak self] error in
            Task { @MainActor in
                guard let self else { return }
                guard self.generation == id else { if error == nil { recorder.stopCapture { _ in } }; return }
                self.starting = false; self.active = error == nil; self.error = error?.localizedDescription
            }
        })
    }
    public func snapshot() -> Data? { active ? frames.snapshot() : nil }
    public func stop() {
        generation = UUID(); active = false; starting = false; frames.clear()
        if RPScreenRecorder.shared().isRecording { RPScreenRecorder.shared().stopCapture { _ in } }
    }
    public nonisolated func screenRecorder(_ screenRecorder: RPScreenRecorder, didStopRecordingWith previewViewController: RPPreviewViewController?, error: Error?) {
        let detail = error?.localizedDescription
        Task { @MainActor in self.stop(); self.error = detail }
    }
}
#endif
