/// <reference lib="webworker" />
/**
 * Owns the USDA food table off the main thread. Parsing it and building the
 * search index, ranking "best next food" across ~8,000 foods, and finding food
 * ideas for the weekly report take a second or more on a slow phone; here they
 * never freeze the screen. Messages: { id, type, args } → { id, result | error }.
 */
import { buildUsdaDb, searchUsda, type RawFile, type UsdaDb } from '../data/usda'
import { weeklyReport } from '../lib/insights'
import { planDay, suggestFoods } from '../lib/suggestUsda'

let url = ''
let db: Promise<UsdaDb> | null = null

function load() {
  db ??= fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`Food database failed to load (${r.status})`)
      return r.json() as Promise<RawFile>
    })
    .then(buildUsdaDb)
    .catch((e) => {
      db = null // allow a retry
      throw e
    })
  return db
}

type Args = Record<string, any>
const handlers: Record<string, (a: Args) => Promise<unknown>> = {
  init: async (a) => {
    url = a.url
    return (await load()).foods.length
  },
  search: async (a) => searchUsda(await load(), a.query, a.limit),
  suggest: async (a) => suggestFoods(a.states, await load(), a.diet, a.eatenNames, a.count, a.own),
  plan: async (a) => planDay(a.states, await load(), a.diet, a.exclude, a.own, a.opts),
  weekly: async (a) => weeklyReport({ ...(a.opts as Parameters<typeof weeklyReport>[0]), usda: await load() }),
}

self.onmessage = async (e: MessageEvent<{ id: number; type: string; args: Args }>) => {
  const { id, type, args } = e.data
  try {
    const result = await handlers[type](args)
    self.postMessage({ id, result })
  } catch (err) {
    self.postMessage({ id, error: (err as Error).message })
  }
}
