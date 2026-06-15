'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const BUCKET = 'content-media'

type Episode = {
  id:               string
  episode_number:   number
  title:            string
  subtitle:         string | null
  transcript:       string | null
  duration_seconds: number | null
  audio_url:        string
}

type Summary = {
  id:           string
  title:        string
  author:       string | null
  category:     string | null
  cover_url:    string | null
  tagline:      string | null
  description:  string | null
  season:       string | null
  is_published: boolean
  created_at:   string
  episodes:     Episode[]
}

// One episode row in the form. In edit mode `id`/`existingAudioUrl` are set;
// a null `file` then means "keep the existing audio".
type EpisodeDraft = {
  key:              string
  id:               string | null
  existingAudioUrl: string | null
  title:            string
  subtitle:         string
  transcript:       string
  file:             File | null
  duration:         number | null   // seconds, auto-detected (editable)
}

function newEpisodeDraft(): EpisodeDraft {
  return { key: crypto.randomUUID(), id: null, existingAudioUrl: null, title: '', subtitle: '', transcript: '', file: null, duration: null }
}

const rand = () => crypto.randomUUID().slice(0, 8)

// Extract the storage object path from a content-media public URL, or null if
// the URL doesn't live in our bucket (so we never try to delete something else).
function storagePath(url: string | null): string | null {
  if (!url) return null
  const marker = `/${BUCKET}/`
  const i = url.indexOf(marker)
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length))
}

const extOf = (file: File, fallback: string) => {
  const fromName = file.name.split('.').pop()?.toLowerCase()
  return fromName && fromName.length <= 4 ? fromName : fallback
}

// Read an audio file's duration in the browser
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(audio.duration) ? Math.round(audio.duration) : null)
    }
    audio.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    audio.src = url
  })
}

const fmtMin = (secs: number | null) => (secs ? `${Math.round(secs / 60)} min` : '—')

