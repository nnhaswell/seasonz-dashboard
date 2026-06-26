'use client';

import { PRESET_PACKS, type PresetPack } from '@/lib/tagRefreshPresets';

/**
 * Row of one-click starter packs. Selecting a pack loads its words into the
 * Build editor (replacing what's there) so they can be edited and pushed.
 */
export function TagRefreshPresetPicker({ onLoad }: { onLoad: (pack: PresetPack) => void }) {
  return (
    <div className="card mb-4">
      <p className="text-xs font-bold tracking-widest uppercase text-muted mb-3">Starter packs</p>
      <div className="flex flex-wrap gap-2">
        {PRESET_PACKS.map((pack) => (
          <button
            key={pack.theme}
            onClick={() => onLoad(pack)}
            className="inline-flex items-center gap-2 bg-surface-high border border-white/10 hover:border-accent/60 text-white text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
          >
            {pack.theme}
            <span className="text-faint font-normal">· {pack.words.length}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
