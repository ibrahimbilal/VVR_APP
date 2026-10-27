# Render benchmark report

Generated from machine-readable JSON in `server/tmp/`. Re-run:

```bash
npm run bench:ranking baseline
npm run bench:screensaver baseline
# …after optimizations…
npm run bench:ranking after
npm run bench:screensaver after
npm run bench:render-report
```

## Summary (§13)

| Workload | Before | After | Improvement | Quality |
| --- | --- | --- | --- | --- |

Ranking **before** rows used `VVR_FFMPEG_THREADS=1`, `VVR_FFMPEG_FILTER_THREADS=1`, `VVR_X264_THREADS=1`.

| Ranking 1080p | 18.18s | 5.72s | 68.5% | verified |
| Ranking with transitions | 20.97s | 9.9s | 52.8% | verified |
| Static Screensaver 1080p | 4.31s | 3.89s | 9.7% | verified |
| Static Screensaver 4K | 13.23s | 1.55s | 88.3% | verified |
| Animated Screensaver | 3.57s | 5.77s | -61.6% | verified |

## Raw files

- `server/tmp/bench-ranking-baseline.json`
- `server/tmp/bench-ranking-after.json`
- `server/tmp/bench-baseline.json`
- `server/tmp/bench-after.json`