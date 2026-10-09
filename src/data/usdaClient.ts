import type { Diet } from '../lib/profile'
import { weeklyReport, type WeeklyReport } from '../lib/insights'
import { suggestFoods, type FoodSuggestion, type OwnCandidate } from '../lib/suggestUsda'
import type { NutrientState } from '../types'
import { loadUsda, searchUsda, type UsdaFood } from './usda'

/**
 * Talks to the USDA worker (src/workers/usda.worker.ts). If workers aren't
 * available (or it fails to start), the same work runs on the main thread, so
 * every feature keeps working, just less smoothly.
 */
let worker: Worker | null | undefined
let seq = 0
const waiting = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
let size: Promise<number> | null = null

function getWorker(): Worker | null {
  if (worker !== undefined) return worker
  try {
    worker = new Worker(new URL('../workers/usda.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
      const w = waiting.get(e.data.id)
      waiting.delete(e.data.id)
      if (e.data.error != null) w?.reject(new Error(e.data.error))
      else w?.resolve(e.data.result)
    }
    worker.onerror = () => {
      // Fall back to the main thread for this and later calls.
      for (const w of waiting.values()) w.reject(new Error('worker failed'))
      waiting.clear()
      worker?.terminate()
      worker = null
      size = null
    }
  } catch {
    worker = null
  }
  return worker
}

function call<T>(type: string, args: object): Promise<T> {
  const w = getWorker()
  if (!w) return Promise.reject(new Error('no worker'))
  const id = ++seq
  return new Promise<T>((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    w.postMessage({ id, type, args })
  })
}

/** Start loading the table in the background; resolves to the number of foods. */
export function initUsda(): Promise<number> {
  size ??= call<number>('init', { url: new URL(`${import.meta.env.BASE_URL}usda/foods.json`, document.baseURI).href }).catch(async () => (await loadUsda()).foods.length)
  return size
}

export async function searchFoods(query: string, limit = 40): Promise<UsdaFood[]> {
  await initUsda()
  return call<UsdaFood[]>('search', { query, limit }).catch(async () => searchUsda(await loadUsda(), query, limit))
}

export async function suggestNextFoods(states: NutrientState[], diet: Diet, eatenNames: string[], count: number, own: OwnCandidate[]): Promise<FoodSuggestion[]> {
  await initUsda()
  return call<FoodSuggestion[]>('suggest', { states, diet, eatenNames, count, own }).catch(async () => suggestFoods(states, await loadUsda(), diet, eatenNames, count, own))
}

/** The weekly report with food ideas (the part that needs the food table). */
export async function weeklyReportWithFoods(opts: Omit<Parameters<typeof weeklyReport>[0], 'usda'>): Promise<WeeklyReport> {
  await initUsda()
  return call<WeeklyReport>('weekly', { opts }).catch(async () => weeklyReport({ ...opts, usda: await loadUsda() }))
}
