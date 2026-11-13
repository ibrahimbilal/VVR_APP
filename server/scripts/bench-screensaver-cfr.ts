/**
 * Lightweight production CFR benchmarks (segment length + quality presets).
 * Uses 720p / short durations so it finishes on ~8 GB RAM machines.
 * Writes docs/screensaver-cfr-bench.md
 */
import { execFile } from 'node:child_process'
import { mkdir, rm, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { SCREENSAVER_CFR_SEGMENT_CANDIDATES_SEC, type ScreensaverCfrQuality } from '../../shared/screensaver'
import { ffmpegBinary } from '../src/binaries'
import { renderScreensaver } from '../src/renderScreensaver'
import { ensureStorage, outputsDir, tmpDir } from '../src/storage'
import { planStaticSegments, selectPreferredSegmentSeconds } from '../src/screensaverCfr/timeline'

const execFileAsync = promisify(execFile)
const REPORT = path.join(tmpDir, '..', '..', 'docs', 'screensaver-cfr-bench.md')

async function main(): Promise<void> {
  process.env.VVR_SCREENSAVER_TEST = '1'
  await ensureStorage()
  const root = path.join(tmpDir, 'cfr-bench')
  await rm(root, { recursive: true, force: true })
  await mkdir(root, { recursive: true })

  const composed = path.join(root, 'art.png')
  await execFileAsync(ffmpegBinary(), [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=1280x720:rate=1:duration=1',
    '-frames:v',
    '1',
    composed,
  ])

  const lines: string[] = [
    '# Screensaver Optimized CFR bench',
    '',
    `Generated ${new Date().toISOString()}. Short 720p runs for encoder / segment defaults.`,
    '',
    '## Segment planner (arithmetic)',
    '',
  ]

  for (const candidate of SCREENSAVER_CFR_SEGMENT_CANDIDATES_SEC) {
    const plan = planStaticSegments(53 * 60, 60, candidate)
    lines.push(
      `- Preferred ${candidate}s for 53s@60: unique lengths [${plan.uniqueFrameCounts.join(', ')}], refs ${plan.references.length}`,
    )
  }
  lines.push(
    '',
    `Selected preferred for 53s@60: **${selectPreferredSegmentSeconds(53 * 60, 60, 1)} s** (validated PoC baseline is 10 s).`,
    '',
    '## Quality presets (20 s @ 30 fps, 1280×720, no animation)',
    '',
    '| Quality | Wall (s) | Bytes |',
    '| --- | ---: | ---: |',
  )

  const qualities: ScreensaverCfrQuality[] = ['high', 'balanced', 'compact']
  for (const quality of qualities) {
    const id = `00000000-0000-4000-8000-00000000003${qualities.indexOf(quality)}`
    const started = performance.now()
    await renderScreensaver(
      {
        id,
        mediaPath: composed,
        mediaKind: 'image',
        mode: 'static',
        width: 1280,
        height: 720,
        fps: 30,
        duration: 20,
        fit: 'contain',
        loopType: 'hard',
        crossfadeSeconds: 1,
        audioMode: 'none',
        audioVolume: 0.7,
        audioFadeIn: 0,
        audioFadeOut: 0,
        loopAudio: true,
        backgroundColor: '#000000',
        musicPath: null,
        sourceDuration: 0,
        sourceHasAudio: false,
        profile: 'balanced',
        encoder: 'cpu',
        renderingMode: 'optimized-cfr',
        cfrQuality: quality,
        compositionPath: composed,
      },
      {
        cancelled: () => false,
        onProgress: () => undefined,
        onStatus: () => undefined,
        registerKill: () => undefined,
      },
    )
    const wall = (performance.now() - started) / 1000
    const output = path.join(outputsDir, `${id}.mp4`)
    const bytes = (await stat(output)).size
    lines.push(`| ${quality} | ${wall.toFixed(2)} | ${bytes} |`)
    await rm(output, { force: true })
  }

  lines.push(
    '',
    '## Defaults chosen for production',
    '',
    '- Static segment preference: **10 s** (PoC-validated; planner fills remainders with 2/5/30/60 s pieces).',
    '- Balanced quality: **CRF 20 / veryfast / GOP 2 s** (matches PoC YouTube-validated encode).',
    '- High: CRF 18 / medium. Compact: CRF 24 / veryfast / GOP 5 s.',
    '',
  )

  await writeFile(REPORT, `${lines.join('\n')}\n`)
  console.log(`Wrote ${REPORT}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
