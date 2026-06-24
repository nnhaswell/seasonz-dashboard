// app/superuser/tag-refresh/actions.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import type { GeneratedWord } from '@/app/champion/[groupId]/tag-refresh/actions';

export interface PushOrgRoundInput {
  name: string;
  theme: string | null;
  source: 'manual' | 'ai';
  words: GeneratedWord[];
  speed: 'slow' | 'medium' | 'fast';
  wordsPerRound: number;
}

/** Create an org-wide (group_id NULL) bank + words + sent round. Returns the round id. */
export async function pushOrgRound(input: PushOrgRoundInput): Promise<{ roundId: string }> {
  if (!input.words.length) throw new Error('Add at least one word.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');

  const { data: bank, error: bankErr } = await supabase
    .from('tag_refresh_banks')
    .insert({
      group_id: null,
      created_by: user.id,
      name: input.name.trim() || 'Org-wide bank',
      theme: input.theme,
      source: input.source,
    })
    .select('id')
    .single();
  if (bankErr || !bank) throw new Error(bankErr?.message ?? 'Could not create the bank.');

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

  const { data: round, error: roundErr } = await supabase
    .from('tag_refresh_rounds')
    .insert({
      bank_id: bank.id,
      group_id: null,
      created_by: user.id,
      speed: input.speed,
      words_per_round: input.wordsPerRound,
      audience: 'all',
      status: 'sent',
      sent_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (roundErr || !round) throw new Error(roundErr?.message ?? 'Could not create the round.');

  return { roundId: round.id };
}
