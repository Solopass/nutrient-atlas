import { applyDailySupplements } from './supplements'
import { db, FDC_KEY_SETTING, MEALVISION_SETTING, localDate, type Food, type LogEntry, type Product, type SavedMeal, type Setting, type Supplement } from '../db/db'
import { download } from './download'

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

/** Settings that belong to this device, not to your data: kept out of backup files and kept on restore. */
const DEVICE_SETTINGS = [FDC_KEY_SETTING, MEALVISION_SETTING]

export async function makeBackup(): Promise<ExportFile> {
  return {
    app: 'nutrient-atlas',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    settings: (await db.settings.toArray()).filter((s) => !DEVICE_SETTINGS.includes(s.key)),
    foods: await db.foods.toArray(),
    logs: await db.logs.toArray(),
    supplements: await db.supplements.toArray(),
    meals: await db.meals.toArray(),
    products: await db.products.toArray(),
  }
}

/** Download a full backup and remember when (for the backup reminder). */
export async function exportBackup() {
  const data = await makeBackup()
  download(`nutrient-atlas-${localDate()}.json`, JSON.stringify(data, null, 1), 'application/json')
  await db.settings.put({ key: 'lastBackup', value: localDate() })
  await db.settings.delete('backupSnoozedUntil')
  return data
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
    const keep = await db.settings.bulkGet(DEVICE_SETTINGS)
    await Promise.all([db.settings.clear(), db.foods.clear(), db.logs.clear(), db.supplements.clear(), db.meals.clear(), db.products.clear()])
    await db.settings.bulkPut((data.settings ?? []).filter((s) => !DEVICE_SETTINGS.includes(s.key)))
    await db.settings.bulkPut(keep.filter((s) => s != null))
    await db.foods.bulkPut(data.foods)
    await db.logs.bulkPut(data.logs)
    await db.supplements.bulkPut(data.supplements ?? [])
    await db.meals.bulkPut(data.meals ?? [])
    await db.products.bulkPut(data.products ?? [])
  })
  // Daily supplements pick up from the backup's last day through today.
  await applyDailySupplements()
}
