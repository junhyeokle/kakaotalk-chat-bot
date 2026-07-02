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
  incrementPhotoCooldown,
  resetPhotoCooldown,
} from '../firebase/configStore';
import { getAllParticipants, saveParticipantProfiles } from '../firebase/participantStore';
import { getPhoto, listPhotosByTags, downloadPhotoBytes } from '../firebase/photoStore';
import { extractMessageText } from './messageContent';
import { detectMention } from './triggerEngine';
import { judgeAndMaybeReply } from './contextJudge';
import { isSleepHour } from './activityHours';
import { buildPromptContext } from '../persona/promptBuilder';
import { DEFAULT_FILLER_PHRASES } from '../persona/fillerPhrases';
import { summarizeRoom, resolveParticipantUpdates } from '../persona/summarizer';
import { getLlmProvider } from '../llm';
import { sendHumanized, sleep } from './humanize';

/**
 * Handles one incoming chat message end to end.
 *
 * Direct mentions always get a real reply. Otherwise, the bot can react in
 * one of three independent registers: a cheap filler reaction (ㅋㅋㅋ, 인정, ...)
 * on a short cooldown, a real spontaneous reply on a longer cooldown, or a
 * photo (if the room is whitelisted for any) on the longest cooldown of all —
 * sending one never resets or blocks the others, since real people fire off
 * filler far more often than actual replies, and photos rarer still.
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

  const sleeping = isSleepHour(
    new Date(),
    roomConfig.sleepStartHour ?? config.sleepStartHour,
    roomConfig.sleepEndHour ?? config.sleepEndHour,
    config.timeZone,
  );

  // All three cooldowns tick on every message, mention or not.
  const [meaningfulCooldownCount, fillerCooldownCount, photoCooldownCount] = await Promise.all([
    incrementSpontaneousCooldown(chatId),
    incrementFillerCooldown(chatId),
    incrementPhotoCooldown(chatId),
  ]);

  // A room only ever sees photos it's explicitly whitelisted for (see
  // RoomConfig.photoTags) — an unconfigured room gets no candidates and thus
  // never has photo as an option, by default.
  const photoCandidates =
    !sleeping && roomConfig.photoTags?.length
      ? await listPhotosByTags(roomConfig.photoTags)
      : [];

  // Asleep: don't even consider jumping in unprompted. A direct mention still
  // gets a reply below (a real person eventually checks their phone), just a
  // much slower one.
  const meaningfulAllowed = !sleeping && meaningfulCooldownCount >= config.spontaneousCooldownMessages;
  const fillerAllowed = !sleeping && fillerCooldownCount >= config.fillerCooldownMessages;
  const photoAllowed =
    !sleeping && photoCooldownCount >= config.photoCooldownMessages && photoCandidates.length > 0;

  if (!mentioned && !meaningfulAllowed && !fillerAllowed && !photoAllowed) return;

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

  let reply = '';
  let photoId: string | undefined;
  let resetMeaningful = false;
  let resetFiller = false;
  let resetPhoto = false;

  if (mentioned) {
    reply = (await getLlmProvider().generateReply(context)).trim();
    resetMeaningful = true;
  } else {
    const judged = await judgeAndMaybeReply(getLlmProvider(), context, {
      meaningfulAllowed,
      fillerAllowed,
      fillerPhrases: roomConfig.fillerPhrases ?? DEFAULT_FILLER_PHRASES,
      photoAllowed,
      photoCandidates: photoCandidates.map((p) => ({ id: p.id, description: p.description })),
    });
    if (judged.mode === 'none') return;
    reply = judged.reply;
    photoId = judged.photoId;
    resetMeaningful = judged.mode === 'meaningful';
    resetFiller = judged.mode === 'filler';
    resetPhoto = judged.mode === 'photo';
  }

  if (!reply && !photoId) return;

  // Mentioned while asleep: still reply (ignoring a direct mention entirely
  // would look broken), but with a long extra delay on top of the normal
  // typing delay, like someone who only glances at their phone occasionally
  // while asleep rather than replying instantly.
  if (mentioned && sleeping) await sleep(config.sleepExtraDelayMs);

  let loggedText: string;
  if (photoId) {
    const photo = await getPhoto(photoId);
    if (!photo) return; // whitelisted candidate vanished between judge and send — skip rather than crash
    const bytes = await downloadPhotoBytes(photo.storagePath);
    await kakao.sendPhoto(channel, bytes, photo.storagePath.split('/').pop() ?? 'photo.jpg');
    loggedText = `[사진을 보냄: ${photo.description}]`;
  } else {
    await sendHumanized(reply, (chunk) => kakao.sendText(channel, chunk));
    loggedText = reply;
  }

  if (resetMeaningful) await resetSpontaneousCooldown(chatId);
  if (resetFiller) await resetFillerCooldown(chatId);
  if (resetPhoto) await resetPhotoCooldown(chatId);

  await appendMessage(chatId, {
    sender: config.kakaoBotName,
    text: loggedText,
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
