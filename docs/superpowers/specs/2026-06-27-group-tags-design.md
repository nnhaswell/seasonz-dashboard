# Group Tags — Design Spec

**Date:** 2026-06-27
**Status:** Draft for review
**Repos:** `seasonz-dashboard` (authoring) · `Seasons_AIv02` (display + Discover ranking) · shared Supabase (Tokyo `ysavccnnbgymuaeiucxs`)

## Goal

Give groups **tags** drawn from the Tag Refresh vocabulary, set by champions/superusers, displayed read-only on the group page, and used to **rank groups in Discover by overlap with the viewer's own tags** — so users see relevant groups instead of a season-bucketed jumble.

## Core Principles

- **Shared vocabulary.** Group tags use the same labels as user tags (the Tag Refresh starter-pack words), so user↔group matching is plain label overlap. No free text.
- **Fixed for standard users.** A group's tags are a constant property of the group. Joining never changes them. Only champions (their own group) and superusers edit them, and only on the dashboard.
- **Tags complement season.** Groups keep their `season` field; tags add a topical dimension on top.

## Decisions (from discussion)

| Question | Decision |
| --- | --- |
| Who sets tags | Champion (own group) + superuser, **on the dashboard only** |
| Vocabulary | The Tag Refresh **starter-pack** words (`lib/tagRefreshPresets.ts`); no free text |
| How they're added | **Manually** (toggle individual words) **and** by **applying a whole category** (one click adds a pack's words) |
| Standard-user visibility | Read-only, viewable via a **three-dots** affordance on the group page (mirrors the user season-profile sheet) |
| Season coupling | Group tags are **season-agnostic labels** (a "Fitness" group matches anyone tagged Fitness in any season) |
| Discover | Group cards **ranked by tag overlap** with the viewer's tags |

## Vocabulary

The controlled list is the five Tag Refresh starter packs already in `seasonz-dashboard/lib/tagRefreshPresets.ts`:

- **Personal Life** — Fitness, Family, Career, Travel, Friendships, Wealth, Learning, Creativity, Luxury
- **Work & Career** — Leadership, Promotion, Networking, Expertise, Recognition, Innovation, Entrepreneurship, Mentoring, Work-Life Balance
- **Technology** — Artificial Intelligence, Social Media, Automation, Cybersecurity, Gaming, Digital Skills, Virtual Reality, Smart Home, Data Privacy
- **Society & Environment** — Sustainability, Volunteering, Diversity, Community, Climate Action, Conservation, Recycling, Public Transport, Local Business
- **Dreams & Aspirations** — Adventure, Freedom, Purpose, Confidence, Home, Legacy, Happiness, Achievement, Exploration

A group tag is one of these **labels** (string). These same labels become user tags when a member plays a Tag Refresh round built from these packs, so overlap matching is meaningful.

> The dashboard authoring UI is the only place that needs the packs (it already imports them). The mobile app and Discover only ever read the stored label strings.

## Data Model

### `group_tags` (new)

```sql
create table if not exists public.group_tags (
  group_id   uuid not null references public.groups(id) on delete cascade,
  label      text not null,
  created_at timestamptz not null default now(),
  primary key (group_id, label)
);
create index if not exists idx_group_tags_label on public.group_tags(label);
create index if not exists idx_group_tags_group on public.group_tags(group_id);

alter table public.group_tags enable row level security;

-- Anyone authenticated can read group tags (not sensitive; needed for Discover ranking).
drop policy if exists "group_tags_select" on public.group_tags;
create policy "group_tags_select" on public.group_tags for select to authenticated using (true);

grant select on public.group_tags to authenticated;
-- No client insert/delete: writes go through set_group_tags() only.
```

### `set_group_tags` RPC (replace the group's tag set atomically)

```sql
create or replace function public.set_group_tags(p_group uuid, p_labels text[])
returns void language plpgsql security definer set search_path = public as $$
declare v_is_super boolean;
begin
  select coalesce(is_superuser,false) into v_is_super from profiles where id = auth.uid();
  if not (v_is_super or public.is_group_champion(p_group, auth.uid())) then
    raise exception 'not authorised';
  end if;
  delete from group_tags where group_id = p_group;
  insert into group_tags (group_id, label)
    select p_group, distinct_label
    from (select distinct trim(unnest) as distinct_label from unnest(p_labels)) s
    where distinct_label <> ''
    on conflict do nothing;
end; $$;
grant execute on function public.set_group_tags(uuid, text[]) to authenticated;
```

The dashboard sends the full desired label set; the RPC replaces what's there. Authorization mirrors `set_group_pricing` (superuser OR champion of the group).

No cap is enforced in the DB; the authoring UI caps the selection (see below).

## Authoring — Dashboard (`GroupCard`)

