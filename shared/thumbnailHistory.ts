export interface HistoryStack<T> {
  past: T[]
  present: T
  future: T[]
  limit: number
}

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function createHistory<T>(present: T, limit = 50): HistoryStack<T> {
  return { past: [], present: cloneData(present), future: [], limit: Math.max(1, limit) }
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function historyCommit<T>(stack: HistoryStack<T>, next: T): HistoryStack<T> {
  const present = cloneData(next)
  if (sameJson(stack.present, present)) return { ...stack, present }
  return {
    limit: stack.limit,
    past: [...stack.past, cloneData(stack.present)].slice(-stack.limit),
    present,
    future: [],
  }
}

export function historyCheckpoint<T>(stack: HistoryStack<T>): HistoryStack<T> {
  return {
    ...stack,
    past: [...stack.past, cloneData(stack.present)].slice(-stack.limit),
    future: [],
  }
}

export function historyReplace<T>(stack: HistoryStack<T>, next: T): HistoryStack<T> {
  return { ...stack, present: cloneData(next) }
}

export function historyDropCheckpoint<T>(stack: HistoryStack<T>): HistoryStack<T> {
  if (stack.past.length === 0) return stack
  return { ...stack, past: stack.past.slice(0, -1) }
}

export function historyUndo<T>(stack: HistoryStack<T>): HistoryStack<T> {
  const previous = stack.past[stack.past.length - 1]
  if (previous === undefined) return stack
  return {
    ...stack,
    past: stack.past.slice(0, -1),
    present: cloneData(previous),
    future: [cloneData(stack.present), ...stack.future].slice(0, stack.limit),
  }
}

export function historyRedo<T>(stack: HistoryStack<T>): HistoryStack<T> {
  const next = stack.future[0]
  if (next === undefined) return stack
  return {
    ...stack,
    past: [...stack.past, cloneData(stack.present)].slice(-stack.limit),
    present: cloneData(next),
    future: stack.future.slice(1),
  }
}

export function canUndo<T>(stack: HistoryStack<T>): boolean {
  return stack.past.length > 0
}

export function canRedo<T>(stack: HistoryStack<T>): boolean {
  return stack.future.length > 0
}
