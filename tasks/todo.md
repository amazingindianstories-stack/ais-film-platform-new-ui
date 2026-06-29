# API Cost Sheet Audit

- [x] Review project memory, repo status, and prior lessons.
- [x] Inventory every API/service call site in server routes, utilities, hooks, and clients.
- [x] Capture model names, fallback model chains, optional branches, and environment-controlled providers.
- [x] Research current public pricing for token, image, video, payment, storage, and sidecar APIs.
- [x] Estimate approximate input/output tokens or billable media units for each project workflow step.
- [x] Generate a CSV cost sheet covering required and optional calls.
- [x] Verify coverage with broad code searches and spot checks.
- [x] Add review notes and save useful context to MemPalace.

## Review

- Created `api_cost_sheet.csv` with 63 audited rows and 18 columns covering all 40 `src/app/api/**/route.js` files plus provider utilities, frontend fetch wrappers, optional fallback paths, storage/database/payment processes, and model selectors.
- Used current public pricing sources as of 2026-06-26, including Google Gemini/Veo, BytePlus ModelArk/Seedream/Seedance, Stripe, Supabase, and Shotstack. Rows include source URLs and caveats for plan/region/account-specific pricing.
- Explicitly separated local `@/utils/storage` writes under `public/uploads` from generated-media routes that use Supabase admin storage.
- Verified CSV parse validity with Python `csv.DictReader`: 63 data rows, 18 columns, no malformed rows.
- Verified API route coverage mechanically: all 40 `src/app/api/**/route.js` files are mentioned in the CSV.
- Noted high-risk pricing caveats in the sheet: `gemini-2.0-flash-preview-image-generation` is shut down as of 2026-06-01, older Veo 3.0 SKUs are near deprecation, Shotstack cost is hidden behind the Python sidecar, and Seedance exact duration pricing depends on the configured endpoint/vendor account.

## Comfy Upgrade Review

- Updated `api_cost_sheet.csv` to 63 rows and 22 columns by appending `paid_models_optimizable_by_comfy`, `comfy_tier_1_best_models`, `comfy_tier_2_second_options`, and `comfy_tier_3_last_options`.
- Added row-specific Comfy/open-weight replacement tiers for audio, text/script/KB, multimodal vision/QC, reference sheet splitting, image generation, image+QC, video generation, and editor/render optimization.
- Created a filterable workbook version at `outputs/api-cost-sheet-comfy/api_cost_sheet_comfy.xlsx` with `Cost Audit`, `Comfy Summary`, and `Sources` sheets.
- Verified the upgraded CSV parses cleanly and retains all 63 rows with the requested four appended columns.
