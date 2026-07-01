import { config } from '../config';

export interface TriggerDecision {
  respond: boolean;
  reason: 'mentioned' | 'probabilistic' | 'skipped';
}

/**
 * Decides whether the bot should reply to a message.
 *
 * If the message references the bot's name it always responds (direct address).
 * Otherwise it engages randomly at the room's configured probability so the bot
 * chimes in occasionally instead of on every message.
 */
export function decideTrigger(
  text: string,
  engagementProbability: number,
): TriggerDecision {
  const name = config.kakaoBotName.trim();
  if (name && text.toLowerCase().includes(name.toLowerCase())) {
    return { respond: true, reason: 'mentioned' };
  }

  if (Math.random() < engagementProbability) {
    return { respond: true, reason: 'probabilistic' };
  }

  return { respond: false, reason: 'skipped' };
}
