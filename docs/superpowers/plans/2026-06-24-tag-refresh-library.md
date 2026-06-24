# Tag Refresh — Plan: Library (reusable word banks)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Library tab where champions save, browse, reuse, and delete word banks — so a bank can be reused across rounds instead of being recreated on every push.

**Architecture:** CRUD over `tag_refresh_banks` (+ `tag_refresh_bank_words`) via the cookie-auth Supabase client (`createClient`), so champion RLS authorizes everything (no admin client needed). New server actions extend the existing `actions.ts`. A Library tab lists the group's banks; "Use" loads a bank into the Build screen (`?bank=<id>`); the Build screen gains a "Save to Library" button and bank-preload on mount. Deletion is guarded so a bank that's already been pushed into a round can't be cascade-deleted.

**Tech Stack:** Next.js (App Router, server actions + RSC), `@supabase/ssr`, TypeScript.

**Source spec:** `docs/superpowers/specs/2026-06-23-tag-refresh-game-design.md` (§4.2 Library).

**Grounding facts (verified):**
- `app/champion/[groupId]/tag-refresh/actions.ts` exists with `'use server'`, `generateWordBank`, `pushRound`, and exports `type GeneratedWord` ({ label, emoji, displayMode }) + `DisplayMode`.
- `app/champion/[groupId]/tag-refresh/page.tsx` is the Build screen (client component) with `words` state of type `GeneratedWord[]`, a theme input, and a "Push to members" button.
- `app/champion/[groupId]/tag-refresh/tabs.tsx` renders the Build/Insights tab strip (client, `usePathname`).
- `@/lib/supabase/server` → `createClient()` (cookie auth, RLS). Champion RLS (`trb_champion_all` / `trbw_champion_all`) lets a champion read/insert/delete their group's banks + words.
- No test runner usage here (pure CRUD) — verified by `npm run type-check` + `npm run build` + manual.

**Scope boundary:** No bank renaming/editing-in-place beyond load→re-save, no folders/search, no cross-group sharing.

---

## File Structure

**Modify:**
- `app/champion/[groupId]/tag-refresh/actions.ts` — append `saveBank`, `listBanks`, `getBankWords`, `deleteBank` + the `BankSummary` type.
- `app/champion/[groupId]/tag-refresh/page.tsx` — add "Save to Library" + preload from `?bank=`.
- `app/champion/[groupId]/tag-refresh/tabs.tsx` — add the Library tab.

**Create:**
- `app/champion/[groupId]/tag-refresh/library/page.tsx` — Library list (server component).
- `app/champion/[groupId]/tag-refresh/library/bank-actions.tsx` — client "Use" link + delete button.

---

## Task 1: Library server actions

**Files:** Modify `app/champion/[groupId]/tag-refresh/actions.ts` (append).

- [ ] **Step 1: Append the actions**

READ the file first (to confirm `GeneratedWord` is exported and `createClient` is imported — it is, from `pushRound`). Then APPEND:

```ts

export interface BankSummary {
  id: string;
  name: string;
  theme: string | null;
  source: 'manual' | 'ai';
  wordCount: number;
  createdAt: string;
}

/** Save a reusable bank (no round). Returns the bank id. */
export async function saveBank(input: {
  groupId: string;
  name: string;
  theme: string | null;
  source: 'manual' | 'ai';
  words: GeneratedWord[];
}): Promise<{ bankId: string }> {
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
  if (bankErr || !bank) throw new Error(bankErr?.message ?? 'Could not save the bank.');

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

  return { bankId: bank.id };
}

/** List the group's saved banks (most recent first) with word counts. */
export async function listBanks(groupId: string): Promise<BankSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tag_refresh_banks')
    .select('id, name, theme, source, created_at, tag_refresh_bank_words(count)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((b: any) => ({
    id: b.id,
    name: b.name,
    theme: b.theme,
    source: b.source,
    wordCount: b.tag_refresh_bank_words?.[0]?.count ?? 0,
    createdAt: b.created_at,
  }));
}

/** Load a bank's words (to preload the Build screen). */
export async function getBankWords(bankId: string): Promise<GeneratedWord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tag_refresh_bank_words')
    .select('label, emoji, display_mode, position')
    .eq('bank_id', bankId)
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((w: any) => ({
    label: w.label,
    emoji: w.emoji ?? null,
    displayMode: w.display_mode,
  }));
}

/** Delete a bank — refused if any round has been pushed from it (would cascade). */
export async function deleteBank(bankId: string): Promise<void> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('tag_refresh_rounds')
    .select('id', { count: 'exact', head: true })
    .eq('bank_id', bankId);
  if ((count ?? 0) > 0) {
    throw new Error('This bank has been pushed in a round and can’t be deleted.');
  }
  const { error } = await supabase.from('tag_refresh_banks').delete().eq('id', bankId);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "app/champion/[groupId]/tag-refresh/actions.ts"
git commit -m "feat(tag-refresh): library server actions (save/list/get/delete bank)"
```

