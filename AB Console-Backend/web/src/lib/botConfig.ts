/**
 * Bot 统一配置 — 消除 4 处重复定义
 */

export const BOT_IDS = ['al-brooks', 'trader', 'wyckoff'] as const;
export type BotId = (typeof BOT_IDS)[number];

export interface BotConfig {
  id: BotId;
  emoji: string;
  name: string;
  fullName: string;
  color: string;
  gradient: string;
}

export const botConfig: Record<BotId, BotConfig> = {
  'al-brooks': {
    id: 'al-brooks',
    emoji: '🦁',
    name: 'PA',
    fullName: 'PA交易',
    color: 'text-amber-400',
    gradient: 'from-amber-900/30 to-amber-900/10 border-amber-700/50',
  },
  trader: {
    id: 'trader',
    emoji: '📊',
    name: '量化',
    fullName: '量化分析师',
    color: 'text-blue-400',
    gradient: 'from-blue-900/30 to-blue-900/10 border-blue-700/50',
  },
  wyckoff: {
    id: 'wyckoff',
    emoji: '🔮',
    name: '威科夫',
    fullName: '威科夫大师',
    color: 'text-purple-400',
    gradient: 'from-purple-900/30 to-purple-900/10 border-purple-700/50',
  },
};

export function getBotConfig(botId: string): BotConfig | undefined {
  return botConfig[botId as BotId];
}
