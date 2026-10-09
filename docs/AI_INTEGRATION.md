# AI in Nutrient Atlas

The app uses AI in two places today, both by **copy/paste**: free, private, and working with any chatbot. Automating them is Phase C of the [roadmap](ROADMAP.md), and it waits on one decision: an API key with a monthly budget cap.

## Now (shipped): copy / paste

### Meals (Log food → AI estimate)
1. Describe a meal.
2. The app builds a prompt ([src/lib/ai/prompt.ts](../src/lib/ai/prompt.ts)) with the nutrient table (ids, names, units) and asks for **JSON only**: items with quantity, grams, confidence and nutrients.
3. Paste the prompt into any chatbot (Claude, ChatGPT, Gemini…) and paste the reply back. The draft survives switching tabs or closing the sheet.
4. [src/lib/ai/parse.ts](../src/lib/ai/parse.ts) extracts and validates the JSON:
   - tolerates code fences, surrounding prose and trailing commas
   - maps ids case-insensitively and drops unknown ids, with a warning
   - rejects negative or non-numeric values
   - flags likely unit mix-ups (a value more than 20× the upper limit or target)
5. Review: untick items, set servings (an item at 0 servings is skipped), then log. Items are saved as reusable foods (`source: 'ai'`) plus log entries.

### Product labels (Products → Import · AI · CSV)
- **Copy AI prompt** builds a prompt ([src/lib/products/io.ts](../src/lib/products/io.ts), `buildProductPrompt`) for reading **label photos or product pages**: brand, name, serving, servings per container, price, nutrients per serving in the app's units, ingredient forms ("magnesium glycinate"), testing seals and tags.
- Attach photos in the chatbot (several products at once is fine) and paste the reply. It goes through the same importer as JSON and CSV files: units in column names convert (e.g. "Vitamin D (IU)"), and unknown nutrients are reported. Products that match an existing one (same barcode, or same kind + brand + name) are updated rather than duplicated.

**Missing ≠ zero.** Both prompts tell the model to *omit* what it can't see or estimate. Omitted nutrients lower data coverage, so the Atlas shows "no data" or "partial data" instead of a false deficiency.

## Next: automated (Phase C)

The contract is `MealEstimator` in [src/lib/ai/types.ts](../src/lib/ai/types.ts): the manual estimator has no `estimate`; an automated one implements `estimate(description) → Promise<ParseResult>`, and the review screen stays the same. The same pattern applies to label reading.

| Step | What | Notes |
|---|---|---|
| C1 | **Proxy** (Cloudflare Worker / Pages Function, `POST /api/estimate`) holds the API key and enforces a monthly budget cap and per-device rate limit | The key never ships to the browser. Needs hosting (Phase B). |
| C2 | **One-tap meal estimate** | Same prompt with the JSON shape enforced by the provider's structured output / tool use; `parseMealResponse` stays as a second check. Copy/paste remains as the free option. |
| C3 | **Photo logging** | Same endpoint with an image; only the prompt preamble changes. |
| C4 | **USDA grounding** | The model returns food names and grams only; nutrients come from the USDA table (more accurate, consistent and cheaper than asking for 50 values). Model-estimated nutrients stay as the fallback for foods not in the table. |
| C5 | **Label photo → Products** | The product prompt over the proxy; lands in the same import review. |
| C6 | **AI coach** | Questions like "why am I always low on magnesium?", answered from your own logs (summaries are sent, not the raw database), with the same hedged, not-medical-advice tone as the weekly report. |

**Settings:** the AI estimation choice already exists (Copy & paste / Automatic, the latter marked "coming soon"). Manual stays the default and keeps working offline and with no account.

**Model choice:** a current Claude model, picked for cost per call (estimates are short JSON). Check prices and the budget cap before turning it on.

## Prompt versioning

`PROMPT_VERSION` in `prompt.ts`. Bump it when the output shape changes. Later, store it on AI-sourced foods so older estimates can be re-run.
