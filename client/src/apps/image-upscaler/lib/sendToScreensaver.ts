import { router } from '../../../app/router'
import { useScreensaverStore } from '../../frame-screensaver/stores/screensaver'

/** Hand the full processed file to Screensaver the same way a new image drop does. */
export async function sendFileToScreensaver(file: File): Promise<void> {
  const screensaver = useScreensaverStore()
  await screensaver.acceptExternalImage(file)
  await router.push('/screensaver')
}
