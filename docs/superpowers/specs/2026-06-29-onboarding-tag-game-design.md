# Onboarding via a First Tag Refresh Round — Design Spec

**Date:** 2026-06-29
**Status:** Draft for review
**Repo:** `Seasons_AIv02` (mobile only — no dashboard or schema changes)

## Goal

Replace the 3-page season tag-picker as the *default* onboarding tag-capture with **one short, gentle Tag Refresh round** (the app's signature falling-words game), keeping the existing manual picker as an opt-out. This makes onboarding lower-effort (react vs. browse), teaches the core mechanic on day one, and produces the same strength-weighted tag signals the model is built on.

## Why this approach

- **Lower cognitive load** at the highest-stakes moment: sorting falling words beats cold-start "describe yourself" from curated lists.
- **Teaches the loop:** the home-feed Tag Refresh game later feels familiar, not novel.
- **Better data:** the game produces `tag_signals` + strength-weighted `user_tags` (decay/reinforcement), consistent with the ongoing model — unlike the manual picker's binary present/absent inserts.
- **Reuses everything that exists:** the game screen, intro/done overlays, sampling, scoring, and the sort→tag commit logic. No new schema.

## Current state (verified)

- `OnboardingScreen` has phases `'username' | 'tags'` (username step from the claimable-handles work; tags = the 3-page season scroll). It ends by calling `onComplete({ past, present, future })`.
- App.tsx's `onComplete` handler inserts each selected tag into `user_tags`, sets `profiles.onboarding_complete = true`, redeems any invite, and navigates into the app. It tolerates empty arrays (the insert loop simply no-ops).
- The game: `TagRefreshGameScreen` takes a `round: TagRefreshRound` (`{ id, speed, wordsPerRound, words: BankWord[] }`) and calls `onComplete(sorts, completed)`. `TagRefreshGameContainer` wires that to `useCommitTagRefresh`.
- `commitTagRefresh` does three things: (1) insert `tag_refresh_plays` (needs a real `round_id` FK), (2) insert `tag_refresh_play_words`, (3) **apply tag signals** to `user_tags` + `tag_signals` via `planTagCommit`. Step 3 needs no round.

## Design

### Onboarding flow (phase machine)

`OnboardingScreen` phases become **`'username' | 'game' | 'manual'`**:
- `username` → existing claimable-handle step → advance to `game`.
- `game` → the onboarding Tag Refresh round (default capture). A quiet **"Prefer to pick manually?"** link → `manual`.
- `manual` → the existing 3-page season picker, unchanged.

Both `game` and `manual` end onboarding through the existing completion path (see "Committing").

### The onboarding round (no DB round)

A **synthetic, local** round — never touches `tag_refresh_rounds`/banks:
- `id: 'onboarding'` (sentinel, never used as a DB FK).
- `speed: 'slow'` (gentle for first-timers).
- `wordsPerRound: 10` (minimal viable capture — the ongoing game enriches later).
- `words`: a **curated local starter bank** (`src/lib/onboardingBank.ts`) — ~16 broadly-relevant, emoji-tagged words spanning life domains (drawn from the Tag Refresh starter-pack vocabulary: e.g. Fitness, Family, Career, Travel, Friendships, Learning, Creativity, Adventure, Home, Health, Wealth, Purpose, Confidence, Community, Freedom, Achievement). The existing sampler picks `wordsPerRound` of them.

Rationale for a hand-picked bank: a first-timer has no champion-pushed round, and the bank must be broad enough that everyone can place several words.

### Committing tags without a DB round (the key piece)

Refactor `useCommitTagRefresh.ts` to extract step 3 into a reusable, exported async function:

```ts
// Apply sort outcomes to user_tags + tag_signals (the strength model). No play row.
export async function applyTagSignals(userId: string, sorts: SortResult[], now = new Date()): Promise<void>
```
`commitTagRefresh` is updated to call `applyTagSignals(...)` for step 3 (behaviour unchanged — pure refactor, covered by running the existing game).

Add an onboarding commit that uses **only** the signal application:

```ts
// Onboarding has no DB round, so we persist tag signals but no tag_refresh_plays row.
export function useCommitOnboardingTags() // mutationFn: ({ userId, sorts }) => applyTagSignals(userId, sorts)
```
(Invalidates the `userTags` cache on success.)

### Wiring the game into onboarding

New `OnboardingGameStep` (component) mirrors `TagRefreshGameContainer` but:
- builds the synthetic onboarding round (above),
- on the game's `onComplete(sorts, completed)`: `await useCommitOnboardingTags().mutateAsync({ userId, sorts })`, then calls the screen's existing **`onComplete({ past: [], present: [], future: [] })`** — reusing App.tsx's finish/navigate/invite logic (the empty arrays are a no-op for its manual-insert loop; tags were already persisted by the game commit).
- exposes the **"Prefer to pick manually?"** affordance (see below) → switches `OnboardingScreen` to `manual`.

### Gentleness for first-timers

- `speed: 'slow'`.
- The game's intro overlay already frames the task ("sort each word into your past, present or future") — keep it.
- **Hide the score** on the onboarding round (no competitive pressure on day one): add an optional `hideScore?: boolean` prop to `TagRefreshGameScreen` that suppresses the score readout. Default false (the home-feed game is unchanged).
- The "Prefer to pick manually?" link lives on the game's **intro overlay** (before play), via an optional `onPickManually?: () => void` prop rendered as a subtle text link. When absent (the normal home-feed game), nothing renders.

### Manual fallback

The existing 3-page season picker stays exactly as-is and remains a first-class path (for the game-averse, accessibility, or anyone who prefers deliberate selection). It continues to persist via the existing `onComplete(tags)`.

## No schema change

Everything persists through existing tables (`user_tags`, `tag_signals`, `tags`). The onboarding round is local; no `tag_refresh_rounds`/`tag_refresh_plays` rows are written. No migration.

## Testing

- The `applyTagSignals` extraction is a pure refactor — verified by running the home-feed game (unchanged behaviour) and by the existing `tagRefreshCommit`/`tagOutcome`/`tagStrength` unit tests that cover `planTagCommit`.
- `onboardingBank.ts` is data; a tiny unit test asserts the bank has ≥ `wordsPerRound` entries and well-formed `BankWord`s (label + displayMode).
- Onboarding round construction (speed/words/wordsPerRound) — unit-testable if extracted to a `buildOnboardingRound()` helper.
- The full flow (username → game → commit → app; and the "pick manually" branch) verified by running the app.

## Out of scope (future)

- Replacing/removing the manual picker (kept as the fallback).
- Multi-round or adaptive onboarding (e.g. a second round to disambiguate).
- Persisting an onboarding "play" for analytics (could add a nullable-round play later if wanted).
- Changing the home-feed game.

## File map (anticipated)

- `src/lib/onboardingBank.ts` (+ small test) — curated `ONBOARDING_BANK: BankWord[]`, `buildOnboardingRound()`.
- `src/hooks/useCommitTagRefresh.ts` — extract+export `applyTagSignals`; add `useCommitOnboardingTags`.
- `src/hooks/index.ts` — export `useCommitOnboardingTags`.
- `src/components/OnboardingGameStep.tsx` — synthetic round + onboarding commit + "pick manually".
- `src/screens/TagRefreshGameScreen.tsx` — optional `hideScore?` and `onPickManually?` props (both default off/absent; home-feed game unchanged).
- `src/screens/OnboardingScreen.tsx` — `'username' | 'game' | 'manual'` phase machine; game is the default, manual reachable via the link.

## Open items to confirm at plan time

- Final onboarding bank word list (the ~16) and `wordsPerRound` (10 proposed).
- Whether to hide the score on the onboarding round (recommended yes).
- Whether the manual link sits on the intro overlay (proposed) or as a top-bar "skip to manual".
