# Tag Refresh — Plan 3: Dashboard Build & Push (champion authoring)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A champion screen in the **seasonz-dashboard** repo to build a Tag Refresh word bank (manual + AI-generated), set speed/size, and push a round to their group's members' feeds — replacing the hand-seeded rounds used during mobile testing.

**Architecture:** A client-component Build page under the existing access-controlled champion route, backed by two server actions: `generateWordBank` (calls the Claude API for theme → words+emoji) and `pushRound` (writes `tag_refresh_banks` + `_bank_words` + `_rounds` via the cookie-auth Supabase client, so champion RLS applies). A Sidebar nav item links to it.

**Tech Stack:** Next.js (App Router, server actions), `@anthropic-ai/sdk`, `@supabase/ssr`, TypeScript.

**Source spec:** `docs/superpowers/specs/2026-06-23-tag-refresh-game-design.md` (§4.1 Build, §7 AI generation).

**Grounding facts (verified):**
- Champion pages live at `app/champion/[groupId]/<feature>/page.tsx`; `app/champion/[groupId]/layout.tsx` already gates access to champions/superusers of the group.
- `@/lib/supabase/server` exports `createClient()` (cookie auth, RLS) and `createAdminClient()` (service role). Use `createClient()` so champion RLS (`trb_champion_all` / `trr_champion_all`) authorizes the writes.
- `ANTHROPIC_API_KEY` is in `.env.local`. `@anthropic-ai/sdk` is NOT yet a dependency.
- `@/*` maps to the repo root. Verify commands: `npm run type-check`, `npm run build`. **No test runner** — this slice is verified by type-check/build + a manual smoke test (run the dashboard, generate, push, confirm a round row + the mobile feed card).
- Sidebar nav array is in `components/Sidebar.tsx` (items: `{ label, href, icon }`, linked as `/champion/${groupId}/${href}`).

**Scope boundary (NOT in Plan 3):** Library (saved/reusable banks), Insights/analytics, admin org-wide push (superuser), scheduling. Audience is fixed to "all members of this group" for v1.

---

## File Structure

**Create (seasonz-dashboard repo):**
- `lib/anthropic.ts` — server-only Anthropic client singleton.
- `app/champion/[groupId]/tag-refresh/actions.ts` — `generateWordBank` + `pushRound` server actions.
- `app/champion/[groupId]/tag-refresh/page.tsx` — the Build screen (client component).

**Modify:**
- `package.json` — add `@anthropic-ai/sdk`.
- `components/Sidebar.tsx` — add the "Tag Refresh" nav item.

**Shared word shape** (used across tasks — define inline in `actions.ts`, import where needed):
```ts
export type DisplayMode = 'text' | 'combo' | 'emoji';
export interface GeneratedWord { label: string; emoji: string | null; displayMode: DisplayMode; }
```

---

## Task 1: Anthropic client + dependency

**Files:**
- Modify: `package.json` (add dependency)
- Create: `lib/anthropic.ts`

- [ ] **Step 1: Install the SDK**

Run (from repo root): `npm install @anthropic-ai/sdk`
Expected: `@anthropic-ai/sdk` appears under `dependencies`.

- [ ] **Step 2: Create the server-only client**

```ts
// lib/anthropic.ts
// Server-only — never import this from a Client Component.
import Anthropic from '@anthropic-ai/sdk';

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json lib/anthropic.ts
git commit -m "chore(tag-refresh): add Anthropic SDK + server client"
```

---

## Task 2: `generateWordBank` server action (Claude API)

**Files:**
- Create: `app/champion/[groupId]/tag-refresh/actions.ts`

Uses Claude tool-use for reliable structured output (a forced `emit_words` tool). Follow the `claude-api` skill at implementation time (model choice, prompt caching if extended). Haiku is plenty for short word lists.

- [ ] **Step 1: Write the action file (generate half)**

