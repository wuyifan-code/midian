import { requestUrl } from 'obsidian';
import { t } from '../i18n';
import type { ProviderConfig, ProviderId } from './types';
import { normalizeBaseUrl } from './types';

export async function testConnection(providerId: ProviderId, config: ProviderConfig): Promise<string> {
  if (!config.apiKey) {
    return t('connect.noKey');
  }
  if (!config.model.trim() && providerId === 'openai') {
    return t('connect.noModel');
  }
  try {
    if (providerId === 'anthropic') {
      const response = await requestUrl({
        url: `${normalizeBaseUrl(config.baseUrl)}/v1/models`,
        method: 'GET',
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        throw: false,
      });
      return response.status === 200 ? t('connect.ok') : `HTTP ${response.status}: ${response.text.slice(0, 300)}`;
    }
    const response = await requestUrl({
      url: `${normalizeBaseUrl(config.baseUrl)}/models`,
      method: 'GET',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      throw: false,
    });
    return response.status === 200 ? t('connect.ok') : `HTTP ${response.status}: ${response.text.slice(0, 300)}`;
  } catch (error) {
    return `${t('connect.failed')}: ${error instanceof Error ? error.message : String(error)}`;
  }
}
