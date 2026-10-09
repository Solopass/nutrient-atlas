/**
 * USDA FoodData Central nutrient ids → the app's nutrients and units. Shared
 * by the USDA table build (scripts/build-usda.ts) and barcode lookups of USDA
 * Branded Foods (src/lib/barcode.ts), so both read USDA data the same way.
 */

/** app nutrient id → list of [USDA nutrient id, factor]. The first one present wins,
 *  except `sum` entries, which add all present parts (e.g. methionine + cystine). */
export type UsdaSource = { ids: [number, number][]; sum?: boolean }

export const USDA_NUTRIENT_MAP: Record<string, UsdaSource> = {
  protein: { ids: [[1003, 1]] },
  fat: { ids: [[1004, 1]] },
  carbs: { ids: [[1005, 1], [1050, 1]] },
  fiber: { ids: [[1079, 1]] },
  vitA: { ids: [[1106, 1]] },
  // Hidden companion to vitA: the vitamin A UL covers preformed vitamin A (retinol) only, not beta-carotene.
  retinol: { ids: [[1105, 1]] },
  vitC: { ids: [[1162, 1]] },
  vitD: { ids: [[1114, 1], [1110, 1 / 40]] }, // IU → mcg
  vitE: { ids: [[1109, 1]] },
  vitK: { ids: [[1185, 1]] },
  calcium: { ids: [[1087, 1]] },
  magnesium: { ids: [[1090, 1]] },
  potassium: { ids: [[1092, 1]] },
  iron: { ids: [[1089, 1]] },
  zinc: { ids: [[1095, 1]] },
  b1: { ids: [[1165, 1]] },
  b2: { ids: [[1166, 1]] },
  b3: { ids: [[1167, 1]] },
  b5: { ids: [[1170, 1]] },
  b6: { ids: [[1175, 1]] },
  b7: { ids: [[1176, 1]] },
  b9: { ids: [[1190, 1], [1177, 1]] }, // DFE, else total folate
  b12: { ids: [[1178, 1]] },
  copper: { ids: [[1098, 1000]] }, // mg → mcg
  manganese: { ids: [[1101, 1]] },
  selenium: { ids: [[1103, 1]] },
  chromium: { ids: [[1096, 1]] },
  molybdenum: { ids: [[1102, 1]] },
  iodine: { ids: [[1100, 1]] },
  phosphorus: { ids: [[1091, 1]] },
  ala: { ids: [[1404, 1], [1270, 1]] }, // ALA, else total 18:3
  epa: { ids: [[1278, 1000]] }, // g → mg
  dha: { ids: [[1272, 1000]] },
  la: { ids: [[1316, 1], [1269, 1]] }, // LA n-6, else total 18:2
  leu: { ids: [[1213, 1000]] },
  ile: { ids: [[1212, 1000]] },
  val: { ids: [[1219, 1000]] },
  lys: { ids: [[1214, 1000]] },
  met: { ids: [[1215, 1000], [1216, 1000]], sum: true }, // methionine + cystine (target is Met+Cys)
  trp: { ids: [[1210, 1000]] },
  thr: { ids: [[1211, 1000]] },
  phe: { ids: [[1217, 1000], [1218, 1000]], sum: true }, // phenylalanine + tyrosine (target is Phe+Tyr)
  his: { ids: [[1221, 1000]] },
  choline: { ids: [[1180, 1]] },
  boron: { ids: [[1137, 0.001]] }, // mcg → mg
  sulfur: { ids: [[1094, 0.001]] }, // mg → g
  lutein: { ids: [[1121, 1], [1123, 1]] }, // SR Legacy only has lutein + zeaxanthin combined
  zeaxanthin: { ids: [[1119, 1]] },
  // Limits (stay under)
  sodium: { ids: [[1093, 1]] },
  satfat: { ids: [[1258, 1]] },
  transfat: { ids: [[1257, 1]] },
  cholesterol: { ids: [[1253, 1]] },
  addedSugar: { ids: [[1235, 1]] },
  caffeine: { ids: [[1057, 1]] },
  alcohol: { ids: [[1018, 1]] },
}

/** Energy in kcal: Atwater general, then specific factors. */
export const USDA_ENERGY_IDS = [1008, 2048, 2047]

/** Convert one food's USDA values (by nutrient id) to app ids and units; missing stays missing. */
export function usdaToApp(values: Map<number, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, src] of Object.entries(USDA_NUTRIENT_MAP)) {
    if (src.sum) {
      if (!values.has(src.ids[0][0])) continue // only report a sum when the main component is present
      out[key] = src.ids.reduce((a, [id, k]) => a + (values.get(id) ?? 0) * k, 0)
      continue
    }
    const hit = src.ids.find(([id]) => values.has(id))
    if (hit) out[key] = values.get(hit[0])! * hit[1]
  }
  return out
}
