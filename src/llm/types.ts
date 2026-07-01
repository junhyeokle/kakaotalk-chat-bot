export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmContext {
  /** Persona + instructions that steer the model's behaviour. */
  systemPrompt: string;
  /** Recent conversation turns, oldest first. */
  messages: LlmMessage[];
}

export interface LlmProvider {
  generateReply(context: LlmContext): Promise<string>;
}
