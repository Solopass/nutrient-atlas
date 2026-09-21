/**
 * Ask the browser not to evict our IndexedDB under storage pressure. Without
 * this, "best-effort" storage can be cleared when the disk runs low. Chromium
 * grants or denies silently (installed PWAs and often-used sites get it);
 * Firefox asks once.
 */
export async function ensurePersistentStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return null
  }
}

export async function storageStatus(): Promise<{ persisted: boolean | null; usedMb: number | null }> {
  try {
    const [persisted, est] = await Promise.all([navigator.storage?.persisted?.() ?? null, navigator.storage?.estimate?.() ?? null])
    return { persisted, usedMb: est?.usage != null ? est.usage / 1024 / 1024 : null }
  } catch {
    return { persisted: null, usedMb: null }
  }
}
