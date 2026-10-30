import rawHistory from "./banner-history.json";

export type VersionDescriptor = {
  version: string;
  start: string;
  end: string;
  days: number;
};

type RawPhase = {
  version: string;
  start: string;
  end: string;
};

const day = (value: string) =>
  Math.floor(Date.parse(`${value}T00:00:00Z`) / 86400000);

const compareVersions = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true });

/**
 * The banner history is the single source of truth for version windows.
 * Adding a phase to banner-history.json automatically exposes its version to
 * resource calculations, target suggestions, and current-version detection.
 */
export const bundledVersionCatalog: VersionDescriptor[] = (() => {
  const byVersion = new Map<string, { starts: string[]; ends: string[] }>();
  for (const phase of rawHistory.phases as RawPhase[]) {
    const current = byVersion.get(phase.version) ?? { starts: [], ends: [] };
    current.starts.push(phase.start);
    current.ends.push(phase.end);
    byVersion.set(phase.version, current);
  }
  return [...byVersion.entries()]
    .map(([version, window]) => {
      const start = [...window.starts].sort()[0] ?? "";
      const end = [...window.ends].sort().at(-1) ?? start;
      return {
        version,
        start,
        end,
        days: start && end ? Math.max(1, day(end) - day(start) + 1) : 42,
      };
    })
    .filter((item) => item.start && item.end)
    .sort((a, b) => compareVersions(a.version, b.version));
})();

export const latestBundledVersion =
  bundledVersionCatalog.at(-1)?.version ?? "0.0";

export const versionDescriptor = (
  version: string,
  fallback?: Partial<VersionDescriptor>,
): VersionDescriptor => {
  const known = bundledVersionCatalog.find((item) => item.version === version);
  return {
    version,
    start: known?.start ?? fallback?.start ?? "",
    end: known?.end ?? fallback?.end ?? "",
    days: known?.days ?? fallback?.days ?? 42,
  };
};

export const activeVersionForDate = (
  asOf: string,
  catalog = bundledVersionCatalog,
) => {
  const containing = catalog.find(
    (item) => asOf >= item.start && asOf <= item.end,
  );
  if (containing) return containing.version;
  const started = catalog.filter((item) => item.start <= asOf);
  return (
    started.at(-1)?.version ?? catalog.at(-1)?.version ?? latestBundledVersion
  );
};

export const nextCatalogVersion = (version: string) => {
  const index = bundledVersionCatalog.findIndex(
    (item) => item.version === version,
  );
  return bundledVersionCatalog[index + 1]?.version ?? null;
};

/** Bump when bundled banners, resources, or announced characters change. */
export const bundledContentRevision = "2026-10-22.1";
