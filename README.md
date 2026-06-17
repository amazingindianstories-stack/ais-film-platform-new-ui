# AIS Studio

Standalone Next.js 16 app for the rebuilt AI music-video studio.

## Stack

- Next.js 16 App Router and React 19
- GSAP canvas transitions
- Supabase project, asset, and auth APIs
- Gemini / Veo generation routes copied into this app
- Optional Python sidecar for Shotstack editor helpers

## Run

```bash
npm install
cp .env.example .env.local
npm run dev        # http://localhost:3002
```

The app now serves its own backend routes from `src/app/api`, so the parent
project does not need to run for dashboard, upload, analysis, script, character,
location, shot-plan, media-generation, or render API calls.

For render/editor routes that call the Python sidecar:

```bash
cd python-service
python3 -m venv venv
. venv/bin/activate
pip install -r requirements.txt
python3 -m uvicorn main:app --port 8001 --reload
```

Set `PYTHON_SERVICE_URL` if the sidecar is not on `http://localhost:8001`.

## Auth And Data

Dashboard routes use Supabase directly. Configure:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

You can pass a Supabase access token through `?accessToken=<token>`,
`studioAccessToken` in local storage, or `NEXT_PUBLIC_STUDIO_ACCESS_TOKEN`.
Without a real token/session, the dashboard keeps its demo fallback rows.

## Structure

- `src/app/` — App Router entry, styles, and API route handlers
- `src/app/api/` — copied backend routes from the parent app
- `src/utils/` — copied server utilities used by backend routes
- `src/components/CanvasApp.js` — workflow shell and screen routing
- `src/lib/backendClient.js` — browser client helpers for local API routes
- `src/lib/dashboardClient.js` — dashboard project API helpers
- `src/lib/backendCatalog.js` — machine-readable backend transfer inventory
- `python-service/` — copied Python sidecar source for render/editor helpers
- `docs/` — migration checklist and backend transfer notes