Add a **Tags** section to the existing expanded `GroupCard` (`app/superuser/groups/GroupCard.tsx`), beneath Champion / above Pricing.

- **Current tags** render as chips (with × to remove).
- **Apply a category** — one button per starter pack (`PRESET_PACKS`); clicking adds all that pack's words to the selection.
- **Add individual** — the packs render as expandable groups of toggle-able word chips; clicking a word toggles it in/out of the selection.
- **Soft cap** of 12 tags (disable adding past it, with a hint) to keep cards meaningful.
- **Save tags** → `set_group_tags(groupId, selectedLabels)`.

Initial tags load from `group_tags` when the page fetches groups (add to the existing groups query or a per-card fetch).

## Display — Mobile group page

Read-only for everyone; editing is dashboard-only.

- Add a **three-dots (•••) button** to the `GroupProfileScreen` header (next to / replacing nothing functional — sits alongside the existing back/title). Tapping opens a new **`GroupTagsSheet`** (bottom sheet, mirrors `BioSheet` styling) listing the group's tags as chips, with the group name and a short "what this group is about" framing.
- New hook **`useGroupTags(groupId)`** → `string[]` of labels (`select label from group_tags where group_id = ...`).
- If a group has no tags, the three-dots still opens the sheet with an empty-state line ("No tags yet").

(The existing champion "manage" sheet is unchanged; tag editing is not added to mobile.)

## Discover ranking

Make group cards relevance-ranked instead of season-only.

- **Load tags with groups:** extend `useAllGroups` to also select `group_tags(label)`, exposing `tags: string[]` on `GroupRow`.
- **Viewer tags:** in `DiscoverScreen`, call `useUserTags(currentUser.id)` and flatten past/present/future into a `Set<string>` of the viewer's labels.
- **Rank:** a pure helper `rankGroupsByTagOverlap(groups, viewerLabels)` returns groups sorted by overlap count desc, then `member_count` desc. `buildDiscoverFeed` uses it when ordering the group cards within each season.
- **Reason line (optional, nice-to-have):** when overlap > 0, the group card can show "matches your Fitness, Career" using the shared labels.

Ranking is by **overlap count** for v1 (number of shared labels). Weighting by user tag *strength* is a deliberate future enhancement, not in this scope.

## Error handling / edge cases

- Group with no tags → ranked last (overlap 0), still shown; sheet shows empty state.
- Viewer with no tags (new user) → overlap 0 for all; falls back to `member_count` order (today's behaviour, no regression).
- Re-pricing/editing a group never alters tags except via the Tags save action.
- Duplicate/whitespace labels are de-duplicated by the RPC and the `(group_id,label)` PK.

## Testing (Vitest, pure logic)

- `rankGroupsByTagOverlap` — orders by overlap then member_count; viewer-no-tags fallback; group-no-tags last. (mobile)
- Overlap/“matches your …” reason builder, if added.
- RPC (`set_group_tags`), RLS, and the sheet/editor UI are verified by running the flow.

## Migration & rollout

- One migration (`group_tags` + `set_group_tags`), applied live from `Seasons_AIv02` (Tokyo); copy to the dashboard repo for record (same pattern as paid groups).
- **Cold start:** no seeding. Existing groups start with no tags until a champion/superuser sets them (the user is clearing all data shortly, so a seed would be throwaway). New users with no tags fall back to member-count ordering, so the empty state is safe.

## Out of scope (future)

- Free-text / custom group tags.
- Member-derived (emergent) group tags from member tag aggregates.
- Per-season group tags.
- Strength-weighted Discover ranking.
- Browse/filter groups by tag, and tag-based search.
- Tag editing from the mobile app.

## File map (anticipated)

**Shared / DB**
- `Seasons_AIv02/supabase/migrations/<ts>_group_tags.sql` (canonical) + copy in dashboard repo.

**`seasonz-dashboard`**
- `app/superuser/groups/GroupCard.tsx` — Tags section (category apply + individual toggle + save).
- `app/champion/[groupId]/group-pricing-actions.ts` (or a new `group-tags-actions.ts`) — `setGroupTags(groupId, labels)` server action wrapping the RPC.
- `app/superuser/groups/page.tsx` — load `group_tags` with groups; pass to card.

**`Seasons_AIv02`**
- `src/hooks/useGroups.ts` — `useGroupTags`; add `tags` to `GroupRow` + `useAllGroups` select.
- `src/lib/groupTagRank.ts` (+ test) — `rankGroupsByTagOverlap`.
- `src/components/GroupTagsSheet.tsx` — read-only tags sheet.
- `src/screens/GroupProfileScreen.tsx` — three-dots button → sheet.
- `src/screens/DiscoverScreen.tsx` — viewer tags + ranked group ordering.
