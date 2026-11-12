import { onScopeDispose, ref, type Ref } from 'vue'

const START_PX = 4
const EDGE_PX = 36
const SCROLL_STEP = 12

type DragSession = {
  pointerId: number
  from: number
  insert: number
  layoutY: number[]
  height: number[]
  gap: number
  offsetX: number
  offsetY: number
  originLeft: number
  originTop: number
  slotTop: number
  ghost: HTMLElement
  list: HTMLElement
  scroller: HTMLElement
  scrollDir: number
  frame: number
  lastX: number
  lastY: number
  finished: boolean
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function itemElements(list: HTMLElement): HTMLElement[] {
  return [...list.querySelectorAll<HTMLElement>(':scope > [data-reorder-item]')]
}

function scrollParent(start: HTMLElement): HTMLElement {
  let node: HTMLElement | null = start
  while (node && node !== document.body) {
    const overflow = getComputedStyle(node).overflowY
    if (overflow === 'auto' || overflow === 'scroll') return node
    node = node.parentElement
  }
  return start
}

/** Index after removing `from` and inserting where `contentY` falls among the other cards. */
export function cardInsertIndex(contentY: number, from: number, layoutY: number[], height: number[], gap: number): number {
  const n = layoutY.length
  let cursor = layoutY[0] ?? 0
  let insert = 0
  for (let i = 0; i < n; i++) {
    if (i === from) continue
    const mid = cursor + (height[i] ?? 0) / 2
    if (contentY > mid) insert += 1
    cursor += (height[i] ?? 0) + gap
  }
  return Math.max(0, Math.min(n - 1, insert))
}

/** Vertical shifts that slide every card so `from` occupies `insert`, plus the placeholder's content Y. */
export function cardReorderShifts(
  from: number,
  insert: number,
  layoutY: number[],
  height: number[],
  gap: number,
): { shifts: number[]; slotTop: number } {
  const order = layoutY.map((_, index) => index)
  const [moved] = order.splice(from, 1)
  if (moved == null) return { shifts: layoutY.map(() => 0), slotTop: layoutY[from] ?? 0 }
  order.splice(insert, 0, moved)
  const shifts = layoutY.map(() => 0)
  let y = layoutY[0] ?? 0
  let slotTop = y
  for (const index of order) {
    if (index === from) slotTop = y
    shifts[index] = y - (layoutY[index] ?? 0)
    y += (height[index] ?? 0) + gap
  }
  return { shifts, slotTop }
}

function shiftsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (Math.abs((a[i] ?? 0) - (b[i] ?? 0)) > 0.5) return false
  }
  return true
}

/**
 * Pointer reorder with a lifted, tilted card and a gap the other rows slide into.
 * The list order changes only when the card is dropped.
 */
export function useCardReorder(options: {
  list: Ref<HTMLElement | null>
  onReorder: (from: number, to: number) => void
}) {
  const instant = ref(false)
  const placeholderIndex = ref<number | null>(null)
  const shifts = ref<number[]>([])
  let session: DragSession | null = null
  let cancelPending: (() => void) | null = null

  function itemStyle(index: number): Record<string, string> | undefined {
    const y = shifts.value[index]
    if (!y) return undefined
    return { transform: `translate3d(0, ${y}px, 0)` }
  }

  function isPlaceholder(index: number): boolean {
    return placeholderIndex.value === index
  }

  function detach(current: DragSession) {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerCancel)
    window.removeEventListener('keydown', onKeyDown)
    if (current.frame) cancelAnimationFrame(current.frame)
  }

  function suppressClick() {
    const stop = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      window.removeEventListener('click', stop, true)
    }
    window.addEventListener('click', stop, true)
  }

