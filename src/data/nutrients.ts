import type { Category, Nutrient } from '../types'

/**
 * Placeholder profile until Settings exists. Targets below are DRI values for
 * this profile; amino acid targets are RDA mg/kg/day × body weight.
 */
export const PROFILE = { sex: 'male', age: 30, weightKg: 75 } as const

const perKg = (mgPerKg: number) => mgPerKg * PROFILE.weightKg

const AMINO_LOW = 'Usually follows low total protein: muscle loss, slow recovery'

export const NUTRIENTS: Nutrient[] = [
  // ── Core: macros ──────────────────────────────────────────────
  {
    id: 'protein', name: 'Protein', symbol: 'Pro', unit: 'g', category: 'macro',
    target: 0.8 * PROFILE.weightKg, targetKind: 'RDA',
    why: 'Builds and repairs muscle, enzymes, hormones and immune cells.',
    lowSigns: 'Muscle loss, slow recovery, frequent illness',
    sources: ['Chicken breast', 'Greek yogurt', 'Lentils', 'Eggs'],
  },
  {
    id: 'carbs', name: 'Carbohydrates', shortName: 'Carbs', symbol: 'Carb', unit: 'g', category: 'macro',
    target: 130, targetKind: 'RDA',
    why: 'Primary fuel for the brain and for high-intensity activity.',
    lowSigns: 'Fatigue, poor workout performance, brain fog',
    sources: ['Oats', 'Rice', 'Potatoes', 'Fruit'],
  },
  {
    id: 'fat', name: 'Fat', symbol: 'Fat', unit: 'g', category: 'macro',
    target: 78, targetKind: 'DV',
    why: 'Supports hormone production and absorption of vitamins A, D, E and K.',
    lowSigns: 'Dry skin, hormonal disruption, poor vitamin absorption',
    sources: ['Olive oil', 'Avocado', 'Nuts', 'Salmon'],
  },
  {
    id: 'fiber', name: 'Fiber', symbol: 'Fib', unit: 'g', category: 'macro',
    target: 38, targetKind: 'AI',
    why: 'Feeds gut bacteria and steadies blood sugar and cholesterol.',
    lowSigns: 'Constipation, blood-sugar swings, hunger soon after meals',
    sources: ['Chia seeds', 'Black beans', 'Raspberries', 'Oats'],
  },

  // ── Core: vitamins ────────────────────────────────────────────
  {
    id: 'vitA', name: 'Vitamin A', symbol: 'A', unit: 'mcg', category: 'vitamin',
    target: 900, targetKind: 'RDA', upperLimit: 3000, ulNote: 'UL applies to preformed vitamin A (retinol)',
    why: 'Vision, immune defense and skin health.',
    lowSigns: 'Night blindness, dry eyes, frequent infections',
    sources: ['Sweet potato', 'Carrots', 'Spinach', 'Beef liver'],
  },
  {
    id: 'vitC', name: 'Vitamin C', symbol: 'C', unit: 'mg', category: 'vitamin',
    target: 90, targetKind: 'RDA', upperLimit: 2000,
    why: 'Antioxidant; needed for collagen and for absorbing plant iron.',
    lowSigns: 'Easy bruising, bleeding gums, slow wound healing',
    sources: ['Bell pepper', 'Kiwi', 'Oranges', 'Broccoli'],
  },
  {
    id: 'vitD', name: 'Vitamin D', symbol: 'D', unit: 'mcg', category: 'vitamin',
    target: 15, targetKind: 'RDA', upperLimit: 100,
    why: 'Calcium absorption, bone strength and immune function. Hard to get from food alone.',
    lowSigns: 'Bone aches, muscle weakness, low mood',
    sources: ['Salmon', 'Fortified milk', 'Egg yolks', 'UV-exposed mushrooms'],
  },
  {
    id: 'vitE', name: 'Vitamin E', symbol: 'E', unit: 'mg', category: 'vitamin',
    target: 15, targetKind: 'RDA', upperLimit: 1000, ulAppliesTo: 'supplements', ulNote: 'UL applies to vitamin E from supplements only',
    why: 'Fat-soluble antioxidant that protects cell membranes.',
    lowSigns: 'Rare; nerve and muscle problems',
    sources: ['Sunflower seeds', 'Almonds', 'Hazelnuts', 'Spinach'],
  },
  {
    id: 'vitK', name: 'Vitamin K', symbol: 'K', unit: 'mcg', category: 'vitamin',
    target: 120, targetKind: 'AI',
    why: 'Blood clotting and bone mineralization.',
    lowSigns: 'Easy bleeding and bruising',
    sources: ['Kale', 'Spinach', 'Broccoli', 'Natto'],
  },

  // ── Core: minerals ────────────────────────────────────────────
  {
    id: 'calcium', name: 'Calcium', symbol: 'Ca', unit: 'mg', category: 'mineral',
    target: 1000, targetKind: 'RDA', upperLimit: 2500,
    why: 'Bones, teeth, muscle contraction and nerve signaling.',
    lowSigns: 'Muscle cramps; weaker bones over time',
    sources: ['Yogurt', 'Cheese', 'Sardines', 'Calcium-set tofu'],
  },
  {
    id: 'magnesium', name: 'Magnesium', symbol: 'Mg', unit: 'mg', category: 'mineral',
    target: 420, targetKind: 'RDA', upperLimit: 350, ulAppliesTo: 'supplements', ulNote: 'UL applies to magnesium from supplements only, not food',
    why: 'Cofactor for 300+ enzymes, including energy production and muscle function.',
    lowSigns: 'Cramps, poor sleep, fatigue',
    sources: ['Pumpkin seeds', 'Almonds', 'Spinach', 'Black beans'],
  },
  {
    id: 'potassium', name: 'Potassium', symbol: 'K', unit: 'mg', category: 'mineral',
    target: 3400, targetKind: 'AI',
    why: 'Fluid balance, blood pressure and heart rhythm.',
    lowSigns: 'Muscle weakness, cramps, higher blood pressure',
    sources: ['Potatoes', 'Beans', 'Bananas', 'Avocado'],
  },
  {
    id: 'iron', name: 'Iron', symbol: 'Fe', unit: 'mg', category: 'mineral',
    target: 8, targetKind: 'RDA', upperLimit: 45,
    why: 'Carries oxygen in the blood via hemoglobin.',
    lowSigns: 'Tiredness, pale skin, shortness of breath',
    sources: ['Red meat', 'Lentils', 'Spinach', 'Fortified cereal'],
  },
  {
    id: 'zinc', name: 'Zinc', symbol: 'Zn', unit: 'mg', category: 'mineral',
    target: 11, targetKind: 'RDA', upperLimit: 40,
    why: 'Immune function, wound healing, taste and smell.',
    lowSigns: 'Frequent colds, slow healing, reduced taste',
    sources: ['Oysters', 'Beef', 'Pumpkin seeds', 'Chickpeas'],
  },

  // ── Outer: B vitamins ─────────────────────────────────────────
  {
    id: 'b1', name: 'Thiamine', symbol: 'B1', unit: 'mg', category: 'bvitamin',
    target: 1.2, targetKind: 'RDA',
    why: 'Turns carbohydrates into energy; supports nerve function.',
    lowSigns: 'Fatigue, irritability, tingling',
    sources: ['Pork', 'Sunflower seeds', 'Black beans', 'Whole grains'],
  },
  {
    id: 'b2', name: 'Riboflavin', symbol: 'B2', unit: 'mg', category: 'bvitamin',
    target: 1.3, targetKind: 'RDA',
    why: 'Energy production and healthy skin and eyes.',
    lowSigns: 'Cracked lips, sore throat, skin inflammation',
    sources: ['Milk', 'Eggs', 'Almonds', 'Mushrooms'],
  },
  {
    id: 'b3', name: 'Niacin', symbol: 'B3', unit: 'mg', category: 'bvitamin',
    target: 16, targetKind: 'RDA', upperLimit: 35, ulAppliesTo: 'supplements', ulNote: 'UL applies to niacin from supplements and fortified foods',
    why: 'Energy metabolism and DNA repair.',
    lowSigns: 'Fatigue, sun-sensitive skin rash, digestive upset',
    sources: ['Chicken', 'Tuna', 'Peanuts', 'Brown rice'],
  },
  {
    id: 'b5', name: 'Pantothenic Acid', symbol: 'B5', unit: 'mg', category: 'bvitamin',
    target: 5, targetKind: 'AI',
    why: 'Needed to make coenzyme A for fat and energy metabolism.',
    lowSigns: 'Rare; fatigue, numbness',
    sources: ['Mushrooms', 'Avocado', 'Chicken', 'Sunflower seeds'],
  },
  {
    id: 'b6', name: 'Pyridoxine', symbol: 'B6', unit: 'mg', category: 'bvitamin',
    target: 1.3, targetKind: 'RDA', upperLimit: 100,
    why: 'Protein metabolism and neurotransmitter production.',
    lowSigns: 'Mood changes, confusion, sore tongue',
    sources: ['Chickpeas', 'Salmon', 'Potatoes', 'Bananas'],
  },
  {
    id: 'b7', name: 'Biotin', symbol: 'B7', unit: 'mcg', category: 'bvitamin',
    target: 30, targetKind: 'AI',
    why: 'Metabolizes fats, carbohydrates and amino acids.',
    lowSigns: 'Thinning hair, brittle nails, rash',
    sources: ['Eggs', 'Almonds', 'Salmon', 'Sweet potato'],
  },
  {
    id: 'b9', name: 'Folate', symbol: 'B9', unit: 'mcg', category: 'bvitamin',
    target: 400, targetKind: 'RDA', upperLimit: 1000, ulAppliesTo: 'supplements', ulSupplementScale: 1 / 1.7, ulNote: 'UL applies to folic acid from supplements (1,000 mcg folic acid ≈ 1,700 mcg DFE)',
    why: 'Cell division and DNA synthesis; critical in pregnancy.',
    lowSigns: 'Fatigue, mouth sores, anemia',
    sources: ['Lentils', 'Asparagus', 'Spinach', 'Avocado'],
  },
  {
    id: 'b12', name: 'Cobalamin', symbol: 'B12', unit: 'mcg', category: 'bvitamin',
    target: 2.4, targetKind: 'RDA',
    why: 'Nerve health and red blood cell formation. Found almost only in animal foods.',
    lowSigns: 'Fatigue, numbness, memory problems',
    sources: ['Clams', 'Beef', 'Salmon', 'Fortified nutritional yeast'],
  },

  // ── Outer: trace minerals ─────────────────────────────────────
  {
    id: 'copper', name: 'Copper', symbol: 'Cu', unit: 'mcg', category: 'trace',
    target: 900, targetKind: 'RDA', upperLimit: 10000,
    why: 'Iron metabolism, connective tissue and nerve health.',
    lowSigns: 'Anemia, fatigue, weakened immunity',
    sources: ['Beef liver', 'Cashews', 'Dark chocolate', 'Shiitake'],
  },
  {
    id: 'manganese', name: 'Manganese', symbol: 'Mn', unit: 'mg', category: 'trace',
    target: 2.3, targetKind: 'AI', upperLimit: 11,
    why: 'Bone formation and antioxidant enzymes.',
    lowSigns: 'Rare; poor bone health',
    sources: ['Mussels', 'Hazelnuts', 'Brown rice', 'Oats'],
  },
  {
    id: 'selenium', name: 'Selenium', symbol: 'Se', unit: 'mcg', category: 'trace',
    target: 55, targetKind: 'RDA', upperLimit: 400,
    why: 'Thyroid hormone production and antioxidant defense.',
    lowSigns: 'Fatigue, weakened immunity, thyroid problems',
    sources: ['Brazil nuts', 'Tuna', 'Sardines', 'Eggs'],
  },
  {
    id: 'chromium', name: 'Chromium', symbol: 'Cr', unit: 'mcg', category: 'trace',
    target: 35, targetKind: 'AI',
    why: 'Supports insulin action.',
    lowSigns: 'Poorer blood-sugar control (rare)',
    sources: ['Broccoli', 'Grape juice', 'Whole grains', 'Potatoes'],
  },
  {
    id: 'molybdenum', name: 'Molybdenum', symbol: 'Mo', unit: 'mcg', category: 'trace',
    target: 45, targetKind: 'RDA', upperLimit: 2000,
    why: 'Cofactor for enzymes that process sulfur amino acids.',
    lowSigns: 'Extremely rare',
    sources: ['Lentils', 'Black-eyed peas', 'Oats', 'Yogurt'],
  },
  {
    id: 'iodine', name: 'Iodine', symbol: 'I', unit: 'mcg', category: 'trace',
    target: 150, targetKind: 'RDA', upperLimit: 1100,
    why: 'Makes the thyroid hormones that set metabolic rate.',
    lowSigns: 'Fatigue, weight gain, goiter',
    sources: ['Seaweed', 'Cod', 'Iodized salt', 'Dairy'],
  },
  {
    id: 'phosphorus', name: 'Phosphorus', symbol: 'P', unit: 'mg', category: 'trace',
    target: 700, targetKind: 'RDA', upperLimit: 4000,
    why: 'Bones, teeth and ATP, the cell’s energy currency.',
    lowSigns: 'Rare; weakness, bone pain',
    sources: ['Salmon', 'Yogurt', 'Lentils', 'Pumpkin seeds'],
  },

  // ── Outer: fatty acids ────────────────────────────────────────
  {
    id: 'ala', name: 'Omega-3 (ALA)', symbol: 'ω3', unit: 'g', category: 'fatty',
    target: 1.6, targetKind: 'AI',
    why: 'Plant omega-3 that supports heart health; a small share converts to EPA/DHA.',
    lowSigns: 'Dry skin, poor wound healing',
    sources: ['Flaxseed', 'Chia seeds', 'Walnuts', 'Hemp seeds'],
  },
  {
    id: 'epa', name: 'EPA', symbol: 'EPA', unit: 'mg', category: 'fatty',
    target: null,
    why: 'Marine omega-3 that helps regulate inflammation. No official target; many guidelines suggest 250–500 mg EPA+DHA daily.',
    lowSigns: 'Not clearly defined',
    sources: ['Salmon', 'Sardines', 'Mackerel', 'Herring'],
  },
  {
    id: 'dha', name: 'DHA', symbol: 'DHA', unit: 'mg', category: 'fatty',
    target: null,
    why: 'Structural fat in the brain and retina. No official target.',
    lowSigns: 'Not clearly defined',
    sources: ['Salmon', 'Trout', 'Sardines', 'Algae oil'],
  },
  {
    id: 'la', name: 'Omega-6 (LA)', symbol: 'ω6', unit: 'g', category: 'fatty',
    target: 17, targetKind: 'AI',
    why: 'Essential fat for skin and cell membranes.',
    lowSigns: 'Rare; dry, scaly skin',
    sources: ['Sunflower seeds', 'Walnuts', 'Soybean oil', 'Pumpkin seeds'],
  },

  // ── Outer: essential amino acids ──────────────────────────────
  {
    id: 'leu', name: 'Leucine', symbol: 'Leu', unit: 'mg', category: 'amino',
    target: perKg(42), targetKind: 'RDA',
    why: 'The main trigger of muscle protein synthesis.',
    lowSigns: AMINO_LOW, sources: ['Whey', 'Chicken', 'Soybeans', 'Parmesan'],
  },
  {
    id: 'ile', name: 'Isoleucine', symbol: 'Ile', unit: 'mg', category: 'amino',
    target: perKg(19), targetKind: 'RDA',
    why: 'Muscle energy and blood-sugar regulation.',
    lowSigns: AMINO_LOW, sources: ['Eggs', 'Chicken', 'Soybeans', 'Cod'],
  },
  {
    id: 'val', name: 'Valine', symbol: 'Val', unit: 'mg', category: 'amino',
    target: perKg(24), targetKind: 'RDA',
    why: 'Muscle growth and tissue repair.',
    lowSigns: AMINO_LOW, sources: ['Cottage cheese', 'Beef', 'Peanuts', 'Lentils'],
  },
  {
    id: 'lys', name: 'Lysine', symbol: 'Lys', unit: 'mg', category: 'amino',
    target: perKg(38), targetKind: 'RDA',
    why: 'Collagen formation and calcium absorption. Often the limiting amino acid in grain-heavy diets.',
    lowSigns: AMINO_LOW, sources: ['Lentils', 'Tempeh', 'Chicken', 'Parmesan'],
  },
  {
    id: 'met', name: 'Methionine', symbol: 'Met', unit: 'mg', category: 'amino',
    target: perKg(19), targetKind: 'RDA',
    why: 'Starts every new protein chain and supplies sulfur. Target includes cysteine.',
    lowSigns: AMINO_LOW, sources: ['Brazil nuts', 'Eggs', 'Fish', 'Sesame seeds'],
  },
  {
    id: 'trp', name: 'Tryptophan', symbol: 'Trp', unit: 'mg', category: 'amino',
    target: perKg(5), targetKind: 'RDA',
    why: 'Precursor to serotonin and melatonin.',
    lowSigns: AMINO_LOW, sources: ['Turkey', 'Pumpkin seeds', 'Oats', 'Milk'],
  },
  {
    id: 'thr', name: 'Threonine', symbol: 'Thr', unit: 'mg', category: 'amino',
    target: perKg(20), targetKind: 'RDA',
    why: 'Part of collagen, elastin and the gut’s protective mucus.',
    lowSigns: AMINO_LOW, sources: ['Cottage cheese', 'Chicken', 'Lentils', 'Salmon'],
  },
  {
    id: 'phe', name: 'Phenylalanine', symbol: 'Phe', unit: 'mg', category: 'amino',
    target: perKg(33), targetKind: 'RDA',
    why: 'Precursor to tyrosine, dopamine and adrenaline. Target includes tyrosine.',
    lowSigns: AMINO_LOW, sources: ['Soybeans', 'Parmesan', 'Beef', 'Pumpkin seeds'],
  },
  {
    id: 'his', name: 'Histidine', symbol: 'His', unit: 'mg', category: 'amino',
    target: perKg(14), targetKind: 'RDA',
    why: 'Precursor to histamine; supports hemoglobin and tissue repair.',
    lowSigns: AMINO_LOW, sources: ['Tuna', 'Chicken', 'Pork', 'Soybeans'],
  },

  // ── Advanced (toggle) ─────────────────────────────────────────
  {
    id: 'choline', name: 'Choline', symbol: 'Chl', unit: 'mg', category: 'advanced',
    target: 550, targetKind: 'AI', upperLimit: 3500,
    why: 'Cell membranes, liver function and the neurotransmitter acetylcholine.',
    lowSigns: 'Fatty liver, muscle damage',
    sources: ['Eggs', 'Beef liver', 'Chicken', 'Soybeans'],
  },
  {
    id: 'boron', name: 'Boron', symbol: 'B', unit: 'mg', category: 'advanced',
    target: null, upperLimit: 20,
    why: 'May support bone and hormone metabolism. No official target.',
    lowSigns: 'Not clearly defined',
    sources: ['Prunes', 'Raisins', 'Avocado', 'Peanut butter'],
  },
  {
    id: 'sulfur', name: 'Sulfur', symbol: 'S', unit: 'g', category: 'advanced',
    target: null,
    why: 'Part of amino acids, glutathione and connective tissue. Mostly supplied by protein.',
    lowSigns: 'Not clearly defined',
    sources: ['Eggs', 'Garlic', 'Onions', 'Broccoli'],
  },
  {
    id: 'lutein', name: 'Lutein', symbol: 'Lut', unit: 'mcg', category: 'advanced',
    target: null,
    why: 'Carotenoid concentrated in the retina that filters blue light.',
    lowSigns: 'Not clearly defined',
    sources: ['Kale', 'Spinach', 'Egg yolk', 'Corn'],
  },
  {
    id: 'zeaxanthin', name: 'Zeaxanthin', symbol: 'Zea', unit: 'mcg', category: 'advanced',
    target: null,
    why: 'Partner carotenoid to lutein in the macula.',
    lowSigns: 'Not clearly defined',
    sources: ['Corn', 'Orange peppers', 'Egg yolk', 'Goji berries'],
  },
  {
    id: 'coq10', name: 'Coenzyme Q10', symbol: 'Q10', unit: 'mg', category: 'advanced',
    target: null,
    why: 'Used in cellular energy production; the body makes its own.',
    lowSigns: 'Not clearly defined',
    sources: ['Beef heart', 'Sardines', 'Chicken', 'Peanuts'],
  },
  {
    id: 'creatine', name: 'Creatine', symbol: 'Crn', unit: 'g', category: 'advanced',
    target: null,
    why: 'Stores rapid energy for muscle and brain; the body makes about 1 g/day.',
    lowSigns: 'Not clearly defined',
    sources: ['Beef', 'Herring', 'Salmon', 'Pork'],
  },
]

export const CATEGORY_LABEL: Record<Category, string> = {
  macro: 'Macros',
  vitamin: 'Vitamins',
  mineral: 'Minerals',
  bvitamin: 'B Vitamins',
  trace: 'Trace Minerals',
  fatty: 'Fatty Acids',
  amino: 'Essential Amino Acids',
  advanced: 'Advanced',
}

export const CORE_CATEGORIES: Category[] = ['macro', 'vitamin', 'mineral']

export const byCategory = (c: Category) => NUTRIENTS.filter((n) => n.category === c)
