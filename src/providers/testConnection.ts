import { requestUrl } from 'obsidian';
import type { ProviderConfig, ProviderId } from './types';
import { normalizeBaseUrl } from './types';

export async function testConnection(providerId: ProviderId, config: ProviderConfig): Promise<string> {
  if (!config.apiKey) {
    return '未配置 API Key';
  }
  if (!config.model.trim() && providerId === 'openai') {
    return '未配置模型名称';
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
      return response.status === 200 ? '连接成功' : `HTTP ${response.status}: ${response.text.slice(0, 300)}`;
    }
    const response = await requestUrl({
      url: `${normalizeBaseUrl(config.baseUrl)}/models`,
      method: 'GET',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      throw: false,
    });
    return response.status === 200 ? '连接成功' : `HTTP ${response.status}: ${response.text.slice(0, 300)}`;
  } catch (error) {
    return `连接失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}
