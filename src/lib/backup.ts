import { applyDailySupplements } from './supplements'
import { db, type Food, type LogEntry, type Product, type SavedMeal, type Setting, type Supplement } from '../db/db'

export const EXPORT_VERSION = 4

export interface ExportFile {
  app: 'nutrient-atlas'
  version: number
  exportedAt: string
  settings: Setting[]
  foods: Food[]
  logs: LogEntry[]
  supplements?: Supplement[]
  meals?: SavedMeal[]
  products?: Product[]
}

export async function makeBackup(): Promise<ExportFile> {
  return {
    app: 'nutrient-atlas',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    settings: await db.settings.toArray(),
    foods: await db.foods.toArray(),
    logs: await db.logs.toArray(),
    supplements: await db.supplements.toArray(),
    meals: await db.meals.toArray(),
    products: await db.products.toArray(),
  }
}

/** Read and check a backup file without touching the database. */
export async function readBackup(file: File): Promise<ExportFile> {
  let data: ExportFile
  try {
    data = JSON.parse(await file.text()) as ExportFile
  } catch {
    throw new Error("That file isn't a Nutrient Atlas backup (it isn't valid JSON).")
  }
  if (data?.app !== 'nutrient-atlas' || !Array.isArray(data.logs) || !Array.isArray(data.foods)) throw new Error("That file isn't a Nutrient Atlas backup.")
  return data
}

export const describeBackup = (d: ExportFile) =>
  `backup from ${typeof d.exportedAt === 'string' ? d.exportedAt.slice(0, 10) : 'an unknown date'}: ${d.logs.length} log entries, ${(d.supplements ?? []).length} supplements, ${d.foods.length} foods${d.products?.length ? `, ${d.products.length} products` : ''}`

/** Replace everything with the backup, all-or-nothing. */
export async function restoreBackup(data: ExportFile) {
  await db.transaction('rw', [db.settings, db.foods, db.logs, db.supplements, db.meals, db.products], async () => {
    await Promise.all([db.settings.clear(), db.foods.clear(), db.logs.clear(), db.supplements.clear(), db.meals.clear(), db.products.clear()])
    await db.settings.bulkPut(data.settings ?? [])
    await db.foods.bulkPut(data.foods)
    await db.logs.bulkPut(data.logs)
    await db.supplements.bulkPut(data.supplements ?? [])
    await db.meals.bulkPut(data.meals ?? [])
    await db.products.bulkPut(data.products ?? [])
  })
  // Daily supplements pick up from the backup's last day through today.
  await applyDailySupplements()
}
