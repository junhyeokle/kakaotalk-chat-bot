import { db } from './admin';
import { FillerPhrase } from '../persona/fillerPhrases';

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
  /**
   * Low-effort "filler" reactions (ㅋㅋㅋ, 인정, etc.) this room's bot is
   * allowed to send, each tagged with when it actually fits so the judge
   * doesn't fire one out of context (e.g. "인정" only for agreement, not for
   * something funny). Undefined means fall back to DEFAULT_FILLER_PHRASES.
   * Kept as an explicit whitelist (not free-form LLM generation) so a
   * casual/coarse phrase allowed in one room can never leak into another.
   */
  fillerPhrases?: FillerPhrase[];
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
    fillerPhrases: Array.isArray(data.fillerPhrases)
      ? data.fillerPhrases.filter(
          (p): p is FillerPhrase =>
            typeof p === 'object' &&
            p !== null &&
            typeof (p as FillerPhrase).phrase === 'string' &&
            typeof (p as FillerPhrase).context === 'string' &&
            ['high', 'medium', 'low'].includes((p as FillerPhrase).frequency),
        )
      : undefined,
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
 * Increments the count of messages seen since the bot last gave a real,
 * meaningful spontaneous reply (i.e. not because it was mentioned, and not
 * just a filler reaction), and returns the new value. Used to gate how often
 * the bot is even allowed to *consider* jumping in with an actual reply
 * unprompted, so it doesn't ask the LLM "should I reply?" on every message.
 */
export async function incrementSpontaneousCooldown(chatId: string): Promise<number> {
  return incrementCounterField(chatId, 'messagesSinceSpontaneousReply');
}

/** Resets the meaningful-reply cooldown, e.g. right after the bot has spoken. */
export async function resetSpontaneousCooldown(chatId: string): Promise<void> {
  await roomConfigDoc(chatId).set({ messagesSinceSpontaneousReply: 0 }, { merge: true });
}

/**
 * Same idea as the spontaneous-reply cooldown, but for cheap filler
 * reactions (ㅋㅋㅋ, 인정, ...). Tracked independently and with its own,
 * much shorter threshold, because real people send these far more often
 * than an actual reply — and sending one shouldn't block or be blocked by
 * the meaningful-reply cadence.
 */
export async function incrementFillerCooldown(chatId: string): Promise<number> {
  return incrementCounterField(chatId, 'messagesSinceFillerReply');
}

/** Resets the filler-reaction cooldown, e.g. right after the bot sends one. */
export async function resetFillerCooldown(chatId: string): Promise<void> {
  await roomConfigDoc(chatId).set({ messagesSinceFillerReply: 0 }, { merge: true });
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
