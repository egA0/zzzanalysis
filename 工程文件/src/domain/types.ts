export type Channel = "agent" | "engine";
export type SpecialFamily = "rescreening" | "reverberation";
export type Certainty = "confirmed" | "estimated";
export type VersionPhase = 1 | 2;
export type RateStep = { fromPull: number; probability: number };
export type ChannelRule = {
  hardPity: number;
  featuredChance: number;
  baseChance: number;
  officialConsolidatedChance: number;
  officialFeaturedConsolidatedChance: number;
  guaranteeAfterMiss: boolean;
  pityCarriesAcrossTargets: boolean;
  guaranteeCarriesAcrossTargets: boolean;
  rateSteps: RateStep[];
  confidence: string;
};
export type Rules = {
  profileId: string;
  verifiedAt: string;
  modelLabel: string;
  enabledSourceIds: string[];
  conversion: {
    filmPerTape: number;
    otherPerTape: number;
    signalAfterglowPerTape: number;
    signalResidualPerTape: number;
  };
  channels: Record<Channel, ChannelRule>;
  specialChannels: Record<SpecialFamily, SpecialChannelRule>;
};
export type SpecialCarryRule = "carry" | "reset";
export type RegularStateRelation = "independent" | "shared";
export type SpecialChannelRule = {
  mechanic: "first-s-selected-v1";
  baseChannel: Channel;
  usesBaseChannelRates: boolean;
  specialFirstSGuaranteed: boolean;
  specialGuaranteeSeparate: boolean;
  inheritance: {
    regular: {
      pity: RegularStateRelation;
      standardGuarantee: RegularStateRelation;
    };
    selection: {
      pity: SpecialCarryRule;
      standardGuarantee: SpecialCarryRule;
      specialGuarantee: SpecialCarryRule;
      discount: SpecialCarryRule;
    };
    period: {
      pity: SpecialCarryRule;
      standardGuarantee: SpecialCarryRule;
      specialGuarantee: SpecialCarryRule;
      discount: SpecialCarryRule;
    };
  };
  discountSearches: number;
  discountCost: number;
  confidence: string;
};
export type SpecialPlanState = {
  periodId: string;
  targetName: string;
  pity: number;
  standardGuaranteed: boolean;
  specialGuaranteeAvailable: boolean;
  discountAvailable: boolean;
  useDiscount: boolean;
  copies: number;
  maxTapes: number;
};
export type Pity = {
  count: number;
  guaranteed: boolean;
  lastResult: "none" | "featured" | "off-banner";
};
export type Resources = {
  film: number;
  encrypted: number;
  original: number;
  other: number;
  signalAfterglow: number;
  signalResidual: number;
  includeMoney: boolean;
  moneyBudget: number;
};
export type Target = {
  id: string;
  name: string;
  channel: Channel;
  copies: number;
  includeSignatureEngine?: boolean;
  signatureEngineCopies?: number;
  priority: number;
  maxPulls: number;
  targetVersion: string;
  targetPhase: VersionPhase;
  stopDate: string;
  continueOnSuccess: boolean;
  skipped: boolean;
};
export type Plan = { id: string; name: string; targets: Target[] };
export type Banner = {
  id: string;
  recordKey: string;
  name: string;
  featured: string;
  channel: Channel;
  version: string;
  phase: number;
  kind: "debut" | "rerun" | "special" | "manual";
  start: string;
  end: string;
  official: boolean;
  source: string;
  sourceId: string;
  sourceKind: "official" | "third-party" | "manual";
  updatedAt: string;
};
export type AnnouncedCharacter = {
  id: string;
  name: string;
  channel: "agent";
  announcedAt: string;
  source: string;
  sourceId: string;
  sourceName: string;
  sourceKind: "official" | "third-party";
  note: string;
  expectedVersion?: string;
};
export type BannerChange = {
  recordKey: string;
  before: Banner | null;
  after: Banner | null;
};
export type BannerUpdateBatch = {
  id: string;
  sourceId: string;
  sourceName: string;
  appliedAt: string;
  changes: BannerChange[];
};
export type BannerSyncState = {
  lastCheckedAt: string;
  lastSuccessAt: string;
  lastError: string;
  cacheUpdatedAt: string;
  usedCache: boolean;
  cachedBanners: Banner[];
  pendingChanges: BannerChange[];
  updateBatches: BannerUpdateBatch[];
  disabledSourceIds: string[];
};
export type Income = {
  id: string;
  name: string;
  source: string;
  category:
    | "daily"
    | "weekly"
    | "event"
    | "version"
    | "code"
    | "monthly"
    | "pass"
    | "other";
  amount: number;
  unit: "film" | "tape";
  start: string;
  end: string;
  everyDays: number;
  certainty: Certainty;
  enabled: boolean;
};
export type VersionResourceEntry = {
  id: string;
  version: string;
  scope: "confirmed" | "f2p" | "monthly" | "monthly_pass";
  label: string;
  pulls: number | null;
  film: number | null;
  encryptedTapes: number | null;
  masterTapes: number | null;
  boopons: number | null;
  start: string;
  end: string;
  phase1Min: number | null;
  phase1Max: number | null;
  phase2Min: number | null;
  phase2Max: number | null;
  sourceId: string;
  sourceName: string;
  sourceKind: "official" | "third-party" | "manual";
  certainty: Certainty;
  checkedAt: string;
  note: string;
};
export type ResourceProgress = {
  version: string;
  film: number;
  encrypted: number;
  acquiredPulls?: number;
  acquisitionPercent: number;
  observedAt: string;
};
export type VersionResourceSyncState = {
  lastCheckedAt: string;
  lastSuccessAt: string;
  lastError: string;
  usedCache: boolean;
  cachedEntries: VersionResourceEntry[];
  disabledSourceIds: string[];
};
export type AppData = {
  schemaVersion: 10;
  resources: Resources;
  pity: Record<Channel, Pity>;
  specialPlans: Record<SpecialFamily, SpecialPlanState>;
  rules: Rules;
  banners: Banner[];
  announcedCharacters: AnnouncedCharacter[];
  bannerSync: BannerSyncState;
  incomes: Income[];
  versionResources: VersionResourceEntry[];
  resourceProgress: Record<string, ResourceProgress>;
  versionResourceSync: VersionResourceSyncState;
  plans: Plan[];
  activePlanId: string;
  settings: {
    includeEstimates: boolean;
    gachaProceeds: {
      enabled: boolean;
      agentAfterglowPerPull: number;
      agentResidualPerPull: number;
      engineAfterglowPerPull: number;
      engineResidualPerPull: number;
    };
    simulations: number;
    seed: number;
    theme: "dark" | "light";
    language: Locale;
  };
};
import type { Locale } from "../i18n";
