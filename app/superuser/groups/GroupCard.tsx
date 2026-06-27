'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { GroupPricingCard } from '@/components/GroupPricingCard'
import { Toggle } from '@/components/Toggle'
import { formatPrice } from '@/lib/price'
import { setGroupTags } from '@/app/champion/[groupId]/group-tags-actions'
import { PRESET_PACKS } from '@/lib/tagRefreshPresets'

const SEASON_COLOR: Record<string, string> = {
  past:    '#f87559',
  present: '#22c55e',
  future:  '#60a5fa',
  multi:   '#9aa3b8',
}

export type GroupCardData = {
  id:               string
  name:             string
  description:      string | null
  season:           string | null
  is_public:        boolean
  member_count:     number
  championName:     string | null
  championId:       string | null
  tags:             string[]
  pricing_type:     'free' | 'one_time' | 'subscription'
  price_amount:     number
  price_currency:   string
  billing_interval: 'month' | 'year' | null
}

export type UserOption = { id: string; display_name: string | null }

interface Props {
  group: GroupCardData
  users: UserOption[]
  onChanged: () => void
}

function priceSummary(g: GroupCardData): string {
  if (g.pricing_type === 'free') return 'Free'
  const base = formatPrice(g.price_amount, g.price_currency)
  if (g.pricing_type === 'subscription') return `${base} / ${g.billing_interval === 'year' ? 'yr' : 'mo'}`
  return base
}

