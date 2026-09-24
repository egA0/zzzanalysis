import rawHistory from "./banner-history.json";
import type { Banner } from "../domain/types";

type RawPhase = {
  id: string;
  version: string;
  phase: number;
  start: string;
  end: string;
  agents: string[];
  engines: string[];
  sourceId?: string;
  sourceKind?: "official" | "third-party";
  source?: string;
  agentEnds?: Record<string, string>;
  engineEnds?: Record<string, string>;
};

export const bannerHistoryCheckedAt = rawHistory.checkedAt;
export const bannerHistorySourceId = "official-banner-history";
export const onlineBannerSourceId = "bannerhistory-cn-feed";
export const bannerHistoryChineseUrl =
  "https://bannerhistory.app/zh/zzz-pickup-history";
export const bwikiBannerHistoryUrl =
  "https://wiki.biligame.com/zzz/%E5%BE%80%E6%9C%9F%E8%B0%83%E9%A2%91";
export const bwikiEngineCatalogUrl =
  "https://wiki.biligame.com/zzz/%E9%9F%B3%E6%93%8E";

export const bannerSources = [
  {
    id: bannerHistorySourceId,
    name: "官方卡池记录（内置）",
    kind: "official" as const,
    url: "",
    checkedAt: bannerHistoryCheckedAt,
    confidence: "仅保留已写入本地的官方记录；新版本由人工根据官方公告维护。",
    summary: "离线内置记录；不进行实时联网搜索。",
  },
];

const names: Record<string, string> = {
  Ellen: "艾莲",
  "Zhu Yuan": "朱鸢",
  Qingyi: "青衣",
  "Jane Doe": "简",
  Caesar: "凯撒",
  Burnice: "柏妮思",
  "Tsukishiro Yanagi": "柳",
  Lighter: "莱特",
  "Hoshimi Miyabi": "雅",
  "Asaba Harumasa": "悠真",
  "Astra Yao": "耀嘉音",
  Evelyn: "伊芙琳",
  "Soldier 0 - Anby": "零号·安比",
  Trigger: "扳机",
  Vivian: "薇薇安",
  Hugo: "雨果",
  Yixuan: "仪玄",
  "Yi Xuan": "仪玄",
  "Ju Fufu": "橘福福",
  "Ukinami Yuzuha": "柚叶",
  Yuzuha: "柚叶",
  Alice: "爱丽丝",
  Seed: "「席德」",
  "Orphie & Magus": "奥菲丝&「鬼火」",
  Orphie: "奥菲丝&「鬼火」",
  Lucia: "卢西娅",
  Yidhari: "伊德海莉",
  Dialyn: "琉音",
  Banyue: "般岳",
  "Ye Shunguang": "叶瞬光",
  Zhao: "照",
  Sunna: "桑娜",
  Aria: "爱芮",
  "Nangong Yu": "南宫羽",
  Cissia: "希希芙",
  Promeia: "普罗米娅",
  "Starlight-Knight Billy": "星徽·比利",
  "Starlight Billy": "星徽·比利",
  Velina: "维琳娜",
  Norma: "诺姆",
  Remielle: "蕾米埃尔",
  Sigrid: "希格莉德",
  Claret: "克拉蕾",
  Roxy: "洛克茜",
  Yanagi: "柳",
  "Ellen Joe": "艾莲",
  "Soldier 0 – Anby": "零号·安比",
  César: "凯撒",
  Miyabi: "雅",
  "Hugo Vlad": "雨果",
  Harumasa: "悠真",
  "Deep Sea Visitor": "深海访客",
  "Riot Suppressor Mark VI": "防暴者Ⅵ型",
  "Ice-Jade Teapot": "青漪灵鼎",
  "Sharpened Stinger": "淬锋钳刺",
  "Tusks of Fury": "奔袭獠牙",
  "Flamemaker Shaker": "灼心摇壶",
  Timeweaver: "时流贤者",
  "Blazing Laurel": "焰心桂冠",
  "Hailstorm Shrine": "霰落星殿",
  "Zanshin Herb Case": "残心青囊",
  "Elegant Vanity": "玲珑妆匣",
  "Heartstring Nocturne": "心弦夜响",
  "Severed Innocence": "牺牲洁纯",
  "Spectral Gaze": "索魂影眸",
  "Flight of Fancy": "飞鸟星梦",
  "Myriad Eclipse": "千面日陨",
  "Qingming Birdcage": "青溟笼舍",
  "Roaring Fur-nace": "福虓炉炉",
  Metanukimorphosis: "狸法七变化",
  "Practiced Perfection": "十方锻星",
  "Cordis Germina": "机巧心种",
  "Bellicose Blaze": "嚣枪喧焰",
  "Dreamlit Hearth": "铸梦炉歌",
  "Kraken's Cradle": "海妖摇篮",
  "Yesterday Calls": "昨夜来电",
  "Wrathful Vajra": "怒目金刚",
  "Cloudcleave Radiance": "云霓孤光",
  "Half-Sugar Bunny": "半糖雪兔",
  Thoughtbop: "思络成歌",
  "Angel in the Shell": "壳中之灵",
  "Neon Fantasies": "霓虹妄想",
  "Serpentine Seeker": "鳞齿寻踪",
  "Frostfall Sickle": "朔月裁霜",
  "Starlight Rider Faceplate": "辉骑面铠",
  "Joyau Dore": "琳琅鎏心",
  "Chief Sidekick": "首席跟班",
  "Ode to Resurrected Wings": "空羽复归之诗",
  "Knight's Extolment": "骁骑礼赞",
  "Crimson Thirst": "猩红渴望",
  "Crimson Moon Casket": "绯月银棺",
  月城柳: "柳",
  星见雅: "雅",
  浅羽悠真: "悠真",
  "0号·安比": "零号·安比",
  席德: "「席德」",
  阿莉娅: "爱芮",
  席西娅: "希希芙",
  普罗米亚: "普罗米娅",
  "星辉骑士·比利": "星徽·比利",
  诺玛: "诺姆",
  柔米耶尔: "蕾米埃尔",
  防暴者VI型: "防暴者Ⅵ型",
  玉壶青冰: "青漪灵鼎",
  心种: "机巧心种",
  梦乡炉歌: "铸梦炉歌",
  金刚怒目: "怒目金刚",
  云霓裂光: "云霓孤光",
  思绪跃响: "思络成歌",
  壳中天使: "壳中之灵",
  蛇形搜寻者: "鳞齿寻踪",
  霜落之镰: "朔月裁霜",
  星辉骑士面罩: "辉骑面铠",
  金色珍宝: "琳琅鎏心",
  首席助手: "首席跟班",
  复翼颂歌: "空羽复归之诗",
  骑士赞歌: "骁骑礼赞",
};

