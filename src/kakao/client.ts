import {
  TalkClient,
  TalkChannel,
  TalkChatData,
  OAuthCredential,
  Long,
  KnownChatType,
} from 'node-kakao';
import { SavedSession } from './session';

export type ChatListener = (data: TalkChatData, channel: TalkChannel) => void;

function sessionToCredential(session: SavedSession): OAuthCredential {
  return {
    userId: Long.fromString(session.userId),
    deviceUUID: session.deviceUUID,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  };
}

export class KakaoClient {
  readonly client: TalkClient;

  constructor() {
    this.client = new TalkClient();
  }

  /**
   * Reconnect using a previously saved session. Throws with a clear message if
   * the stored tokens are rejected (e.g. expired) so the caller can prompt the
   * user to re-run the login script.
   */
  async login(session: SavedSession): Promise<void> {
    const res = await this.client.login(sessionToCredential(session));
    if (!res.success) {
      throw new Error(
        `KakaoTalk login failed (status ${res.status}). ` +
          `Your saved session may be expired — re-run "npm run login".`,
      );
    }
  }

  onChat(listener: ChatListener): void {
    this.client.on('chat', listener);
  }

  /** Lists every channel (room) this account is currently joined to. */
  listJoinedChannels(): { channelId: string; name: string }[] {
    return Array.from(this.client.channelList.all()).map((channel) => ({
      channelId: channel.channelId.toString(),
      name: channel.getDisplayName(),
    }));
  }

  isSelf(data: TalkChatData): boolean {
    return this.client.isClientUser(data.chat.sender);
  }

  async sendText(channel: TalkChannel, text: string): Promise<void> {
    const res = await channel.sendChat(text);
    if (!res.success) {
      throw new Error(`Failed to send chat (status ${res.status})`);
    }
  }

  async sendPhoto(channel: TalkChannel, data: Buffer, filename: string): Promise<void> {
    const ext = filename.split('.').pop() || 'jpg';
    const res = await channel.sendMedia(KnownChatType.PHOTO, { name: filename, ext, data });
    if (!res.success) {
      throw new Error(`Failed to send photo (status ${res.status})`);
    }
  }

  close(): void {
    this.client.close();
  }
}
