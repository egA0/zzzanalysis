export const messages = {
  "zh-CN": {
    home: "总览",
    resources: "当前资源",
    pity: "卡池状态",
    targets: "目标编辑",
    timeline: "版本时间轴",
    special: "特殊频道",
    analysis: "概率分析",
    compare: "方案比较",
    sources: "数据来源",
    settings: "设置",
    agent: "角色",
    engine: "音擎",
  },
} as const;

export type Locale = "zh-CN" | "en-US";
export type MessageKey = keyof (typeof messages)["zh-CN"];
const catalogs: Partial<Record<Locale, Record<MessageKey, string>>> = messages;
export const t = (key: MessageKey, locale: Locale = "zh-CN") =>
  (catalogs[locale] ?? messages["zh-CN"])[key];
