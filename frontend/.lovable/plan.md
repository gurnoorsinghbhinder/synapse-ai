
## Scope

Frontend only. No backend, no auth wiring, no DB. Every page runs on mocked data so the UI can be demoed end-to-end. Backend hookup happens later.

## Design system (locked from selected direction)

- Palette: neutral-50/900/950 surfaces, `--color-brand` emerald `#10b981`, `--color-accent` amber `#f59e0b`, red-500 for destructive.
- Type: Inter (sans body), Outfit (display), JetBrains Mono (telemetry/labels). Loaded via `<link>` in `__root.tsx`.
- Two skins: **light neutral** for marketing / dashboard / resume / results, **obsidian cockpit** (`bg-neutral-950`) for interview room + engineering view.
- All colors defined as CSS tokens in `src/styles.css` under `@theme inline` / `:root` — no hardcoded hex in components.
- Mono uppercase micro-labels, generous whitespace on light surfaces, dense telemetry on dark.

## Routes (TanStack file-based)

```text
src/routes/
  __root.tsx              // fonts, nav shell logic per route, HeadContent
  index.tsx               // 1. Landing
  auth.tsx                // 2. Sign in / Google
  dashboard.tsx           // 3. Dashboard
  resume.tsx              // 4. Resume upload & profile
  interview.tsx           // 5. Interview Room (cockpit) + arch drawer
  results.tsx             // 6. Results
  engineering.tsx         // 7. Engineering / Judge Mode
```

Each route sets its own `head()` with unique title + description + og:title/description.

## Page-by-page build

**1. Landing (`/`)** — Rewrite the placeholder index. Hero from prototype: "v1.0.4 PRODUCTION READY" chip, big display headline, subhead, two CTAs (`Start Interview` → `/auth`, `Watch Demo` → scrolls / no-op), 5-col mono stat strip (Latency / Intelligence / Context / Feedback / Engine). Add a second section with the 5 features (Real-time AI, Resume-aware, Adaptive, Live Analytics, Backend Architecture) as a bento-ish grid in the same restrained style. Light footer.

**2. Auth (`/auth`)** — Split-screen: left = branding panel with mission-control tagline over neutral-950; right = light form (Email, Password, `Sign in` button, divider, `Continue with Google` outline button). Pure UI, buttons navigate to `/dashboard` on submit.

**3. Dashboard (`/dashboard`)** — Light neutral. Greeting header "Welcome, Bhinder". Three stat cards (Resume ✔ Uploaded, 3 Interviews, Avg Score 82%). Four action tiles: Start New Interview → `/interview`, Resume → `/resume`, Settings (stub), Architecture Demo → `/engineering`. Recent interviews list (mock rows: date, role, score).

**4. Resume (`/resume`)** — Dashed drop zone ("Drag PDF or click"), on file selected show a fake parsed state. Extracted skills as chips (Go, Kafka, K8s, MongoDB, AWS). Projects + Experience as editable-looking cards (read-only inputs for now). Save button → `/dashboard`.

**5. Interview Room (`/interview`)** — The hero surface. Exactly the cockpit from the prototype: `bg-neutral-950`, 12-col grid, left 8-col console (AI avatar with pulse-ring, active session label, Q3/10, End Interview red button, current question in display type, live transcript block with animated waveform bars + "LISTENING FOR INPUT..."), right 4-col telemetry (live score 82/100, sub-score bars, gradient-ringed **Live Architecture** button labeled `CMD + K`). Clicking the button (or pressing ⌘K) opens the **architecture side drawer** (shadcn `Sheet` from right, 480px, dark) with: event stream ticker (mock events cycling every ~1.5s via `setInterval`), pipeline stages with pulsing nodes, Avg Latency + Queue Depth metric cards. End Interview → `/results`.

**6. Results (`/results`)** — Light. Header "Evaluation Summary" + candidate line. 4-card grid: Overall 86 (display type), Technical/Communication pair, Problem Solving/Confidence pair, brand-tinted "Ready for On-site" CTA card. Two-column Strengths (brand dots) vs Growth Areas (accent dots). Bottom action row: Replay Interview, Back to Dashboard.

**7. Engineering / Judge Mode (`/engineering`)** — Full-page dark version of the drawer content, expanded: large pipeline diagram (Candidate → STT → Event Bus → Workers → LLM → TTS → Candidate) rendered with CSS boxes + connecting lines, worker cards grid (Transcript / Question / Scoring / Resume / Analytics), continuous event stream panel, metrics row (Avg Latency, Queue Depth, Events/sec) with counting-up numbers. This is the "show the judges" page.

## Shared components

```text
src/components/
  site-nav.tsx            // top nav for light routes (logo, links, Start Interview)
  cockpit-nav.tsx         // minimal nav for dark routes
  architecture-drawer.tsx // shadcn Sheet content used by interview room
  event-stream.tsx        // shared mock event ticker used by drawer + engineering
  pipeline-diagram.tsx    // shared worker/pipeline visual
  score-bar.tsx           // labeled progress bar w/ mono caption
```

Uses existing shadcn primitives: `Sheet`, `Button`, `Card`, `Progress`, `Input`. No new deps.

## Mock data

`src/lib/mock.ts` exports: `mockEvents[]`, `mockPipeline[]`, `mockScores`, `mockStrengths`, `mockWeaknesses`, `mockSkills`, `mockInterviews`. Interview room ticks through events client-side with `useEffect` + `setInterval`.

## SEO / head

Each route sets route-specific `head()` (title, description, og:title, og:description). Root `head()` gets updated to Synapse defaults (no `og:image` on root). Skip `og:image` on leaves for now (no meaningful hero image yet).

## Out of scope (explicit)

- No Lovable Cloud, no auth backend, no DB, no file upload storage, no real audio/STT, no LLM calls — the user is building the backend separately.
- Settings page (not in the 7).
- Password reset / signup flows.

## Verification

After build: read the preview at `/`, `/auth`, `/dashboard`, `/resume`, `/interview` (with drawer open), `/results`, `/engineering` via Playwright screenshots at 1440×900 to confirm composition matches the chosen direction.
