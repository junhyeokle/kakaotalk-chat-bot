import {
  TalkClient,
  TalkChannel,
  TalkChatData,
  OAuthCredential,
  Long,
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

  isSelf(data: TalkChatData): boolean {
    return this.client.isClientUser(data.chat.sender);
  }

  async sendText(channel: TalkChannel, text: string): Promise<void> {
    const res = await channel.sendChat(text);
    if (!res.success) {
      throw new Error(`Failed to send chat (status ${res.status})`);
    }
  }

  close(): void {
    this.client.close();
  }
}
