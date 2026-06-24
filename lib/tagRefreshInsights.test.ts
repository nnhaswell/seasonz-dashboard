// lib/tagRefreshInsights.test.ts
import { describe, it, expect } from 'vitest';
import { popularTags, seasonBalance, movers, summaryStats, type PlayWord, type Play } from './tagRefreshInsights';

const pw = (label: string, outcome: PlayWord['outcome'], emoji: string | null = null): PlayWord => ({ label, emoji, outcome });

describe('popularTags', () => {
  it('counts tags for a season, sorted desc, limited', () => {
    const words = [pw('Music', 'present', '🎸'), pw('Music', 'present'), pw('Travel', 'present'), pw('Old', 'past')];
    const r = popularTags(words, 'present', 1);
    expect(r).toEqual([{ label: 'Music', emoji: '🎸', count: 2 }]);
  });
  it('ignores other seasons', () => {
    expect(popularTags([pw('X', 'past')], 'present', 5)).toEqual([]);
  });
});

describe('seasonBalance', () => {
  it('counts each season, excluding not_relevant', () => {
    const words = [pw('a', 'past'), pw('b', 'present'), pw('c', 'present'), pw('d', 'not_relevant')];
    expect(seasonBalance(words)).toEqual({ past: 1, present: 2, future: 0 });
  });
});

describe('movers', () => {
  it('returns month-over-month deltas, biggest |delta| first, excluding zero', () => {
    const now = [pw('Yoga', 'present'), pw('Yoga', 'present'), pw('Gaming', 'present')];
    const prev = [pw('Gaming', 'present'), pw('Gaming', 'present'), pw('Yoga', 'present')];
    const r = movers(now, prev, 5);
    expect(r).toEqual([
      { label: 'Yoga', delta: 1 },
      { label: 'Gaming', delta: -1 },
    ]);
  });
  it('ignores not_relevant', () => {
    expect(movers([pw('X', 'not_relevant')], [], 5)).toEqual([]);
  });
});

describe('summaryStats', () => {
  it('computes players, completion %, and tags refreshed', () => {
    const plays: Play[] = [
      { id: '1', userId: 'a', completed: true },
      { id: '2', userId: 'a', completed: false },
      { id: '3', userId: 'b', completed: true },
    ];
    const words = [pw('x', 'present'), pw('y', 'not_relevant')];
    expect(summaryStats(4, plays, words)).toEqual({ roundsSent: 4, players: 2, completionPct: 67, tagsRefreshed: 1 });
  });
});