```ts
// app/champion/[groupId]/tag-refresh/actions.ts
'use server';

import { anthropic } from '@/lib/anthropic';

export type DisplayMode = 'text' | 'combo' | 'emoji';
export interface GeneratedWord {
  label: string;
  emoji: string | null;
  displayMode: DisplayMode;
}

/** Generate `count` tag words (with optional emoji) for a theme, via Claude. */
export async function generateWordBank(theme: string, count: number): Promise<GeneratedWord[]> {
  const clean = theme.trim();
  if (!clean) return [];

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    tools: [
      {
        name: 'emit_words',
        description: 'Return the generated tag words for the theme.',
        input_schema: {
          type: 'object',
          properties: {
            words: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string', description: 'A concise tag word (1–2 words).' },
                  emoji: { type: ['string', 'null'], description: 'One fitting emoji, or null if none fits.' },
                  displayMode: { type: 'string', enum: ['text', 'combo', 'emoji'] },
                },
                required: ['label', 'emoji', 'displayMode'],
              },
            },
          },
          required: ['words'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'emit_words' },
    messages: [
      {
        role: 'user',
        content:
          `Generate ${count} short, single-concept tag words a person might identify with for the theme "${clean}". ` +
          `Each should be something someone could place in their past, present, or future (interests, roles, traits, activities). ` +
          `For each: a concise label (1–2 words), one fitting emoji (or null), and a displayMode — ` +
          `'combo' (word + emoji, the default), 'emoji' (emoji-only, only for very iconic ones), or 'text' (no emoji). ` +
          `Avoid duplicates and overly generic words.`,
      },
    ],
  });

  const tool = msg.content.find((b) => b.type === 'tool_use');
  if (!tool || tool.type !== 'tool_use') return [];
  const words = (tool.input as { words?: GeneratedWord[] }).words ?? [];
  return words
    .filter((w) => w.label && w.label.trim())
    .slice(0, count)
    .map((w) => ({
      label: w.label.trim(),
      emoji: w.emoji ?? null,
      displayMode: (['text', 'combo', 'emoji'] as const).includes(w.displayMode) ? w.displayMode : 'combo',
    }));
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: no new errors. If the SDK's content-block union complains about `.type === 'tool_use'`, the narrowing above (`tool.type !== 'tool_use'`) is correct for the SDK; do not loosen with `any`.

- [ ] **Step 3: Commit**

```bash
git add "app/champion/[groupId]/tag-refresh/actions.ts"
git commit -m "feat(tag-refresh): generateWordBank server action (Claude)"
```

---

## Task 3: `pushRound` server action (Supabase writes)

**Files:**
- Modify: `app/champion/[groupId]/tag-refresh/actions.ts` (append)

Writes a bank + its words + a sent round, using the cookie-auth client so champion RLS authorizes it. The round is group-scoped (`group_id = input.groupId`), audience fixed to `'all'`.

- [ ] **Step 1: Append the push action**

```ts
// append to app/champion/[groupId]/tag-refresh/actions.ts
import { createClient } from '@/lib/supabase/server';

export interface PushRoundInput {
  groupId: string;
  name: string;
  theme: string | null;
  source: 'manual' | 'ai';
  words: GeneratedWord[];
  speed: 'slow' | 'medium' | 'fast';
  wordsPerRound: number;
}

