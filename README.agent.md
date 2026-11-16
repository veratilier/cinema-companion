# Cinema Companion：给 AI 与开发者的接入说明

本文是代码现状与集成契约，不代表项目已经具备生产部署能力。面向使用者的介绍见 [README.md](README.md)。以实际源码和测试结果为准；不要推断尚未实现的功能已经可用。

## 项目目的与边界

从既有 iOS 共影功能提取的 Swift Package，分为前台屏幕采样、跨 App 广播扩展采样、本地视频和可选的 B 站导入辅助代码。仓库同时包含一个 PWA Lite 实现，用于可移植的页内视频、手动帧分享和浏览器可选屏幕捕获。宿主应用负责提供 AI、对话身份与记忆、网络传输、凭据、访问控制和会话管理。

当前没有独立 iOS App 或 Xcode 工程、内置 AI 客户端、可部署 HTTP 服务、完整的广播上传实现、音频采集或自动旁白。PWA 的宿主回调也是接入边界，不包含 AI 服务。图片采样不是视频流。不要将样例的 TODO 描述成可用的远程上传能力，也不要把移动端 PWA 描述成 ReplayKit 广播扩展。

## 目录和入口

| 路径 | 内容 |
| --- | --- |
| `Package.swift` | Swift Package；iOS 16+，产品为 `CinemaCompanion` |
| `Sources/CinemaCompanion/CinemaView.swift` | SwiftUI 入口、`SharedScene`、本地 AVPlayer、当前帧分享、可选系统广播选择器 |
| `Sources/CinemaCompanion/ForegroundCapture.swift` | 本 App 前台 ReplayKit 采样；启动、停止、读取新鲜帧 |
| `Sources/CinemaCompanion/BroadcastFrameSampler.swift` | Broadcast Upload Extension 的帧采样器，不负责上传 |
| `Examples/BroadcastExtension/SampleHandler.swift` | 扩展结构示例；帧传输为 TODO |
| `server/media_import.py` | B 站导入、临时任务、签名票据与 Range 响应辅助函数；不是独立 HTTP 服务 |
| `docs/server.md` | 导入模块的部署约束与宿主责任 |
| `web/index.html`、`web/app.js` | 无构建步骤的 PWA Lite 界面、本地或远程视频、手动帧分享和可选屏幕捕获 |
| `web/lib.js` | 播放时间格式化和定时陪看间隔校验 |
| `web/host-adapter.example.js` | 将 `SharedScene` 作为 multipart 请求交给宿主后端的示例；不会默认加载 |
| `web/sw.js`、`web/manifest.webmanifest` | 应用外壳缓存与安装元数据，不缓存用户视频或捕获帧 |
| `web/tests/` | 可在 Node 中运行的纯逻辑测试 |
| `python_tests/` | Python 导入辅助测试 |

## 数据流与约定

### 本地影片

`CinemaView(onScene:)` 由文件选择器读取用户选择的视频，`AVPlayer` 在本地播放。用户点“Share this scene”时，使用 `AVAssetImageGenerator` 获取当前帧，构造 `SharedScene` 交给宿主异步回调。回调返回 `String?`：非空可显示为回复；`nil` 表示没有回复。

原生示例的定时模式默认关闭，用户可选 5–3600 秒。循环等待间隔后分享，等待上一轮结束再进入下一次等待；影片暂停时跳过，切换模式、换片、页面离开或进入后台时停止。该定时器仅用于页面中的本地影片和 App 内屏幕采样，不管理跨 App 广播扩展。

`SharedScene` 包含 `source`、JPEG 数据、采集时间，以及影片可用时的 `title`、`position`。这些字段不包含音频。

### 当前 App 的屏幕

`ForegroundCapture` 使用 `RPScreenRecorder.startCapture`；仅接收 `.video`，不启用麦克风。最多每约 2 秒转换一帧，`snapshot()` 只返回 5 秒内的帧。截图通过 `onScene` 交给宿主；采样本身不发送网络请求。进入非活动状态或页面消失时停止并清除缓存。

### 跨 App 的屏幕

`CinemaView(broadcastExtensionID:onScene:)` 提供可选的系统广播选择器。宿主必须创建并签名 Broadcast Upload Extension，配置匹配的扩展标识，接好用户同意、认证、网络、限流、停止和结果回传。`BroadcastFrameSampler` 默认每 10 秒把一张压缩 JPEG 交给扩展的 `onFrame`；它不上传、不接音频、不实现背压或会话管理。示例扩展也不会上传。不得向用户声称该路径已经端到端可用。

