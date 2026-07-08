'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Toggle } from '@/components/Toggle'

const CTA_OPTIONS = ['check in', 'write it', 'start reflection'] as const

type Activity = {
  id:           string
  title:        string
  description:  string
  cta:          string
  emoji:        string | null
  season:       string
  is_published: boolean
  expires_at:   string | null
  created_at:   string
  response_count: number
}

export default function SuperuserActivitiesPage() {
  const supabase = createClient()

  const [items, setItems]   = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')

  // Create form
  const [showForm, setShowForm]       = useState(false)
  const [title, setTitle]             = useState('')
  const [description, setDescription] = useState('')
  const [cta, setCta]                 = useState<string>('check in')
  const [emoji, setEmoji]             = useState('')
  const [season, setSeason]           = useState('present')
  const [expires, setExpires]         = useState('')
  const [isPublished, setIsPublished] = useState(true)
  const [saving, setSaving]           = useState(false)
  const [formError, setFormError]     = useState('')

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('activities')
      .select('id, title, description, cta, emoji, season, is_published, expires_at, created_at, activity_responses(count)')
      .eq('scope', 'global')
      .order('created_at', { ascending: false })

    if (error) { setError(error.message); setLoading(false); return }

    setItems((data ?? []).map((a: any) => ({
      ...a,
      response_count: a.activity_responses?.[0]?.count ?? 0,
    })) as Activity[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function resetForm() {
    setTitle(''); setDescription(''); setCta('check in'); setEmoji('')
    setSeason('present'); setExpires(''); setIsPublished(true); setFormError('')
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!title.trim() || !description.trim()) { setFormError('Title and description are required.'); return }
    setSaving(true)
    const { error } = await supabase.from('activities').insert({
      scope:         'global',
      response_mode: 'feed',
      title:         title.trim(),
      description:   description.trim(),
      cta,
      emoji:         emoji.trim() || null,
      season,
      expires_at:    expires ? new Date(expires).toISOString() : null,
      is_published:  isPublished,
    })
    setSaving(false)
    if (error) { setFormError(error.message); return }
    resetForm(); setShowForm(false); load()
  }

  async function togglePublished(a: Activity) {
    await supabase.from('activities').update({ is_published: !a.is_published }).eq('id', a.id)
    load()
  }

  async function handleDelete(a: Activity) {
    if (!confirm(`Delete "${a.title}"? Responses to it will be removed too.`)) return
    await supabase.from('activities').delete().eq('id', a.id)
    load()
  }

  const inputCls = 'w-full bg-surface-high border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent'

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Activities</h1>
          <p className="text-muted text-sm mt-1">Engagement prompts shown to every user in Discover</p>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); if (showForm) resetForm() }}
          className="bg-accent text-accent-ink font-semibold text-sm rounded-lg px-4 py-2.5 hover:opacity-90 transition-opacity"
        >
          {showForm ? 'Cancel' : '✦ New activity'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card mb-8 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-white">New activity (global)</h2>
          <div>
            <label className="block text-xs text-muted mb-1.5">Title / question *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Weekly season check-in" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">Description *</label>
            <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Five minutes to name where you are right now." className={`${inputCls} resize-none`} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1.5">Button</label>
              <select value={cta} onChange={e => setCta(e.target.value)} className={inputCls}>
                {CTA_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1.5">Season</label>
              <select value={season} onChange={e => setSeason(e.target.value)} className={inputCls}>
                <option value="past">Past</option>
                <option value="present">Present</option>
                <option value="future">Future</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1.5">Emoji</label>
              <input value={emoji} onChange={e => setEmoji(e.target.value)} placeholder="◎" maxLength={4} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">Expires (optional)</label>
            <input type="date" value={expires} onChange={e => setExpires(e.target.value)} className={inputCls} />
          </div>
          <Toggle checked={isPublished} onChange={setIsPublished} label={isPublished ? 'Published (live)' : 'Draft (hidden)'} />
          {formError && <p className="text-sm text-past">{formError}</p>}
          <button type="submit" disabled={saving} className="self-start bg-accent text-accent-ink font-semibold text-sm rounded-lg px-4 py-2.5 hover:opacity-90 disabled:opacity-40 transition-opacity">
            {saving ? 'Creating…' : 'Create activity'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-muted text-sm">Loading…</p>
      ) : error ? (
        <p className="text-past text-sm">{error}</p>
      ) : items.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-muted">No activities yet.</p>
          <button onClick={() => setShowForm(true)} className="text-accent text-sm mt-2 hover:underline">Create the first one</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(a => (
            <div key={a.id} className="card flex items-start gap-4">
              <div className="w-9 h-9 rounded-lg bg-surface-high flex items-center justify-center shrink-0 text-lg">{a.emoji || '✦'}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-white truncate">{a.title}</h3>
                  {a.is_published
                    ? <span className="text-xs px-2 py-0.5 rounded-full bg-present/[0.16] text-present shrink-0">live</span>
                    : <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] text-faint shrink-0">draft</span>}
                </div>
                <p className="text-xs text-muted line-clamp-1 mb-2">{a.description}</p>
                <div className="flex items-center gap-3 text-xs text-faint">
                  <span className="capitalize">{a.season}</span>
                  <span>“{a.cta}”</span>
                  <span>{a.response_count} response{a.response_count !== 1 ? 's' : ''}</span>
                  {a.expires_at && <span>expires {new Date(a.expires_at).toLocaleDateString()}</span>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <button onClick={() => togglePublished(a)} className="text-xs text-muted hover:text-white transition-colors">{a.is_published ? 'Unpublish' : 'Publish'}</button>
                <button onClick={() => handleDelete(a)} className="text-xs text-faint hover:text-past transition-colors">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
