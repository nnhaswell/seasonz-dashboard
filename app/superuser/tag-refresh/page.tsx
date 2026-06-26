// app/superuser/tag-refresh/page.tsx
'use client';

import { useState } from 'react';
import { generateWordBank, type GeneratedWord } from '@/app/champion/[groupId]/tag-refresh/actions';
import { pushOrgRound } from './actions';
import { TagRefreshPresetPicker } from '@/components/TagRefreshPresetPicker';
import type { PresetPack } from '@/lib/tagRefreshPresets';

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

  function loadPreset(pack: PresetPack) {
    setTheme(pack.theme);
    setWords(dedupe(pack.words));
    setUsedAi(false);
    setStatus(`Loaded “${pack.theme}” — edit the chips below, then push.`);
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

      <TagRefreshPresetPicker onLoad={loadPreset} />

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
