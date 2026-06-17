# New UI Backend Transfer

Last updated: 2026-06-17

For the permanent screen-by-screen checklist, use
`new-ui/docs/old-ui-backend-feature-checklist.md`.

## Runtime Boundary

`new-ui` is now packaged as a standalone Next.js app. The backend route handlers
and shared server utilities were copied into this folder instead of being served
by the parent project.

- New UI dev server: `http://localhost:3002`
- Local API routes: `new-ui/src/app/api/**`
- Shared backend utilities: `new-ui/src/utils/**`
- Optional render sidecar: `new-ui/python-service`
- Browser clients now call `/api/...` directly, not `/api/backend/...`

The legacy bridge route at `src/app/api/backend/[...path]/route.js` can remain
for compatibility during transition, but the current app no longer needs the old
project running for normal workflow APIs.

## Copied Backend Surface

These route families now live inside `new-ui/src/app/api`:

- Dashboard projects: `/api/dashboard/projects`, `/api/dashboard/projects/[projectId]`
- Audio and analysis: `/api/studio/upload-audio`, `/api/analyze`
- Script extraction and generation: `/api/extract-script-file`, `/api/generate-script`, `/api/studio/extract-script`, `/api/studio/generate-script`
- Script editing: `/api/studio/save-script-analysis`
- Characters, locations, wardrobe: `/api/studio/save-character`, `/api/studio/generate-character`, `/api/studio/save-location`, `/api/studio/generate-location`, `/api/studio/save-wardrobe`
- Knowledge base and planning: `/api/build-knowledge-base`, `/api/studio/build-knowledge-base`, `/api/generate-shot-list`, `/api/studio/save-shot-plan`, `/api/studio/save-shot-timing`
- Media generation: `/api/generate-shot-image`, `/api/generate-shot-video`, `/api/rewrite-shot-prompt`
- Style/brain routes: `/api/process-wardrobe-brain-dump`, `/api/generate-style-bible`, `/api/generate-wardrobe-image`, `/api/generate-wardrobe-outfit`
- Sheet splitting: `/api/split-character-sheet`, `/api/split-location-sheet`
- Billing/render integrations: `/api/checkout/session`, `/api/shotstack/render`, `/api/shotstack/render/[renderId]`

## Package Additions

`new-ui/package.json` now declares the backend SDK dependencies copied routes
need:

- `@google/genai`
- `@google/generative-ai`
- `@supabase/ssr`
- `@supabase/supabase-js`
- `stripe`

The copied render helper source is in `new-ui/python-service`; install and run
it only when using editor/render routes.

## Environment

Use `new-ui/.env.example` as the standalone template. Minimum practical setup:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_AI_API_KEY`

Optional integrations include Stripe, Seedance/ByteDance, Shotstack timeouts,
and `PYTHON_SERVICE_URL`.

`STUDIO_BACKEND_SHARED_SECRET` should normally stay empty in standalone mode
because browser calls go directly to local API routes. If it is set, protected
studio routes expect an `x-studio-backend-key` header from a server-side proxy.

## Local Test Recipe

1. `cd new-ui`
2. `npm install`
3. `cp .env.example .env.local`
4. Fill Supabase and Google keys.
5. `npm run dev`
6. Open `http://localhost:3002`

For editor/render sidecar tests:

1. `cd new-ui/python-service`
2. `python3 -m venv venv`
3. `. venv/bin/activate`
4. `pip install -r requirements.txt`
5. `python3 -m uvicorn main:app --port 8001 --reload`