export const localizeBannerName = (name: string) =>
  names[name.trim()] ?? name.trim();

const slug = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");

export const bannerRecordKey = (
  version: string,
  phase: number,
  channel: Banner["channel"],
  featured: string,
) => `${version}-${phase}:${channel}:${slug(featured)}`;

const phaseToBanners = (phase: RawPhase, special: boolean): Banner[] => {
  const sourceId = phase.sourceId ?? bannerHistorySourceId;
  const sourceKind = phase.sourceKind ?? "official";
  const source = phase.source ?? "";
  const make = (
    value: string,
    channel: Banner["channel"],
    index: number,
  ): Banner => {
    const featured = localizeBannerName(value);
    const kind = special ? "special" : index === 0 ? "debut" : "rerun";
    const recordKey = bannerRecordKey(
      phase.version,
      phase.phase,
      channel,
      featured,
    );
    const end =
      (channel === "agent"
        ? phase.agentEnds?.[value]
        : phase.engineEnds?.[value]) ?? phase.end;
    return {
      id: `history:${phase.id}:${channel}:${index}`,
      recordKey,
      name: featured,
      featured,
      channel,
      version: phase.version,
      phase: phase.phase,
      kind,
      start: phase.start,
      end,
      official: sourceKind === "official",
      source,
      sourceId,
      sourceKind,
      updatedAt: bannerHistoryCheckedAt,
    };
  };
  return [
    ...phase.agents.map((value, index) => make(value, "agent", index)),
    ...phase.engines.map((value, index) => make(value, "engine", index)),
  ];
};

export const bundledBanners: Banner[] = [
  ...(rawHistory.phases as RawPhase[]).flatMap((phase) =>
    phaseToBanners(phase, false),
  ),
  ...(rawHistory.specialPhases as RawPhase[]).flatMap((phase) =>
    phaseToBanners(phase, true),
  ),
];

export const bundledBannersForSource = (sourceId: string) =>
  bundledBanners
    .filter((banner) => banner.sourceId === sourceId)
    .map((banner) => structuredClone(banner));
