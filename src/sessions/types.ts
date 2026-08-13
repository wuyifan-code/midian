import type { ProviderId } from '../providers/types';

export interface SessionMessage {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  images?: string[];
  createdAt: number;
}

export interface MidianSession {
  id: string;
  title: string;
  providerId: ProviderId;
  model: string;
  createdAt: number;
  updatedAt: number;
  messages: SessionMessage[];
}
