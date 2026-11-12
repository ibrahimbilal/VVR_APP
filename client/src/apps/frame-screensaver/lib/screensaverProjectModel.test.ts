import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyExportToRender,
  bindRenderTrack,
  draftRender,
  mediaCountLabel,
  statusFromExportPhase,
} from './screensaverProjectModel'

describe('screensaver project render state', () => {
  it('maps export phases onto the shared status names', () => {
    assert.equal(statusFromExportPhase('queued'), 'queued')
    assert.equal(statusFromExportPhase('preparing'), 'rendering')
    assert.equal(statusFromExportPhase('rendering'), 'rendering')
    assert.equal(statusFromExportPhase('done'), 'completed')
    assert.equal(statusFromExportPhase('error'), 'failed')
    assert.equal(statusFromExportPhase('cancelled'), 'cancelled')
  })

  it('ignores events from an older track', () => {
    const current = bindRenderTrack(draftRender(), 'track-b')
    const stale = applyExportToRender(current, {
      projectId: 'p1',
      trackId: 'track-a',
      phase: 'done',
      progress: 1,
      error: null,
      jobId: 'job-a',
      downloadUrl: '/api/jobs/job-a/download',
      filename: 'old.mp4',
    })
    assert.equal(stale, null)
    assert.equal(current.trackId, 'track-b')
    assert.equal(current.outputUrl, null)
  })

  it('keeps one project record when the same project renders again', () => {
    let render = bindRenderTrack(draftRender(), 'track-a')
    render = applyExportToRender(render, {
      projectId: 'p1',
      trackId: 'track-a',
      phase: 'done',
      progress: 1,
      error: null,
      jobId: 'job-a',
      downloadUrl: '/api/jobs/job-a/download',
      filename: 'first.mp4',
    })!
    render = bindRenderTrack(render, 'track-b')
    assert.equal(render.status, 'queued')
    assert.equal(render.outputUrl, '/api/jobs/job-a/download')
    render = applyExportToRender(render, {
      projectId: 'p1',
      trackId: 'track-b',
      phase: 'rendering',
      progress: 0.4,
      error: null,
      jobId: 'job-b',
      downloadUrl: null,
      filename: null,
    })!
    assert.equal(render.status, 'rendering')
    assert.equal(render.progress, 0.4)
    assert.equal(render.jobId, 'job-b')
  })

  it('adopts a resumed job when the client track id was cleared', () => {
    const saved = {
      ...draftRender(),
      status: 'rendering' as const,
      progress: 0.2,
      jobId: 'job-a',
      trackId: null,
    }
    const next = applyExportToRender(saved, {
      projectId: 'p1',
      trackId: 'track-after-reload',
      phase: 'rendering',
      progress: 0.55,
      error: null,
      jobId: 'job-a',
      downloadUrl: null,
      filename: null,
    })
    assert.equal(next?.trackId, 'track-after-reload')
    assert.equal(next?.progress, 0.55)
  })

  it('labels the single screensaver source', () => {
    assert.equal(mediaCountLabel('image'), '1 image')
    assert.equal(mediaCountLabel('video'), '1 video')
    assert.equal(mediaCountLabel(null), 'No media')
  })
})
