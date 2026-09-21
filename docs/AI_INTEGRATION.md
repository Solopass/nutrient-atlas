# AI meal estimation: plan

## Now: manual copy/paste (shipped, Milestone 2)

1. User describes a meal in **Log food → AI estimate**.
2. The app builds a prompt ([src/lib/ai/prompt.ts](../src/lib/ai/prompt.ts)). It contains the nutrient table (ids, names, units) and asks for **JSON only**.
3. User pastes the prompt into any chatbot and pastes the reply back.
4. [src/lib/ai/parse.ts](../src/lib/ai/parse.ts) extracts and validates the JSON:
   - tolerates code fences, surrounding prose and trailing commas
   - maps ids case-insensitively and drops unknown ids, with a warning
   - rejects negative or non-numeric values
   - flags likely unit mix-ups (value > 20× the upper limit or target)
5. The review step lets the user untick items and set servings. Logged items are saved as reusable foods (`source: 'ai'`) plus log entries.

**Missing ≠ zero.** The prompt tells the model to *omit* nutrients it can't estimate. Omitted keys lower that nutrient's data coverage, so the Atlas shows "no data" or "partial data" instead of a false deficiency.

## Next: automated (Milestone 6)

The contract is `MealEstimator` in [src/lib/ai/types.ts](../src/lib/ai/types.ts). An automated provider implements `estimate(description) → ParseResult`, and the review UI stays the same.

1. **Backend proxy.** A small serverless function (`POST /api/estimate`) holds the API key. The key must never ship to the browser.
2. **Structured output.** Send the same prompt, with the JSON shape enforced through the provider's structured-output / tool-use feature. Keep `parseMealResponse` as a second line of validation.
3. **Photo input (Milestone 6).** Same endpoint with an image attached. Only the prompt preamble changes.
4. **Settings.** Choose the estimator: Manual (default, free, private) or Automatic.
5. **Grounding (later).** Have the model return food names + grams only, then look up nutrients from the USDA data (Milestone 1). This is more accurate and cheaper than asking the model for 50 nutrient values. The current "model gives nutrients" path stays as a fallback for foods not in the database.

## Prompt versioning

`PROMPT_VERSION` in `prompt.ts`. Bump it when the output shape changes. Later, store it on AI-sourced foods so older estimates can be re-run.
