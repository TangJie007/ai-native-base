# Loop Craft

Seamless looping is the product. Everything else is packaging.

## Strategies

### 1. Natural cycle (best)

Choose motion that returns to a visually identical state: pendulum, breath, rotating light with period T, tiled rain texture, looping particle systems authored to wrap.

Author the loop length = period (or integer multiple).

### 2. Hold + dissolve

Trim so start and end are similar (same framing, close lighting). Crossfade last N frames into first N frames.

- Quiet scene: N = 8–15 frames @30fps  
- Complex scene: N = 15–30 frames  
- Too long dissolve → mushy; too short → visible cut

### 3. Boomerang (A→B→A)

Play forward then reverse. Good for: sway, flicker, zoom breathing.  
Bad for: one-way water flow, walking crowds, reading text (text reverses), physics that look wrong backwards.

### 4. Tile / scroll wrap

Horizontal or vertical scroll of a tileable texture (clouds, stars, abstract). Period = width/speed. Ensure texture edges match (or mirror tile).

### 5. Locked-camera micro-motion

Camera fixed; only local elements move (steam, candles, leaves). Easier to loop than moving cameras.

## Detection checklist

Watch 3 loops with desktop icons visible (or mock icons overlay):

1. Cut / pop at seam?
2. Motion vector suddenly reverses or jumps?
3. Exposure flicker?
4. Subject jumps position?
5. Audio click (if any)?

If yes to any → fix before encode.

## ffmpeg — trim

```bash
ffmpeg -y -ss 00:00:02.000 -to 00:00:14.000 -i source.mp4 -c copy work/trim.mp4
```

Prefer re-encode after trim if cut is not on keyframe:

```bash
ffmpeg -y -ss 00:00:02.000 -to 00:00:14.000 -i source.mp4 \
  -c:v libx264 -crf 18 -pix_fmt yuv420p -an work/trim.mp4
```

## ffmpeg — crossfade loop (xfade)

Goal: T-second clip → seamless by overlapping dissolve of `d` seconds.

Example: 12s clip, 0.5s dissolve → output duration ≈ 11.5s.

```bash
# offset = duration - d
ffmpeg -y -i work/trim.mp4 -i work/trim.mp4 -filter_complex \
  "[0:v][1:v]xfade=transition=fade:duration=0.5:offset=11.5,format=yuv420p[v]" \
  -map "[v]" -an -c:v libx264 -crf 18 -movflags +faststart work/loop.mp4
```

Compute `offset = input_duration - duration`. Measure duration first:

```bash
ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 work/trim.mp4
```

## ffmpeg — boomerang

```bash
ffmpeg -y -i work/trim.mp4 -filter_complex \
  "[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0,format=yuv420p[v]" \
  -map "[v]" -an -c:v libx264 -crf 18 -movflags +faststart work/boomerang.mp4
```

## ffmpeg — Ken Burns from still (Path B starter)

Slow zoom on a still, then boomerang or xfade for seam. Example 12s @30fps zoom:

```bash
ffmpeg -y -loop 1 -i source/still.png -vf \
  "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,\
   zoompan=z='min(zoom+0.0004,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=360:s=1920x1080:fps=30,\
   format=yuv420p" \
  -t 12 -c:v libx264 -crf 18 -an work/kenburns.mp4
```

Then apply boomerang or ensure end≈start by limiting zoom range and dissolving.

## Content rules for loops

- No progressive story that “ends”
- No accumulating particles that never reset (snow piles forever)
- No UI clocks / progress bars
- Rain/snow: use looping emitters or tile UV scroll
- Day-night cycles: only if full cycle fits in loop length

## Reduced motion / accessibility

Offer a still poster frame (`poster.png`) beside the video for users who disable live wallpaper.