function placeGhost(current: DragSession, clientX: number, clientY: number) {
  const x = clientX - current.offsetX - current.originLeft
  const y = clientY - current.offsetY - current.originTop
  const tilt = prefersReducedMotion() ? 'rotate(0deg)' : 'rotate(3deg)'
  current.ghost.style.transform = `translate3d(${x}px, ${y}px, 0) ${tilt}`
}

  function updateSlots(current: DragSession, clientX: number, clientY: number) {
    current.lastX = clientX
    current.lastY = clientY
    placeGhost(current, clientX, clientY)
    const listRect = current.list.getBoundingClientRect()
    const contentY = clientY - listRect.top + current.list.scrollTop
    const insert = cardInsertIndex(contentY, current.from, current.layoutY, current.height, current.gap)
    current.insert = insert
    const { shifts: next, slotTop } = cardReorderShifts(current.from, insert, current.layoutY, current.height, current.gap)
    current.slotTop = slotTop
    if (!shiftsEqual(shifts.value, next)) shifts.value = next

    const scrollerRect = current.scroller.getBoundingClientRect()
    const maxScroll = current.scroller.scrollHeight - current.scroller.clientHeight
    if (clientY < scrollerRect.top + EDGE_PX && current.scroller.scrollTop > 0) current.scrollDir = -1
    else if (clientY > scrollerRect.bottom - EDGE_PX && current.scroller.scrollTop < maxScroll - 1) current.scrollDir = 1
    else current.scrollDir = 0
  }

  function tick() {
    const current = session
    if (!current || current.finished) return
    current.frame = requestAnimationFrame(tick)
    if (!current.scrollDir) return
    const next = current.scroller.scrollTop + current.scrollDir * SCROLL_STEP
    const maxScroll = current.scroller.scrollHeight - current.scroller.clientHeight
    current.scroller.scrollTop = Math.min(maxScroll, Math.max(0, next))
    updateSlots(current, current.lastX, current.lastY)
  }

  function clearDragState() {
    document.body.classList.remove('card-reordering')
    instant.value = true
    placeholderIndex.value = null
    shifts.value = []
    requestAnimationFrame(() => {
      instant.value = false
    })
  }

  function finish(commit: boolean, swallowClick = false) {
    const current = session
    if (!current || current.finished) return
    current.finished = true
    session = null
    detach(current)
    if (swallowClick) suppressClick()

    const from = current.from
    const to = current.insert
    const ghost = current.ghost
    const reduced = prefersReducedMotion()
    const listRect = current.list.getBoundingClientRect()
    const top = listRect.top + (commit ? current.slotTop : (current.layoutY[from] ?? 0)) - current.list.scrollTop

    const commitList = () => {
      ghost.remove()
      clearDragState()
      if (commit && from !== to) options.onReorder(from, to)
    }

    if (!commit) shifts.value = shifts.value.map(() => 0)

    if (reduced) {
      commitList()
      return
    }

    let closed = false
    let fallback = 0
    const done = (event?: Event) => {
      if (closed) return
      if (event instanceof TransitionEvent && event.target !== ghost) return
      if (event instanceof TransitionEvent && event.propertyName !== 'transform') return
      closed = true
      ghost.removeEventListener('transitionend', done)
      window.clearTimeout(fallback)
      commitList()
    }
    ghost.addEventListener('transitionend', done)
    fallback = window.setTimeout(done, 320)
    const dy = top - current.originTop
    ghost.classList.add('card-drag-ghost--settle')
    void ghost.offsetWidth
    ghost.style.transform = `translate3d(0px, ${dy}px, 0) rotate(0deg)`
  }

  function begin(event: PointerEvent, index: number, list: HTMLElement) {
    const items = itemElements(list)
    const source = items[index]
    if (!source || items.length < 2) return
    const rects = items.map((item) => item.getBoundingClientRect())
    const listRect = list.getBoundingClientRect()
    const sourceRect = rects[index]
    if (!sourceRect) return
    const layoutY = rects.map((rect) => rect.top - listRect.top + list.scrollTop)
    const height = rects.map((rect) => rect.height)
    const rawGap = layoutY.length > 1 ? (layoutY[1] ?? 0) - (layoutY[0] ?? 0) - (height[0] ?? 0) : 8
    const gap = rawGap >= 0 && rawGap < 64 ? rawGap : 8
    const ghost = source.cloneNode(true) as HTMLElement
    ghost.classList.add('card-drag-ghost')
    ghost.setAttribute('aria-hidden', 'true')
    ghost.removeAttribute('data-reorder-item')
    ghost.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'))
    ghost.style.width = `${sourceRect.width}px`
    ghost.style.height = `${sourceRect.height}px`
    ghost.style.left = `${sourceRect.left}px`
    ghost.style.top = `${sourceRect.top}px`
    document.body.appendChild(ghost)
    document.body.classList.add('card-reordering')

    const current: DragSession = {
      pointerId: event.pointerId,
      from: index,
      insert: index,
      layoutY,
      height,
      gap,
      offsetX: event.clientX - sourceRect.left,
      offsetY: event.clientY - sourceRect.top,
      originLeft: sourceRect.left,
      originTop: sourceRect.top,
      slotTop: layoutY[index] ?? 0,
      ghost,
      list,
      scroller: scrollParent(list),
      scrollDir: 0,
      frame: 0,
      lastX: event.clientX,
      lastY: event.clientY,
      finished: false,
    }
    session = current
    placeholderIndex.value = index
    shifts.value = items.map(() => 0)
    updateSlots(current, event.clientX, event.clientY)
    current.frame = requestAnimationFrame(tick)
  }

  function onPointerMove(event: PointerEvent) {
    const current = session
    if (!current || current.finished || event.pointerId !== current.pointerId) return
    event.preventDefault()
    updateSlots(current, event.clientX, event.clientY)
  }

  function onPointerUp(event: PointerEvent) {
    const current = session
    if (!current || event.pointerId !== current.pointerId) return
    finish(true, true)
  }

  function onPointerCancel(event: PointerEvent) {
    const current = session
    if (!current || event.pointerId !== current.pointerId) return
    finish(false)
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !session) return
    event.preventDefault()
    finish(false)
  }

  function onGripPointerDown(event: PointerEvent, index: number) {
    if (event.button !== 0 || session || cancelPending) return
    const list = options.list.value
    if (!list || itemElements(list).length < 2) return
    const startX = event.clientX
    const startY = event.clientY
    const pointerId = event.pointerId
    let started = false

    const stopArming = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      cancelPending = null
    }
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId || started) return
      if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < START_PX) return
      const currentList = options.list.value
      if (!currentList) {
        stopArming()
        return
      }
      started = true
      stopArming()
      begin(moveEvent, index, currentList)
      if (!session) return
      window.addEventListener('pointermove', onPointerMove, { passive: false })
      window.addEventListener('pointerup', onPointerUp)
      window.addEventListener('pointercancel', onPointerCancel)
      window.addEventListener('keydown', onKeyDown)
    }
    const up = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId || started) return
      stopArming()
    }
    cancelPending = stopArming
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  onScopeDispose(() => {
    cancelPending?.()
    if (session) finish(false)
  })

  return { instant, itemStyle, isPlaceholder, onGripPointerDown }
}
