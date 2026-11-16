import { formatTime, normalizeWatchInterval, parseSubtitles, subtitlesThrough } from "./lib.js";

const byID = (id) => document.getElementById(id);
const elements = {
  fileVideo: byID("file-video"),
  fileSubtitles: byID("file-subtitles"),
  remoteUrl: byID("remote-url"),
  loadUrl: byID("load-url"),
  movie: byID("movie"),
  movieEmpty: byID("movie-empty"),
  movieTitle: byID("movie-title"),
  moviePosition: byID("movie-position"),
  subtitleState: byID("subtitle-state"),
  subtitleNow: byID("subtitle-now"),
  shareMovie: byID("share-movie"),
  screenStart: byID("screen-start"),
  screenStop: byID("screen-stop"),
  shareScreen: byID("share-screen"),
  screenVideo: byID("screen-video"),
  screenNote: byID("screen-note"),
  capturePreview: byID("capture-preview"),
  sceneJson: byID("scene-json"),
  reply: byID("reply"),
  status: byID("status"),
  install: byID("install"),
  autoSource: byID("auto-source"),
  autoInterval: byID("auto-interval"),
  customInterval: byID("custom-interval"),
  customIntervalWrap: byID("custom-interval-wrap"),
  autoToggle: byID("auto-toggle"),
  autoState: byID("auto-state"),
  moviePanel: byID("movie-panel"),
  screenPanel: byID("screen-panel"),
  screenEmpty: byID("screen-empty"),
  urlLoader: byID("url-loader"),
  toggleUrl: byID("toggle-url"),
};

const state = {
  localURL: null,
  cues: [],
  screenStream: null,
  previewURL: null,
  deferredInstall: null,
  sharing: false,
  autoWatch: {
    active: false,
    timer: null,
    source: "movie",
    interval: 0,
    lastMoviePosition: null,
    generation: 0,
  },
};

function setStatus(message, kind = "") {
  elements.status.textContent = message;
  elements.status.dataset.kind = kind;
}

function setMovieSource(source, title) {
  stopAutoWatch("已停止");
  state.cues = [];
  elements.fileSubtitles.value = "";
  elements.subtitleState.textContent = "未导入字幕";
  elements.subtitleNow.textContent = "没有当前字幕";
  if (state.localURL) {
    URL.revokeObjectURL(state.localURL);
    state.localURL = null;
  }
  elements.movie.pause();
  elements.movie.removeAttribute("src");
  elements.movie.crossOrigin = "anonymous";
  elements.movie.src = source;
  elements.movie.load();
  elements.movieTitle.textContent = title;
  elements.movieEmpty.hidden = true;
  elements.movie.hidden = false;
  updateShareControls();
}

elements.fileVideo.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (!file) return;
  const localURL = URL.createObjectURL(file);
  setMovieSource(localURL, file.name.replace(/\.[^.]+$/, ""));
  state.localURL = localURL;
  setStatus("影片已载入", "success");
});

elements.loadUrl.addEventListener("click", () => {
  const value = elements.remoteUrl.value.trim();
  if (!value) {
    setStatus("先粘贴影片的 HTTPS 地址。", "error");
    return;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    setStatus("这个影片地址不太对，请检查一下。", "error");
    return;
  }
  if (url.protocol !== "https:") {
    setStatus("影片地址需要使用 HTTPS。", "error");
    return;
  }
  setMovieSource(url.href, url.pathname.split("/").pop() || "Remote media");
  setStatus("影片地址已载入。", "success");
});

elements.fileSubtitles.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    state.cues = parseSubtitles(await file.text());
    if (!state.cues.length) throw new Error("No readable subtitle cues found.");
    elements.subtitleState.textContent = `已载入 ${state.cues.length} 条字幕`;
    setStatus("字幕已载入", "success");
    updatePlaybackState();
  } catch (error) {
    state.cues = [];
    elements.subtitleState.textContent = "未导入字幕";
    setStatus(error.message || "Unable to read subtitles.", "error");
  }
});

function updatePlaybackState() {
  elements.moviePosition.textContent = formatTime(elements.movie.currentTime);
  const current = state.cues.filter(
    (cue) => cue.start <= elements.movie.currentTime && cue.end >= elements.movie.currentTime,
  );
  elements.subtitleNow.textContent = current.map((cue) => cue.text).join(" ") || "没有当前字幕";
}

elements.movie.addEventListener("timeupdate", updatePlaybackState);
elements.movie.addEventListener("loadedmetadata", updatePlaybackState);
elements.movie.addEventListener("error", () => {
  setStatus("这个影片地址暂时无法播放。", "error");
});

