import { TalkChatData, KnownChatType, EmoticonAttachment } from 'node-kakao';

const STICKER_TYPES = new Set<number>([
  KnownChatType.STICKER,
  KnownChatType.STICKERANI,
  KnownChatType.STICKERGIF,
  KnownChatType.DITEMEMOTICON,
]);

const PHOTO_TYPES = new Set<number>([KnownChatType.PHOTO, KnownChatType.MULTIPHOTO]);

/**
 * Derives a text representation of an incoming message for logging/context,
 * even when it carries no literal text.
 *
 * Stickers/emoticons carry a short Kakao-provided description (`alt`/`name`,
 * e.g. "빵터짐") that's genuinely informative without needing to look at the
 * image, so those are read and included. Photos have no such description —
 * actually understanding what's in a photo needs vision (downloading the
 * image and passing it to a multimodal LLM call), which isn't implemented
 * yet (see README "Planned / not yet implemented"), so for now a photo is
 * only acknowledged as having arrived, not analyzed.
 *
 * Returns undefined for message types with no meaningful way to react yet
 * (video, file, voice call, etc.) — the message is just ignored.
 */
export function extractMessageText(data: TalkChatData): string | undefined {
  const rawText = data.text?.trim();
  if (rawText) return rawText;

  const type = data.chat.type;

  if (STICKER_TYPES.has(type)) {
    const attachment = data.attachment<EmoticonAttachment>();
    const description = attachment.alt || attachment.name;
    return description ? `[이모티콘: ${description}]` : undefined;
  }

  if (PHOTO_TYPES.has(type)) {
    return '[사진을 보냄]';
  }

  return undefined;
}
