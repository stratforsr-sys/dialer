@AGENTS.md

# Sales Reflex Trainer — Project Handoff

> **Context**: This project was bootstrapped and ~90% built in an Anthropic sandbox session. All source is already committed. Use this doc to continue development on a local machine (Claude Code, Cursor, VS Code, etc.) without needing access to the original session.

## What this app is

An AI-powered training gym for B2B sales reps based on the **BBBTUUICC** meeting framework (9-step Lion Academy methodology). Reps upload notes/videos/transcripts, the app extracts techniques, generates scenario exercises, runs live roleplay chats with personas, and enforces spaced repetition (SM-2) so skills don't decay.

**Core loop**: Upload → Extract techniques → Practice (scenario cards + recall) → Roleplay (chat with AI persona) → Real-meeting analysis → Spaced repetition → Level up.

## Stack

- **Next.js 16.2.3** App Router (breaking changes vs older Next — read `node_modules/next/dist/docs/` before API guessing)
- **React 19.2.4** + **TypeScript** + **Tailwind v4**
- **Prisma 7.7** with `@prisma/adapter-better-sqlite3` (local dev) — migrate to Postgres for prod
- **Google Gemini** (`@google/generative-ai`) for all LLM calls
- **Framer Motion 12** for animations
- **bcryptjs** for password hashing (NextAuth not yet wired — planned)

## Environment

Required env vars (create `.env` in project root):

```
DATABASE_URL="file:./dev.db"
GOOGLE_GENERATIVE_AI_API_KEY="<your-gemini-key>"
# Planned: NEXTAUTH_SECRET, NEXTAUTH_URL, RESEND_API_KEY
```

## Getting started locally

```bash
cd salestraining
npm install
npx prisma migrate dev       # creates dev.db + applies migrations
npx tsx prisma/seed.mts      # seeds 6 default personas
npm run dev                  # http://localhost:3000
```

## File map

```
salestraining/
├── prisma/
│   ├── schema.prisma           # 20+ models (User, Module, Technique, RepetitionCard, Persona, PracticeSession, RoleplaySession, RealMeetingAnalysis, ...)
│   ├── seed.mts                # Seeds 6 personas (Anna Lindstrom, Magnus Eriksson, Sara Johansson, Johan Berg, Lisa Nystrom, Peter Holm)
│   └── migrations/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout — Geist + Fraunces fonts
│   │   ├── globals.css         # Design tokens (obsidian + blue accent theme)
│   │   └── (shell)/
│   │       ├── layout.tsx      # Shell with TopNav
│   │       ├── page.tsx        # Dashboard
│   │       ├── practice/       # Scenario cards + recall tests
│   │       ├── modules/        # Technique library per module (upload notes)
│   │       ├── roleplay/       # Live chat with AI persona
│   │       └── meetings/       # Real-meeting transcript analysis
│   ├── actions/                # ALL Server Actions (no REST endpoints for CRUD)
│   │   ├── gamification.ts     # getDashboardStats, getUserAchievements, checkAchievements
│   │   ├── modules.ts          # createModule, addNotesToModule, updateTechnique, deleteTechnique
│   │   ├── practice.ts         # startPracticeSession, generateScenarioCard, submitScenarioAnswer, submitRecallTest
│   │   ├── roleplay.ts         # startRoleplay, sendRoleplayMessage, endRoleplay
│   │   ├── meetings.ts         # analyzeRealMeeting, getMeetingAnalysis, getUserMeetings
│   │   └── reflections.ts
│   ├── lib/
│   │   ├── prisma.ts           # Prisma client (singleton)
│   │   ├── gemini.ts           # All Gemini prompts (analyzeNotes, generateScenario, evaluateResponse, roleplayResponse, analyzeMeetingTranscript)
│   │   ├── knowledge-base.ts   # buildKnowledgeBase, buildModuleKnowledgeBase, getWeakestTechniques, getDueRepetitions
│   │   └── spaced-repetition.ts # SM-2 algorithm: scoreToQuality, calculateNextReview, getNextReviewDate, calculateLevel, getXpReward
│   └── components/
│       ├── nav/                # top-nav.tsx, command-palette.tsx (Cmd+K)
│       ├── dashboard/          # dashboard-client.tsx
│       ├── gamification/       # xp-bar, streak-display, level-badge
│       ├── modules/            # modules-client, module-detail-client
│       ├── practice/           # practice-client (scenario flow)
│       ├── roleplay/           # roleplay-setup-client, roleplay-chat-client
│       ├── meetings/           # meetings-client
│       └── ui/                 # primitives
```

