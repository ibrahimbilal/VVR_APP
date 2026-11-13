#!/usr/bin/env node
/**
 * Lightweight SemVer release helpers for Ribo Studio.
 * Preparation only: never commits, tags, pushes, or publishes.
 *
 * Usage:
 *   node scripts/release.mjs check
 *   node scripts/release.mjs prepare patch|minor|major [--dry-run]
 */
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PKG_PATH = path.join(root, 'package.json')
const LOCK_PATH = path.join(root, 'package-lock.json')
const CHANGELOG_PATH = path.join(root, 'CHANGELOG.md')
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

const args = process.argv.slice(2)
const command = args[0]
const dryRun = args.includes('--dry-run')

function fail(message, code = 1) {
  console.error(`release: ${message}`)
  process.exit(code)
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function git(argsList, { allowFail = false } = {}) {
  const result = spawnSync('git', argsList, { cwd: root, encoding: 'utf8' })
  if (result.status !== 0 && !allowFail) {
    fail(`git ${argsList.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`)
  }
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  }
}

function parseSemver(version) {
  const match = SEMVER_RE.exec(version)
  if (!match) return null
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

function formatSemver({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`
}

function bumpVersion(version, type) {
  const parsed = parseSemver(version)
  if (!parsed) fail(`invalid current version "${version}" (expected MAJOR.MINOR.PATCH)`)
  if (type === 'major') return formatSemver({ major: parsed.major + 1, minor: 0, patch: 0 })
  if (type === 'minor') return formatSemver({ major: parsed.major, minor: parsed.minor + 1, patch: 0 })
  if (type === 'patch') return formatSemver({ major: parsed.major, minor: parsed.minor, patch: parsed.patch + 1 })
  fail(`unknown release type "${type}" (use patch, minor, or major)`)
}

function listReleaseTags() {
  const { stdout } = git(['tag', '-l', 'v*'], { allowFail: true })
  if (!stdout) return []
  return stdout
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => SEMVER_RE.test(t.slice(1)))
    .sort((a, b) => {
      const pa = parseSemver(a.slice(1))
      const pb = parseSemver(b.slice(1))
      if (!pa || !pb) return a.localeCompare(b)
      if (pa.major !== pb.major) return pa.major - pb.major
      if (pa.minor !== pb.minor) return pa.minor - pb.minor
      return pa.patch - pb.patch
    })
}

function latestReleaseTag(tags) {
  return tags.length ? tags[tags.length - 1] : null
}

function workingTreeClean() {
  const { stdout } = git(['status', '--porcelain'])
  return stdout.length === 0
}

/** Body of ## [Unreleased] up to the next ## [version] heading (does not eat that heading). */
function unreleasedBody(changelog) {
  const match = changelog.match(/## \[Unreleased\][^\n]*\r?\n([\s\S]*?)(?=\r?\n## \[|$)/i)
  return match ? match[1] : null
}

function changelogHasUnreleasedContent(changelog) {
  const body = unreleasedBody(changelog)
  if (body == null) return false
  return /###\s+\w+/.test(body) && /-\s+\S/.test(body)
}

function prepareChangelog(changelog, nextVersion, today) {
  if (!/## \[Unreleased\]/i.test(changelog)) {
    fail('CHANGELOG.md is missing an ## [Unreleased] section')
  }
  if (!changelogHasUnreleasedContent(changelog)) {
    fail('CHANGELOG.md Unreleased section has no entries to promote')
  }

  const body = (unreleasedBody(changelog) || '').replace(/\s+$/, '\n')
  const header = `## [Unreleased]\n\n## [${nextVersion}] — ${today}\n${body}`
  return changelog.replace(/## \[Unreleased\][^\n]*\r?\n[\s\S]*?(?=\r?\n## \[|$)/i, header)
}

function syncLockfileVersion(nextVersion) {
  if (!fs.existsSync(LOCK_PATH)) {
    console.warn('release: package-lock.json missing; skipped lock sync')
    return
  }
  const lock = readJson(LOCK_PATH)
  lock.version = nextVersion
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = nextVersion
  }
  writeJson(LOCK_PATH, lock)
}

function runNpmScript(scriptName) {
  console.log(`release: running npm run ${scriptName} …`)
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', scriptName], {
    cwd: root,
    stdio: 'inherit',
  })
}

