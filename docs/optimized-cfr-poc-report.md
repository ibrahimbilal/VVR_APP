# Optimized CFR proof of concept

Generated 2026-11-12T23:11:06.012Z. This is a standalone test. The Screensaver export path is unchanged, and YouTube compatibility is not claimed.

## Setup

- Host: Ribo-Laptop
- CPU: 12th Gen Intel(R) Core(TM) i5-12450H
- Memory: 7.70 GB
- FFmpeg: ffmpeg version 6.1.1-essentials_build-www.gyan.dev Copyright (c) 2000-2023 the FFmpeg developers
- Picture: 3840x2160 testsrc2 still, with a generated SUBSCRIBE graphic that slides in and out during the first 6.9 seconds. This is a stand-in for the editor's subscribe animation, not a frame from that canvas renderer.
- Timeline: 7 s animation + five reused 10 s static segments + one 3 s remainder = 60 s
- Encoder base: existing libx264 standard settings (CRF 20, veryfast, stillimage tune on static segments only)
- Added for concat compatibility: High profile, level 5.2, yuv420p, bt.709, closed GOP, 2 s keyframe interval, timescale 60000
- Chosen concat strategy: MP4 segments, 2 B-frames

## Strategy trials

- MP4 segments, 2 B-frames: passed 1800 frames at 1/60000, tick 1000.

The optimized concat uses `-c:v copy`. It does not fall back to a full re-encode.

## Measurements

| Method | Render time | Frames encoded | File size | Peak FFmpeg working set | Temp disk | Duration | Frames | Nominal rate | Average rate | CFR valid |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Existing VFR | 21.27 s | 473 | 921.5 KB | 1.32 GB | 1.8 MB | 64.000000 | 473 | 60/1 | 4730/619 | no |
| Full-video CFR | 162.67 s | 3600 | 7.2 MB | 1.35 GB | 7.2 MB | 60.000000 | 3600 | 60/1 | 60/1 | yes |
| Optimized CFR | 55.39 s | 1200 | 7.1 MB | 1.39 GB | 9.6 MB | 60.000000 | 3600 | 60/1 | 60/1 | yes |

Frames encoded counts pictures sent to libx264. The optimized output still contains 3600 frames because the 10 s segment is referenced 5 times in the concat list and stored once on disk (2.5 MB of unique segment media versus 7.1 MB if those repeats were separate files). File sizes are small because the test pattern is large flat colors. The useful comparison is time and frames encoded, not these byte counts as an estimate for a photograph.

### Existing VFR

- Same segment split and concat flags as `renderScreensaverHybrid`: 420 frames at 60 fps, then 53 frames at 1 fps, concat copy with `+genpts`.
- The pieces were 7.000 s and 53.000 s before concat. The joined file is 473 frames, time base `1/15360`, duration 64.000 s, average rate `4730/619` (about 7.64 fps).
- At the join, presentation time goes 6.983 s, then 7.467 s, and later static timestamps are not spaced at 1 second. Packet durations in the joined file are all one 60 fps tick. This run started with the animation, so the file inherited the 60 fps time base. A four-hour export that starts on 1 fps static art keeps the 1 fps time base instead (`1/16384` on the file that played back as `3840x2160@6`). Both results are variable frame rate.
- Output: `server/tmp/cfr-poc/vfr/vfr.mp4`

### Full-video CFR

- One libx264 encode of all 3600 frames. The subscribe graphic is enabled for the first 6.9 seconds.
- Time base `1/60000`, 3600 packets, PTS `0, 1000, 2000 … 3598000`, every packet duration 1000, DTS steps of 1000. Nominal rate, average rate, and duration are `60/1`, `60/1`, and 60.000000.
- An early checker also demanded keyframes at the concat indexes (420, 1020, 1620, 2220, 2820, 3420). Those indexes belong to the segmented file. This single encode places a keyframe every 2 seconds, and the packet grid above is the CFR result.
- Output: `server/tmp/cfr-poc/full/full-cfr.mp4`

### Optimized CFR

- Strategy: MP4 segments, 2 B-frames. No MPEG-TS fallback was required.
- Static segment encoded once (1.1 MB) and listed five times. Remainder encoded once (433 KB). Animation encoded once (981 KB). Unique segment media is 2.5 MB. Five physical copies of the static segment would have been about 7.1 MB, which is the size of the stream-copied video.
- Timestamp grid, DTS steps, packet durations, and keyframes at every segment start matched. The final concat command is `-c:v copy`.
- Output: `server/tmp/cfr-poc/optimized/video.mp4`

## Timestamp proof

Optimized time base `1/60000`, tick 1000. Packet count 3600. First PTS 0, last PTS 3598000. A 60 fps frame at timescale 60000 is 1000 ticks. Matching nominal and average rates is not treated as proof; the integer PTS grid and DTS steps are.

Boundary packet indexes checked for keyframes: 0, 420, 1020, 1620, 2220, 2820, 3420.

## Visual checks

| Check | Result |
| --- | --- |
| Seek extract matches accurate extract at frame 420 | yes |
| Reused static frame 420 hash equals frame 1020 | yes |
| Reused static frame 420 hash equals frame 2820 | yes |
| SSIM across first static join (frames 1019 and 1020) | 0.997023 |
| SSIM across remainder join (frames 3419 and 3420) | 0.997023 |
| SSIM animation frame 210, optimized vs full CFR | 1.000000 |
| SSIM static frame 1800, optimized vs full CFR | 0.998519 |
| SSIM optimized static frame vs source artwork | 0.840933 |
| Black frames, optimized | 0 |
| Black frames, full CFR | 0 |
| Black frames, VFR | 0 |

The artwork score is the RGB test pattern against the yuv420 encode. The pattern has hard edges and a fine dot grid, so 0.84 is the encode, not a join error. Joins are 0.997, and the first frame of each reused 10 s copy is byte-identical (frames 420, 1020, and 2820). Frames at 3.5 s show the subscribe graphic. Frames on either side of 17 s and 57 s are the still, with no black frame.

Extracted frames are in `server/tmp/cfr-poc/frames/`.

## Audio mux

Silent stereo AAC was muxed with `-c:v copy` onto the optimized video. Video timestamp checksum matched the video-only file. Video duration 60.000000 s, audio duration 60.000000 s. The upload candidate is the muxed file.

## Four-hour projection

Not measured. Arithmetic only, using this timeline shape (7 s animation, then static): a 14400 s film needs 864000 frames at 60 fps. The static tail is 14393 s = 1439 × 10 s + 3 s, the same remainder this 60 s test encodes. Frames that would be encoded: 420 + 600 + 180 = 1200, against 864000 frames stored in the output.

## YouTube

Upload candidate: `C:\Users\Gebruiker\Desktop\VVR_APP\server\tmp\cfr-poc\out\youtube-optimized-cfr-60s.mp4`

Do not treat this file as YouTube-compatible until a manual upload shows:

- 4K processing has finished
- playback quality 2160p60 is available
- Stats for Nerds shows `3840x2160@60`
- the subscribe graphic moves smoothly
- joins at 7 s, 17 s, 27 s, 37 s, 47 s, and 57 s do not flash or pause

Average rate on this 60 s VFR comparison is about 4730/619 fps because the 7 s animation is a large share of a one-minute file. The four-hour export that showed `3840x2160@6` has an average near 1 fps. This test answers whether the reused segments are CFR. It does not reproduce that four-hour average.
