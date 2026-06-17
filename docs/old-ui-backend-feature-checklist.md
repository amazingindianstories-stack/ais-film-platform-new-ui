# Old UI Backend Feature Checklist

Last updated: 2026-06-11

This is the durable migration checklist for backend behavior from the old UI into `new-ui`.
Use it when adding each new screen: tick only after the new UI has an actual screen/control wired to the backend behavior and the behavior has been cross-checked in code.

Scope note: this tracks backend features and persisted state. Pure layout, animation, and visual-only controls are intentionally omitted unless they read or write backend data.

## Current New UI Coverage

Current new UI screens: Dashboard, Start/Brain Hub, Audio Upload, Player, Analysis, Script Upload, Script Analysis, Characters canvas, Locations canvas, Shots canvas.

Implemented backend coverage today:
- Dashboard project import/list/create/open/delete.
- Audio upload to Supabase-backed project assets through the local copied API routes.
- Saved project audio and prior analysis hydrate when reopening a project.
- Audio analysis through the local copied API routes, with retained full transcript and word timing rendered in the new UI.
- Script upload/extraction, script generation from lyrics, editable script scene analysis, and extracted character/location names seeded into draggable empty canvas templates.
- Character/location save + generation bridges, character-level wardrobe outfit persistence inside character templates, shot-plan checkpoint upload/paste/generation before Studio launch, Studio shot-plan edit action, and scene-card Studio layout with local per-shot duration adjustment.

Not yet implemented:
- Native auth, profile, billing, full Brain Dump refinement/style-bible screen, global libraries, wardrobe generation, per-shot card persistence, shot image/video generation, Clips, Editor, and full shared knowledge-base status controls.

## Cross-Check Sources

- Old app pages: `src/app/page.js`, `src/app/dashboard/page.js`, `src/app/create/[projectId]/page.js`, `src/app/billing/page.js`, `src/app/profile/page.js`, `src/app/payment/page.js`
- Old workflow screens: `src/components/screens/*.js`
- Shared old component: `src/components/KnowledgeBaseStatus.js`
- Backend route list: `src/app/api/**/route.js`
- New UI implementation: `new-ui/src/components/CanvasApp.js`, `new-ui/src/components/DashboardScreen.js`, `new-ui/src/hooks/useDashboardProjects.js`, `new-ui/src/hooks/useStudioBackend.js`, `new-ui/src/lib/backendClient.js`, `new-ui/src/lib/dashboardClient.js`, `new-ui/src/app/api`

## Account / Auth Landing

Old source: `src/app/page.js`

- [ ] Supabase email/password sign in.
- [ ] Supabase sign up with full-name profile metadata.
- [ ] Auth error/loading state handling.
- [ ] Redirect authenticated users into the dashboard.
- [ ] Route users from landing auth into the project workflow.

## Dashboard

Old source: `src/app/dashboard/page.js`

- [x] Load authenticated user with Supabase session/cookie forwarding.
- [x] Load user project list from `projects`, ordered by `updated_at`.
- [x] Render existing project titles, dates, current step, audio status, analysis status, and shot counts from backend data.
- [x] Create a new project in `projects`.
- [x] Open a project and carry its project id into the new UI workflow.
- [x] Import existing project audio URL into the current new UI audio/player state when present.
- [x] Delete a project from `projects`.
- [x] Delete nested Supabase `assets` files for a deleted project.
- [x] Refresh/reload dashboard projects from the backend.
- [ ] Native new UI auth/session surface instead of relying on bearer token plumbing or demo fallback.
- [ ] New UI navigation surfaces for Billing and Profile.

## Create Flow Shell / Project Loader

Old source: `src/app/create/[projectId]/page.js`

