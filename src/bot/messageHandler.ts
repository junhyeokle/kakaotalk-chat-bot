import { TalkChatData, TalkChannel } from 'node-kakao';
import { config } from '../config';
import { KakaoClient } from '../kakao/client';
import {
  appendMessage,
  getRecentMessages,
  nowTimestamp,
} from '../firebase/memoryStore';
import {
  getRoomConfig,
  getRoomMemory,
  incrementMessageCounter,
  saveRoomSummary,
  incrementSpontaneousCooldown,
  resetSpontaneousCooldown,
  incrementFillerCooldown,
  resetFillerCooldown,
} from '../firebase/configStore';
import { getAllParticipants, saveParticipantProfiles } from '../firebase/participantStore';
import { extractMessageText } from './messageContent';
import { detectMention } from './triggerEngine';
import { judgeAndMaybeReply } from './contextJudge';
import { buildPromptContext } from '../persona/promptBuilder';
import { DEFAULT_FILLER_PHRASES } from '../persona/fillerPhrases';
import { summarizeRoom, resolveParticipantUpdates } from '../persona/summarizer';
import { getLlmProvider } from '../llm';
import { sendHumanized } from './humanize';

/**
 * Handles one incoming chat message end to end.
 *
 * Direct mentions always get a real reply. Otherwise, the bot can react in
 * one of two independent registers: a cheap filler reaction (ㅋㅋㅋ, 인정, ...)
 * on a short cooldown, or a real spontaneous reply on a longer cooldown —
 * sending one doesn't reset or block the other, since real people fire off
 * filler far more often than actual replies.
 */
export async function handleMessage(
  kakao: KakaoClient,
  data: TalkChatData,
  channel: TalkChannel,
): Promise<void> {
  // Never react to our own messages, or we'd loop replying to ourselves.
  if (kakao.isSelf(data)) return;

  const text = extractMessageText(data);
  if (!text) return;

  const chatId = channel.channelId.toString();
  const senderName = data.getSenderInfo(channel)?.nickname ?? 'unknown';
  const senderId = data.chat.sender.userId.toString();

  await appendMessage(chatId, {
    sender: senderName,
    senderId,
    text,
    isBot: false,
    timestamp: nowTimestamp(),
  });

  // Long-term memory upkeep runs independently of whether the bot replies to
  // this particular message, so room/participant memory stays current either way.
  await refreshSummaryIfDue(chatId);

  const roomConfig = await getRoomConfig(chatId);
  if (!roomConfig.enabled) return;

  const mentioned = detectMention(text, config.kakaoBotName, roomConfig.aliases);

  // Both cooldowns tick on every message, mention or not.
  const [meaningfulCooldownCount, fillerCooldownCount] = await Promise.all([
    incrementSpontaneousCooldown(chatId),
    incrementFillerCooldown(chatId),
  ]);

  const meaningfulAllowed = meaningfulCooldownCount >= config.spontaneousCooldownMessages;
  const fillerAllowed = fillerCooldownCount >= config.fillerCooldownMessages;

  if (!mentioned && !meaningfulAllowed && !fillerAllowed) return;

  const [history, memory, participants] = await Promise.all([
    getRecentMessages(chatId),
    getRoomMemory(chatId),
    getAllParticipants(chatId),
  ]);
  const context = buildPromptContext(
    history,
    roomConfig.personaOverride,
    memory.summary,
    participants,
    roomConfig.guardrails,
  );

  let reply: string;
  let resetMeaningful = false;
  let resetFiller = false;

  if (mentioned) {
    reply = (await getLlmProvider().generateReply(context)).trim();
    resetMeaningful = true;
  } else {
    const judged = await judgeAndMaybeReply(getLlmProvider(), context, {
      meaningfulAllowed,
      fillerAllowed,
      fillerPhrases: roomConfig.fillerPhrases ?? DEFAULT_FILLER_PHRASES,
    });
    if (judged.mode === 'none') return;
    reply = judged.reply;
    resetMeaningful = judged.mode === 'meaningful';
    resetFiller = judged.mode === 'filler';
  }

  if (!reply) return;

  await sendHumanized(reply, (chunk) => kakao.sendText(channel, chunk));
  if (resetMeaningful) await resetSpontaneousCooldown(chatId);
  if (resetFiller) await resetFillerCooldown(chatId);

  await appendMessage(chatId, {
    sender: config.kakaoBotName,
    text: reply,
    isBot: true,
    timestamp: nowTimestamp(),
  });
}

/**
 * Bumps the room's message counter and, once it reaches the configured
 * interval, folds the recent history into the room's rolling summary and
 * per-participant profiles so long-term memory survives beyond the capped
 * short-term history window.
 */
async function refreshSummaryIfDue(chatId: string): Promise<void> {
  const count = await incrementMessageCounter(chatId);
  if (count < config.summaryUpdateInterval) return;

  const [history, memory, participants] = await Promise.all([
    getRecentMessages(chatId),
    getRoomMemory(chatId),
    getAllParticipants(chatId),
  ]);

  const result = await summarizeRoom(getLlmProvider(), memory.summary, participants, history);
  await saveRoomSummary(chatId, result.summary);
  await saveParticipantProfiles(chatId, resolveParticipantUpdates(result, history));
}
