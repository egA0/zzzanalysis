import { expect, it } from "vitest";
import { initialData } from "../src/domain/data";
import {
  syncBundledContent,
  bundledContentRevision,
} from "../src/data/content";
import { currentVersion } from "../src/data/version-resources";
import { migrate } from "../src/storage/data";

it("内容修订会自动补齐新版本卡池与资源并保留用户输入", () => {
  const data = initialData();
  data.banners = data.banners.filter(
    (banner) => banner.version !== currentVersion,
  );
  data.versionResources = data.versionResources.filter(
    (resource) => resource.version !== currentVersion,
  );
  data.contentRevision = "2026-09-22.1";
  data.versionResources.push({
    ...initialData().versionResources[0]!,
    id: "manual-user-entry",
    version: currentVersion,
    label: "用户自定义资源",
    pulls: 12,
  });

  syncBundledContent(data);

  expect(data.contentRevision).toBe(bundledContentRevision);
  expect(data.banners.some((banner) => banner.version === currentVersion)).toBe(
    true,
  );
  expect(
    data.versionResources.some(
      (resource) => resource.id === `manual-${currentVersion}-activity`,
    ),
  ).toBe(true);
  expect(
    data.versionResources.find((item) => item.id === "manual-user-entry")
      ?.pulls,
  ).toBe(12);
});

it("迁移旧备份时自动写入当前内容修订号", () => {
  const old = initialData() as unknown as Record<string, unknown>;
  old.schemaVersion = 12;
  delete old.contentRevision;
  const migrated = migrate(old);
  expect(migrated.schemaVersion).toBe(13);
  expect(migrated.contentRevision).toBe(bundledContentRevision);
});

it("停用官方卡池来源后升级不会重新加入该来源记录", () => {
  const data = initialData();
  data.banners = data.banners.filter(
    (banner) => banner.version !== currentVersion,
  );
  data.bannerSync.disabledSourceIds = ["official-banner-history"];
  syncBundledContent(data);
  expect(data.banners.some((banner) => banner.version === currentVersion)).toBe(
    false,
  );
});

it("迁移旧备份时尊重停用的内置官方来源", () => {
  const old = initialData() as unknown as Record<string, unknown>;
  old.schemaVersion = 12;
  const sync = old.bannerSync as Record<string, unknown>;
  sync.disabledSourceIds = ["official-banner-history"];
  const migrated = migrate(old);
  expect(
    migrated.banners.some((banner) => banner.version === currentVersion),
  ).toBe(false);
});