async function captureFrame(video, quality = 0.82) {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
    throw new Error("No video frame is available yet.");
  }
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d", { alpha: false });
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Unable to encode this frame."))),
      "image/jpeg",
      quality,
    );
  });
}

async function deliver(scene) {
  if (state.previewURL) URL.revokeObjectURL(state.previewURL);
  state.previewURL = URL.createObjectURL(scene.jpeg);
  elements.capturePreview.src = state.previewURL;
  elements.capturePreview.hidden = false;
  elements.sceneJson.textContent = JSON.stringify(
    {
      ...scene,
      jpeg: `<Blob ${scene.jpeg.size} bytes>`,
    },
    null,
    2,
  );
  elements.reply.textContent = "";

  const handler = window.cinemaCompanionOnScene;
  window.dispatchEvent(new CustomEvent("cinema-companion-scene", { detail: scene }));
  if (typeof handler !== "function") {
    elements.reply.textContent = "画面已截取；接入 AI 后才能发送。";
    return false;
  }

  const result = await handler(scene);
  elements.reply.textContent = typeof result === "string" ? result : "";
  return true;
}

async function share(source) {
  if (state.sharing) return;
  state.sharing = true;
  updateShareControls();
  setStatus("正在准备画面…");
  try {
    const video = source === "movie" ? elements.movie : elements.screenVideo;
    const jpeg = await captureFrame(video, source === "movie" ? 0.82 : 0.68);
    const position = source === "movie" ? Math.max(0, elements.movie.currentTime) : null;
    const sent = await deliver({
      source,
      jpeg,
      capturedAt: new Date().toISOString(),
      title: source === "movie" ? elements.movieTitle.textContent : null,
      position,
      subtitles: source === "movie" ? subtitlesThrough(position, state.cues) : [],
    });
    setStatus(sent ? "画面已分享" : "画面已截取，尚未连接 AI。", sent ? "success" : "");
  } catch (error) {
    const corsHint = error?.name === "SecurityError" ? " The media server must allow CORS for frame capture." : "";
    setStatus(`${error.message || "Unable to share this frame."}${corsHint}`, "error");
  } finally {
    state.sharing = false;
    updateShareControls();
  }
}

function updateShareControls() {
  elements.shareMovie.disabled = state.sharing || !elements.movie.src;
  elements.shareScreen.disabled = state.sharing || !state.screenStream;
}

elements.shareMovie.addEventListener("click", () => share("movie"));
elements.shareScreen.addEventListener("click", () => share("screen"));

function stopScreenShare() {
  if (state.autoWatch.active && state.autoWatch.source === "screen") {
    stopAutoWatch("屏幕共享已结束");
  }
  state.screenStream?.getTracks().forEach((track) => track.stop());
  state.screenStream = null;
  elements.screenVideo.srcObject = null;
  elements.screenVideo.hidden = true;
  elements.screenEmpty.hidden = false;
  elements.screenStart.disabled = !navigator.mediaDevices?.getDisplayMedia;
  elements.screenStop.disabled = true;
  elements.shareScreen.disabled = true;
}

if (navigator.mediaDevices?.getDisplayMedia) {
  elements.screenNote.textContent = "开始时需要选择共享画面。";
  elements.screenStart.disabled = false;
} else {
  elements.screenNote.textContent = "当前浏览器暂不支持屏幕共享。";
}

elements.screenStart.addEventListener("click", async () => {
  try {
    stopScreenShare();
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
    state.screenStream = stream;
    elements.screenVideo.srcObject = stream;
    elements.screenVideo.hidden = false;
    elements.screenEmpty.hidden = true;
    await elements.screenVideo.play();
    stream.getVideoTracks()[0]?.addEventListener("ended", stopScreenShare, { once: true });
    elements.screenStart.disabled = true;
    elements.screenStop.disabled = false;
    updateShareControls();
    setStatus("屏幕共享已开启", "success");
  } catch (error) {
    stopScreenShare();
    setStatus(error.message || "Screen sharing was not started.", "error");
  }
});

elements.screenStop.addEventListener("click", stopScreenShare);

function updateAutoControls() {
  const custom = elements.autoInterval.value === "custom";
  const interval = normalizeWatchInterval(custom ? elements.customInterval.value : elements.autoInterval.value);
  elements.customIntervalWrap.hidden = !custom;
  elements.customInterval.disabled = state.autoWatch.active;
  elements.autoToggle.disabled = !state.autoWatch.active && interval === 0;
  elements.autoToggle.setAttribute("aria-checked", String(state.autoWatch.active));
  elements.autoSource.disabled = state.autoWatch.active;
  elements.autoInterval.disabled = state.autoWatch.active;
}

