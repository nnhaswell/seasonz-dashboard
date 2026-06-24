# Tag Refresh — Plan: Admin org-wide push (superuser)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Seasons superuser build a word bank and push an **org-wide** round (`group_id = NULL`) that surfaces on every member's feed — completing the authoring side alongside per-group champion pushes.

**Architecture:** Superuser RLS policies let `profiles.is_superuser` users insert/manage banks, bank-words, and rounds (including org-wide ones the champion policies can't touch). A `pushOrgRound` server action writes a `group_id = NULL` bank + words + sent round via the cookie-auth client (superuser RLS authorizes it). A superuser Build page (under the `is_superuser`-gated `/superuser` area) reuses the existing `generateWordBank` Claude action and a focused builder UI. Players already read org-wide rounds via `trr_orgwide_read` + `trb_player_read` + `trbw_player_read`.

**Tech Stack:** Next.js (App Router, server actions + RSC), Supabase, TypeScript.

**Source spec:** `docs/superpowers/specs/2026-06-23-tag-refresh-game-design.md` (§4.4 scoping — admin org-wide).

**Grounding facts (verified):**
- `app/superuser/layout.tsx` gates `/superuser/*` to `profiles.is_superuser` (redirects to `/403` otherwise).
- `components/SuperuserNav.tsx` has a nav-items array (`{ label, href: '/superuser/…', icon }`).
- `@/lib/supabase/server` → `createClient()` (cookie auth, RLS).
- Existing champion actions at `app/champion/[groupId]/tag-refresh/actions.ts` export `generateWordBank(theme, count)` and `type GeneratedWord` ({ label, emoji, displayMode }) — reused here.
- Tag Refresh RLS today: champion-only writes for banks/words/rounds; player reads for org-wide rounds + their bank/words. There is **no** policy letting a superuser write org-wide (`group_id NULL`) banks/rounds — this plan adds it.
- Dashboard: no test runner — verify via `npm run type-check` + `npm run build` + manual. `@/*` maps to repo root.

**Scope boundary:** Org-wide push only. No org-wide Library/Insights, no scheduling, no audience targeting beyond "all".

---

## File Structure

**Create:**
- `supabase/migrations/20260624020000_tag_refresh_superuser_write.sql` — superuser RLS (apply live).
- `app/superuser/tag-refresh/actions.ts` — `pushOrgRound`.
- `app/superuser/tag-refresh/page.tsx` — superuser Build page.

**Modify:**
- `components/SuperuserNav.tsx` — add "Tag Refresh".

---

## Task 1: Superuser write RLS

**Files:** Create `supabase/migrations/20260624020000_tag_refresh_superuser_write.sql`, then apply it to the live DB.

- [ ] **Step 1: Write the migration**

```sql
-- =====================================================
-- Tag Refresh — superuser write access (incl. org-wide group_id NULL)
-- Champion policies only cover a champion's own group; org-wide pushes
-- (group_id IS NULL) need a superuser to create the bank + round.
-- =====================================================

CREATE POLICY trb_superuser_all ON public.tag_refresh_banks
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_superuser = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_superuser = true));

CREATE POLICY trbw_superuser_all ON public.tag_refresh_bank_words
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_superuser = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_superuser = true));

CREATE POLICY trr_superuser_all ON public.tag_refresh_rounds
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_superuser = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_superuser = true));
```

- [ ] **Step 2: Apply to the live DB**

Run: `supabase db query --linked -f supabase/migrations/20260624020000_tag_refresh_superuser_write.sql`
Then verify: `echo "select policyname from pg_policies where policyname like 'tr%_superuser_all';" | supabase db query --linked -o json` — expect the 3 policy names.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260624020000_tag_refresh_superuser_write.sql
git commit -m "feat(tag-refresh): superuser write RLS for org-wide pushes"
```

---

## Task 2: `pushOrgRound` server action

**Files:** Create `app/superuser/tag-refresh/actions.ts`.

- [ ] **Step 1: Write the action**

```ts
// app/superuser/tag-refresh/actions.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import type { GeneratedWord } from '@/app/champion/[groupId]/tag-refresh/actions';

export interface PushOrgRoundInput {
  name: string;
  theme: string | null;
  source: 'manual' | 'ai';
  words: GeneratedWord[];
  speed: 'slow' | 'medium' | 'fast';
  wordsPerRound: number;
}

/** Create an org-wide (group_id NULL) bank + words + sent round. Returns the round id. */
export async function pushOrgRound(input: PushOrgRoundInput): Promise<{ roundId: string }> {
  if (!input.words.length) throw new Error('Add at least one word.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');

  const { data: bank, error: bankErr } = await supabase
    .from('tag_refresh_banks')
    .insert({
      group_id: null,
      created_by: user.id,
      name: input.name.trim() || 'Org-wide bank',
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
      group_id: null,
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
Expected: no new errors. (Cross-route `type GeneratedWord` import is a type-only import — erased at build.)

- [ ] **Step 3: Commit**

```bash
git add "app/superuser/tag-refresh/actions.ts"
git commit -m "feat(tag-refresh): pushOrgRound server action (org-wide)"
```

---

## Task 3: Superuser Build page

**Files:** Create `app/superuser/tag-refresh/page.tsx`.

A focused builder (theme + AI generate + manual chips + speed + words-per-round + push org-wide). Reuses `generateWordBank` from the champion actions.

- [ ] **Step 1: Write the page**

```tsx
// app/superuser/tag-refresh/page.tsx
'use client';

import { useState } from 'react';
import { generateWordBank, type GeneratedWord } from '@/app/champion/[groupId]/tag-refresh/actions';
import { pushOrgRound } from './actions';

export default function SuperuserTagRefreshPage() {
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
      await pushOrgRound({
        name: theme.trim() || 'Org-wide Tag Refresh',
        theme: theme.trim() || null,
        source: usedAi ? 'ai' : 'manual',
        words,
        speed,
        wordsPerRound: perRound,
      });
      setStatus('Pushed org-wide! Every member will see it on their feed.');
      setWords([]); setTheme(''); setUsedAi(false);
    } catch (e) {
      setStatus(`Push failed: ${(e as Error).message}`);
    } finally { setPushing(false); }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-white">Tag Refresh · Org-wide</h1>
      <p className="text-sm text-muted mt-1 mb-6">
        Build a word bank and push a falling-words game to <b>every</b> Seasons member.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        <div className="card">
          <p className="text-xs font-bold tracking-widest uppercase text-muted mb-3">Word bank</p>
          <div className="flex gap-2 mb-4">
            <input
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="Theme — e.g. New year, new season"
              className="flex-1 bg-surface-low border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            />
            <button onClick={onGenerate} disabled={generating || !theme.trim()} className="bg-accent text-accent-ink font-bold text-sm px-4 rounded-lg disabled:opacity-50">
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

        <div className="card h-fit">
          <p className="text-xs font-bold tracking-widest uppercase text-muted mb-3">Settings</p>
          <div className="flex items-center justify-between py-2.5 border-b border-white/[0.06]">
            <span className="text-sm font-semibold text-white">Speed</span>
            <div className="flex bg-surface-low border border-white/10 rounded-lg overflow-hidden">
              {(['slow', 'medium', 'fast'] as const).map((s) => (
                <button key={s} onClick={() => setSpeed(s)} className={`text-xs font-bold px-3 py-1.5 capitalize ${speed === s ? 'bg-accent text-accent-ink' : 'text-muted'}`}>
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
          <button onClick={onPush} disabled={pushing || !words.length} className="w-full bg-accent text-accent-ink font-bold text-sm py-3 rounded-xl mt-4 disabled:opacity-50">
            {pushing ? 'Pushing…' : 'Push to everyone'}
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
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "app/superuser/tag-refresh/page.tsx"
git commit -m "feat(tag-refresh): superuser org-wide Build page"
```

---

## Task 4: Superuser nav item

**Files:** Modify `components/SuperuserNav.tsx`.

- [ ] **Step 1: Add the nav entry**

In the nav-items array (alongside e.g. `{ label: 'Analytics', href: '/superuser/analytics', icon: '∿' }`), add:
```ts
  { label: 'Tag Refresh', href: '/superuser/tag-refresh', icon: '✺' },
```

- [ ] **Step 2: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: clean; the `/superuser/tag-refresh` route compiles.

- [ ] **Step 3: Manual smoke test**

`npm run dev`, as a **superuser** open `/superuser/tag-refresh`: theme → Generate → push **Push to everyone** → success. Confirm a `tag_refresh_rounds` row with `group_id IS NULL`, `status 'sent'`. On mobile, **any** logged-in member's feed shows the Tag Refresh card and the game loads the words (org-wide read RLS already lets non-members read it).

- [ ] **Step 4: Commit**

```bash
git add components/SuperuserNav.tsx
git commit -m "feat(tag-refresh): add Tag Refresh to superuser nav"
```

---

## Self-Review (completed by plan author)

**Spec coverage (§4.4 admin org-wide):**
- Superuser can push org-wide (`group_id NULL`) → superuser RLS (Task 1) + `pushOrgRound` (Task 2) + page (Task 3). ✓
- Surfaces on every member's feed → relies on existing `trr_orgwide_read` / `trb_player_read` / `trbw_player_read` (verified in mobile #3). ✓
- Reachable from superuser nav → Task 4. ✓

**Placeholder scan:** No TBD/TODO; complete code. RLS verified live; UI by type-check/build + manual.

**Type consistency:** `GeneratedWord` reused (type-only import) from champion actions in both `pushOrgRound` and the page. `PushOrgRoundInput.words: GeneratedWord[]` matches the page's `words` state. Round insert fields match the Plan 1 schema with `group_id: null`. ✓

---

## Done after this
This completes the Tag Refresh authoring side (champion per-group + admin org-wide) and the full player loop. No further planned slices — only optional polish (e.g. shared builder component to DRY the champion/superuser pages, org-level Insights).