- [x] Carry selected project id from dashboard or `?projectId=` into the current new UI flow.
- [x] Load the full project row by id for dashboard opens and direct `?projectId=` hydration.
- [x] Load and expose `projects.project_state` to all new UI workflow screens.
- [ ] Load authenticated profile data for credits/user context.
- [ ] Persist generic `project_state` updates from screens.
- [ ] Persist `current_step` progression.
- [ ] Persist the active screen in local storage for workflow resume.
- [ ] Rehydrate old workflow state into the new UI after refresh.
- [x] Schedule background knowledge-base rebuilds after supported character/location/wardrobe saves.
- [ ] Propagate project-level save/loading/error state through the workflow shell.

## Screen 1: Home / Landing

Old source: `src/components/screens/LandingScreen.js`

No backend behavior was found on the old screen itself. It only routes the user onward in the create flow.

## Screen 2: Audio Upload And Analysis

Old source: `src/components/screens/UploadAudioScreen.js`

- [x] Validate selected audio files before upload.
- [x] Upload audio files into Supabase `assets`.
- [x] Update `projects.audio_url` after upload.
- [x] Remove the previous project audio asset when a replacement upload succeeds.
- [x] Keep local preview/player state after upload.
- [x] Send uploaded audio to `/api/analyze`.
- [x] Send known audio duration into analysis when available.
- [x] Persist returned analysis into the backend via the old analysis route.
- [x] Render BPM, duration, lyric count, full lyric transcript, word-level timing, genre, mood, and summary in the new UI.
- [x] Rehydrate saved `projects.audio_url` and `project_state.analysis` when reopening a project.
- [ ] Persist `project_state.audio_duration_seconds` independently before analysis.
- [ ] Preserve the old screen's full project-state audio metadata shape beyond `audio_url` and analysis.
- [ ] Surface the old upload failure/retry states with project-state parity.

## Screen 3: Brain Dump / Story

Old source: `src/components/screens/BrainDumpScreen.js`

- [x] Persist script/story/theme fields into `project_state`. (Script screen → `studio/extract-script` & `studio/generate-script`.)
- [x] Upload script files to Supabase `assets`. (`studio/extract-script` → `assets/<projectId>/scripts/`.)
- [x] Extract PDF/TXT/Markdown script text through `/api/extract-script-file`. (Reused server-side by `studio/extract-script`.)
- [x] Generate creative plan/script through `/api/generate-script` logic. (`geminiAgent.generateScript` reused by `studio/generate-script`.)
- [x] Seed creative plan generation from audio transcript/lyrics. ("Generate Script From Lyrics" passes `analysis.lyrics`.)
- [x] Preserve uploaded/raw script metadata when generated plan data is merged. (Both routes merge into existing `project_state.script`.)
- [x] Persist editable high-level script scenes into `project_state.script.scenes`. (`studio/save-script-analysis`.)
- [x] Keep generated shot ideas as draft script context instead of auto-promoting them into `project_state.shot_list`.
- [ ] Upload character reference images to Supabase `assets`.
- [ ] Upload location reference images to Supabase `assets`.
- [ ] Process wardrobe/location/style brain dump through `/api/process-wardrobe-brain-dump`.
- [ ] Persist refined character, location, wardrobe, and style-bible fields into `project_state`.
- [ ] Embed knowledge-base status and rebuild controls.
- [ ] Persist Brain Dump completion/progression state.

## Screen 4: Cast / Characters

Old source: `src/components/screens/CharactersScreen.js`

- [x] Seed one draggable empty character template per extracted character from `project_state.characters` or script detected entities.
- [ ] Load global character history from `characters_library`.
- [ ] Import a saved global character into the current project.
- [ ] Save a project character into `characters_library`.
- [ ] Update saved global character metadata.
- [ ] Delete saved global characters.
- [x] Upload character reference images to Supabase `assets`. (Template reference dropzone → `studio/save-character`.)
- [x] Upload character wardrobe images to Supabase `assets`. (Template wardrobe dropzone → `studio/save-character`.)
- [x] Edit + persist character description/bio into `project_state.characters`. (Template bio editor → `studio/save-character`.)
- [ ] Upload character sheet images to Supabase `assets`.
- [ ] Generate character anchor images through `/api/generate-character-anchor`.
- [ ] Generate character pose/reference sheets through `/api/generate-character-pose`.
- [ ] Queue character generation for one, many, or all characters.
- [x] Persist character image URLs and storage paths into `project_state`. (Reference + wardrobe stored as `{url,path}` on the character.)
- [ ] Persist character completion/approval state.

