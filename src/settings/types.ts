import type { ProviderConfig, ProviderId } from '../providers/types';

export type LanguageSetting = 'auto' | 'zh' | 'en';

export interface MidianSettings {
  provider: ProviderId;
  anthropic: ProviderConfig;
  openai: ProviderConfig;
  persona: string;
  toolsEnabled: boolean;
  context: {
    includeActiveNote: boolean;
    includeSelection: boolean;
    budgetChars: number;
    historyMessages: number;
  };
  memory: {
    enabled: boolean;
    model: string;
  };
  language: LanguageSetting;
}

export const DEFAULT_SETTINGS: MidianSettings = {
  provider: 'anthropic',
  anthropic: {
    apiKey: '',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    maxTokens: 4096,
  },
  openai: {
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: '',
    maxTokens: 4096,
  },
  persona: '',
  toolsEnabled: true,
  context: {
    includeActiveNote: true,
    includeSelection: true,
    budgetChars: 16000,
    historyMessages: 40,
  },
  memory: {
    enabled: false,
    model: '',
  },
  language: 'auto',
};
