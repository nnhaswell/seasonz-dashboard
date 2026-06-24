// lib/anthropic.ts
// Server-only — never import this from a Client Component.
import Anthropic from '@anthropic-ai/sdk';

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});
