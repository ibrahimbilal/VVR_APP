# Screensaver Optimized CFR bench

Generated 2026-11-12T23:54:26.374Z. Short 720p runs for encoder / segment defaults.

## Segment planner (arithmetic)

- Preferred 2s for 53s@60: unique lengths [120, 60], refs 27
- Preferred 5s for 53s@60: unique lengths [300, 120, 60], refs 12
- Preferred 10s for 53s@60: unique lengths [600, 120, 60], refs 7
- Preferred 30s for 53s@60: unique lengths [1800, 600, 120, 60], refs 5
- Preferred 60s for 53s@60: unique lengths [1800, 600, 120, 60], refs 5

Selected preferred for 53s@60: **10 s** (validated PoC baseline is 10 s).

## Quality presets (20 s @ 30 fps, 1280×720, no animation)

| Quality | Wall (s) | Bytes |
| --- | ---: | ---: |
| high | 0.29 | 567630 |
| balanced | 0.26 | 404282 |
| compact | 0.25 | 152122 |

## Defaults chosen for production

- Static segment preference: **10 s** (PoC-validated; planner fills remainders with 2/5/30/60 s pieces).
- Balanced quality: **CRF 20 / veryfast / GOP 2 s** (matches PoC YouTube-validated encode).
- High: CRF 18 / medium. Compact: CRF 24 / veryfast / GOP 5 s.

