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
} from '../firebase/configStore';
import { decideTrigger } from './triggerEngine';
import { buildPromptContext } from '../persona/promptBuilder';
import { summarizeRoom } from '../persona/summarizer';
import { getLlmProvider } from '../llm';
import { sendHumanized } from './humanize';

/**
 * Handles one incoming chat message end to end:
 * ignore self -> log -> trigger decision -> build context -> LLM -> humanize
 * -> send -> log reply.
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

  await appendMessage(chatId, {
    sender: senderName,
    text,
    isBot: false,
    timestamp: nowTimestamp(),
  });

  // Long-term memory upkeep runs independently of whether the bot replies to
  // this particular message, so the room summary stays current either way.
  await refreshSummaryIfDue(chatId);

  const roomConfig = await getRoomConfig(chatId);
  if (!roomConfig.enabled) return;

  const decision = decideTrigger(text, roomConfig.engagementProbability);
  if (!decision.respond) return;

  const [history, memory] = await Promise.all([
    getRecentMessages(chatId),
    getRoomMemory(chatId),
  ]);
  const context = buildPromptContext(history, roomConfig.personaOverride, memory.summary);

  const reply = (await getLlmProvider().generateReply(context)).trim();
  if (!reply) return;

  await sendHumanized(reply, (chunk) => kakao.sendText(channel, chunk));

  await appendMessage(chatId, {
    sender: config.kakaoBotName,
    text: reply,
    isBot: true,
    timestamp: nowTimestamp(),
  });
}

/**
 * Bumps the room's message counter and, once it reaches the configured
 * interval, folds the recent history into the room's rolling summary so
 * long-term context survives beyond the capped short-term history window.
 */
async function refreshSummaryIfDue(chatId: string): Promise<void> {
  const count = await incrementMessageCounter(chatId);
  if (count < config.summaryUpdateInterval) return;

  const [history, memory] = await Promise.all([
    getRecentMessages(chatId),
    getRoomMemory(chatId),
  ]);

  const summary = await summarizeRoom(getLlmProvider(), memory.summary, history);
  await saveRoomSummary(chatId, summary);
}
