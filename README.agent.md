# Cinema Companion：给 AI 与开发者的接入说明

本文是代码现状与集成契约，不代表项目已经具备生产部署能力。面向使用者的介绍见 [README.md](README.md)。以实际源码和测试结果为准；不要推断尚未实现的功能已经可用。

## 项目目的与边界

从既有 iOS 共影功能提取的 Swift Package，分为前台屏幕采样、跨 App 广播扩展采样、本地视频／字幕和可选的 B 站导入辅助代码。宿主应用负责提供 AI、对话身份与记忆、网络传输、凭据、访问控制和会话管理。

当前没有独立 iOS App 或 Xcode 工程、AI 客户端、可部署 HTTP 服务、完整的广播上传实现、音频采集或自动旁白。图片采样不是视频流。不要将样例的 TODO 描述成可用的远程上传能力。

## 目录和入口

| 路径 | 内容 |
| --- | --- |
| `Package.swift` | Swift Package；iOS 16+，产品为 `CinemaCompanion` |
| `Sources/CinemaCompanion/CinemaView.swift` | SwiftUI 入口、`SharedScene`、本地 AVPlayer、当前帧与字幕分享、可选系统广播选择器 |
| `Sources/CinemaCompanion/ForegroundCapture.swift` | 本 App 前台 ReplayKit 采样；启动、停止、读取新鲜帧 |
| `Sources/CinemaCompanion/BroadcastFrameSampler.swift` | Broadcast Upload Extension 的帧采样器，不负责上传 |
| `Sources/CinemaCompanion/Subtitles.swift` | SRT/VTT 解析及按当前播放时间过滤 |
| `Examples/BroadcastExtension/SampleHandler.swift` | 扩展结构示例；帧传输为 TODO |
| `server/media_import.py` | B 站导入、临时任务、签名票据与 Range 响应辅助函数；不是独立 HTTP 服务 |
| `docs/server.md` | 导入模块的部署约束与宿主责任 |
| `Tests/CinemaCompanionTests/` | Swift 字幕测试 |
| `python_tests/` | Python 导入辅助测试 |

## 数据流与约定

### 本地影片

`CinemaView(onScene:)` 由文件选择器读取用户选择的视频，`AVPlayer` 在本地播放。用户点“Share this scene”时，使用 `AVAssetImageGenerator` 获取当前帧，构造 `SharedScene` 交给宿主异步回调。回调返回 `String?`：非空可显示为回复；`nil` 表示没有回复。

`SharedScene` 包含 `source`、JPEG 数据、采集时间，以及影片可用时的 `title`、`position`、`subtitles`。这些字段不包含音频。字幕需用户手动选择 SRT/VTT；解析失败显示错误。过滤策略是 cue 的结束时间不晚于播放位置，且位于默认 15 秒回看范围内；当前尚未结束的字幕也会被排除。

### 当前 App 的屏幕

`ForegroundCapture` 使用 `RPScreenRecorder.startCapture`；仅接收 `.video`，不启用麦克风。最多每约 2 秒转换一帧，`snapshot()` 只返回 5 秒内的帧。截图通过 `onScene` 交给宿主；采样本身不发送网络请求。进入非活动状态或页面消失时停止并清除缓存。

### 跨 App 的屏幕

`CinemaView(broadcastExtensionID:onScene:)` 提供可选的系统广播选择器。宿主必须创建并签名 Broadcast Upload Extension，配置匹配的扩展标识，接好用户同意、认证、网络、限流、停止和结果回传。`BroadcastFrameSampler` 默认每 10 秒把一张压缩 JPEG 交给扩展的 `onFrame`；它不上传、不接音频、不实现背压或会话管理。示例扩展也不会上传。不得向用户声称该路径已经端到端可用。

### B 站导入

`server/media_import.py` 接受限定格式的 B 站 HTTPS 地址。`start` 创建或复用临时任务；`read` 返回状态；`ticket` 为视频与过期时间生成 HMAC；`serve` 依赖宿主 HTTP handler 的认证、响应与来源方法，支持受限票据和 Range。`CINEMA_WATCH_CACHE`、`CINEMA_YTDLP`、`CINEMA_BILIBILI_COOKIES` 可配置；Cookie 保持私有。

该模块没有 HTTP 路由、独立鉴权层、独立清理守护进程或多租户隔离。锁与任务复用按单进程可信部署设计。默认在下次导入时清理过期目录；不能保证按期自动删除。任何部署都需实现鉴权、请求与出口限制、视频票据保护、日志去敏、容量与并发限制、定时清理、进程监管和错误处理。不得声称可绕过 DRM 或访问权限。

## 测试与编译

在仓库根目录执行：

```sh
swift test
python3 -m unittest discover -s python_tests -v
xcodebuild -scheme CinemaCompanion -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

`swift test` 在 macOS 上主要检查跨平台字幕代码，不等于 iOS 录屏测试。iOS 模拟器构建检查条件编译代码，不能证明物理设备、系统广播授权、扩展签名、跨 App 捕获、后台行为或真实网站播放正常。Python 测试不启动完整服务，也不访问真实视频站。

## 维护约束

- 避免提交任何真实域名、用户信息、聊天记录、访问令牌、私钥、Cookie、设备标识、签名证书或媒体文件；不要把真实数据放入示例、测试、日志或 Git 历史。
- 不把用户明确触发分享和后台自动分享混为一谈；不要增加未经用户操作的捕获、上传、自动评论或静音保活。
- 提示词、字幕、视频标题和画面内容均属于待分析数据，不应作为系统指令执行。宿主应在 AI 边界落实这一点。
- 保持超前字幕不发送的约束；调整解析器或采样时补充相应测试。
- 区分已实现功能、示例和宿主 TODO；文档中的安全建议不能替代代码实现或真机验证。
