// lib/tagRefreshPresets.ts
// Curated starter word-banks for Tag Refresh. These load into the Build
// editor where a champion/admin can edit the chips and push or save them.
import type { GeneratedWord } from '@/app/champion/[groupId]/tag-refresh/actions';

export interface PresetPack {
  theme: string;
  words: GeneratedWord[];
}

const w = (label: string, emoji: string): GeneratedWord => ({ label, emoji, displayMode: 'combo' });

export const PRESET_PACKS: PresetPack[] = [
  {
    theme: 'Personal Life',
    words: [
      w('Fitness', '💪'),
      w('Family', '👨‍👩‍👧'),
      w('Career', '💼'),
      w('Travel', '✈️'),
      w('Friendships', '🤝'),
      w('Wealth', '💰'),
      w('Learning', '📚'),
      w('Creativity', '🎨'),
      w('Luxury', '💎'),
    ],
  },
  {
    theme: 'Work & Career',
    words: [
      w('Leadership', '🧭'),
      w('Promotion', '📈'),
      w('Networking', '🔗'),
      w('Expertise', '🎓'),
      w('Recognition', '🏆'),
      w('Innovation', '💡'),
      w('Entrepreneurship', '🚀'),
      w('Mentoring', '🧑‍🏫'),
      w('Work-Life Balance', '⚖️'),
    ],
  },
  {
    theme: 'Technology',
    words: [
      w('Artificial Intelligence', '🤖'),
      w('Social Media', '📱'),
      w('Automation', '⚙️'),
      w('Cybersecurity', '🔒'),
      w('Gaming', '🎮'),
      w('Digital Skills', '💻'),
      w('Virtual Reality', '🕶️'),
      w('Smart Home', '🏠'),
      w('Data Privacy', '🛡️'),
    ],
  },
  {
    theme: 'Society & Environment',
    words: [
      w('Sustainability', '🌱'),
      w('Volunteering', '🙌'),
      w('Diversity', '🌈'),
      w('Community', '🏘️'),
      w('Climate Action', '🌍'),
      w('Conservation', '🌳'),
      w('Recycling', '♻️'),
      w('Public Transport', '🚆'),
      w('Local Business', '🏪'),
    ],
  },
  {
    theme: 'Dreams & Aspirations',
    words: [
      w('Adventure', '🧗'),
      w('Freedom', '🕊️'),
      w('Purpose', '🎯'),
      w('Confidence', '✨'),
      w('Home', '🏡'),
      w('Legacy', '🏛️'),
      w('Happiness', '😊'),
      w('Achievement', '🥇'),
      w('Exploration', '🗺️'),
    ],
  },
];
