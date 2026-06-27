# Group Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give groups champion-set tags from the Tag Refresh vocabulary, displayed read-only on the mobile group page via a three-dots sheet, and used to rank groups in Discover by overlap with the viewer's own tags.

**Architecture:** A new `group_tags(group_id, label)` table + `set_group_tags` RPC (superuser/champion auth). The dashboard `GroupCard` gains a Tags editor (apply-a-category + toggle-individual, from `PRESET_PACKS`). Mobile reads tags via `useGroupTags`, shows them in a read-only `GroupTagsSheet` opened by a three-dots button, and ranks Discover group cards with a pure `rankGroupsByTagOverlap` helper fed by the viewer's `useUserTags`.

**Tech Stack:** Supabase/Postgres (RLS, plpgsql), Next.js App Router (server actions), React Native/Expo, @tanstack/react-query, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-27-group-tags-design.md`

**Repos:**
- `seasonz-dashboard` = `/Users/nathaniel/Desktop/Claude/Projects/seasonz-dashboard`
- `Seasons_AIv02` = `/Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02`

**Infra note:** Apply the migration **live from `Seasons_AIv02`** (`supabase db query --linked`) against Tokyo; the dashboard CLI points at the wrong Mumbai project. Commit the migration file to both repos for record.

---

## File Structure

**Shared / DB**
- Create: `Seasons_AIv02/supabase/migrations/20260627140000_group_tags.sql` (canonical) + identical copy in `seasonz-dashboard/supabase/migrations/`.

**`seasonz-dashboard`**
- Create: `app/champion/[groupId]/group-tags-actions.ts` — `setGroupTags` server action.
- Modify: `app/superuser/groups/GroupCard.tsx` — Tags section + `initialTags` prop.
- Modify: `app/superuser/groups/page.tsx` — load `group_tags` with groups; pass `initialTags`.

**`Seasons_AIv02`**
- Create: `src/lib/groupTagRank.ts` + `src/lib/groupTagRank.test.ts` — `overlapCount`, `rankGroupsByTagOverlap`.
- Modify: `src/hooks/useGroups.ts` — `GroupRow.tags`, `useAllGroups` embed, `useGroupTags`.
- Modify: `src/hooks/index.ts` — export `useGroupTags`.
- Create: `src/components/GroupTagsSheet.tsx` — read-only tags sheet.
- Modify: `src/screens/GroupProfileScreen.tsx` — three-dots button + sheet.
- Modify: `src/screens/DiscoverScreen.tsx` — viewer tags → ranked group ordering.

---

## Task 1: Database migration (`group_tags` + `set_group_tags`)

**Files:**
- Create: `Seasons_AIv02/supabase/migrations/20260627140000_group_tags.sql`

- [ ] **Step 1: Write the migration file**

Create `Seasons_AIv02/supabase/migrations/20260627140000_group_tags.sql`:

```sql
-- Group tags: champion/superuser-set labels (Tag Refresh vocabulary) used to
-- describe a group and rank it in Discover. Safe to re-run.

create table if not exists public.group_tags (
  group_id   uuid not null references public.groups(id) on delete cascade,
  label      text not null,
  created_at timestamptz not null default now(),
  primary key (group_id, label)
);
create index if not exists idx_group_tags_label on public.group_tags(label);
create index if not exists idx_group_tags_group on public.group_tags(group_id);

alter table public.group_tags enable row level security;

drop policy if exists "group_tags_select" on public.group_tags;
create policy "group_tags_select" on public.group_tags for select to authenticated using (true);

grant select on public.group_tags to authenticated;
-- No client insert/delete: writes go through set_group_tags() only.

-- Replace a group's tag set atomically. Authorised: superuser OR the group's champion.
create or replace function public.set_group_tags(p_group uuid, p_labels text[])
returns void language plpgsql security definer set search_path = public as $$
declare v_is_super boolean;
begin
  select coalesce(is_superuser, false) into v_is_super from profiles where id = auth.uid();
  if not (v_is_super or public.is_group_champion(p_group, auth.uid())) then
    raise exception 'not authorised';
  end if;
  delete from group_tags where group_id = p_group;
  insert into group_tags (group_id, label)
    select p_group, lbl
    from (select distinct trim(both from l) as lbl from unnest(coalesce(p_labels, '{}')) as l) s
    where lbl <> '';
