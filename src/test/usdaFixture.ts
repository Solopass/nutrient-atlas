import { buildUsdaDb, type RawFile, type UsdaDb } from '../data/usda'

let db: UsdaDb | null = null

/** The real preprocessed USDA table, loaded once per test run. */
export async function usdaDb() {
  db ??= buildUsdaDb((await Bun.file(new URL('../../public/usda/foods.json', import.meta.url)).json()) as RawFile)
  return db
}