export function GroupCard({ group, users, onChanged }: Props) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)

  // Edit form
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description ?? '')
  const [season, setSeason] = useState(group.season ?? 'present')
  const [isPublic, setIsPublic] = useState(group.is_public)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editMsg, setEditMsg] = useState<string | null>(null)

  // Champion assignment
  const [championPick, setChampionPick] = useState('')
  const [championFilter, setChampionFilter] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [removingChamp, setRemovingChamp] = useState(false)
  const [championMsg, setChampionMsg] = useState<string | null>(null)

  // Tags
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

  async function saveEdit() {
    setSavingEdit(true); setEditMsg(null)
    const { error } = await supabase
      .from('groups')
      .update({ name: name.trim(), description: description.trim() || null, season, is_public: isPublic })
      .eq('id', group.id)
    setSavingEdit(false)
    if (error) { setEditMsg(`Save failed: ${error.message}`); return }
    setEditMsg('Saved.')
    onChanged()
  }

  /** Demote any current champion(s) of this group to plain member. */
  async function demoteChampions() {
    return supabase
      .from('group_members')
      .update({ role: 'member' })
      .eq('group_id', group.id)
      .eq('role', 'champion')
  }

  async function assignChampion() {
    if (!championPick) { setChampionMsg('Pick a user first.'); return }
    setAssigning(true); setChampionMsg(null)
    // Replace: demote existing champion(s), then set the picked user.
    const { error: demoteErr } = await demoteChampions()
    if (demoteErr) { setAssigning(false); setChampionMsg(`Failed: ${demoteErr.message}`); return }
    const { error } = await supabase
      .from('group_members')
      .upsert(
        { group_id: group.id, user_id: championPick, role: 'champion', joined_at: new Date().toISOString() },
        { onConflict: 'group_id,user_id' },
      )
    setAssigning(false)
    if (error) { setChampionMsg(`Failed: ${error.message}`); return }
    setChampionMsg(group.championName ? 'Champion replaced.' : 'Champion assigned.')
    setChampionPick('')
    onChanged()
  }

  async function removeChampion() {
    if (!confirm('Remove the current champion? They stay a member of the group.')) return
    setRemovingChamp(true); setChampionMsg(null)
    const { error } = await demoteChampions()
    setRemovingChamp(false)
    if (error) { setChampionMsg(`Failed: ${error.message}`); return }
    setChampionMsg('Champion removed.')
    onChanged()
  }

  async function remove() {
    if (!confirm(`Delete "${group.name}"? This cannot be undone.`)) return
    await supabase.from('groups').delete().eq('id', group.id)
    onChanged()
  }

  const filteredUsers = championFilter.trim()
    ? users.filter(u => (u.display_name ?? '').toLowerCase().includes(championFilter.trim().toLowerCase()))
    : users

  return (
    <div className="card">
      {/* Header row — always visible, click to fold/unfold */}
      <div className="flex items-start gap-4">
        <button onClick={() => setOpen(o => !o)} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-faint text-xs transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
            <h3 className="text-sm font-semibold text-white capitalize truncate">{group.name}</h3>
            {group.season && (
              <span
                className="text-xs px-2 py-0.5 rounded-full shrink-0"
                style={{
                  backgroundColor: (SEASON_COLOR[group.season] ?? '#9aa3b8') + '22',
                  color: SEASON_COLOR[group.season] ?? '#9aa3b8',
                }}
              >
                {group.season}
              </span>
            )}
            {!group.is_public && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] text-faint shrink-0">private</span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] text-muted shrink-0">{priceSummary(group)}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-faint pl-5">
            <span>{group.member_count} member{group.member_count !== 1 ? 's' : ''}</span>
            {group.championName
              ? <span className="text-accent">Champion: {group.championName}</span>
              : <span className="text-past">No champion assigned</span>
            }
          </div>
        </button>
        <button
          onClick={remove}
          className="shrink-0 text-xs text-faint hover:text-past transition-colors px-2 py-1"
        >
          Delete
        </button>
      </div>

      {/* Expanded body */}
      {open && (
        <div className="mt-5 pt-5 border-t border-white/[0.06] flex flex-col gap-6">

          {/* Edit details */}
          <div>
            <p className="text-xs font-bold tracking-widest uppercase text-muted mb-3">Details</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-muted mb-1.5">Name</label>
                <input
                  value={name} onChange={e => setName(e.target.value)}
                  className="w-full bg-surface-high border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">Season</label>
                <select
                  value={season} onChange={e => setSeason(e.target.value)}
                  className="w-full bg-surface-high border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
                >
                  <option value="past">Past</option>
                  <option value="present">Present</option>
                  <option value="future">Future</option>
                  <option value="multi">Multi-season</option>
                </select>
              </div>
            </div>
            <div className="mb-3">
              <label className="block text-xs text-muted mb-1.5">Description</label>
              <textarea
                rows={2} value={description} onChange={e => setDescription(e.target.value)}
                className="w-full bg-surface-high border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent resize-none"
              />
            </div>
            <div className="mb-3">
              <Toggle checked={isPublic} onChange={setIsPublic} label={isPublic ? 'Public' : 'Private'} />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={saveEdit} disabled={savingEdit || !name.trim()}
                className="bg-accent text-accent-ink font-bold text-sm px-4 py-2.5 rounded-xl disabled:opacity-50"
              >
                {savingEdit ? 'Saving…' : 'Save changes'}
              </button>
              {editMsg && <span className="text-xs text-muted">{editMsg}</span>}
            </div>
          </div>

          {/* Champion */}
          <div>
            <p className="text-xs font-bold tracking-widest uppercase text-muted mb-3">Champion</p>
            <div className="flex items-center gap-3 mb-2">
              <p className="text-xs text-faint">
                {group.championName ? <>Current: <span className="text-accent">{group.championName}</span></> : 'No champion assigned'}
              </p>
              {group.championName && (
                <button
                  onClick={removeChampion} disabled={removingChamp}
                  className="text-xs text-faint hover:text-past transition-colors disabled:opacity-50"
                >
                  {removingChamp ? 'Removing…' : 'Remove'}
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={championFilter} onChange={e => setChampionFilter(e.target.value)}
                placeholder="Filter users…"
                className="w-40 bg-surface-high border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
              />
              <select
                value={championPick} onChange={e => setChampionPick(e.target.value)}
                className="min-w-48 bg-surface-high border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
              >
                <option value="">Choose a user…</option>
                {filteredUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.display_name ?? u.id.slice(0, 8)}</option>
                ))}
              </select>
              <button
                onClick={assignChampion} disabled={assigning || !championPick}
                className="bg-surface-high text-white font-bold text-sm px-4 py-2.5 rounded-xl border border-white/[0.08] hover:border-accent/60 disabled:opacity-50"
              >
                {assigning ? 'Saving…' : group.championName ? 'Replace champion' : 'Assign as champion'}
              </button>
              {championMsg && <span className="text-xs text-muted">{championMsg}</span>}
            </div>
          </div>

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

          {/* Pricing */}
          <GroupPricingCard
            groupId={group.id}
            initialType={group.pricing_type}
            initialAmount={group.price_amount}
            initialCurrency={group.price_currency}
            initialInterval={group.billing_interval}
          />
        </div>
      )}
    </div>
  )
}