## Screen 5: Locations / Sets

Old source: `src/components/screens/LocationsScreen.js`

- [x] Seed one draggable empty location template per extracted location from `project_state.locations` or script detected entities.
- [ ] Load global location history from `locations_library`.
- [ ] Import a saved global location into the current project.
- [ ] Save a project location into `locations_library`.
- [ ] Update saved global location metadata.
- [ ] Delete saved global locations.
- [x] Upload location references to Supabase `assets`.
- [ ] Upload generated location sheets to Supabase `assets`.
- [ ] Split uploaded/generated location sheets through `/api/split-location-sheet`.
- [ ] Generate location images/sheets through `/api/generate-location-image`.
- [ ] Regenerate/refine individual location crops.
- [ ] Queue location generation for one, many, or all locations.
- [x] Persist location URLs, storage paths, prompts, and generation status into `project_state`.
- [ ] Persist location completion/approval state.

## Screen 6: Wardrobe

Old source: `src/components/screens/WardrobeScreen.js`

- [x] Load project characters from `project_state`.
- [x] Load project locations from `project_state`.
- [ ] Load global `characters_library` entries for wardrobe context.
- [ ] Load global `locations_library` entries for wardrobe context.
- [x] Persist character wardrobe outfit options with legacy matrix compatibility.
- [ ] Generate outfit text through `/api/generate-wardrobe-outfit`.
- [ ] Generate outfit images through `/api/generate-wardrobe-image`.
- [ ] Queue wardrobe generation per outfit, per location, or for all missing outfits.
- [x] Upload wardrobe reference/outfit images to Supabase `assets`.
- [x] Persist outfit prompt, image URL, and storage path into `project_state`.
- [ ] Persist wardrobe approval/completion state.

## Screen 7: Shot Plan

Old source: `src/components/screens/GenerateShotListScreen.js`

- [x] Generate shot list through `/api/generate-shot-list`.
- [x] Send script, analysis, cast, locations, wardrobe, and style context to the shot-list backend.
- [x] Parse and preview uploaded shot-list files. (JSON/TXT supported; PDF parsing still pending.)
- [x] Persist manually entered or edited shot lists into `project_state.shot_list`.
- [x] Persist generated shot lists into `project_state.shot_list`.
- [x] Persist `project_state.shot_list_meta`.
- [ ] Approve shot list and advance workflow state.
- [x] Reopen an existing shot plan from the Studio screen and persist a replacement plan.
- [x] Surface backend generation errors and retry state.

2026-06-11 note: shot-plan creation now lives in the rocket-launch checkpoint before the Studio route, while Studio exposes only an edit action for existing plans.

## Screen 8: Shots / Storyboard

Old source: `src/components/screens/ShotListScreen.js`

- [x] Load and normalize draft `project_state.shot_list`.
- [ ] Add, edit, delete, duplicate, and reorder shots with persistence.
- [ ] Generate an image for a single shot through `/api/generate-shot-image`.
- [ ] Generate images for all or remaining shots through `/api/generate-shot-image`.
- [ ] Persist shot image URL, storage path, prompt, model, and generation status.
- [ ] Persist per-shot errors and retry state.
- [ ] Edit selected shot title/prompt text with persistence.
- [x] Edit shot duration/timing from the scene timeline and persist exact `start`/`end`/`duration`.
- [ ] Persist storyboard/image approval state.

## Legacy Frames Screen

Old source: `src/components/screens/ImagesScreen.js`