## Architecture rules

- **Server Actions only** for mutations (no `/api/*` REST CRUD).
- **Activity log is immutable** — never delete session/attempt rows.
- **SM-2 spaced repetition** — every scored exercise updates a `RepetitionCard`. `getDueRepetitions()` drives the practice queue.
- **Gamification** — XP from exercise scores, daily streaks, level calc in `spaced-repetition.ts#calculateLevel`.
- **Multi-tenant-ready** schema (every row has `userId`), but auth is not wired yet.

## PRD decisions already locked in (don't re-ask)

| Area | Decision |
|---|---|
| Onboarding | Skip heavy wizard; deactivated modules toggleable in settings |
| Empty states | Illustrated + suggested first action |
| Keyboard shortcuts | Command palette (Cmd+K) + contextual hotkeys |
| Theme | Dark obsidian default, light mode toggle |
| Roleplay framing | Implicit via persona (not explicit instructions) |
| Roleplay modes | Switchable between strict and freeform |
| Database (prod) | Supabase free tier for Postgres |
| Mascot | Animated lion character |
| Exercise types | Scenario + recall + pattern match |
| Nav layout | Top bar (full-width) |
| Ambient sound | Simple toggle |
| Persona avatars | Static server-generated images |
| Visual depth | Flat design |

## Status

### Done
- Full schema + seed data (6 personas)
- All 5 server actions + reflections
- All 12 client components
- Design system (globals.css)
- SM-2 engine + knowledge-base utilities
- All Gemini prompt templates
- Dashboard, practice, modules, roleplay, meetings flows (UI layer)

### Pick up here (ordered roughly by priority)
1. **Auth** — NextAuth with CredentialsProvider + bcrypt (schema already has `User.passwordHash`)
2. **Login/signup pages** — `/login`, `/signup` + middleware to protect `(shell)` routes
3. **Supabase migration** — swap `better-sqlite3` adapter for `@prisma/adapter-pg`
4. **File upload** — notes, video transcripts (Vercel Blob or Supabase Storage)
5. **Cron: morning email** — Resend + Vercel Cron for no-show reminders
6. **Command palette wiring** — component exists; wire to search + nav actions
7. **Achievements engine** — `checkAchievements()` stub exists; define rules
8. **Production polish** — error boundaries, loading states per PRD
9. **Vercel deploy** — set root directory to `salestraining/` in project settings

### Known gotchas
- `next.config.ts` uses Next 16 conventions — check `node_modules/next/dist/docs/` before config changes.
- Prisma 7 + better-sqlite3 adapter: `prisma generate` required after schema changes.
- Seed script is `.mts` (ESM) — run with `tsx`, not plain `node`.
- Package.json has `db:seed` pointing to `seed.ts` but file is `seed.mts` — update script or rename.
- `src/generated/` is Prisma client output — gitignore it locally if missing.

## Design language (see root `CLAUDE.md` and parent repo rules)

Bento grid + sophisticated glassmorphism. No generic AI aesthetics (no purple/blue gradients on white, no default `rounded-lg`). Custom radii (22px squircle). Every component has one unforgettable detail. Critique standard requests before executing.

## Git / deploy

Repo: `stratforsr-sys/dialer` — the sales training app lives in the `salestraining/` subfolder (pushed here from sandbox). Branch: `claude/sales-training-tool-xTde0`.

**For Vercel**: set root directory to `salestraining/` in project settings, or split into its own repo.
