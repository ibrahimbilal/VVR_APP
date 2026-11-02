let loadedUrl: string | null = null
let loadedImage: HTMLImageElement | null = null
let loadPromise: Promise<HTMLImageElement | null> | null = null

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = url
  })
}

export function getSubscribeChannelAvatarImage(): HTMLImageElement | null {
  return loadedImage
}

export function clearSubscribeChannelAvatarCache(): void {
  loadedUrl = null
  loadedImage = null
  loadPromise = null
}

export async function preloadSubscribeChannelAvatar(url: string | null | undefined): Promise<void> {
  const next = url?.trim() || null
  if (!next) {
    clearSubscribeChannelAvatarCache()
    return
  }
  if (next === loadedUrl && loadedImage) return
  if (next === loadedUrl && loadPromise) {
    await loadPromise
    return
  }
  loadedUrl = next
  loadedImage = null
  loadPromise = loadImage(next)
  loadedImage = await loadPromise
  loadPromise = null
}
