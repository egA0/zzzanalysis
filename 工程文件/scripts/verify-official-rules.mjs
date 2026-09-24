import { readFile } from "node:fs/promises";

const base =
  "https://operation-webstatic.hoyoverse.com/gacha_info/nap/prod_gf_us";
const official = JSON.parse(
  await readFile(
    new URL("../src/rules/official.json", import.meta.url),
    "utf8",
  ),
);

const percent = (value) => Number.parseFloat(value) / 100;
const close = (actual, expected, tolerance = 1e-8) =>
  Math.abs(actual - expected) <= tolerance;
const failures = [];

const listResponse = await fetch(`${base}/gacha/list.json`);
if (!listResponse.ok)
  throw new Error(`官方频道索引请求失败：${listResponse.status}`);
const list = (await listResponse.json()).data.list;

for (const item of list.filter((entry) =>
  [2001, 2011, 3001, 3011].includes(entry.gacha_type),
)) {
  const response = await fetch(`${base}/${item.gacha_id}/zh-cn.json`);
  if (!response.ok)
    throw new Error(`官方频道 ${item.gacha_type} 请求失败：${response.status}`);
  const detail = await response.json();
  const channel = [2001, 2011].includes(item.gacha_type) ? "agent" : "engine";
  const expected = official.channels[channel];
  const hard = Number(
    detail.content.match(
      /最多<color=#FFFFFF>(\d+)<\/color>次调频必能通过保底获取S级(?:代理人|音擎)/,
    )?.[1],
  );
  const featuredConsolidated = percent(
    detail.content.match(
      /本期限定S级(?:代理人|音擎)的综合概率（含保底）为<color=#FFFFFF>([\d.]+)%/,
    )?.[1],
  );
  const guaranteeAfterMiss =
    /则下次调频获取的S级(?:代理人|音擎)<color=#FFFFFF>必定<\/color>为本期限定S级(?:代理人|音擎)/.test(
      detail.content,
    );
  const pityCarriesAcrossTargets =
    /调频保底次数会一直累计在「(?:独家|音擎)频段」中/.test(
      detail.content,
    );
  const checks = {
    hardPity: [hard, expected.hardPity],
    baseChance: [percent(detail.base_prob_star5), expected.baseChance],
    officialConsolidatedChance: [
      percent(detail.general_prob_star5),
      expected.officialConsolidatedChance,
    ],
    featuredChance: [percent(detail.up_prob), expected.featuredChance],
    officialFeaturedConsolidatedChance: [
      featuredConsolidated,
      expected.officialFeaturedConsolidatedChance,
    ],
    guaranteeAfterMiss: [guaranteeAfterMiss, expected.guaranteeAfterMiss],
    pityCarriesAcrossTargets: [
      pityCarriesAcrossTargets,
      expected.pityCarriesAcrossTargets,
    ],
  };
  for (const [field, [actual, configured]] of Object.entries(checks)) {
    if (
      typeof actual === "boolean"
        ? actual !== configured
        : !close(actual, configured)
    )
      failures.push({
        channel,
        gachaType: item.gacha_type,
        field,
        actual,
        configured,
      });
  }
  console.log(
    `✓ ${item.gacha_type} ${detail.title}: base=${detail.base_prob_star5}, overall=${detail.general_prob_star5}, featuredOverall=${(featuredConsolidated * 100).toFixed(3)}%, up=${detail.up_prob}, hard=${hard}, missGuarantee=${guaranteeAfterMiss}, pityCarry=${pityCarriesAcrossTargets}`,
  );
}

if (failures.length) {
  console.error("官方规则与本地配置存在差异：", failures);
  process.exitCode = 1;
} else {
  console.log(
    `官方规则核验通过。本地核验日期：${official.verifiedAt}。该命令不会自动修改配置。`,
  );
}
