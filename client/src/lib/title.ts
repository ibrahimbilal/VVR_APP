import type { TitleSpan } from '../types'

export function spansToText(spans: TitleSpan[]): string {
  let text = ''
  spans.forEach((span, index) => {
    if (!span.text) return
    if (text && span.breakBefore) text += '\n'
    else if (index > 0 && text) text += ' '
    text += span.text
  })
  return text
}

export function retokenize(text: string, previous: TitleSpan[]): TitleSpan[] {
  const used = new Set<number>()
  const spans: TitleSpan[] = []
  let any = false
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  for (const line of lines) {
    const words = line.split(/\s+/).filter(Boolean)
    words.forEach((word, wordIndex) => {
      const prevIndex = previous.findIndex((span, index) => !used.has(index) && span.text === word)
      if (prevIndex >= 0) used.add(prevIndex)
      const previousSpan = prevIndex >= 0 ? previous[prevIndex] : undefined
      spans.push({
        id: previousSpan?.id ?? crypto.randomUUID(),
        text: word,
        color: previousSpan?.color ?? '#ffffff',
        breakBefore: any && wordIndex === 0,
      })
      any = true
    })
  }
  return spans
}
