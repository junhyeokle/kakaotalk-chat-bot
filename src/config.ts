import * as dotenv from 'dotenv';

dotenv.config();

export type LlmProviderName = 'gemini' | 'openai';

export interface AppConfig {
  llmProvider: LlmProviderName;
  geminiApiKey: string;
  openaiApiKey: string;
  kakaoBotName: string;
  spontaneousCooldownMessages: number;
  fillerCooldownMessages: number;
  firebaseServiceAccountPath: string;
  summaryUpdateInterval: number;
  timeZone: string;
  sleepStartHour: number;
  sleepEndHour: number;
  sleepExtraDelayMs: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got: ${raw}`);
  }
  return value;
}

function parseHour(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 23) {
    throw new Error(`${name} must be an integer between 0 and 23, got: ${raw}`);
  }
  return value;
}

function parseNonNegativeInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer, got: ${raw}`);
  }
  return value;
}

function loadConfig(): AppConfig {
  const llmProviderRaw = (process.env.LLM_PROVIDER ?? 'gemini').trim().toLowerCase();
  if (llmProviderRaw !== 'gemini' && llmProviderRaw !== 'openai') {
    throw new Error(`LLM_PROVIDER must be "gemini" or "openai", got: ${llmProviderRaw}`);
  }
  const llmProvider = llmProviderRaw as LlmProviderName;

  // Only the key for the selected provider is mandatory — fail fast so the
  // bot never starts in a state where it silently cannot generate replies.
  const geminiApiKey =
    llmProvider === 'gemini' ? requireEnv('GEMINI_API_KEY') : process.env.GEMINI_API_KEY ?? '';
  const openaiApiKey =
    llmProvider === 'openai' ? requireEnv('OPENAI_API_KEY') : process.env.OPENAI_API_KEY ?? '';

  return {
    llmProvider,
    geminiApiKey,
    openaiApiKey,
    kakaoBotName: requireEnv('KAKAO_BOT_NAME'),
    spontaneousCooldownMessages: parsePositiveInt(
      process.env.SPONTANEOUS_COOLDOWN_MESSAGES,
      6,
      'SPONTANEOUS_COOLDOWN_MESSAGES',
    ),
    fillerCooldownMessages: parsePositiveInt(
      process.env.FILLER_COOLDOWN_MESSAGES,
      2,
      'FILLER_COOLDOWN_MESSAGES',
    ),
    firebaseServiceAccountPath: requireEnv('FIREBASE_SERVICE_ACCOUNT_PATH'),
    summaryUpdateInterval: parsePositiveInt(
      process.env.SUMMARY_UPDATE_INTERVAL,
      30,
      'SUMMARY_UPDATE_INTERVAL',
    ),
    timeZone: process.env.TIMEZONE?.trim() || 'Asia/Seoul',
    sleepStartHour: parseHour(process.env.SLEEP_START_HOUR, 2, 'SLEEP_START_HOUR'),
    sleepEndHour: parseHour(process.env.SLEEP_END_HOUR, 7, 'SLEEP_END_HOUR'),
    sleepExtraDelayMs: parseNonNegativeInt(
      process.env.SLEEP_EXTRA_DELAY_MS,
      90000,
      'SLEEP_EXTRA_DELAY_MS',
    ),
  };
}

export const config: AppConfig = loadConfig();