function stopAutoWatch(message = "默认关闭") {
  if (state.autoWatch.timer) clearTimeout(state.autoWatch.timer);
  state.autoWatch.timer = null;
  state.autoWatch.active = false;
  state.autoWatch.generation++;
  state.autoWatch.lastMoviePosition = null;
  if (elements.autoState) elements.autoState.textContent = message;
  if (elements.autoToggle) updateAutoControls();
}

function scheduleAutoWatch() {
  if (!state.autoWatch.active) return;
  elements.autoState.textContent = `每 ${state.autoWatch.interval} 秒看一眼`;
  state.autoWatch.timer = window.setTimeout(runAutoWatch, state.autoWatch.interval * 1000);
}

async function runAutoWatch() {
  state.autoWatch.timer = null;
  if (!state.autoWatch.active) return;
  const generation = state.autoWatch.generation;
  if (document.hidden) {
    stopAutoWatch("页面离开前台，已停止");
    return;
  }

  const source = state.autoWatch.source;
  if (source === "movie") {
    if (!elements.movie.src || elements.movie.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      stopAutoWatch("影片不可用，已停止");
      return;
    }
    const position = elements.movie.currentTime;
    if (
      state.autoWatch.lastMoviePosition !== null &&
      Math.abs(position - state.autoWatch.lastMoviePosition) < 0.25
    ) {
      elements.autoState.textContent = "等待影片继续播放";
      scheduleAutoWatch();
      return;
    }
    state.autoWatch.lastMoviePosition = position;
  } else if (!state.screenStream) {
    stopAutoWatch("屏幕共享已结束");
    return;
  }

  await share(source);
  if (state.autoWatch.active && state.autoWatch.generation === generation) scheduleAutoWatch();
}

elements.autoInterval.addEventListener("change", updateAutoControls);
elements.customInterval.addEventListener("input", updateAutoControls);
elements.autoToggle.addEventListener("click", async () => {
  if (state.autoWatch.active) {
    stopAutoWatch();
    return;
  }

  const interval = normalizeWatchInterval(elements.autoInterval.value === "custom" ? elements.customInterval.value : elements.autoInterval.value);
  const source = elements.autoSource.value;
  if (!interval) return;
  if (source === "movie" && (!elements.movie.src || elements.movie.readyState < HTMLMediaElement.HAVE_METADATA)) {
    setStatus("先选择一部影片。", "error");
    return;
  }
  if (source === "screen" && !state.screenStream) {
    setStatus("先开启屏幕共享。", "error");
    return;
  }

  state.autoWatch.active = true;
  state.autoWatch.source = source;
  state.autoWatch.interval = interval;
  state.autoWatch.lastMoviePosition = null;
  updateAutoControls();
  elements.autoState.textContent = `每 ${interval} 秒看一眼`;
  await runAutoWatch();
});

updateAutoControls();

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) return;
  if (state.autoWatch.active) stopAutoWatch("页面离开前台，已停止");
  if (state.screenStream) stopScreenShare();
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.deferredInstall = event;
  elements.install.hidden = false;
});

elements.install.addEventListener("click", async () => {
  if (!state.deferredInstall) return;
  await state.deferredInstall.prompt();
  state.deferredInstall = null;
  elements.install.hidden = true;
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

window.addEventListener("pagehide", () => {
  stopAutoWatch();
  stopScreenShare();
  if (state.localURL) URL.revokeObjectURL(state.localURL);
  if (state.previewURL) URL.revokeObjectURL(state.previewURL);
});

elements.toggleUrl.addEventListener("click", () => {
  elements.urlLoader.hidden = !elements.urlLoader.hidden;
  elements.toggleUrl.setAttribute("aria-expanded", String(!elements.urlLoader.hidden));
});

document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => {
  const mode = button.dataset.mode;
  if (elements.autoSource.value !== mode) stopAutoWatch();
  elements.autoSource.value = mode;
  elements.moviePanel.hidden = mode !== "movie";
  elements.screenPanel.hidden = mode !== "screen";
  elements.shareMovie.hidden = mode !== "movie";
  elements.shareScreen.hidden = mode !== "screen";
  document.querySelectorAll(".tab").forEach((tab) => {
    const selected = tab === button;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-pressed", String(selected));
  });
}));