export default function SummariesPage() {
  const supabase = createClient()

  const [summaries, setSummaries] = useState<Summary[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')

  // ── Form state (shared between create + edit) ──────────────────
  const [showForm,    setShowForm]    = useState(false)
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editingOriginal, setEditingOriginal] = useState<Summary | null>(null)  // snapshot for storage diffing
  const [title,       setTitle]       = useState('')
  const [author,      setAuthor]      = useState('')
  const [category,    setCategory]    = useState('book')
  const [season,      setSeason]      = useState('')
  const [tagline,     setTagline]     = useState('')
  const [description, setDescription] = useState('')
  const [isPublished, setIsPublished] = useState(true)
  const [coverFile,   setCoverFile]   = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string>('')  // existing url OR object url for a new pick
  const [episodes,    setEpisodes]    = useState<EpisodeDraft[]>([newEpisodeDraft()])

  const [saving,   setSaving]   = useState(false)
  const [progress, setProgress] = useState('')
  const [formError, setFormError] = useState('')
  const coverInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('season_summaries')
      .select(`
        id, title, author, category, cover_url, tagline, description, season, is_published, created_at,
        episodes:season_summary_episodes(id, episode_number, title, subtitle, transcript, duration_seconds, audio_url)
      `)
      .order('created_at', { ascending: false })

    if (error) { setError(error.message); setLoading(false); return }

    const mapped = (data ?? []).map((s: any) => ({
      ...s,
      episodes: (s.episodes ?? []).sort((a: Episode, b: Episode) => a.episode_number - b.episode_number),
    })) as Summary[]

    setSummaries(mapped)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function resetForm() {
    setEditingId(null)
    setEditingOriginal(null)
    setTitle(''); setAuthor(''); setCategory('book'); setSeason('')
    setTagline(''); setDescription(''); setIsPublished(true)
    setCoverFile(null); setCoverPreview(''); setEpisodes([newEpisodeDraft()])
    setFormError(''); setProgress('')
    if (coverInputRef.current) coverInputRef.current.value = ''
  }

  function startCreate() {
    resetForm()
    setShowForm(true)
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function startEdit(s: Summary) {
    setEditingId(s.id)
    setEditingOriginal(s)
    setTitle(s.title)
    setAuthor(s.author ?? '')
    setCategory(s.category ?? '')
    setSeason(s.season ?? '')
    setTagline(s.tagline ?? '')
    setDescription(s.description ?? '')
    setIsPublished(s.is_published)
    setCoverFile(null)
    setCoverPreview(s.cover_url ?? '')
    setEpisodes(
      s.episodes.length
        ? s.episodes.map(ep => ({
            key: ep.id,
            id: ep.id,
            existingAudioUrl: ep.audio_url,
            title: ep.title,
            subtitle: ep.subtitle ?? '',
            transcript: ep.transcript ?? '',
            file: null,
            duration: ep.duration_seconds,
          }))
        : [newEpisodeDraft()],
    )
    setFormError(''); setProgress('')
    if (coverInputRef.current) coverInputRef.current.value = ''
    setShowForm(true)
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function closeForm() {
    resetForm()
    setShowForm(false)
  }

  function onCoverPick(file: File | null) {
    setCoverFile(file)
    if (file) setCoverPreview(URL.createObjectURL(file))
  }

  function updateEpisode(key: string, patch: Partial<EpisodeDraft>) {
    setEpisodes(eps => eps.map(e => (e.key === key ? { ...e, ...patch } : e)))
  }

  async function onEpisodeFile(key: string, file: File | null) {
    updateEpisode(key, { file, duration: null })
    if (file) {
      const secs = await readDuration(file)
      updateEpisode(key, { duration: secs })
    }
  }

  async function uploadFile(path: string, file: File): Promise<string> {
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || undefined, upsert: true })
    if (upErr) throw new Error(`Upload failed (${path}): ${upErr.message}`)
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return data.publicUrl
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    // Keep episodes that have a title and some audio (new file or, in edit, existing)
    const kept = episodes.filter(ep => ep.title.trim() && (ep.file || ep.existingAudioUrl))
    if (!title.trim()) { setFormError('Title is required.'); return }
    if (kept.length === 0) { setFormError('Add at least one episode with a title and audio file.'); return }

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const fields = {
        title:        title.trim(),
        author:       author.trim() || null,
        category:     category.trim() || null,
        season:       season || null,
        tagline:      tagline.trim() || null,
        description:  description.trim() || null,
        is_published: isPublished,
      }

      // ── Resolve the summary id (insert new, or use editing target) ──
      let summaryId: string
      if (editingId) {
        summaryId = editingId
        setProgress('Saving changes…')
        const { error: uErr } = await supabase.from('season_summaries').update(fields).eq('id', summaryId)
        if (uErr) throw new Error(uErr.message)
      } else {
        setProgress('Creating summary…')
        const { data: row, error: sErr } = await supabase
          .from('season_summaries')
          .insert({ ...fields, created_by: user?.id ?? null })
          .select('id')
          .single()
        if (sErr || !row) throw new Error(sErr?.message ?? 'Could not create summary.')
        summaryId = row.id as string
      }

      // ── Cover (only when a new file was picked) ──
      if (coverFile) {
        setProgress('Uploading cover…')
        const coverUrl = await uploadFile(`summaries/${summaryId}/cover-${rand()}.${extOf(coverFile, 'jpg')}`, coverFile)
        await supabase.from('season_summaries').update({ cover_url: coverUrl }).eq('id', summaryId)
      }

      // ── Episodes — upload new audio, then replace the set in order ──
      const rows: Array<{ summary_id: string; episode_number: number; title: string; subtitle: string | null; transcript: string | null; duration_seconds: number | null; audio_url: string }> = []
      for (let i = 0; i < kept.length; i++) {
        const ep = kept[i]
        const episodeNumber = i + 1
        let audioUrl = ep.existingAudioUrl ?? ''
        if (ep.file) {
          setProgress(`Uploading episode ${episodeNumber} of ${kept.length}…`)
          audioUrl = await uploadFile(`summaries/${summaryId}/audio-${rand()}.${extOf(ep.file, 'mp3')}`, ep.file)
        }
        rows.push({
          summary_id:       summaryId,
          episode_number:   episodeNumber,
          title:            ep.title.trim(),
          subtitle:         ep.subtitle.trim() || null,
          transcript:       ep.transcript.trim() || null,
          duration_seconds: ep.duration ?? null,
          audio_url:        audioUrl,
        })
      }

      // Replace episodes wholesale (handles add / remove / reorder cleanly)
      setProgress('Saving episodes…')
      if (editingId) {
        const { error: delErr } = await supabase.from('season_summary_episodes').delete().eq('summary_id', summaryId)
        if (delErr) throw new Error(delErr.message)
      }
      const { error: insErr } = await supabase.from('season_summary_episodes').insert(rows)
      if (insErr) throw new Error(insErr.message)

      // ── Clean up storage objects no longer referenced (edit only, best-effort) ──
      if (editingOriginal) {
        const keepPaths = new Set(rows.map(r => storagePath(r.audio_url)).filter(Boolean) as string[])
        const orphans = new Set<string>()
        for (const ep of editingOriginal.episodes) {
          const p = storagePath(ep.audio_url)
          if (p && !keepPaths.has(p)) orphans.add(p)
        }
        // Old cover is replaced (new upload uses a unique name) → remove the previous one
        if (coverFile) {
          const oldCover = storagePath(editingOriginal.cover_url)
          if (oldCover) orphans.add(oldCover)
        }
        if (orphans.size) {
          await supabase.storage.from(BUCKET).remove([...orphans]).catch(() => {})
        }
      }

      setProgress('')
      closeForm()
      await load()
    } catch (err: any) {
      setFormError(err.message ?? 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  async function togglePublished(s: Summary) {
    await supabase.from('season_summaries').update({ is_published: !s.is_published }).eq('id', s.id)
    load()
  }

  async function handleDelete(s: Summary) {
    if (!confirm(`Delete "${s.title}" and its ${s.episodes.length} episode(s)? This cannot be undone.`)) return
    // Remove every object in the summary's folder (best-effort), then the row (episodes cascade)
    const { data: objs } = await supabase.storage.from(BUCKET).list(`summaries/${s.id}`)
    if (objs?.length) {
      await supabase.storage.from(BUCKET).remove(objs.map(o => `summaries/${s.id}/${o.name}`)).catch(() => {})
    }
    await supabase.from('season_summaries').delete().eq('id', s.id)
    if (editingId === s.id) closeForm()
    load()
  }

  const inputCls = 'w-full bg-surface-high border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent'

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Season Summaries</h1>
          <p className="text-muted text-sm mt-1">
            {summaries.length} summar{summaries.length === 1 ? 'y' : 'ies'} · audio content for Discover
          </p>
        </div>
        <button
          onClick={() => (showForm ? closeForm() : startCreate())}
          className="bg-accent text-accent-ink font-semibold text-sm rounded-lg px-4 py-2.5 hover:opacity-90 transition-opacity"
        >
          {showForm ? 'Cancel' : '✦ New summary'}
        </button>
      </div>

      {/* ── Create / Edit form ──────────────────────────────────── */}
      {showForm && (
        <form ref={formRef} onSubmit={handleSubmit} className="card mb-8 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">{editingId ? 'Edit summary' : 'New season summary'}</h2>
            {editingId && <span className="text-xs text-faint">Editing existing content</span>}
          </div>

          {/* Cover + core meta */}
          <div className="flex gap-5">
            <div>
              <label className="block text-xs text-muted mb-1.5">Cover</label>
              <label className="block w-28 h-36 rounded-lg overflow-hidden border border-white/[0.08] bg-surface-high cursor-pointer hover:border-accent transition-colors">
                {coverPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverPreview} alt="cover" className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full flex items-center justify-center text-faint text-xs text-center px-2">Tap to add</span>
                )}
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => onCoverPick(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <div className="flex-1 flex flex-col gap-3">
              <div>
                <label className="block text-xs text-muted mb-1.5">Title *</label>
                <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="The Richest Man in Babylon" className={inputCls} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-muted mb-1.5">Author</label>
                  <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="George S. Clason" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">Category</label>
                  <input value={category} onChange={e => setCategory(e.target.value)} placeholder="book" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">Season</label>
                  <select value={season} onChange={e => setSeason(e.target.value)} className={inputCls}>
                    <option value="">None</option>
                    <option value="past">Past</option>
                    <option value="present">Present</option>
                    <option value="future">Future</option>
                    <option value="multi">Multi</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted mb-1.5">Tagline</label>
            <input value={tagline} onChange={e => setTagline(e.target.value)} placeholder="Timeless lessons on building wealth." className={inputCls} />
          </div>

          <div>
            <label className="block text-xs text-muted mb-1.5">Summary (long-form)</label>
            <textarea rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="The overall summary shown on the detail screen and player." className={`${inputCls} resize-none`} />
          </div>

          {/* Episodes */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted">Episodes ({episodes.length})</label>
              <button type="button" onClick={() => setEpisodes(eps => [...eps, newEpisodeDraft()])} className="text-accent text-xs hover:underline">+ Add episode</button>
            </div>

            {episodes.map((ep, idx) => (
              <div key={ep.key} className="rounded-lg border border-white/[0.08] bg-surface-low p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">Episode {idx + 1}</span>
                  {episodes.length > 1 && (
                    <button type="button" onClick={() => setEpisodes(eps => eps.filter(x => x.key !== ep.key))} className="text-faint text-xs hover:text-past">Remove</button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input value={ep.title} onChange={e => updateEpisode(ep.key, { title: e.target.value })} placeholder="Episode title" className={inputCls} />
                  <input value={ep.subtitle} onChange={e => updateEpisode(ep.key, { subtitle: e.target.value })} placeholder="Subtitle (optional)" className={inputCls} />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs text-accent hover:underline cursor-pointer shrink-0">
                    {ep.file || ep.existingAudioUrl ? 'Change audio' : 'Choose audio'}
                    <input type="file" accept="audio/*" className="hidden" onChange={e => onEpisodeFile(ep.key, e.target.files?.[0] ?? null)} />
                  </label>
                  <span className="text-xs text-faint truncate">
                    {ep.file
                      ? `${ep.file.name} · ${fmtMin(ep.duration)}`
                      : ep.existingAudioUrl
                        ? `Current audio · ${fmtMin(ep.duration)}`
                        : 'No file chosen'}
                  </span>
                </div>
                <textarea rows={3} value={ep.transcript} onChange={e => updateEpisode(ep.key, { transcript: e.target.value })} placeholder="Transcript (optional)" className={`${inputCls} resize-none`} />
              </div>
            ))}
          </div>

          {/* Publish toggle + submit */}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setIsPublished(v => !v)} className={`relative w-9 h-5 rounded-full transition-colors ${isPublished ? 'bg-accent' : 'bg-surface-high border border-white/20'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${isPublished ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-sm text-muted">{isPublished ? 'Published (live in app)' : 'Draft (hidden)'}</span>
          </div>

          {formError && <p className="text-sm text-past">{formError}</p>}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving} className="self-start bg-accent text-accent-ink font-semibold text-sm rounded-lg px-4 py-2.5 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Publish summary'}
            </button>
            {editingId && !saving && (
              <button type="button" onClick={closeForm} className="text-xs text-muted hover:text-white transition-colors">Cancel</button>
            )}
            {saving && progress && <span className="text-xs text-muted">{progress}</span>}
          </div>
        </form>
      )}

      {/* ── List ────────────────────────────────────────────────── */}
      {loading ? (
        <p className="text-muted text-sm">Loading…</p>
      ) : error ? (
        <p className="text-past text-sm">{error}</p>
      ) : summaries.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-muted">No summaries yet.</p>
          <button onClick={startCreate} className="text-accent text-sm mt-2 hover:underline">Create the first one</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {summaries.map(s => (
            <div key={s.id} className={`card flex items-start gap-4 ${editingId === s.id ? 'border-accent/40' : ''}`}>
              {/* Cover */}
              <div className="w-14 h-[72px] rounded-md overflow-hidden bg-surface-high shrink-0 flex items-center justify-center">
                {s.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.cover_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-faint text-lg">♪</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-white truncate">{s.title}</h3>
                  {s.is_published ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-present/[0.16] text-present shrink-0">live</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] text-faint shrink-0">draft</span>
                  )}
                </div>
                {s.author && <p className="text-xs text-muted mb-1">{s.author}</p>}
                {s.tagline && <p className="text-xs text-faint line-clamp-1 mb-2">{s.tagline}</p>}
                <div className="flex items-center gap-3 text-xs text-faint">
                  <span>{s.episodes.length} episode{s.episodes.length !== 1 ? 's' : ''}</span>
                  <span>{fmtMin(s.episodes.reduce((a, e) => a + (e.duration_seconds ?? 0), 0))}</span>
                  {s.category && <span className="capitalize">{s.category}</span>}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                <button onClick={() => startEdit(s)} className="text-xs text-accent hover:underline">Edit</button>
                <button onClick={() => togglePublished(s)} className="text-xs text-muted hover:text-white transition-colors">
                  {s.is_published ? 'Unpublish' : 'Publish'}
                </button>
                <button onClick={() => handleDelete(s)} className="text-xs text-faint hover:text-past transition-colors">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
