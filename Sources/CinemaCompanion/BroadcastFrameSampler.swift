#if os(iOS)
import ReplayKit
import CoreImage
import UIKit

/// Use inside a Broadcast Upload Extension; the host supplies its own authenticated transport.
/// `onFrame` receives sampled JPEGs only, never microphone or app audio.
public final class BroadcastFrameSampler {
    public var onFrame: ((Data) -> Void)?
    private let interval: TimeInterval
    private let context = CIContext(options: [.cacheIntermediates: false])
    private let lock = NSLock()
    private var lastFrame = Date.distantPast
    public init(interval: TimeInterval = 10) { self.interval = max(1, interval) }
    public func reset() { lock.lock(); lastFrame = .distantPast; lock.unlock() }
    public func accept(_ sampleBuffer: CMSampleBuffer, type: RPSampleBufferType) {
        guard type == .video else { return }
        lock.lock()
        guard Date().timeIntervalSince(lastFrame) >= interval else { lock.unlock(); return }
        lastFrame = Date(); lock.unlock()
        autoreleasepool {
            guard let pixel = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
            var image = CIImage(cvPixelBuffer: pixel)
            if let orientation = CMGetAttachment(sampleBuffer, key: RPVideoSampleOrientationKey as CFString, attachmentModeOut: nil) as? NSNumber {
                image = image.oriented(forExifOrientation: orientation.int32Value)
            }
            let scale = min(1, 900 / max(image.extent.width, image.extent.height))
            image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
            guard let cg = context.createCGImage(image, from: image.extent), let jpeg = UIImage(cgImage: cg).jpegData(compressionQuality: 0.6) else { return }
            onFrame?(jpeg)
        }
    }
}
#endif
