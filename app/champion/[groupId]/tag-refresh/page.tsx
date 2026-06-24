// app/champion/[groupId]/tag-refresh/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { generateWordBank, pushRound, saveBank, getBankWords, type GeneratedWord } from './actions';
import { useSearchParams } from 'next/navigation';

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
    <div>
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
            onClick={onSaveToLibrary}
            disabled={saving || !words.length}
            className="w-full bg-surface-high text-white font-bold text-sm py-2.5 rounded-xl mt-4 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save to Library'}
          </button>
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