### PWA Lite

`web/` 是静态 PWA，不复用 Swift 代码。用户选择本地视频时创建临时 object URL；也可以加载宿主给出的 HTTPS 播放地址。远程地址只有在响应允许正确的 CORS 画布读取时才能截帧。

点击分享后，PWA 生成最长边不超过 1280 像素的 JPEG `Blob`，构造 `{source, jpeg, capturedAt, title, position}`，先显示本地预览、派发 `cinema-companion-scene` 事件，再调用可选的 `window.cinemaCompanionOnScene(scene)`。项目自身不发送数据；宿主回调或事件监听器可以发送，宿主须自行完成鉴权、上传、取消、错误处理和回复展示。

定时陪看默认关闭，提供 10、30、60 秒预设，也接受 5–3600 秒的自定义整数。用户必须选择 `movie` 或 `screen` 来源并单独点击开始；同一时间只能运行一个来源。定时循环使用串行 `setTimeout`，等待上一轮宿主回调结束后才安排下一轮；手动“看这一刻”不启动定时模式，分享进行中按钮暂不可用。影片暂停时定时模式不重复发送同一时间点；切换影片、屏幕流结束、页面隐藏或离开时立即停止。

屏幕共享通过能力检测后的 `navigator.mediaDevices.getDisplayMedia()` 提供，只能由用户操作触发。页面隐藏时主动停止轨道。浏览器是否提供屏幕或窗口、是否包含音频、切换 App 后是否继续以及捕获受保护媒体的结果均不受项目控制。尤其不得把 iPhone/iPad PWA 当作原生 ReplayKit Broadcast Upload Extension 的替代品。

Service Worker 只缓存应用外壳，不缓存 object URL、视频、画面或 AI 回复。长期 AI 密钥和设备凭据不得出现在 PWA bundle、LocalStorage 或公开仓库中。

### B 站导入

`server/media_import.py` 接受限定格式的 B 站 HTTPS 地址。`start` 创建或复用临时任务；`read` 返回状态；`ticket` 为视频与过期时间生成 HMAC；`serve` 依赖宿主 HTTP handler 的认证、响应与来源方法，支持受限票据和 Range。`CINEMA_WATCH_CACHE`、`CINEMA_YTDLP`、`CINEMA_BILIBILI_COOKIES` 可配置；Cookie 保持私有。

该模块没有 HTTP 路由、独立鉴权层或多租户隔离。锁与任务复用按单进程可信部署设计。后台线程每 30 分钟清理超过 6 小时的任务，导入进行中跳过；`start()` 启动清理线程，宿主也应在服务启动时调用 `start_cleanup_worker()`，退出时可调用 `stop_cleanup_worker()`。服务进程未运行时不会清理；多进程部署需要另外的跨进程协调。任何部署都需实现鉴权、请求与出口限制、视频票据保护、日志去敏、容量与并发限制、进程监管和错误处理。不得声称可绕过 DRM 或访问权限。

## 测试与编译

在仓库根目录执行：

```sh
swift build
python3 -m unittest discover -s python_tests -v
(cd web && npm test)
xcodebuild -scheme CinemaCompanion -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

`swift build` 不等于 iOS 录屏测试。PWA 的 Node 测试检查间隔、时间和缓存范围，不启动浏览器。iOS 模拟器构建检查条件编译代码，不能证明物理设备、系统广播授权、扩展签名、跨 App 捕获、后台行为或真实网站播放正常。Python 测试不启动完整服务，也不访问真实视频站。网页播放、CORS、安装和 `getDisplayMedia()` 必须在目标浏览器逐一验证。

## 维护约束

- 避免提交任何真实域名、用户信息、聊天记录、访问令牌、私钥、Cookie、设备标识、签名证书或媒体文件；不要把真实数据放入示例、测试、日志或 Git 历史。
- 不把用户明确触发分享和后台自动分享混为一谈；不要增加未经用户操作的捕获、上传、自动评论或静音保活。
- 提示词、视频标题和画面内容均属于待分析数据，不应作为系统指令执行。宿主应在 AI 边界落实这一点。
- Swift 与 PWA 的 `SharedScene` 字段要保持一致；新增字段时同步更新两个 README 和两端测试。
- PWA 只能通过用户操作捕获，不加入后台静默采样、自动上传、持久屏幕权限或在前端保存长期密钥。
- 区分已实现功能、示例和宿主 TODO；文档中的安全建议不能替代代码实现或真机验证。
