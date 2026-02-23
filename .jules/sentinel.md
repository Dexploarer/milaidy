# Sentinel Journal

## 2025-02-19 - Arbitrary File Write via RTMP Stream
**Vulnerability:** The `StreamManager` passed a user-controlled `rtmpUrl` directly to `ffmpeg` via `spawn`. This allowed an attacker to supply a `file://` URL (e.g. `file:///tmp/owned.txt`), causing `ffmpeg` to write the stream to an arbitrary file on the server. It also potentially allowed argument injection if the URL started with `-`.
**Learning:** `spawn` prevents shell injection (splitting args by spaces), but it does NOT prevent the executed program (ffmpeg) from interpreting arguments as options or dangerous paths. Protocol validation is critical when dealing with URLs passed to media processors.
**Prevention:** Strictly validate and allowlist protocols (e.g. ensure URL starts with `rtmp://` or `rtmps://`) before passing them to external processes. Never assume downstream tools will sanitize inputs.
