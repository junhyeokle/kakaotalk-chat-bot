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
} from '../firebase/configStore';
import { getAllParticipants, saveParticipantProfiles } from '../firebase/participantStore';
import { detectMention } from './triggerEngine';
import { judgeAndMaybeReply } from './contextJudge';
import { buildPromptContext } from '../persona/promptBuilder';
import { summarizeRoom, resolveParticipantUpdates } from '../persona/summarizer';
import { getLlmProvider } from '../llm';
import { sendHumanized } from './humanize';

/**
 * Handles one incoming chat message end to end.
 *
 * Direct mentions always get a reply. Otherwise, once enough messages have
 * passed since the bot last spoke up unprompted (the cooldown), it asks the
 * LLM to judge whether jumping into the conversation right now is natural —
 * and if so, to give the reply in that same call.
 */
export async function handleMessage(
  kakao: KakaoClient,
  data: TalkChatData,
  channel: TalkChannel,
): Promise<void> {
  // Never react to our own messages, or we'd loop replying to ourselves.
  if (kakao.isSelf(data)) return;

  const text = data.text?.trim();
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

  // Every message counts toward the spontaneous-reply cooldown, mention or
  // not — a mention still means the bot just spoke, so it shouldn't also be
  // eager to jump in again right after.
  const cooldownCount = await incrementSpontaneousCooldown(chatId);
  if (!mentioned && cooldownCount < config.spontaneousCooldownMessages) return;

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
  );

  let reply: string;
  if (mentioned) {
    reply = (await getLlmProvider().generateReply(context)).trim();
  } else {
    const judged = await judgeAndMaybeReply(getLlmProvider(), context);
    if (!judged.respond) return;
    reply = judged.reply;
  }

  if (!reply) return;

  await sendHumanized(reply, (chunk) => kakao.sendText(channel, chunk));
  await resetSpontaneousCooldown(chatId);

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
