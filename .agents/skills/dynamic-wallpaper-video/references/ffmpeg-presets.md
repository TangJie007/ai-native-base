# ffmpeg Presets

Assume `ffmpeg` and `ffprobe` available. Run from `wallpaper-<slug>/`.

## Probe

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,avg_frame_rate,duration,codec_name \
  -of json work/loop.mp4
```

## Master → 1080p H.264 (default deliverable)

```bash
ffmpeg -y -i work/loop.mp4 \
  -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p" \
  -c:v libx264 -crf 19 -preset slow -profile:v high -level 4.1 \
  -movflags +faststart -an \
  out/slug_1080p.mp4
```

Fill-crop variant (no bars):

```bash
ffmpeg -y -i work/loop.mp4 \
  -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,format=yuv420p" \
  -c:v libx264 -crf 19 -preset slow \
  -movflags +faststart -an \
  out/slug_1080p.mp4
```

## 1440p / 4K

```bash
ffmpeg -y -i work/loop.mp4 \
  -vf "scale=2560:1440:force_original_aspect_ratio=increase,crop=2560:1440,fps=30,format=yuv420p" \
  -c:v libx264 -crf 18 -preset slow -movflags +faststart -an \
  out/slug_1440p.mp4

ffmpeg -y -i work/loop.mp4 \
  -vf "scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160,fps=30,format=yuv420p" \
  -c:v libx264 -crf 18 -preset slow -movflags +faststart -an \
  out/slug_4k.mp4
```

## HEVC (macOS-friendly optional)

```bash
ffmpeg -y -i work/loop.mp4 \
  -vf "scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160,fps=30,format=yuv420p" \
  -c:v libx265 -crf 20 -tag:v hvc1 -movflags +faststart -an \
  out/slug_4k_hevc.mp4
```

`-tag:v hvc1` improves Apple playback compatibility.

## With ambient audio

```bash
ffmpeg -y -i work/loop.mp4 -i source/ambient.wav \
  -filter_complex "[1:a]aloop=loop=-1:size=2e+09,atrim=0:12,afade=t=in:st=0:d=0.5,afade=t=out:st=11.5:d=0.5[a]" \
  -map 0:v -map "[a]" \
  -c:v copy -c:a aac -b:a 128k -shortest \
  out/slug_1080p_audio.mp4
```

Prefer re-encoding video if `copy` fails due to length mismatch. Audio loop length must match video; fade ends to hide clicks.

## Preview GIF (optional, ≤3MB target)

```bash
ffmpeg -y -i out/slug_1080p.mp4 -vf \
  "fps=12,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" \
  -loop 0 out/slug_preview.gif
```

## Poster still

```bash
ffmpeg -y -ss 00:00:01.000 -i out/slug_1080p.mp4 -frames:v 1 out/poster.png
```

## Checksums (PowerShell)

```powershell
Get-FileHash out\* -Algorithm SHA256 |
  ForEach-Object { "{0}  {1}" -f $_.Hash, $_.Path } |
  Set-Content out\checksums.txt
```

## Bash checksums

```bash
(cd out && sha256sum * > checksums.txt)
```

## Two-pass bitrate (optional, size-capped)

When user demands “under X MB”:

```bash
# example target ~8Mbps @1080p
ffmpeg -y -i work/loop.mp4 \
  -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,format=yuv420p" \
  -c:v libx264 -b:v 8M -maxrate 10M -bufsize 16M -preset slow \
  -movflags +faststart -an out/slug_1080p.mp4
```
