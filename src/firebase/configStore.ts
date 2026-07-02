import { db } from './admin';

export interface RoomConfig {
  enabled: boolean;
  personaOverride?: string;
  /** Extra names/nicknames that also count as a direct mention in this room. */
  aliases: string[];
  /**
   * Room-specific hard rules injected into every prompt (e.g. topics to avoid,
   * how far dark humor / profanity can go). Kept separate from personaOverride
   * so rewriting the persona's tone doesn't accidentally drop the room's rules.
   */
  guardrails?: string;
}

function roomConfigDoc(chatId: string) {
  return db.collection('rooms').doc(chatId);
}

/**
 * Returns the per-room config, falling back to env defaults when a room has
 * never been configured. Missing fields fall back individually so a partially
 * configured room still behaves sensibly.
 */
export async function getRoomConfig(chatId: string): Promise<RoomConfig> {
  const snapshot = await roomConfigDoc(chatId).get();
  const data = snapshot.exists ? (snapshot.data() ?? {}) : {};

  return {
    enabled: typeof data.enabled === 'boolean' ? data.enabled : true,
    personaOverride:
      typeof data.personaOverride === 'string' ? data.personaOverride : undefined,
    aliases: Array.isArray(data.aliases)
      ? data.aliases.filter((a): a is string => typeof a === 'string')
      : [],
    guardrails: typeof data.guardrails === 'string' ? data.guardrails : undefined,
  };
}

export async function setRoomConfig(
  chatId: string,
  update: Partial<RoomConfig>,
): Promise<void> {
  await roomConfigDoc(chatId).set(update, { merge: true });
}

export interface RoomMemory {
  /** Long-term rolling summary of this room's conversation, or '' if none yet. */
  summary: string;
  /** Messages logged since the summary was last refreshed. */
  messagesSinceSummary: number;
}

export async function getRoomMemory(chatId: string): Promise<RoomMemory> {
  const snapshot = await roomConfigDoc(chatId).get();
  const data = snapshot.exists ? (snapshot.data() ?? {}) : {};

  return {
    summary: typeof data.summary === 'string' ? data.summary : '',
    messagesSinceSummary:
      typeof data.messagesSinceSummary === 'number' ? data.messagesSinceSummary : 0,
  };
}

/**
 * Increments the room's message counter and returns the new value. Used to
 * decide when enough new messages have accumulated to refresh the summary.
 */
export async function incrementMessageCounter(chatId: string): Promise<number> {
  return incrementCounterField(chatId, 'messagesSinceSummary');
}

/** Saves a freshly generated summary and resets the message counter. */
export async function saveRoomSummary(chatId: string, summary: string): Promise<void> {
  await roomConfigDoc(chatId).set(
    { summary, messagesSinceSummary: 0 },
    { merge: true },
  );
}

/**
 * Increments the count of messages seen since the bot last spoke up on its
 * own (i.e. not because it was mentioned), and returns the new value. Used
 * to gate how often the bot is even allowed to *consider* jumping into the
 * conversation unprompted, so it doesn't ask the LLM "should I reply?" on
 * every single message.
 */
export async function incrementSpontaneousCooldown(chatId: string): Promise<number> {
  return incrementCounterField(chatId, 'messagesSinceSpontaneousReply');
}

/** Resets the spontaneous-reply cooldown, e.g. right after the bot has spoken. */
export async function resetSpontaneousCooldown(chatId: string): Promise<void> {
  await roomConfigDoc(chatId).set({ messagesSinceSpontaneousReply: 0 }, { merge: true });
}

async function incrementCounterField(chatId: string, field: string): Promise<number> {
  const doc = roomConfigDoc(chatId);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(doc);
    const current =
      snapshot.exists && typeof snapshot.data()?.[field] === 'number'
        ? (snapshot.data()![field] as number)
        : 0;
    const next = current + 1;
    tx.set(doc, { [field]: next }, { merge: true });
    return next;
  });
}
