import type { AnnouncedCharacter } from "../domain/types";

// 网络资料在当前构建环境不可稳定读取，因此不把未经核验的爆料写进默认规划。
// 用户可在时间轴的“补充已公布立绘”区域添加记录；该记录会立即进入目标下拉和预测。
export const announcedCharacterSources = [
  {
    id: "official-character-announcements",
    name: "HoYoverse / 绝区零官方公告",
    url: "https://zenless.hoyoverse.com/zh-cn/news",
    kind: "official" as const,
    confidence: "最高：只有官方已公开立绘或公告才可标为官方已公布。",
  },
  {
    id: "zzz-wiki-character-announcements",
    name: "绝区零 BWIKI 角色目录",
    url: "https://wiki.biligame.com/zzz/往期调频",
    kind: "third-party" as const,
    confidence: "中高：用于核对中文名和立绘状态；与官方冲突时以官方为准。",
  },
] as const;

export const bundledAnnouncedCharacters: AnnouncedCharacter[] = [
  {
    id: "official-severian-profile",
    name: "赛维里安·洛威尔",
    channel: "agent",
    announcedAt: "2026-09-18",
    source: "https://zenless.hoyoverse.com/m/zh-cn/character?id=155659",
    sourceId: "official-character-announcements",
    sourceName: "HoYoverse / 绝区零官方角色介绍",
    sourceKind: "official",
    note: "官方角色介绍页已公开角色资料；页面未给出可直接核验的公布日期；当前本地卡池记录尚未出现正式限时卡池。",
  },
  {
    id: "official-fiona-profile",
    name: "菲欧妮·蕾法爱菈",
    channel: "agent",
    announcedAt: "2026-09-18",
    source: "https://zenless.hoyoverse.com/m/zh-cn/character?id=155659",
    sourceId: "official-character-announcements",
    sourceName: "HoYoverse / 绝区零官方角色介绍",
    sourceKind: "official",
    note: "官方角色介绍页已公开角色资料；页面未给出可直接核验的公布日期；当前本地卡池记录尚未出现正式限时卡池。",
  },
];

export const bundledAnnouncedCharactersForSource = (sourceId: string) =>
  bundledAnnouncedCharacters
    .filter((item) => item.sourceId === sourceId)
    .map((item) => structuredClone(item));

