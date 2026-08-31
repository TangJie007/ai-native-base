# Specs — Resolution, Codec, Safe Area

## Target resolutions

| Label | Size | When |
| --- | ---: | --- |
| `1080p` | 1920×1080 | Default Windows laptop / 1080p monitor |
| `1440p` | 2560×1440 | Gaming / 2K monitors |
| `4k` | 3840×2160 | 4K desktop / future-proof master |
| `ultrawide` | 3440×1440 or 3840×1600 | Only if user has UW; do not letterbox 16:9 into UW without asking |
| `phone-vertical` | 1080×1920 or 1440×3168-class | Phone wallpaper; confirm device |

Always encode **exact** width/height even numbers (H.264 requirement). Prefer **crop** to fill over stretch.

Multi-monitor: deliver one clip per geometry, or one large canvas only if the user wants a spanned wallpaper (rare; confirm).

## Frame rate & duration

| | Recommendation |
| --- | --- |
| FPS | 30 default; 24 for filmic stills; 60 only if motion needs it (cost↑) |
| Loop length | 8–20 s sweet spot; ≤30 s hard preference |
| Keyframe | GOP ≈ 2×fps for scrubbing friendliness optional; seamless loop cares more about content than GOP |

## Codecs

| Codec | Container | Use |
| --- | --- | --- |
| **H.264** | MP4 | **Default** — Lively / Wallpaper Engine / almost everything |
| HEVC (H.265) | MP4 | macOS / storage-sensitive 4K; confirm player support |
| VP9 | WebM | Browser / some Linux; optional secondary |
| AV1 | MP4/WebM | Optional modern; not primary for WE/Lively yet |

Pixel format: **`yuv420p`** for maximum player compatibility.  
Move atoms: **`+faststart`** on MP4.

### Bitrate / CRF guides (silent ambient)

| Res | H.264 CRF | Or target bitrate |
| --- | ---: | --- |
| 1080p | 18–22 | 6–10 Mbps |
| 1440p | 18–21 | 10–16 Mbps |
| 4K | 18–20 | 20–35 Mbps |

Low-motion rain/clouds: lean toward higher CRF (smaller). High-detail cities/particles: lower CRF.

## Color

- Rec.709 / limited TV range for desktop wallpaper is fine.
- Avoid HDR deliverables unless user explicitly wants HDR wallpaper support (fragmented).
- Export full-range only when you know the player; default limited + `yuv420p`.

## Safe area (desktop icons)

Assume icons sit on **left edge** and sometimes **bottom** (Windows / many setups).

- Keep critical subject in **central 70%** width and upper-mid height.
- Avoid important motion hugging the left 12% strip.
- Very dark or very busy left edge makes icons unreadable — prefer mid-contrast soft regions there.

Phone: respect status bar / home indicator; keep subject mid-frame.

## Audio

| Mode | Spec |
| --- | --- |
| Silent (default) | `-an`, no audio track |
| Ambient | AAC-LC 96–128 kbps stereo or mono; peak-normalize gently; loop-audio must also seam |

Many users mute wallpaper audio — visual loop must stand alone.

## File naming

```text
<slug>_1080p.mp4
<slug>_1440p.mp4
<slug>_4k.mp4
<slug>_1080p_hevc.mp4
```

`slug`: kebab-case, ASCII.