/** Create a bank + words + a 'sent' round for the group. Returns the round id. */
export async function pushRound(input: PushRoundInput): Promise<{ roundId: string }> {
  if (!input.words.length) throw new Error('Add at least one word.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');

  const { data: bank, error: bankErr } = await supabase
    .from('tag_refresh_banks')
    .insert({
      group_id: input.groupId,
      created_by: user.id,
      name: input.name.trim() || 'Untitled bank',
      theme: input.theme,
      source: input.source,
    })
    .select('id')
    .single();
  if (bankErr || !bank) throw new Error(bankErr?.message ?? 'Could not create the bank.');

  const { error: wordsErr } = await supabase.from('tag_refresh_bank_words').insert(
    input.words.map((w, i) => ({
      bank_id: bank.id,
      label: w.label.trim(),
      emoji: w.emoji,
      display_mode: w.displayMode,
      position: i,
    })),
  );
  if (wordsErr) throw new Error(wordsErr.message);

  const { data: round, error: roundErr } = await supabase
    .from('tag_refresh_rounds')
    .insert({
      bank_id: bank.id,
      group_id: input.groupId,
      created_by: user.id,
      speed: input.speed,
      words_per_round: input.wordsPerRound,
      audience: 'all',
      status: 'sent',
      sent_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (roundErr || !round) throw new Error(roundErr?.message ?? 'Could not create the round.');

  return { roundId: round.id };
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "app/champion/[groupId]/tag-refresh/actions.ts"
git commit -m "feat(tag-refresh): pushRound server action"
```

---

## Task 4: Build screen UI

**Files:**
- Create: `app/champion/[groupId]/tag-refresh/page.tsx`

Client component: theme input + "Generate with AI", editable word chips (add/remove), settings (speed segmented, words-per-round stepper), and "Push to members". Tailwind classes follow the dashboard's design system (`bg-surface`, `text-muted`, season colors, `.card` — see `app/globals.css`).

- [ ] **Step 1: Write the page**

```tsx
// app/champion/[groupId]/tag-refresh/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { generateWordBank, pushRound, type GeneratedWord } from './actions';

export default function TagRefreshPage({ params }: { params: Promise<{ groupId: string }> }) {
  const [groupId, setGroupId] = useState('');
  useEffect(() => { params.then((p) => setGroupId(p.groupId)); }, [params]);

  const [theme, setTheme] = useState('');
  const [words, setWords] = useState<GeneratedWord[]>([]);
  const [newWord, setNewWord] = useState('');
  const [speed, setSpeed] = useState<'slow' | 'medium' | 'fast'>('medium');
  const [perRound, setPerRound] = useState(12);
  const [generating, setGenerating] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [usedAi, setUsedAi] = useState(false);

  async function onGenerate() {
    if (!theme.trim()) return;
    setGenerating(true); setStatus(null);
    try {
      const generated = await generateWordBank(theme, 12);
      setWords((prev) => dedupe([...prev, ...generated]));
      setUsedAi(true);
    } catch (e) {
      setStatus(`Generation failed: ${(e as Error).message}`);
    } finally { setGenerating(false); }
  }

  function addManual() {
    const label = newWord.trim();
    if (!label) return;
    setWords((prev) => dedupe([...prev, { label, emoji: null, displayMode: 'text' }]));
    setNewWord('');
  }

  function removeWord(label: string) {
    setWords((prev) => prev.filter((w) => w.label !== label));
  }

  async function onPush() {
    if (!words.length) { setStatus('Add at least one word first.'); return; }
    setPushing(true); setStatus(null);
    try {
      await pushRound({
        groupId,
        name: theme.trim() || 'Tag Refresh',
        theme: theme.trim() || null,
        source: usedAi ? 'ai' : 'manual',
        words,
        speed,
        wordsPerRound: perRound,
      });
      setStatus('Pushed! Members will see it on their feed.');
      setWords([]); setTheme(''); setUsedAi(false);
    } catch (e) {
      setStatus(`Push failed: ${(e as Error).message}`);
    } finally { setPushing(false); }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-white">Tag Refresh</h1>
      <p className="text-sm text-muted mt-1 mb-6">
        Build a word bank and push a quick falling-words game to your members to refresh their tags.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        {/* Word bank */}
        <div className="card">
          <p className="text-xs font-bold tracking-widest uppercase text-muted mb-3">Word bank</p>
          <div className="flex gap-2 mb-4">
            <input
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="Theme — e.g. Hobbies & interests"
              className="flex-1 bg-surface-low border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            />
            <button
              onClick={onGenerate}
              disabled={generating || !theme.trim()}
              className="bg-accent text-accent-ink font-bold text-sm px-4 rounded-lg disabled:opacity-50"
            >
              {generating ? 'Generating…' : '✨ Generate with AI'}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {words.map((w) => (
              <span key={w.label} className="inline-flex items-center gap-2 bg-surface-high border border-white/10 text-white text-sm font-semibold px-3 py-1.5 rounded-lg">
                {w.emoji && w.displayMode !== 'text' && <span>{w.emoji}</span>}
                {w.label}
                <button onClick={() => removeWord(w.label)} className="text-faint hover:text-white">×</button>
              </span>
            ))}
            <span className="inline-flex items-center gap-1 border border-dashed border-white/20 rounded-lg px-2 py-1.5">
              <input
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addManual(); }}
                placeholder="+ Add word"
                className="bg-transparent text-sm text-white outline-none w-24"
              />
            </span>
          </div>
          {words.length > 0 && <p className="text-xs text-muted mt-3">{words.length} words</p>}
        </div>

        {/* Settings */}
        <div className="card h-fit">
          <p className="text-xs font-bold tracking-widest uppercase text-muted mb-3">Settings</p>

          <div className="flex items-center justify-between py-2.5 border-b border-white/[0.06]">
            <span className="text-sm font-semibold text-white">Speed</span>
            <div className="flex bg-surface-low border border-white/10 rounded-lg overflow-hidden">
              {(['slow', 'medium', 'fast'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`text-xs font-bold px-3 py-1.5 capitalize ${speed === s ? 'bg-accent text-accent-ink' : 'text-muted'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between py-2.5">
            <span className="text-sm font-semibold text-white">Words per round</span>
            <div className="flex items-center gap-3">
              <button onClick={() => setPerRound((n) => Math.max(4, n - 1))} className="w-6 h-6 rounded bg-surface-high text-white font-bold">−</button>
              <b className="text-white">{perRound}</b>
              <button onClick={() => setPerRound((n) => Math.min(30, n + 1))} className="w-6 h-6 rounded bg-surface-high text-white font-bold">+</button>
            </div>
          </div>

          <button
            onClick={onPush}
            disabled={pushing || !words.length || !groupId}
            className="w-full bg-accent text-accent-ink font-bold text-sm py-3 rounded-xl mt-4 disabled:opacity-50"
          >
            {pushing ? 'Pushing…' : 'Push to members'}
          </button>
          {status && <p className="text-xs text-muted mt-3">{status}</p>}
        </div>
      </div>
    </div>
  );
}

function dedupe(list: GeneratedWord[]): GeneratedWord[] {
  const seen = new Set<string>();
  return list.filter((w) => {
    const key = w.label.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: no new errors in the new files.

- [ ] **Step 3: Commit**

```bash
git add "app/champion/[groupId]/tag-refresh/page.tsx"
git commit -m "feat(tag-refresh): champion Build screen"
```

---

## Task 5: Sidebar nav item

**Files:**
- Modify: `components/Sidebar.tsx`

- [ ] **Step 1: Add the nav entry**

In `components/Sidebar.tsx`, add to the nav items array (alongside the existing `{ label: 'Activities', href: 'activities', icon: '◇' }` entries):

```ts
  { label: 'Tag Refresh', href: 'tag-refresh', icon: '✺' },
```

- [ ] **Step 2: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: type-check clean; `next build` succeeds (compiles the new route).

- [ ] **Step 3: Manual smoke test**

Run `npm run dev`, open `/champion/<a-group-you-champion>/tag-refresh`:
- Type a theme → **Generate with AI** → editable word chips appear.
- Add a manual word; remove a word.
- Set speed/words-per-round → **Push to members** → success message.
- Confirm a row in `tag_refresh_rounds` (group_id = that group, status 'sent'), and that the round's bank words exist.
- On mobile (logged in as a **member of that group**), the home feed shows the Tag Refresh card and the game loads the pushed words. *(Note: org-wide visibility for non-members is the superuser flow, out of scope here.)*

- [ ] **Step 4: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat(tag-refresh): add Tag Refresh to champion nav"
```

---

## Self-Review (completed by plan author)

**Spec coverage (§4.1 Build):**
- Theme input + AI generation → Task 2 + Task 4. ✓
- Manual word entry, editable/removable chips → Task 4. ✓
- Speed + words-per-round settings → Task 4. ✓
- Push a round (bank + words + round) → Task 3. ✓
- Audience: fixed to group "all" for v1 (Library/group-picker/scheduling out of scope per boundary). ✓
- Nav entry → Task 5. ✓

**Placeholder scan:** No TBD/TODO; complete code in every step. Verification uses `type-check`/`build` + a concrete manual smoke test (the repo has no test runner).

**Type consistency:** `GeneratedWord` / `DisplayMode` defined in `actions.ts` (Task 2) and imported by the page (Task 4). `PushRoundInput.words: GeneratedWord[]` matches the page's `words` state. `display_mode` (DB column, snake_case) vs `displayMode` (TS) mapped explicitly in `pushRound`. Round insert fields match the Plan 1 schema (`bank_id, group_id, created_by, speed, words_per_round, audience, status, sent_at`). ✓

---

## Next plans (not in this document)
- **Library** — list/reuse saved banks (don't recreate a bank per push).
- **Insights** — popular tags, movers, season balance (queries over `tag_refresh_play_words`).
- **Admin org-wide push** — superuser creates `group_id = NULL` rounds (needs superuser RLS for bank/round writes).
