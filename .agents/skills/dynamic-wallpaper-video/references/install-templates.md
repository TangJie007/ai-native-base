# INSTALL.md Templates

Copy into `wallpaper-<slug>/INSTALL.md` and fill paths.

```markdown
# <Title> — Dynamic Wallpaper

## Files

| File | Use |
| --- | --- |
| `out/<slug>_1080p.mp4` | Default (Windows / general) |
| `out/<slug>_1440p.mp4` | 2K monitors (optional) |
| `out/<slug>_4k.mp4` | 4K (optional) |
| `out/<slug>_4k_hevc.mp4` | macOS / size-sensitive (optional) |
| `out/poster.png` | Static fallback |
| `out/<slug>_preview.gif` | Chat preview only — not for wallpaper |

Silent loop · <W>x<H> · <fps>fps · ~<N>s

## Windows — Lively Wallpaper

1. Install [Lively](https://www.rocksdanister.com/lively/).
2. Open Lively → **Add Wallpaper** (or drag the MP4 in).
3. Select `out/<slug>_1080p.mp4` (or matching resolution).
4. Enable hardware decoding if available.
5. Set pause-when-fullscreen if you game on this PC.

## Windows — Wallpaper Engine

1. Open Wallpaper Engine → **Create Wallpaper** → video / import file.
2. Choose the MP4 matching your monitor resolution.
3. Publish locally; mute audio if the pack includes sound you do not want.

## macOS

1. Prefer the HEVC file when provided.
2. Use a video-wallpaper app that supports seamless MP4/HEVC loops
   (options change over time — pick one you already trust).
3. If the app rejects HEVC, use the H.264 `*_1080p.mp4` / `*_4k.mp4`.

## Android

1. Open your live-wallpaper / video-wallpaper app.
2. Import `*_1080p.mp4` or the vertical export if provided.
3. Allow the app to run in background; disable aggressive battery optimization for it if the loop freezes.

## iOS

1. Import into a live-wallpaper / Live Photo tool you use, or save the short loop as directed by that app.
2. System support varies by iOS version — the MP4 is the source of truth.

## Tips

- Match resolution to the display to save GPU.
- If icons are hard to read, lower wallpaper brightness in the wallpaper app or pick `poster.png` as static.
- Do not use the preview GIF as the actual wallpaper.
```
