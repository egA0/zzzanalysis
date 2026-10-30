import { bundledAnnouncedCharacters } from "./announced-characters";
import { bannerHistorySourceId, bundledBanners } from "./banner-history";
import {
  bundledVersionResources,
  manualVersionResourceSourceId,
} from "./version-resources";
import { bundledContentRevision } from "./version-catalog";
import type { AppData } from "../domain/types";

export { bundledContentRevision };

/**
 * Merge newly shipped static content into a user's local copy.
 *
 * Only records that are missing by stable id/key are added. Existing banner,
 * resource, and announcement records are left untouched so manual edits and
 * imported historical data remain authoritative. Disabled sources are never
 * reintroduced by an upgrade.
 */
export const syncBundledContent = (data: AppData): AppData => {
  const disabledBanners = new Set(data.bannerSync.disabledSourceIds);
  const bannerKeys = new Set(data.banners.map((banner) => banner.recordKey));
  for (const banner of bundledBanners) {
    const sourceDisabled =
      disabledBanners.has(banner.sourceId) ||
      (banner.sourceKind === "official" &&
        disabledBanners.has(bannerHistorySourceId));
    if (sourceDisabled || bannerKeys.has(banner.recordKey)) continue;
    data.banners.push(structuredClone(banner));
    bannerKeys.add(banner.recordKey);
  }

  const announcementIds = new Set(
    data.announcedCharacters.map((item) => item.id),
  );
  for (const announcement of bundledAnnouncedCharacters) {
    if (announcementIds.has(announcement.id)) continue;
    data.announcedCharacters.push(structuredClone(announcement));
    announcementIds.add(announcement.id);
  }

  const disabledResources = new Set(data.versionResourceSync.disabledSourceIds);
  const resourceIds = new Set(data.versionResources.map((item) => item.id));
  for (const resource of bundledVersionResources) {
    if (
      resource.sourceId === manualVersionResourceSourceId &&
      disabledResources.has(resource.sourceId)
    )
      continue;
    if (resourceIds.has(resource.id)) continue;
    data.versionResources.push(structuredClone(resource));
    resourceIds.add(resource.id);
  }

  data.contentRevision = bundledContentRevision;
  return data;
};
