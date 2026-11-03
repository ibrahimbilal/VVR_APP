/** Downscale a local file for the on-screen preview so the browser does not keep a full 4K or 8K bitmap. */
export async function readLocalImage(file: File, maxEdge: number): Promise<{ width: number; height: number; previewUrl: string }> {
  const bitmap = await createImageBitmap(file)
  try {
    const width = bitmap.width
    const height = bitmap.height
    const scale = Math.min(1, maxEdge / Math.max(width, height, 1))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not preview this image.')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86))
    if (!blob) throw new Error('Could not preview this image.')
    return { width, height, previewUrl: URL.createObjectURL(blob) }
  } finally {
    bitmap.close()
  }
}