function printCheckReport() {
  const pkg = readJson(PKG_PATH)
  const version = pkg.version
  const parsed = parseSemver(version)
  const tags = listReleaseTags()
  const latest = latestReleaseTag(tags)
  const lock = fs.existsSync(LOCK_PATH) ? readJson(LOCK_PATH) : null
  const changelog = fs.existsSync(CHANGELOG_PATH) ? fs.readFileSync(CHANGELOG_PATH, 'utf8') : null
  const clean = workingTreeClean()
  const tagForCurrent = `v${version}`
  const tagExistsLocal = tags.includes(tagForCurrent)
  const remoteTag = git(['ls-remote', '--tags', 'origin', `refs/tags/${tagForCurrent}`], { allowFail: true })
  const tagExistsRemote = Boolean(remoteTag.stdout && remoteTag.stdout.includes(`refs/tags/${tagForCurrent}`))

  const issues = []
  if (!parsed) issues.push(`package.json version "${version}" is not valid SemVer MAJOR.MINOR.PATCH`)
  if (lock && lock.version !== version) issues.push(`package-lock.json version "${lock.version}" != package.json "${version}"`)
  if (lock?.packages?.[''] && lock.packages[''].version !== version) {
    issues.push(`package-lock packages[""].version != package.json`)
  }
  if (!changelog) issues.push('CHANGELOG.md is missing')
  else if (!/## \[Unreleased\]/i.test(changelog)) issues.push('CHANGELOG.md missing [Unreleased] section')
  if (tagExistsLocal) issues.push(`local tag ${tagForCurrent} already exists`)
  if (tagExistsRemote) issues.push(`remote tag ${tagForCurrent} already exists`)

  console.log('Release check')
  console.log(`  package.json version : ${version}`)
  console.log(`  package-lock version : ${lock?.version ?? '(missing)'}`)
  console.log(`  latest release tag   : ${latest ?? '(none)'}`)
  console.log(`  tag for current      : ${tagForCurrent} (local=${tagExistsLocal}, remote=${tagExistsRemote})`)
  console.log(`  working tree clean   : ${clean}`)
  console.log(`  changelog Unreleased : ${changelog ? (changelogHasUnreleasedContent(changelog) ? 'has entries' : 'empty / no bullets') : 'missing'}`)

  if (!clean) {
    console.log('  note: dirty tree is OK for check; prepare will refuse unless --dry-run')
  }

  if (issues.length) {
    console.log('\nIssues:')
    for (const issue of issues) console.log(`  - ${issue}`)
    process.exit(1)
  }

  console.log('\nOK — no blocking consistency issues for the current version.')
  console.log('Next: propose a bump with the release-manager skill, then `npm run release:<type>` after approval.')
}

function prepare(type) {
  if (!['patch', 'minor', 'major'].includes(type)) {
    fail('prepare requires patch, minor, or major')
  }

  const pkg = readJson(PKG_PATH)
  const current = pkg.version
  const next = bumpVersion(current, type)
  const tag = `v${next}`
  const tags = listReleaseTags()

  if (tags.includes(tag)) fail(`local tag ${tag} already exists; refusing to prepare`)
  const remoteTag = git(['ls-remote', '--tags', 'origin', `refs/tags/${tag}`], { allowFail: true })
  if (remoteTag.stdout && remoteTag.stdout.includes(`refs/tags/${tag}`)) {
    fail(`remote tag ${tag} already exists; refusing to prepare`)
  }

  if (!dryRun && !workingTreeClean()) {
    fail('working tree is dirty; commit or stash unrelated changes before prepare (or use --dry-run)')
  }

  if (!fs.existsSync(CHANGELOG_PATH)) fail('CHANGELOG.md is missing')
  const changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8')
  const today = new Date().toISOString().slice(0, 10)
  const nextChangelog = prepareChangelog(changelog, next, today)

  console.log(`release: ${current} → ${next} (${type})`)
  console.log(`release: planned tag ${tag}`)
  if (dryRun) {
    console.log('release: --dry-run (no files written)')
    console.log('release: changelog would promote [Unreleased] into the new version section')
    return
  }

  pkg.version = next
  writeJson(PKG_PATH, pkg)
  syncLockfileVersion(next)
  fs.writeFileSync(CHANGELOG_PATH, nextChangelog)

  console.log('release: updated package.json, package-lock.json, CHANGELOG.md')
  console.log('release: running validation (typecheck + production build) …')
  try {
    runNpmScript('typecheck')
    runNpmScript('build:prod')
  } catch {
    fail('validation failed after version bump — fix errors before finalizing; version files were already updated')
  }

  console.log('\nPreparation complete. Do NOT commit/tag yet without explicit approval.')
  console.log('Finalize (manual, after approval):')
  console.log(`  git add package.json package-lock.json CHANGELOG.md`)
  console.log(`  git commit -m "Release v${next}"`)
  console.log(`  git tag -a v${next} -m "Release v${next}"`)
  console.log('Push only when explicitly authorized:')
  console.log(`  git push origin HEAD`)
  console.log(`  git push origin v${next}`)
}

if (command === 'check') {
  printCheckReport()
} else if (command === 'prepare') {
  prepare(args[1])
} else {
  fail(`usage: node scripts/release.mjs <check|prepare> [patch|minor|major] [--dry-run]`)
}
