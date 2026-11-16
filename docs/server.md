# Optional Bilibili import integration

`server/media_import.py` is an extracted helper module, not an HTTP server. It requires Python 3, `yt-dlp`, and `ffmpeg` on PATH. It accepts validated Bilibili video or bangumi URLs, creates temporary jobs, and exposes helpers for job status, signed media access, and byte-range streaming.

Configure `CINEMA_WATCH_CACHE` to a private writable directory. Optional `CINEMA_YTDLP` points to the executable, and `CINEMA_BILIBILI_COOKIES` points to a private Netscape-format cookie file. Do not commit or expose cookies. By default, media is stored below the current user's cache directory. Cleanup is performed when the next import starts; expired files may remain indefinitely if no later import occurs. Add a periodic cleanup mechanism appropriate to the deployment.

Your authenticated host must implement the HTTP routes around `start`, `read`, `ticket`, and `serve`, provide a strong secret, expiration handling, the handler methods expected by `serve`, allowed origins, safe logs and deletion. Authentication is required for starting, checking and deleting jobs; the media URL is a separate short-lived capability. Exclude capability query parameters from logs. The module's in-process lock and reuse behavior assume a single trusted service process; it is not designed for multiple workers or mutually untrusted tenants. Review network egress, storage limits and process supervision before deployment. Do not expose this module directly.

The helper supports only authorized access and does not bypass platform access restrictions or DRM. Available subtitles and compatible formats are not guaranteed. The unit tests cover validation, job reuse, tickets and range parsing; they do not test a real server, streaming integration, or live site.