This screen is legacy/retired in the old active flow, but its backend behavior is still available in the codebase and should be considered if the new UI brings back a dedicated frame screen.

- [ ] Generate frame images through `/api/generate-shot-image`.
- [ ] Rewrite image prompts through `/api/rewrite-shot-prompt`.
- [ ] Persist rewritten prompts into shot data.
- [ ] Persist generated frame URLs and storage paths.
- [ ] Persist `project_state.images_approved`.

## Screen 9: Clips / Videos

Old source: `src/components/screens/VideosScreen.js`

- [ ] Generate shot videos through `/api/generate-shot-video`.
- [ ] Rewrite video prompts through `/api/rewrite-shot-prompt`.
- [ ] Persist rewritten video prompts into shot data.
- [ ] Persist video URL, storage path, model, duration, and generation metadata.
- [ ] Upload replacement video clips to Supabase `assets`.
- [ ] Preserve previous generated clip metadata when a replacement is uploaded.
- [ ] Undo replacement clips back to generated clip metadata.
- [ ] Download generated/replacement clips.
- [ ] Queue video generation for one, many, or all missing clips.
- [ ] Persist per-shot video errors and retry state.
- [ ] Persist `project_state.videos_approved`.

## Screen 10: Editor / Assemble

Old source: `src/components/screens/AssembleScreen.js`

- [ ] Build an editable timeline from generated clips and project audio.
- [ ] Persist timeline/export state in `project_state.shotstack_export`.
- [ ] Submit a final render through `/api/shotstack/render`.
- [ ] Poll render status through `/api/shotstack/render/[renderId]`.
- [ ] Persist render id, render status, render URL, errors, and timestamps.
- [ ] Download completed render output.
- [ ] Surface Shotstack/Python-sidecar backend errors.

## Shared Knowledge Base

Old sources: `src/app/create/[projectId]/page.js`, `src/components/KnowledgeBaseStatus.js`, `src/app/api/build-knowledge-base/route.js`

- [x] Build knowledge base through `/api/build-knowledge-base`. (Reused via the `studio/build-knowledge-base` bridge route.)
- [x] Persist `project_state.knowledge_base`. (Frozen route persists; the bridge loads the latest `project_state` first.)
- [ ] Show knowledge-base readiness/staleness status.
- [x] Rebuild knowledge base manually from supported screens. ("→ Knowledge" button on each character template.)
- [ ] Rebuild knowledge base automatically after every old-flow trigger (script, analysis, and style-bible triggers still pending).
- [x] Pass knowledge-base context into shot list generation.
- [ ] Pass knowledge-base context into shot image, shot video, and prompt rewrite flows from the new UI.

## Billing

Old source: `src/app/billing/page.js`

- [ ] Load profile credits from `profiles`.
- [ ] Load the last 10 `credit_transactions`.
- [ ] Render credit package options.
- [ ] Start Stripe checkout through `/api/checkout/session`.
- [ ] Redirect to the returned Stripe checkout URL.
- [ ] Handle Stripe webhook credit updates through `/api/webhooks/stripe`.

## Profile

Old source: `src/app/profile/page.js`

- [ ] Load authenticated Supabase user.
- [ ] Load matching `profiles` row.
- [ ] Display full name, email, credits, and member-since date.
- [ ] Update `profiles.full_name`.
- [ ] Reflect saved profile changes in local UI state.

## Payment Methods

Old source: `src/app/payment/page.js`

- [ ] Gate payment-method page behind authenticated user lookup.
- [ ] Show saved-payment-method placeholder state.
- [ ] Keep disabled add-payment-method action until a real backend exists.

## Backend Routes Without A Confirmed Active Old Screen Call

These exist in the old backend route tree but were not found as active screen calls in the current old UI cross-check. Keep them visible so they are not forgotten during migration planning.

- [ ] `/api/generate-style-bible`
- [ ] `/api/split-character-sheet`