end; $$;
grant execute on function public.set_group_tags(uuid, text[]) to authenticated;
```

- [ ] **Step 2: Apply the migration live (from `Seasons_AIv02`)**

Run from `/Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02`:

```bash
supabase db query --linked < supabase/migrations/20260627140000_group_tags.sql
```
Expected: no error.

- [ ] **Step 3: Smoke-verify**

```bash
supabase db query --linked <<'SQL'
select to_regclass('public.group_tags') as table_exists;
select proname from pg_proc where proname = 'set_group_tags';
select polname from pg_policy where polrelid = 'public.group_tags'::regclass;
SQL
```
Expected: `public.group_tags`, one function `set_group_tags`, one policy `group_tags_select`.

- [ ] **Step 4: Copy to dashboard repo (record parity)**

```bash
cp /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02/supabase/migrations/20260627140000_group_tags.sql \
   /Users/nathaniel/Desktop/Claude/Projects/seasonz-dashboard/supabase/migrations/20260627140000_group_tags.sql
```

- [ ] **Step 5: Commit (both repos)**

```bash
cd /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02
git add supabase/migrations/20260627140000_group_tags.sql
git commit -m "feat(db): group_tags table + set_group_tags RPC"

cd /Users/nathaniel/Desktop/Claude/Projects/seasonz-dashboard
git add supabase/migrations/20260627140000_group_tags.sql
git commit -m "feat(db): group_tags migration (record copy)"
```

---

## Task 2: Dashboard `setGroupTags` server action

**Files:**
- Create: `seasonz-dashboard/app/champion/[groupId]/group-tags-actions.ts`

- [ ] **Step 1: Write the action**

Create `seasonz-dashboard/app/champion/[groupId]/group-tags-actions.ts`:

```ts
'use server';

import { createClient } from '@/lib/supabase/server';

/** Replace a group's tag set. Authorization is enforced in the SQL RPC
 *  (superuser OR champion of the group). */
export async function setGroupTags(groupId: string, labels: string[]): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_group_tags', {
    p_group: groupId,
    p_labels: labels,
  });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/nathaniel/Desktop/Claude/Projects/seasonz-dashboard && npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 3: Commit**

```bash
git add "app/champion/[groupId]/group-tags-actions.ts"
git commit -m "feat(dashboard): setGroupTags server action"
```

---

## Task 3: Dashboard `GroupCard` Tags section

**Files:**
- Modify: `seasonz-dashboard/app/superuser/groups/GroupCard.tsx`
- Modify: `seasonz-dashboard/app/superuser/groups/page.tsx`

Context: `GroupCard.tsx` exports `GroupCardData` and renders an expanded body with Details, Champion, and `<GroupPricingCard>`. `PRESET_PACKS` lives in `@/lib/tagRefreshPresets` (`{ theme, words: { label, emoji }[] }[]`).

- [ ] **Step 1: Add `tags` to `GroupCardData` and a prop**

In `GroupCard.tsx`, add to the `GroupCardData` type (after `championId`):

```ts
  tags:             string[]
```

- [ ] **Step 2: Imports + tag state**

At the top of `GroupCard.tsx`, add imports:

```ts
import { setGroupTags } from '@/app/champion/[groupId]/group-tags-actions'
import { PRESET_PACKS } from '@/lib/tagRefreshPresets'
```

Inside the component (with the other `useState` calls), add:

```ts
  const MAX_TAGS = 12
  const [tags, setTags] = useState<string[]>(group.tags ?? [])
  const [savingTags, setSavingTags] = useState(false)
  const [tagsMsg, setTagsMsg] = useState<string | null>(null)

  function toggleTag(label: string) {
    setTags((prev) =>
      prev.includes(label)
        ? prev.filter((t) => t !== label)
        : prev.length >= MAX_TAGS ? prev : [...prev, label],
    )
  }

  function applyCategory(words: { label: string }[]) {
    setTags((prev) => {
      const next = [...prev]
      for (const w of words) {
        if (!next.includes(w.label) && next.length < MAX_TAGS) next.push(w.label)
      }
      return next
    })
  }

  async function saveTags() {
    setSavingTags(true); setTagsMsg(null)
    try {
      await setGroupTags(group.id, tags)
      setTagsMsg('Tags saved.')
      onChanged()
    } catch (e) {
      setTagsMsg(`Save failed: ${(e as Error).message}`)
    } finally { setSavingTags(false) }
  }
```

- [ ] **Step 3: Render the Tags section**

