'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { GroupCard, type GroupCardData, type UserOption } from './GroupCard'

export default function GroupsPage() {
  const supabase = createClient()

  const [groups,  setGroups]  = useState<GroupCardData[]>([])
  const [users,   setUsers]   = useState<UserOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [query,   setQuery]   = useState('')

  // Create form state
  const [showForm,     setShowForm]     = useState(false)
  const [name,         setName]         = useState('')
  const [description,  setDescription]  = useState('')
  const [season,       setSeason]       = useState('present')
  const [isPublic,     setIsPublic]     = useState(true)
  const [creating,     setCreating]     = useState(false)
  const [createError,  setCreateError]  = useState('')

  async function load() {
    setLoading(true)
    const [groupsRes, usersRes] = await Promise.all([
      supabase
        .from('groups')
        .select(`
          id, name, description, season, is_public, member_count, created_at,
          pricing_type, price_amount, price_currency, billing_interval,
          group_members!left(user_id, role, profiles(display_name))
        `)
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, display_name').order('display_name', { ascending: true }),
    ])

    if (groupsRes.error) { setError(groupsRes.error.message); setLoading(false); return }

    const mapped: GroupCardData[] = (groupsRes.data ?? []).map((g: any) => {
      const champion = g.group_members?.find((m: any) => m.role === 'champion')
      return {
        id:               g.id,
        name:             g.name,
        description:      g.description,
        season:           g.season,
        is_public:        g.is_public,
        member_count:     g.member_count,
        championName:     champion?.profiles?.display_name ?? null,
        championId:       champion?.user_id ?? null,
        pricing_type:     g.pricing_type,
        price_amount:     g.price_amount,
        price_currency:   g.price_currency,
        billing_interval: g.billing_interval,
      }
    })

    setGroups(mapped)
    setUsers((usersRes.data ?? []) as UserOption[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups.filter(g =>
      g.name.toLowerCase().includes(q) || (g.description ?? '').toLowerCase().includes(q),
    )
  }, [groups, query])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateError('')

    const { error } = await supabase
      .from('groups')
      .insert({ name: name.trim(), description: description.trim() || null, season, is_public: isPublic })

    if (error) {
      setCreateError(error.message)
      setCreating(false)
      return
    }

    setName('')
    setDescription('')
    setSeason('present')
    setIsPublic(true)
    setShowForm(false)
    setCreating(false)
    load()
  }

  return (
    <div className="max-w-4xl">

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Groups</h1>
          <p className="text-muted text-sm mt-1">{groups.length} groups on the platform</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="bg-accent text-accent-ink font-semibold text-sm rounded-lg px-4 py-2.5 hover:opacity-90 transition-opacity"
        >
          {showForm ? 'Cancel' : '✦ New group'}
        </button>
      </div>

      {/* Search */}
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search groups…"
        className="w-full bg-surface-high border border-white/[0.08] rounded-lg px-4 py-2.5 text-white text-sm mb-6 focus:outline-none focus:border-accent"
      />

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="card mb-6 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-white">Create a new group</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted mb-1.5">Group name *</label>
              <input
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Career Changers"
                className="w-full bg-surface-high border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1.5">Season focus</label>
              <select
                value={season}
                onChange={e => setSeason(e.target.value)}
                className="w-full bg-surface-high border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
              >
                <option value="past">Past</option>
                <option value="present">Present</option>
                <option value="future">Future</option>
                <option value="multi">Multi-season</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted mb-1.5">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this group for?"
              className="w-full bg-surface-high border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsPublic(v => !v)}
              className={`relative w-9 h-5 shrink-0 rounded-full transition-colors ${isPublic ? 'bg-accent' : 'bg-surface-high border border-white/20'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${isPublic ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-sm text-muted">{isPublic ? 'Public' : 'Private'}</span>
          </div>

          {createError && <p className="text-sm text-past">{createError}</p>}

          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="self-start bg-accent text-accent-ink font-semibold text-sm rounded-lg px-4 py-2.5 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {creating ? 'Creating…' : 'Create group'}
          </button>
        </form>
      )}

      {/* Groups list */}
      {loading ? (
        <p className="text-muted text-sm">Loading…</p>
      ) : error ? (
        <p className="text-past text-sm">{error}</p>
      ) : groups.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-muted">No groups yet.</p>
          <button onClick={() => setShowForm(true)} className="text-accent text-sm mt-2 hover:underline">
            Create the first one
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-muted text-sm">No groups match “{query}”.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(g => (
            <GroupCard key={g.id} group={g} users={users} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  )
}
