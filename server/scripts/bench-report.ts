import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpDir } from '../src/storage'

interface BenchFile {
  label: string
  rows: { name: string; renderingSeconds: number | null; valid: boolean; encoder?: string }[]
}

async function main(): Promise<void> {
  const rankingBefore = await readOptional(path.join(tmpDir, 'bench-ranking-baseline.json'))
  const rankingAfter = await readOptional(path.join(tmpDir, 'bench-ranking-after.json'))
  const saverBefore = await readOptional(path.join(tmpDir, 'bench-baseline.json'))
  const saverAfter = await readOptional(path.join(tmpDir, 'bench-after.json'))

  const lines: string[] = [
    '# Render benchmark report',
    '',
    'Generated from machine-readable JSON in `server/tmp/`. Re-run:',
    '',
    '```bash',
    'npm run bench:ranking baseline',
    'npm run bench:screensaver baseline',
    '# …after optimizations…',
    'npm run bench:ranking after',
    'npm run bench:screensaver after',
    'npm run bench:render-report',
    '```',
    '',
    '## Summary (§13)',
    '',
    '| Workload | Before | After | Improvement | Quality |',
    '| --- | --- | --- | --- | --- |',
  ]

  const workloads: { label: string; beforeKeys: string[]; afterKeys: string[]; source: 'ranking' | 'screensaver' }[] = [
    { label: 'Ranking 1080p', beforeKeys: ['ranking-1080p-cut'], afterKeys: ['ranking-1080p-cut'], source: 'ranking' },
    { label: 'Ranking with transitions', beforeKeys: ['ranking-1080p-fade'], afterKeys: ['ranking-1080p-fade'], source: 'ranking' },
    { label: 'Static Screensaver 1080p', beforeKeys: ['static-1080p'], afterKeys: ['static-1080p-30fps'], source: 'screensaver' },
    { label: 'Static Screensaver 4K', beforeKeys: ['static-4k'], afterKeys: ['static-4k-1fps'], source: 'screensaver' },
    { label: 'Animated Screensaver', beforeKeys: ['loop-1080p'], afterKeys: ['loop-1080p'], source: 'screensaver' },
  ]

  lines.push('', 'Ranking **before** rows used `VVR_FFMPEG_THREADS=1`, `VVR_FFMPEG_FILTER_THREADS=1`, `VVR_X264_THREADS=1`.', '')

  for (const item of workloads) {
    const beforeFile = item.source === 'ranking' ? rankingBefore : saverBefore
    const afterFile = item.source === 'ranking' ? rankingAfter : saverAfter
    const before = firstRow(beforeFile, item.beforeKeys)?.renderingSeconds ?? null
    const afterRow = firstRow(afterFile, item.afterKeys)
    const after = afterRow?.renderingSeconds ?? null
    const improvement = pctImprovement(before, after)
    const quality =
      afterRow?.valid === false
        ? 'failed verify'
        : before == null && after == null
          ? 'Not Tested'
          : 'verified'
    lines.push(
      `| ${item.label} | ${fmt(before)} | ${fmt(after)} | ${improvement} | ${quality} |`,
    )
  }

  lines.push('', '## Raw files', '')
  if (rankingBefore) lines.push('- `server/tmp/bench-ranking-baseline.json`')
  if (rankingAfter) lines.push('- `server/tmp/bench-ranking-after.json`')
  if (saverBefore) lines.push('- `server/tmp/bench-baseline.json`')
  if (saverAfter) lines.push('- `server/tmp/bench-after.json`')

  const repoDest = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../docs/render-benchmark-report.md')
  await writeFile(repoDest, lines.join('\n'))
  console.log(`Wrote ${repoDest}`)
}

function firstRow(file: BenchFile | null, names: string[]) {
  for (const name of names) {
    const row = file?.rows.find((item) => item.name === name)
    if (row) return row
  }
  return null
}

function fmt(value: number | null): string {
  if (value == null) return 'Not Tested'
  return `${value}s`
}

function pctImprovement(before: number | null, after: number | null): string {
  if (before == null || after == null || before <= 0) return '—'
  const pct = ((before - after) / before) * 100
  return `${Math.round(pct * 10) / 10}%`
}

async function readOptional(file: string): Promise<BenchFile | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as BenchFile
  } catch {
    return null
  }
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