In `GroupCard.tsx`, insert this block in the expanded body, immediately **before** the `{/* Pricing */}` comment / `<GroupPricingCard ... />`:

```tsx
          {/* Tags */}
          <div>
            <p className="text-xs font-bold tracking-widest uppercase text-muted mb-3">
              Tags <span className="text-faint font-normal">· {tags.length}/{MAX_TAGS}</span>
            </p>

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-2 bg-surface-high border border-white/10 text-white text-sm font-semibold px-3 py-1.5 rounded-lg">
                    {t}
                    <button onClick={() => toggleTag(t)} className="text-faint hover:text-white">×</button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-3">
              {PRESET_PACKS.map((pack) => (
                <div key={pack.theme}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <p className="text-xs font-semibold text-muted">{pack.theme}</p>
                    <button
                      onClick={() => applyCategory(pack.words)}
                      className="text-xs text-accent hover:underline"
                    >
                      apply all
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {pack.words.map((w) => {
                      const on = tags.includes(w.label)
                      return (
                        <button
                          key={w.label}
                          onClick={() => toggleTag(w.label)}
                          className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${on ? 'bg-accent text-accent-ink border-accent' : 'bg-surface-low text-muted border-white/10 hover:border-accent/50'}`}
                        >
                          {w.emoji ? `${w.emoji} ` : ''}{w.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={saveTags} disabled={savingTags}
                className="bg-accent text-accent-ink font-bold text-sm px-4 py-2.5 rounded-xl disabled:opacity-50"
              >
                {savingTags ? 'Saving…' : 'Save tags'}
              </button>
              {tagsMsg && <span className="text-xs text-muted">{tagsMsg}</span>}
            </div>
          </div>
```

- [ ] **Step 4: Load tags in `page.tsx` and pass to the card**

In `app/superuser/groups/page.tsx`, add `group_tags(label)` to the groups select:

```ts
        .select(`
          id, name, description, season, is_public, member_count, created_at,
          pricing_type, price_amount, price_currency, billing_interval,
          group_tags(label),
          group_members!left(user_id, role, profiles(display_name))
        `)
```

In the `mapped` object (after `billing_interval`), add:

```ts
        tags:             (g.group_tags ?? []).map((t: any) => t.label),
```

(No render change needed — `GroupCard` reads `group.tags` from `GroupCardData`.)

- [ ] **Step 5: Typecheck + run**

Run: `npx tsc --noEmit` (EXIT 0). Then `npm run dev`, open `/superuser/groups`, expand a group → Tags section appears → "apply all" on a pack and toggle a couple words → **Save tags** → "Tags saved." Reload; the chips persist.

- [ ] **Step 6: Commit**

```bash
git add "app/superuser/groups/GroupCard.tsx" app/superuser/groups/page.tsx
git commit -m "feat(dashboard): group tags editor (apply category + toggle, from Tag Refresh packs)"
```

---

## Task 4: Mobile group-tags hook + `GroupRow.tags` + `useAllGroups` embed

**Files:**
- Modify: `Seasons_AIv02/src/hooks/useGroups.ts`
- Modify: `Seasons_AIv02/src/hooks/index.ts`

- [ ] **Step 1: Add `tags` to `GroupRow`**

In `src/hooks/useGroups.ts`, add to the `GroupRow` interface (after `member_count`):

```ts
  tags?:        string[];
```

- [ ] **Step 2: Embed tags in `useAllGroups`**

Replace the `useAllGroups` `queryFn` body so the select includes group_tags and maps them:

```ts
    queryFn:   async (): Promise<GroupRow[]> => {
      const { data, error } = await supabase
        .from('groups')
        .select('*, group_tags(label)')
        .eq('is_public', true)
        .order('member_count', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((g) => ({
        ...g,
        tags: (g.group_tags ?? []).map((t: any) => t.label),
      })) as GroupRow[];
    },
```

- [ ] **Step 3: Add `useGroupTags`**

Append to `src/hooks/useGroups.ts` (end of file):

```ts
// ─── useGroupTags — a group's tag labels (read-only) ──────────────────────────

export function useGroupTags(groupId: string | null | undefined) {
  return useQuery({
    queryKey:  ['groupTags', groupId ?? ''],
    enabled:   !!groupId,
    staleTime: 5 * 60 * 1000,
    queryFn:   async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('group_tags')
        .select('label')
        .eq('group_id', groupId!);
      if (error) throw new Error(error.message);
      return ((data ?? []) as { label: string }[]).map((r) => r.label);
    },
  });
}
```

- [ ] **Step 4: Export it**

In `src/hooks/index.ts`, find the groups exports and add `useGroupTags`. The file exports group hooks from `./useGroups`; add this line near them:

```ts
export { useGroupTags } from './useGroups';
```

- [ ] **Step 5: Typecheck**

Run: `cd /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02 && npx tsc --noEmit`
Expected: zero errors under `src/` (pre-existing `supabase/functions/` Deno errors are unrelated — ignore them).

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useGroups.ts src/hooks/index.ts
git commit -m "feat(mobile): group tags on GroupRow + useGroupTags hook"
```

---

## Task 5: Mobile `rankGroupsByTagOverlap` helper (TDD)

**Files:**
- Create: `Seasons_AIv02/src/lib/groupTagRank.ts`
- Test: `Seasons_AIv02/src/lib/groupTagRank.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/groupTagRank.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { overlapCount, rankGroupsByTagOverlap } from './groupTagRank';

const viewer = new Set(['Fitness', 'Career']);

describe('overlapCount', () => {
  it('counts shared labels', () => {
    expect(overlapCount(['Fitness', 'Travel'], viewer)).toBe(1);
    expect(overlapCount(['Fitness', 'Career'], viewer)).toBe(2);
  });
  it('is 0 for no tags or no overlap', () => {
    expect(overlapCount(undefined, viewer)).toBe(0);
    expect(overlapCount(['Gaming'], viewer)).toBe(0);
  });
});

describe('rankGroupsByTagOverlap', () => {
  const g = (id: string, tags: string[], member_count: number) => ({ id, tags, member_count });

  it('orders by overlap desc, then member_count desc', () => {
    const groups = [g('a', ['Travel'], 100), g('b', ['Fitness', 'Career'], 5), g('c', ['Fitness'], 50)];
    expect(rankGroupsByTagOverlap(groups, viewer).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('falls back to member_count when viewer has no tags', () => {
    const groups = [g('a', ['Fitness'], 10), g('b', ['Career'], 99)];
    expect(rankGroupsByTagOverlap(groups, new Set<string>()).map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('puts untagged groups last when there is overlap elsewhere', () => {
    const groups = [g('a', undefined as unknown as string[], 100), g('b', ['Fitness'], 1)];
    expect(rankGroupsByTagOverlap(groups, viewer).map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('does not mutate the input array', () => {
    const groups = [g('a', ['Travel'], 1), g('b', ['Fitness'], 1)];
    const copy = [...groups];
    rankGroupsByTagOverlap(groups, viewer);
    expect(groups).toEqual(copy);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/groupTagRank.test.ts`
Expected: FAIL — cannot find module `./groupTagRank`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/groupTagRank.ts`:

```ts
// Pure helpers for ranking groups by how well their tags match a viewer's tags.

/** Number of a group's tags that appear in the viewer's tag set. */
export function overlapCount(tags: string[] | undefined, viewer: Set<string>): number {
  if (!tags || tags.length === 0) return 0;
  let n = 0;
  for (const t of tags) if (viewer.has(t)) n++;
  return n;
}

/** Return a new array of groups sorted by tag overlap (desc), then member_count (desc). */
export function rankGroupsByTagOverlap<T extends { tags?: string[]; member_count: number }>(
  groups: T[],
  viewer: Set<string>,
): T[] {
  return [...groups].sort((a, b) => {
    const d = overlapCount(b.tags, viewer) - overlapCount(a.tags, viewer);
    if (d !== 0) return d;
    return b.member_count - a.member_count;
  });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/groupTagRank.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/groupTagRank.ts src/lib/groupTagRank.test.ts
git commit -m "feat(mobile): rankGroupsByTagOverlap helper"
```

---

## Task 6: Mobile `GroupTagsSheet` (read-only)

**Files:**
- Create: `Seasons_AIv02/src/components/GroupTagsSheet.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/GroupTagsSheet.tsx`:

```tsx
import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '@/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  groupName: string;
  tags: string[];
}

/** Read-only bottom sheet showing a group's tags. Editing happens on the dashboard. */
export function GroupTagsSheet({ visible, onClose, groupName, tags }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.eyebrow}>WHAT THIS GROUP IS ABOUT</Text>
          <Text style={styles.title}>{groupName}</Text>

          {tags.length > 0 ? (
            <View style={styles.tagWrap}>
              {tags.map((t) => (
                <View key={t} style={styles.tag}>
                  <Text style={styles.tagTxt}>{t}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>No tags yet.</Text>
          )}

          <Pressable style={styles.close} onPress={onClose}>
            <Text style={styles.closeTxt}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.xl, paddingBottom: Spacing['2xl'],
  },
  eyebrow: { ...Typography.eyebrow, color: Colors.textMuted },
  title: { fontFamily: 'Inter_700Bold', fontSize: 20, color: Colors.text, marginTop: 4, letterSpacing: -0.3 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: Spacing.lg },
  tag: {
    backgroundColor: Colors.surfaceHigh, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full,
  },
  tagTxt: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.text },
  empty: { ...Typography.bodySm, color: Colors.textMuted, marginTop: Spacing.lg },
  close: { alignItems: 'center', paddingVertical: 14, marginTop: Spacing.lg },
  closeTxt: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.textMuted },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero `src/` errors. (If `Radius.xl` / `Spacing['2xl']` don't exist in `@/theme`, substitute the nearest existing tokens — check `src/theme/index.ts` — e.g. `Radius.lg` / `Spacing.xl`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/GroupTagsSheet.tsx
git commit -m "feat(mobile): read-only GroupTagsSheet"
```

---

## Task 7: Mobile group page — three-dots → tags sheet

**Files:**
- Modify: `Seasons_AIv02/src/screens/GroupProfileScreen.tsx`

Context: the screen imports `Ionicons` already; the main render has a `topBar` then a `ScrollView` whose first child is `<View style={styles.hero}>`. The `group` object (from `useGroup`) has `name`.

- [ ] **Step 1: Imports + state + tags data**

Add the import near the other component imports:

```tsx
import { GroupTagsSheet } from '../components/GroupTagsSheet';
```

Add `useGroupTags` to the existing `@/hooks` import list (the one that already imports `useGroup`, `useJoinGroup`, etc.).

In the component body, near the other `useState` calls, add:

```tsx
  const [tagsOpen, setTagsOpen] = useState(false);
  const { data: groupTags = [] } = useGroupTags(groupId);
```

- [ ] **Step 2: Add the three-dots button to the hero**

Inside `<View style={styles.hero}>`, as its **first** child (before `{/* Row 1 ... */}`), add:

```tsx
          <Pressable style={styles.tagsBtn} onPress={() => setTagsOpen(true)} hitSlop={8}>
            <Ionicons name="ellipsis-horizontal" size={18} color={Colors.textMuted} />
          </Pressable>
```

- [ ] **Step 3: Add the button style**

In the `StyleSheet.create({ ... })` for this screen, add (next to the `hero` style):

```tsx
  tagsBtn: {
    position: 'absolute', top: Spacing.lg, right: Spacing.xl, zIndex: 2,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.surfaceHigh,
    alignItems: 'center', justifyContent: 'center',
  },
```

- [ ] **Step 4: Mount the sheet**

Near the other sheets at the bottom of the returned JSX (alongside `<GroupManageSheet ... />`), add:

```tsx
        <GroupTagsSheet
          visible={tagsOpen}
          onClose={() => setTagsOpen(false)}
          groupName={group.name}
          tags={groupTags}
        />
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero `src/` errors.

- [ ] **Step 6: Commit**

```bash
git add src/screens/GroupProfileScreen.tsx
git commit -m "feat(mobile): three-dots tags sheet on group page"
```

---

## Task 8: Discover — rank group cards by tag overlap

**Files:**
- Modify: `Seasons_AIv02/src/screens/DiscoverScreen.tsx`

Context: `buildDiscoverFeed(suggestions, groups, activities)` builds per-season cards; line ~104 does `const grps = groups.filter((g) => (g.season ?? 'present') === season);`. The component already has `const { data: currentUser } = useCurrentUser();` and a `useMemo` calling `buildDiscoverFeed`.

- [ ] **Step 1: Imports**

Add to the top of `DiscoverScreen.tsx`:

```tsx
import { rankGroupsByTagOverlap } from '@/lib/groupTagRank';
```

Add `useUserTags` to the existing `@/hooks` import list.

- [ ] **Step 2: Thread the viewer's labels into the feed builder**

Change the `buildDiscoverFeed` signature and the group line. Update the signature:

```tsx
function buildDiscoverFeed(
  suggestions: SuggestionResult[],
  groups:      GroupRow[],
  activities:  Activity[],
  viewerLabels: Set<string>,
): Record<Season, DiscoverCard[]> {
```

Replace the `const grps = groups.filter(...)` line with:

```tsx
    const grps = rankGroupsByTagOverlap(
      groups.filter((g) => (g.season ?? 'present') === season),
      viewerLabels,
    );
```

- [ ] **Step 3: Compute viewer labels and pass them in**

In the component body, after `const { data: currentUser } = useCurrentUser();`, add:

```tsx
  const { data: myTags } = useUserTags(currentUser?.id);
  const viewerLabels = useMemo(
    () => new Set<string>([...(myTags?.past ?? []), ...(myTags?.present ?? []), ...(myTags?.future ?? [])]),
    [myTags],
  );
```

Update the existing `feed` memo to pass `viewerLabels` and depend on it:

```tsx
  const feed = useMemo(
    () => buildDiscoverFeed(suggestions, allGroups, activities, viewerLabels),
    [suggestions, allGroups, activities, viewerLabels],
  );
```

- [ ] **Step 4: Typecheck + tests**

Run: `npx tsc --noEmit` (zero `src/` errors). Then `npx vitest run` (all pass, including `groupTagRank`).

- [ ] **Step 5: Commit**

```bash
git add src/screens/DiscoverScreen.tsx
git commit -m "feat(mobile): rank Discover groups by tag overlap with viewer"
```

---

## Task 9: End-to-end verification (run the apps)

**No code changes — drive the flow.**

- [ ] **Step 1: Full test suites**

```bash
cd /Users/nathaniel/Desktop/Claude/Projects/seasonz-dashboard && npx vitest run
cd /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02 && npx vitest run
```
Expected: all pass.

- [ ] **Step 2: Author tags (dashboard)**

`npm run dev` in `seasonz-dashboard`. As a superuser open `/superuser/groups`, expand a group → Tags → "apply all" on a pack + toggle a couple of words → **Save tags** → persists on reload.

- [ ] **Step 3: View tags (mobile)**

In the app, open that group → tap the **•••** in the hero → `GroupTagsSheet` lists the tags. A group with no tags shows "No tags yet."

- [ ] **Step 4: Discover ranking**

As a user whose own tags overlap the group's tags (play a Tag Refresh round with matching words if needed), open **Discover**: within the group's season, groups sharing your tags appear **before** unrelated ones. A brand-new user with no tags sees the prior member-count order (no regression).

- [ ] **Step 5: DB check**

```bash
cd /Users/nathaniel/Desktop/Claude/Projects/Seasons_AIv02
supabase db query --linked "select group_id, label from public.group_tags order by group_id limit 20;"
```
Expected: the labels you saved are present.

---

## Self-Review

**1. Spec coverage**
- `group_tags` table + RLS + `set_group_tags` RPC → Task 1. ✓
- Champion/superuser-only, dashboard-only authoring → Task 1 (RPC auth) + Tasks 2–3. ✓
- Vocabulary = Tag Refresh starter packs; manual toggle + apply-category; soft cap 12 → Task 3. ✓
- Read-only three-dots sheet on mobile (mirrors user profile) → Tasks 6–7. ✓
- Tags fixed for standard users / constant on join → enforced by RPC auth + no mobile editing. ✓
- Discover ranking by overlap → Tasks 4 (data), 5 (helper), 8 (wire-in). ✓
- Season-agnostic labels → `group_tags.label` only (no season column). ✓
- No cold-start seed → migration seeds nothing. ✓
- Out-of-scope items (free text, member-derived, per-season, strength-weighted, browse/filter, mobile editing) → not built. ✓

**2. Placeholder scan:** No TBD/TODO; every code step has complete code. The only `<...>` are not present (timestamps are concrete: `20260627140000`). Task 6 Step 2 names a concrete fallback (check `src/theme/index.ts`) rather than leaving it vague. ✓

**3. Type consistency:** `group_tags(group_id, label)` ↔ `useGroupTags(): string[]` ↔ `GroupRow.tags?: string[]` ↔ `GroupCardData.tags: string[]` ↔ `rankGroupsByTagOverlap<{ tags?: string[]; member_count }>`. `set_group_tags(p_group uuid, p_labels text[])` ↔ `setGroupTags(groupId, labels)` rpc args ↔ `applyCategory(words: {label}[])`/`toggleTag(label)` producing `string[]`. `buildDiscoverFeed(..., viewerLabels: Set<string>)` ↔ `viewerLabels` from `useUserTags`. ✓
