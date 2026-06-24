// app/champion/[groupId]/tag-refresh/actions.ts
'use server';

import { anthropic } from '@/lib/anthropic';
import { createClient } from '@/lib/supabase/server';

export type DisplayMode = 'text' | 'combo' | 'emoji';
export interface GeneratedWord {
  label: string;
  emoji: string | null;
  displayMode: DisplayMode;
}

/** Generate `count` tag words (with optional emoji) for a theme, via Claude. */
export async function generateWordBank(theme: string, count: number): Promise<GeneratedWord[]> {
  const clean = theme.trim();
  if (!clean) return [];

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    tools: [
      {
        name: 'emit_words',
        description: 'Return the generated tag words for the theme.',
        input_schema: {
          type: 'object',
          properties: {
            words: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string', description: 'A concise tag word (1–2 words).' },
                  emoji: { type: ['string', 'null'], description: 'One fitting emoji, or null if none fits.' },
                  displayMode: { type: 'string', enum: ['text', 'combo', 'emoji'] },
                },
                required: ['label', 'emoji', 'displayMode'],
              },
            },
          },
          required: ['words'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'emit_words' },
    messages: [
      {
        role: 'user',
        content:
          `Generate ${count} short, single-concept tag words a person might identify with for the theme "${clean}". ` +
          `Each should be something someone could place in their past, present, or future (interests, roles, traits, activities). ` +
          `For each: a concise label (1–2 words), one fitting emoji (or null), and a displayMode — ` +
          `'combo' (word + emoji, the default), 'emoji' (emoji-only, only for very iconic ones), or 'text' (no emoji). ` +
          `Avoid duplicates and overly generic words.`,
      },
    ],
  });

  const tool = msg.content.find((b) => b.type === 'tool_use');
  if (!tool || tool.type !== 'tool_use') return [];
  const words = (tool.input as { words?: GeneratedWord[] }).words ?? [];
  return words
    .filter((w) => w.label && w.label.trim())
    .slice(0, count)
    .map((w) => ({
      label: w.label.trim(),
      emoji: w.emoji ?? null,
      displayMode: (['text', 'combo', 'emoji'] as const).includes(w.displayMode) ? w.displayMode : 'combo',
    }));
}

export interface PushRoundInput {
  groupId: string;
  name: string;
  theme: string | null;
  source: 'manual' | 'ai';
  words: GeneratedWord[];
  speed: 'slow' | 'medium' | 'fast';
  wordsPerRound: number;
}

/** Create a bank + words + a 'sent' round for the group. Returns the round id. */
export async function pushRound(input: PushRoundInput): Promise<{ roundId: string }> {
  if (!input.words.length) throw new Error('Add at least one word.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');

  const { data: bank, error: bankErr } = await supabase
    .from('tag_refresh_banks')
    .insert({
      group_id: input.groupId,
      created_by: user.id,
      name: input.name.trim() || 'Untitled bank',
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
      group_id: input.groupId,
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
