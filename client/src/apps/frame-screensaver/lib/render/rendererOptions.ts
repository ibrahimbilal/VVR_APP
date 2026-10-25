export interface ScreensaverRendererOptions {
  /** Called after WebGL context loss (restore may follow). */
  onContextLost?: () => void
  /** Called when context restore failed; caller should switch to Canvas2D. */
  onRestoreFailed?: () => void
}