---

## Task 2: Library page + bank actions

**Files:** Create `app/champion/[groupId]/tag-refresh/library/page.tsx` and `.../library/bank-actions.tsx`.

- [ ] **Step 1: Create the client bank-actions (Use link + Delete)**

```tsx
// app/champion/[groupId]/tag-refresh/library/bank-actions.tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deleteBank } from '../actions';

export function BankActions({ groupId, bankId }: { groupId: string; bankId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onDelete() {
    setErr(null);
    startTransition(async () => {
      try {
        await deleteBank(bankId);
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        href={`/champion/${groupId}/tag-refresh?bank=${bankId}`}
        className="text-sm font-semibold text-accent"
      >
        Use
      </Link>
      <button onClick={onDelete} disabled={pending} className="text-sm text-faint hover:text-danger disabled:opacity-50">
        {pending ? '…' : 'Delete'}
      </button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Create the Library page**

```tsx
// app/champion/[groupId]/tag-refresh/library/page.tsx
import { listBanks } from '../actions';
import { BankActions } from './bank-actions';

export default async function LibraryPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const banks = await listBanks(groupId);

  return (
    <div className="max-w-4xl">
      <h2 className="text-lg font-bold text-white mb-4">Library</h2>

      {banks.length === 0 && (
        <div className="card text-sm text-muted">
          No saved banks yet. Build a word bank and hit “Save to Library”.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {banks.map((b) => (
          <div key={b.id} className="card flex items-center justify-between !py-3">
            <div>
              <div className="text-sm font-semibold text-white">{b.name}</div>
              <div className="text-xs text-muted mt-0.5">
                {b.wordCount} words · {b.source === 'ai' ? 'AI' : 'manual'}
              </div>
            </div>
            <BankActions groupId={groupId} bankId={b.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "app/champion/[groupId]/tag-refresh/library/page.tsx" "app/champion/[groupId]/tag-refresh/library/bank-actions.tsx"
git commit -m "feat(tag-refresh): Library list + bank actions"
```

---

## Task 3: Build screen — Save to Library + preload from ?bank

**Files:** Modify `app/champion/[groupId]/tag-refresh/page.tsx`.

- [ ] **Step 1: Read the file** to confirm current structure (imports from `./actions`, `words`/`theme`/`usedAi` state, the Settings card with the "Push to members" button).

- [ ] **Step 2: Update the imports**

Change the import line `import { generateWordBank, pushRound, type GeneratedWord } from './actions';` to:
```ts
import { generateWordBank, pushRound, saveBank, getBankWords, type GeneratedWord } from './actions';
import { useSearchParams } from 'next/navigation';
```
(`useEffect`/`useState` are already imported from `react`.)

- [ ] **Step 3: Add preload-from-bank + a saving state**

Immediately after the existing `const [usedAi, setUsedAi] = useState(false);` line, add:
```ts
  const [saving, setSaving] = useState(false);
  const searchParams = useSearchParams();
  const bankParam = searchParams.get('bank');

  useEffect(() => {
    if (!bankParam) return;
    getBankWords(bankParam)
      .then((w) => { setWords(w); setUsedAi(false); })
      .catch(() => {});
  }, [bankParam]);

  async function onSaveToLibrary() {
    if (!words.length) { setStatus('Add at least one word first.'); return; }
    setSaving(true); setStatus(null);
    try {
      await saveBank({
        groupId,
        name: theme.trim() || 'Tag Refresh bank',
        theme: theme.trim() || null,
        source: usedAi ? 'ai' : 'manual',
        words,
      });
      setStatus('Saved to Library.');
    } catch (e) {
      setStatus(`Save failed: ${(e as Error).message}`);
    } finally { setSaving(false); }
  }
```

- [ ] **Step 4: Add the "Save to Library" button**

In the Settings card, immediately BEFORE the existing "Push to members" `<button ...>` element, add:
```tsx
          <button
            onClick={onSaveToLibrary}
            disabled={saving || !words.length}
            className="w-full bg-surface-high text-white font-bold text-sm py-2.5 rounded-xl mt-4 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save to Library'}
          </button>
```
(The "Push to members" button keeps its existing `mt-4`; that's fine — they stack with spacing.)

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add "app/champion/[groupId]/tag-refresh/page.tsx"
git commit -m "feat(tag-refresh): Save to Library + load bank into Build"
```

---

## Task 4: Add Library to the tab strip

**Files:** Modify `app/champion/[groupId]/tag-refresh/tabs.tsx`.

- [ ] **Step 1: Add the Library tab**

In `tabs.tsx`, the `tabs` array currently is:
```ts
  const tabs = [
    { label: 'Build', href: base },
    { label: 'Insights', href: `${base}/insights` },
  ];
```
Change it to (Library between Build and Insights):
```ts
  const tabs = [
    { label: 'Build', href: base },
    { label: 'Library', href: `${base}/library` },
    { label: 'Insights', href: `${base}/insights` },
  ];
```

> Note on active-state: the existing logic is `t.href === base ? pathname === base : pathname.startsWith(t.href)`. Build matches only the exact base path, and Library/Insights use `startsWith` on their own sub-path — so they don't both light up. Loading a bank uses `?bank=` (a query param, not a path), so Build stays the active tab. No change needed to that logic.

- [ ] **Step 2: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: clean; routes `/tag-refresh`, `/tag-refresh/library`, `/tag-refresh/insights` all compile.

- [ ] **Step 3: Manual smoke test**

`npm run dev` → a group you champion → **Tag Refresh**:
- Build some words (or Generate) → **Save to Library** → status "Saved to Library."
- **Library** tab → the bank appears (name, word count). Click **Use** → returns to Build pre-filled with those words. Adjust + **Push to members** works.
- **Delete** a bank that hasn't been pushed → it disappears. Saving a bank then pushing a *different* round, then trying to delete the pushed bank → shows the "can't be deleted" message.

- [ ] **Step 4: Commit**

```bash
git add "app/champion/[groupId]/tag-refresh/tabs.tsx"
git commit -m "feat(tag-refresh): add Library tab"
```

---

## Self-Review (completed by plan author)

**Spec coverage (§4.2 Library):**
- Saved, reusable banks → `saveBank` + `listBanks` + Library page (Tasks 1–2). ✓
- Reuse across rounds → "Use" loads a bank into Build (`?bank=`), then push (Task 3). ✓
- Manage banks → delete (guarded against pushed banks) (Tasks 1–2). ✓
- Library tab → Task 4. ✓

**Placeholder scan:** No TBD/TODO; complete code throughout. CRUD verified by type-check/build + a concrete manual smoke test.

**Type consistency:** `GeneratedWord` reused from `actions.ts` across save/get + the Build page. `BankSummary` (Task 1) consumed by `listBanks` → Library page (Task 2). `getBankWords` returns `GeneratedWord[]`, matching the Build page's `setWords`. `deleteBank` called from `bank-actions.tsx` (Task 2). Tabs array shape unchanged (Task 4). ✓

---

## Next plans (not in this document)
- **Admin org-wide push** — superuser pushes to the whole org (superuser RLS for bank/round writes).
- **Profile display** — top-8 tags per season by strength (mobile).
