import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import {
  Activity,
  Archive,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Database,
  Download,
  Ellipsis,
  FileDown,
  Home,
  Layers,
  ListOrdered,
  Moon,
  Plus,
  RotateCcw,
  Settings,
  ShieldAlert,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Wallet,
  Globe2,
} from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  availableAt,
  channelName,
  currentPulls,
  incomeUntil,
  id,
  initialData,
  targetMaxPulls,
  today,
} from "../domain/data";
import {
  currentVersion,
  futureVersionDefaultPulls,
  futureVersionProjections,
  targetDateForSelection,
  versionResourceView,
  versionResourceSources,
} from "../data/version-resources";
import type {
  AppData,
  Banner,
  Channel,
  Plan,
  Target,
  SpecialFamily,
} from "../domain/types";
import { useApp } from "../storage/store";
import { clearData, exportJson, migrate } from "../storage/data";
import {
  modeledConsolidatedChance,
  type Analysis,
} from "../engine/probability";
import type { SpecialAnalysis } from "../engine/special";
import { changeSpecialSelection, resetSpecialPeriod } from "../engine/special";
import { t } from "../i18n";
import {
  legacyRules,
  officialRuleSources,
  officialRules,
  restoreLegacyRules,
  restoreOfficialRules,
  ruleSources,
  setRuleSourceEnabled,
} from "../rules/profiles";
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import specialHistoryRaw from "../rules/special-history.json";
import { setBannerSourceEnabled } from "../data/banner-sync";
import {
  bannerHistorySourceId,
  bannerSources,
  onlineBannerSourceId,
} from "../data/banner-history";
import {
  futureVersionList,
  targetCatalog,
  targetOptionLabel,
  targetPredictions,
  topTargetPrediction,
} from "../data/target-predictions";
import {
  announcedCharacterSources,
  bundledAnnouncedCharactersForSource,
} from "../data/announced-characters";

type View =
  | "home"
  | "resources"
  | "version-income"
  | "pity"
  | "targets"
  | "timeline"
  | "special"
  | "analysis"
  | "compare"
  | "sources"
  | "settings";
const navigation: { id: View; name: string; icon: typeof Home }[] = [
  { id: "home", name: t("home"), icon: Home },
  { id: "resources", name: t("resources"), icon: Wallet },
  { id: "version-income", name: "版本资源", icon: Globe2 },
  { id: "pity", name: t("pity"), icon: Layers },
  { id: "targets", name: t("targets"), icon: ListOrdered },
  { id: "timeline", name: t("timeline"), icon: CalendarDays },
  { id: "special", name: t("special"), icon: Sparkles },
  { id: "analysis", name: t("analysis"), icon: Activity },
  { id: "compare", name: t("compare"), icon: BarChart3 },
  { id: "sources", name: t("sources"), icon: Database },
  { id: "settings", name: t("settings"), icon: Settings },
];
const mobilePrimaryViews = new Set<View>([
  "home",
  "resources",
  "targets",
  "timeline",
]);
const mobileNavigation = navigation.filter((item) =>
  mobilePrimaryViews.has(item.id),
);
const mobileMoreNavigation = navigation.filter(
  (item) => !mobilePrimaryViews.has(item.id),
);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const worstLabel = (n: number | null) =>
  n === null ? "无有限上界" : `${n} 抽`;
const deficitLabel = (n: number | null) =>
  n === null ? "无法给出有限缺口" : `${n} 抽`;
const plusDays = (n: number) =>
  new Date(Date.now() + n * 86400000).toLocaleDateString("en-CA");
const downloadImage = async (element: HTMLElement) => {
  const image = await toPng(element, {
    backgroundColor: getComputedStyle(document.body).backgroundColor,
    pixelRatio: 2,
  });
  const link = document.createElement("a");
  link.href = image;
  link.download = "抽卡规划结果.png";
  link.click();
};
function Field({
  label,
  value,
  onChange,
  min = 0,
  max = 1_000_000,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}) {
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState(() => String(value));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(String(value));
  }, [value]);
  const validate = (raw: string) => {
    if (raw.trim() === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    if (n < min || n > max || (step === 1 && !Number.isInteger(n))) return null;
    if (
      step !== 1 &&
      Math.abs((n - min) / step - Math.round((n - min) / step)) > 1e-9
    )
      return null;
    return n;
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        onFocus={() => {
          editing.current = true;
          setMessage("");
        }}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          const n = validate(raw);
          if (n !== null) {
            onChange(n);
            setMessage("");
          } else if (raw.trim() !== "") {
            setMessage(
              `请输入 ${min} 至 ${max} 的${step === 1 ? "整数" : "数字"}`,
            );
          } else {
            setMessage("");
          }
        }}
        onBlur={() => {
          editing.current = false;
          const n = validate(draft);
          if (n === null) {
            setDraft(String(value));
            setMessage("");
          } else {
            setDraft(String(n));
            setMessage("");
          }
        }}
      />
      {hint && <small>{hint}</small>}
      {message && (
        <small className="error" role="alert">
          {message}
        </small>
      )}
    </label>
  );
}
function TextField({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        aria-label={label}
        value={value}
        type={type}
        required={required}
        maxLength={80}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function TargetNameField({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const listId = "target-name-options";
  return (
    <label className="field">
      <span>目标名称</span>
      <input
        aria-label="目标名称"
        role="textbox"
        list={listId}
        value={value}
        required
        maxLength={80}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </datalist>
      <small>可输入自定义名称；从列表选择时会自动套用最高概率版本。</small>
    </label>
  );
}
function TargetVersionField({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const listId = "target-version-options";
  return (
    <label className="field">
      <span>目标版本</span>
      <input
        aria-label="目标版本"
        list={listId}
        value={value}
        inputMode="decimal"
        pattern="\d+\.\d+"
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={listId}>
        {options.map((version) => (
          <option key={version} value={version} />
        ))}
      </datalist>
      <small>可直接输入未来版本号；列表中的“预测”版本仅作提示。</small>
    </label>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((x) => (
          <option key={x.value} value={x.value}>
            {x.label}
          </option>
        ))}
      </select>
    </label>
  );
}
function Heading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="heading">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("界面错误", error, info);
  }
  render() {
    return this.state.failed ? (
      <div className="fatal" role="alert">
        <h1>页面暂时无法显示</h1>
        <p>
          本地数据仍保存在设备上。刷新页面重试；如持续出现，请从设置页导出数据。
        </p>
        <button onClick={() => location.reload()}>
          <RotateCcw size={16} />
          重新加载
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function ResourcesPage({
  data,
  update,
}: {
  data: AppData;
  update: (f: (d: AppData) => void) => void;
}) {
  const r = data.resources;
  const fields = [
    ["film", "菲林"],
    ["encrypted", "加密母带"],
    ["original", "原装母带"],
    ["other", "其他可兑换资源"],
    ["signalAfterglow", "信号余波"],
    ["signalResidual", "信号残响"],
  ] as const;
  return (
    <>
      <Heading
        title="当前资源"
        subtitle="限定频道使用加密母带；信号余波、信号残响等副产物按兑换比例折算。原装母带单独记录，不计入限定抽数。"
      />
      <div className="metrics">
        <Metric
          label="当前限定抽数"
          value={currentPulls(r, data.rules)}
          detail="向下取整，不含未领取收入"
        />
        <Metric label="原装母带" value={r.original} detail="常驻频道独立记录" />
        <Metric
          label="副产物折算抽数"
          value={
            Math.floor(
              r.signalAfterglow / data.rules.conversion.signalAfterglowPerTape,
            ) +
            Math.floor(
              r.signalResidual / data.rules.conversion.signalResidualPerTape,
            )
          }
          detail="信号余波与残响"
        />
        <Metric label="菲林余额" value={r.film.toLocaleString()} />
      </div>
      <section className="band">
        <h2>持有数量</h2>
        <div className="form-grid">
          {fields.map(([key, label]) => (
            <Field
              key={key}
              label={label}
              value={r[key]}
              onChange={(v) =>
                update((d) => {
                  d.resources[key] = v;
                })
              }
            />
          ))}
        </div>
      </section>
      <section className="band">
        <h2>兑换比例</h2>
        <div className="form-grid">
          <Field
            label="每抽所需菲林"
            value={data.rules.conversion.filmPerTape}
            min={1}
            onChange={(v) =>
              update((d) => {
                d.rules.conversion.filmPerTape = v;
              })
            }
          />
          <Field
            label="其他资源每抽所需数量"
            value={data.rules.conversion.otherPerTape}
            min={1}
            onChange={(v) =>
              update((d) => {
                d.rules.conversion.otherPerTape = v;
              })
            }
          />
          <Field
            label="信号余波每抽所需数量"
            value={data.rules.conversion.signalAfterglowPerTape}
            min={1}
            onChange={(v) =>
              update((d) => {
                d.rules.conversion.signalAfterglowPerTape = v;
              })
            }
          />
          <Field
            label="信号残响每抽所需数量"
            value={data.rules.conversion.signalResidualPerTape}
            min={1}
            onChange={(v) =>
              update((d) => {
                d.rules.conversion.signalResidualPerTape = v;
              })
            }
          />
        </div>
        <p className="note">
          换算比例是用户配置。副产物会按整抽向下取整；未兑换的零头会留在余额中，并在模拟中继续累积。
        </p>
      </section>
      <section className="band">
        <h2>现实货币预算</h2>
        <Toggle
          label="记录现实货币预算（默认关闭）"
          checked={r.includeMoney}
          onChange={(v) =>
            update((d) => {
              d.resources.includeMoney = v;
            })
          }
        />
        {r.includeMoney && (
          <>
            <Field
              label="预算上限（本地货币单位）"
              value={r.moneyBudget}
              onChange={(v) =>
                update((d) => {
                  d.resources.moneyBudget = v;
                })
              }
            />
            <p className="note">
              预算只用于自我约束，不自动折算为抽数。请先确认实际支出能力；成功率不是购买建议。
            </p>
          </>
        )}
      </section>
    </>
  );
}

function VersionIncomePage({
  data,
  update,
}: {
  data: AppData;
  update: (f: (d: AppData) => void) => void;
}) {
  const view = versionResourceView(data, currentVersion);
  const activity = data.versionResources.find(
    (resource) =>
      resource.version === currentVersion &&
      resource.id === `manual-${currentVersion}-activity`,
  );
  const daily = data.versionResources.find(
    (resource) =>
      resource.version === currentVersion &&
      resource.id === `manual-${currentVersion}-daily-active`,
  );
  const monthly = data.versionResources.find(
    (resource) =>
      resource.version === currentVersion &&
      resource.scope === "monthly" &&
      resource.sourceKind === "manual",
  );
  const progress = data.resourceProgress[currentVersion] ?? {
    film: 0,
    encrypted: 0,
    acquiredPulls: 0,
    acquisitionPercent: 0,
    observedAt: "",
  };
  const acquiredPulls = progress.acquiredPulls ?? progress.encrypted;
  const setResourceEntry = (id: string, value: number) =>
    update((current) => {
      const entry = current.versionResources.find((item) => item.id === id);
      if (entry) entry.pulls = value;
    });
  const setFilmEntry = (id: string, value: number) =>
    update((current) => {
      const entry = current.versionResources.find((item) => item.id === id);
      if (entry) entry.film = value;
    });
  return (
    <>
      <Heading
        title="版本资源"
        subtitle="不再联网读取版本奖励。请按活动页面分别填写菲林与抽数，已获得资源同样分开记录；日常活跃和月卡资源按版本持续时间计算。"
      />
      <div className="metrics">
        <Metric
          label={`${currentVersion} 总资源`}
          value={`${view.total.toFixed(1)} 抽`}
          detail="活动页面 + 每日活跃 + 月卡"
        />
        <Metric
          label="活动页面资源"
          value={`${view.activityPulls.toFixed(1)} 抽`}
          detail="手工填写"
        />
        <Metric
          label="本版本已获取"
          value={`${view.acquired.toFixed(1)} 抽`}
          detail={`${(view.progressRatio * 100).toFixed(1)}% 已获取`}
        />
        <Metric
          label="本版本剩余"
          value={`${view.remaining.toFixed(1)} 抽`}
          detail={`${view.days} 天 · ${view.start || "未知"} 至 ${view.end || "未知"}`}
        />
      </div>
      <section className="band">
        <div className="section-heading">
          <div>
            <h2>填写活动页面资源与获取度</h2>
            <small>
              活动页面资源请分别填写页面显示的菲林与抽数；已获得资源请填写本版本至今已经获得的菲林与抽数。
            </small>
          </div>
          <span className="tag">{currentVersion}</span>
        </div>
        <div className="form-grid">
          <Field
            label="活动页面版本资源（菲林）"
            value={activity?.film ?? 0}
            min={0}
            onChange={(value) =>
              setFilmEntry(`manual-${currentVersion}-activity`, value)
            }
          />
          <Field
            label="活动页面版本资源（抽数）"
            value={activity?.pulls ?? 0}
            min={0}
            onChange={(value) =>
              setResourceEntry(`manual-${currentVersion}-activity`, value)
            }
          />
          <Field
            label="本版本已获得资源（菲林）"
            value={progress.film}
            min={0}
            onChange={(value) =>
              update((current) => {
                const currentView = versionResourceView(
                  current,
                  currentVersion,
                );
                current.resourceProgress[currentVersion] = {
                  ...current.resourceProgress[currentVersion],
                  version: currentVersion,
                  film: value,
                  encrypted: 0,
                  acquiredPulls,
                  acquisitionPercent:
                    currentView.total > 0
                      ? Math.max(
                          0,
                          Math.min(
                            100,
                            ((value / current.rules.conversion.filmPerTape +
                              acquiredPulls) /
                              currentView.total) *
                              100,
                          ),
                        )
                      : 0,
                  observedAt: today(),
                };
              })
            }
          />
          <Field
            label="本版本已获得资源（抽数）"
            value={acquiredPulls}
            min={0}
            onChange={(value) =>
              update((current) => {
                const currentView = versionResourceView(
                  current,
                  currentVersion,
                );
                current.resourceProgress[currentVersion] = {
                  ...current.resourceProgress[currentVersion],
                  version: currentVersion,
                  film: progress.film,
                  encrypted: 0,
                  acquiredPulls: value,
                  acquisitionPercent:
                    currentView.total > 0
                      ? Math.max(
                          0,
                          Math.min(
                            100,
                            ((progress.film /
                              current.rules.conversion.filmPerTape +
                              value) /
                              currentView.total) *
                              100,
                          ),
                        )
                      : 0,
                  observedAt: today(),
                };
              })
            }
          />
          <Field
            label="每日活跃（菲林/天）"
            value={daily?.film ?? 0}
            min={0}
            onChange={(value) =>
              setFilmEntry(`manual-${currentVersion}-daily-active`, value)
            }
          />
          <Field
            label="月卡（菲林/天）"
            value={monthly?.film ?? 0}
            min={0}
            onChange={(value) => {
              if (monthly) setFilmEntry(monthly.id, value);
            }}
          />
        </div>
        <div className="resource-progress" aria-label="版本资源获取进度">
          <span style={{ width: `${view.progressRatio * 100}%` }} />
        </div>
        <p className="note">
          总资源 = 活动页面菲林 ÷ 160 + 活动页面抽数 + 每日活跃菲林 ×{" "}
          {view.days} 天 ÷ 160 + 月卡菲林 × {view.days} 天 ÷
          160。未购买月卡时将月卡每日菲林填为 0。
        </p>
      </section>
      <section className="band">
        <h2>资源计算明细</h2>
        <div className="resource-comparison">
          <div className="comparison-row">
            <div>
              <strong>活动页面资源</strong>
              <small>
                {activity?.film ?? 0} 菲林 ÷ 160 + {activity?.pulls ?? 0}{" "}
                抽，不含下方按天数计算的项目。
              </small>
            </div>
            <span>{view.activityPulls.toFixed(1)} 抽</span>
          </div>
          <div className="comparison-row">
            <div>
              <strong>每日活跃</strong>
              <small>
                {daily?.film ?? 0} 菲林/天 × {view.days} 天
              </small>
            </div>
            <span>{view.dailyActivityPulls.toFixed(1)} 抽</span>
          </div>
          <div className="comparison-row">
            <div>
              <strong>月卡</strong>
              <small>
                {monthly?.film ?? 0} 菲林/天 × {view.days} 天
              </small>
            </div>
            <span>{view.monthlyCardPulls.toFixed(1)} 抽</span>
          </div>
        </div>
      </section>
      <section className="band">
        <h2>未来版本默认资源</h2>
        <p className="note">
          未来版本不联网估算奖励，直接按每版本 {futureVersionDefaultPulls}{" "}
          抽计算；版本持续时间仍按当前版本天数推演。
        </p>
        <div className="projection-grid">
          {futureVersionProjections(data, 6).map((item) => (
            <div className="projection-card" key={item.version}>
              <span className="tag">{item.version}</span>
              <strong>{item.projectedPulls.toFixed(1)} 抽</strong>
              <small>
                {item.days} 天 · {item.start} 至 {item.end}
              </small>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function PityPage({
  data,
  update,
}: {
  data: AppData;
  update: (f: (d: AppData) => void) => void;
}) {
  return (
    <>
      <Heading
        title="卡池状态"
        subtitle="两个频道分别记录。特殊定向或复刻频道不使用此普通限定模型。"
      />
      {(["agent", "engine"] as Channel[]).map((channel) => {
        const state = data.pity[channel],
          rule = data.rules.channels[channel];
        return (
          <section className="band" key={channel}>
            <div className="section-heading">
              <h2>{channelName(channel)}频道</h2>
              <span className="tag">
                距离硬保底 {rule.hardPity - state.count} 抽
              </span>
            </div>
            <div className="form-grid">
              <Field
                label="当前垫数"
                value={state.count}
                max={rule.hardPity - 1}
                onChange={(v) =>
                  update((d) => {
                    d.pity[channel].count = v;
                  })
                }
              />
              <Select
                label="上一次 S 结果"
                value={state.lastResult}
                options={[
                  { value: "none", label: "未记录" },
                  { value: "featured", label: "当期限定" },
                  { value: "off-banner", label: "非当期限定" },
                ]}
                onChange={(v) =>
                  update((d) => {
                    d.pity[channel].lastResult = v as typeof state.lastResult;
                  })
                }
              />
            </div>
            <Toggle
              label="下一次 S 必定为当期限定（请核对游戏内状态）"
              checked={state.guaranteed}
              onChange={(v) =>
                update((d) => {
                  d.pity[channel].guaranteed = v;
                })
              }
            />
            {rule.guaranteeAfterMiss &&
              state.lastResult === "off-banner" &&
              !state.guaranteed && (
                <p className="warning">
                  记录为非当期限定，但保证开关未打开。请核对游戏内“详情”。
                </p>
              )}
            <p className="note">{rule.confidence}</p>
          </section>
        );
      })}
    </>
  );
}
function SortableTarget({
  target,
  children,
}: {
  target: Target;
  children: React.ReactNode;
}) {
  const sortable = useSortable({ id: target.id });
  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className="target-row"
    >
      <button
        className="drag"
        {...sortable.attributes}
        {...sortable.listeners}
        aria-label={`拖动调整 ${target.name || "未命名目标"} 顺序`}
        title="拖动调整顺序"
      >
        ⠿
      </button>
      {children}
    </div>
  );
}
function TargetsPage({
  data,
  update,
}: {
  data: AppData;
  update: (f: (d: AppData) => void) => void;
}) {
  const plan = data.plans.find((p) => p.id === data.activePlanId)!;
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const catalog = useMemo(() => targetCatalog(data), [data]);
  const targetVersions = useMemo(
    () =>
      [
        ...new Set([
          ...data.banners.map((banner) => banner.version).filter(Boolean),
          currentVersion,
          ...futureVersionList(data),
        ]),
      ].sort((a, b) => b.localeCompare(a, undefined, { numeric: true })),
    [data],
  );
  const set = (targetId: string, f: (t: Target) => void) =>
    update((d) => {
      f(
        d.plans
          .find((p) => p.id === d.activePlanId)!
          .targets.find((t) => t.id === targetId)!,
      );
    });
  const setTargetName = (targetId: string, name: string) =>
    update((d) => {
      const target = d.plans
        .find((p) => p.id === d.activePlanId)!
        .targets.find((item) => item.id === targetId)!;
      target.name = name;
      const prediction = topTargetPrediction(d, name, target.channel);
      if (prediction) {
        target.targetVersion = prediction.version;
        target.targetPhase = prediction.phase;
        target.stopDate = targetDateForSelection(
          d,
          prediction.version,
          prediction.phase,
        );
      }
    });
  const addTarget = (channel: Channel) =>
    update((d) => {
      const first = targetCatalog(d).find((item) => item.channel === channel);
      const name = first?.name ?? "";
      const prediction = name ? topTargetPrediction(d, name, channel) : null;
      const version = prediction?.version ?? currentVersion;
      const phase = prediction?.phase ?? 2;
      d.plans
        .find((p) => p.id === d.activePlanId)!
        .targets.push({
          id: id(),
          name,
          channel,
          copies: 1,
          includeSignatureEngine: false,
          signatureEngineCopies: 1,
          priority: 1,
          maxPulls: targetMaxPulls(d, {
            channel,
            copies: 1,
            includeSignatureEngine: false,
            signatureEngineCopies: 1,
          }),
          targetVersion: version,
          targetPhase: phase,
          stopDate: targetDateForSelection(d, version, phase),
          continueOnSuccess: true,
          skipped: false,
        });
    });
  return (
    <>
      <Heading
        title="目标编辑"
        subtitle="顺序即实际抽取顺序；目标时间按版本与上下期计算，日期仅用于展示和分析。"
        action={
          <div className="actions">
            <button onClick={() => addTarget("agent")}>
              <Plus size={16} />
              角色
            </button>
            <button onClick={() => addTarget("engine")}>
              <Plus size={16} />
              音擎
            </button>
          </div>
        }
      />
      <section className="band">
        <div className="section-heading">
          <h2>{plan.name}</h2>
          <span className="tag">{plan.targets.length} 个目标</span>
        </div>
        {plan.targets.length === 0 && (
          <p className="empty">还没有目标。添加角色或音擎后可以开始分析。</p>
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => {
            if (e.over && e.active.id !== e.over.id)
              update((d) => {
                const list = d.plans.find(
                  (p) => p.id === d.activePlanId,
                )!.targets;
                const a = list.findIndex((t) => t.id === e.active.id),
                  b = list.findIndex((t) => t.id === e.over!.id);
                d.plans.find((p) => p.id === d.activePlanId)!.targets =
                  arrayMove(list, a, b);
              });
          }}
        >
          <SortableContext
            items={plan.targets.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            {plan.targets.map((t, index) => (
              <SortableTarget key={t.id} target={t}>
                <div className="target-content">
                  <div className="section-heading">
                    <h3>
                      #{index + 1} · {t.name || "未命名目标"}{" "}
                      <span className="tag">{channelName(t.channel)}</span>
                    </h3>
                    <button
                      className="icon danger"
                      aria-label={`删除 ${t.name || "目标"}`}
                      title="删除目标"
                      onClick={() => {
                        if (confirm(`确定删除目标“${t.name || "未命名"}”？`))
                          update((d) => {
                            const p = d.plans.find(
                              (p) => p.id === d.activePlanId,
                            )!;
                            p.targets = p.targets.filter((x) => x.id !== t.id);
                          });
                      }}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                  <div className="form-grid">
                    <TargetNameField
                      value={t.name}
                      options={catalog
                        .filter((item) => item.channel === t.channel)
                        .map((item) => ({
                          value: item.name,
                          label: targetOptionLabel(item),
                        }))}
                      onChange={(v) => setTargetName(t.id, v)}
                    />
                    <Select
                      label="频道"
                      value={t.channel}
                      options={[
                        { value: "agent", label: "角色" },
                        { value: "engine", label: "音擎" },
                      ]}
                      onChange={(v) =>
                        update((d) => {
                          const x = d.plans
                            .find((p) => p.id === d.activePlanId)!
                            .targets.find((item) => item.id === t.id)!;
                          const wasAutomatic =
                            x.maxPulls === targetMaxPulls(d, x);
                          x.channel = v as Channel;
                          if (x.channel === "engine")
                            x.includeSignatureEngine = false;
                          if (wasAutomatic) x.maxPulls = targetMaxPulls(d, x);
                          const candidate = targetCatalog(d).find(
                            (item) => item.channel === x.channel,
                          );
                          if (candidate) {
                            x.name = candidate.name;
                            const prediction = topTargetPrediction(
                              d,
                              candidate.name,
                              x.channel,
                            );
                            if (prediction) {
                              x.targetVersion = prediction.version;
                              x.targetPhase = prediction.phase;
                              x.stopDate = targetDateForSelection(
                                d,
                                prediction.version,
                                prediction.phase,
                              );
                            }
                          }
                        })
                      }
                    />
                    <Field
                      label="获得数量"
                      value={t.copies}
                      min={1}
                      max={6}
                      onChange={(v) =>
                        update((d) => {
                          const x = d.plans
                            .find((p) => p.id === d.activePlanId)!
                            .targets.find((item) => item.id === t.id)!;
                          const wasAutomatic =
                            x.maxPulls === targetMaxPulls(d, x);
                          x.copies = v;
                          if (wasAutomatic) x.maxPulls = targetMaxPulls(d, x);
                        })
                      }
                    />
                    {t.channel === "agent" && (
                      <>
                        <Toggle
                          label="同时抽取专武"
                          checked={t.includeSignatureEngine === true}
                          onChange={(v) =>
                            update((d) => {
                              const x = d.plans
                                .find((p) => p.id === d.activePlanId)!
                                .targets.find((item) => item.id === t.id)!;
                              const wasAutomatic =
                                x.maxPulls === targetMaxPulls(d, x);
                              x.includeSignatureEngine = v;
                              if (wasAutomatic)
                                x.maxPulls = targetMaxPulls(d, x);
                            })
                          }
                        />
                        {t.includeSignatureEngine === true && (
                          <Field
                            label="专武获得数量"
                            value={t.signatureEngineCopies ?? 1}
                            min={1}
                            max={6}
                            onChange={(v) =>
                              update((d) => {
                                const x = d.plans
                                  .find((p) => p.id === d.activePlanId)!
                                  .targets.find((item) => item.id === t.id)!;
                                const wasAutomatic =
                                  x.maxPulls === targetMaxPulls(d, x);
                                x.signatureEngineCopies = v;
                                if (wasAutomatic)
                                  x.maxPulls = targetMaxPulls(d, x);
                              })
                            }
                          />
                        )}
                      </>
                    )}
                    <Field
                      label="优先级（1 最高）"
                      value={t.priority}
                      min={1}
                      max={10}
                      onChange={(v) =>
                        set(t.id, (x) => {
                          x.priority = v;
                        })
                      }
                    />
                    <TargetVersionField
                      value={t.targetVersion}
                      options={targetVersions}
                      onChange={(v) =>
                        set(t.id, (x) => {
                          x.targetVersion = v;
                          x.stopDate = targetDateForSelection(
                            data,
                            v,
                            x.targetPhase,
                          );
                        })
                      }
                    />
                    <Select
                      label="目标期数"
                      value={String(t.targetPhase)}
                      options={[
                        { value: "1", label: "第 1 期" },
                        { value: "2", label: "第 2 期" },
                      ]}
                      onChange={(v) =>
                        set(t.id, (x) => {
                          x.targetPhase = Number(v) === 1 ? 1 : 2;
                          x.stopDate = targetDateForSelection(
                            data,
                            x.targetVersion,
                            x.targetPhase,
                          );
                        })
                      }
                    />
                    <Field
                      label="最多投入抽数"
                      value={t.maxPulls}
                      max={1200}
                      hint={`自动大保底 ${targetMaxPulls(data, t)} 抽；可直接修改`}
                      onChange={(v) =>
                        set(t.id, (x) => {
                          x.maxPulls = v;
                        })
                      }
                    />
                    <label className="field">
                      <span>版本计算的截止日期</span>
                      <output>{t.stopDate}</output>
                      <small>
                        {t.targetVersion} 第 {t.targetPhase} 期
                      </small>
                    </label>
                    <label className="field">
                      <span>未来版本预测</span>
                      <output>
                        {targetPredictions(data, t.name, t.channel, 3)
                          .map(
                            (prediction) =>
                              `${prediction.version} 第 ${prediction.phase} 期 ${pct(
                                prediction.probability,
                              )}`,
                          )
                          .join(" · ") || "暂无有效预测"}
                      </output>
                      <small>
                        预测仅用于规划；已公布卡池优先于统计复刻预测。
                      </small>
                    </label>
                  </div>
                  <div className="inline-toggles">
                    <Toggle
                      label="成功后继续下一个目标"
                      checked={t.continueOnSuccess}
                      onChange={(v) =>
                        set(t.id, (x) => {
                          x.continueOnSuccess = v;
                        })
                      }
                    />
                    <Toggle
                      label="跳过此卡池"
                      checked={t.skipped}
                      onChange={(v) =>
                        set(t.id, (x) => {
                          x.skipped = v;
                        })
                      }
                    />
                  </div>
                  <small>
                    截止时预计可用 {availableAt(data, t.stopDate)}{" "}
                    抽；提前出货可能为后续目标留下资源。
                  </small>
                </div>
              </SortableTarget>
            ))}
          </SortableContext>
        </DndContext>
      </section>
    </>
  );
}
function TimelinePage({
  data,
  update,
}: {
  data: AppData;
  update: (f: (d: AppData) => void) => void;
}) {
  const [tab, setTab] = useState<"banners" | "reruns">("banners");
  const versions = useMemo(
    () =>
      [
        ...new Set(
          data.banners.map((banner) => banner.version).filter(Boolean),
        ),
      ].sort((a, b) => b.localeCompare(a, undefined, { numeric: true })),
    [data.banners],
  );
  const [versionFilter, setVersionFilter] = useState(versions[0] ?? "all");
  const [announcedDraft, setAnnouncedDraft] = useState<{
    name: string;
    announcedAt: string;
    source: string;
    expectedVersion: string;
    sourceId: string;
  }>({
    name: "",
    announcedAt: today(),
    source: "",
    expectedVersion: "",
    sourceId:
      announcedCharacterSources[0]?.id ?? "official-character-announcements",
  });
  const addAnnouncedCharacter = () => {
    const source = announcedCharacterSources.find(
      (item) => item.id === announcedDraft.sourceId,
    );
    if (!announcedDraft.name.trim() || !announcedDraft.source.trim()) return;
    update((d) => {
      d.announcedCharacters.push({
        id: id(),
        name: announcedDraft.name.trim(),
        channel: "agent",
        announcedAt: announcedDraft.announcedAt,
        source: announcedDraft.source.trim(),
        sourceId: announcedDraft.sourceId,
        sourceName: source?.name ?? "用户补充来源",
        sourceKind: source?.kind ?? "third-party",
        note: "用户补充；在官方资料确认后可删除或更新。",
        expectedVersion: announcedDraft.expectedVersion.trim() || undefined,
      });
    });
    setAnnouncedDraft((draft) => ({
      ...draft,
      name: "",
      source: "",
      expectedVersion: "",
    }));
  };
  const addBanner = () =>
    update((d) => {
      const bannerId = id();
      const featured = "";
      d.banners.push({
        id: bannerId,
        recordKey: `manual:${bannerId}`,
        name: "",
        featured,
        channel: "agent",
        version: "",
        phase: 0,
        kind: "manual",
        start: today(),
        end: plusDays(21),
        official: false,
        source: "",
        sourceId: `manual:${bannerId}`,
        sourceKind: "manual",
        updatedAt: today(),
      });
    });
  const filteredBanners = useMemo(
    () =>
      [...data.banners]
        .filter(
          (banner) =>
            versionFilter === "all" || banner.version === versionFilter,
        )
        .sort(
          (a, b) =>
            b.start.localeCompare(a.start) ||
            a.channel.localeCompare(b.channel) ||
            a.name.localeCompare(b.name),
        ),
    [data.banners, versionFilter],
  );
  const rerunRows = useMemo(() => {
    const now = Date.parse(`${today()}T00:00:00Z`);
    return targetCatalog(data)
      .filter((entry) => entry.channel === "agent")
      .map((entry) => {
        const history = entry.history
          .slice()
          .sort(
            (a, b) =>
              a.start.localeCompare(b.start) || a.kind.localeCompare(b.kind),
          )
          .filter(
            (record, index, all) =>
              index === 0 ||
              record.start !== all[index - 1]!.start ||
              record.kind !== all[index - 1]!.kind,
          );
        const completed = history.filter(
          (record) => Date.parse(`${record.end}T00:00:00Z`) < now,
        );
        const current = history.find(
          (record) => record.start <= today() && record.end >= today(),
        );
        const next = history.find((record) => record.start > today());
        const lastCompleted = completed.at(-1);
        const daysSince = lastCompleted
          ? Math.floor(
              (now - Date.parse(`${lastCompleted.end}T00:00:00Z`)) / 86400000,
            )
          : null;
        const intervals = history
          .slice(1)
          .map((record, index) =>
            Math.round(
              (Date.parse(`${record.start}T00:00:00Z`) -
                Date.parse(`${history[index]!.start}T00:00:00Z`)) /
                86400000,
            ),
          );
        return {
          name: entry.name,
          history,
          current,
          next,
          daysSince,
          intervals,
          status: entry.status,
          predictions: targetPredictions(data, entry.name, "agent", 3),
        };
      })
      .sort(
        (a, b) =>
          (b.daysSince ?? -1) - (a.daysSince ?? -1) ||
          a.name.localeCompare(b.name, "zh-CN"),
      );
  }, [data]);
  return (
    <>
      <Heading
        title="版本时间轴"
        subtitle="仅使用本地官方记录；未来卡池根据官方公告手动写入，确认后可按批次回滚。"
      />
      <div className="segmented" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "banners"}
          className={tab === "banners" ? "selected" : ""}
          onClick={() => setTab("banners")}
        >
          卡池
        </button>
        <button
          role="tab"
          aria-selected={tab === "reruns"}
          className={tab === "reruns" ? "selected" : ""}
          onClick={() => setTab("reruns")}
        >
          复刻周期
        </button>
      </div>
      {tab === "banners" ? (
        <>
          <section className="band sync-panel">
            <div className="section-heading">
              <div>
                <h2>官方记录（手动维护）</h2>
                <small>
                  时间轴不再联网搜索卡池。未来版本更新时，请根据官方公告在下方卡池记录中手动新增或修改记录。
                </small>
              </div>
              <span className="tag">离线</span>
            </div>
            <p className="note">
              复刻周期表和复刻预测仍完全由卡池记录生成；手动写入新一期后，相关角色会自动重新计算离池天数和未来候选。
            </p>
          </section>
          <section className="band">
            <div className="section-heading">
              <div>
                <h2>卡池记录</h2>
                <small>
                  共 {data.banners.length} 条，覆盖 1.0 至{" "}
                  {versions[0] ?? "当前"}。
                </small>
              </div>
              <div className="actions">
                <label className="compact-select">
                  <span>版本</span>
                  <select
                    aria-label="筛选卡池版本"
                    value={versionFilter}
                    onChange={(event) => setVersionFilter(event.target.value)}
                  >
                    <option value="all">全部版本</option>
                    {versions.map((version) => (
                      <option value={version} key={version}>
                        {version}
                      </option>
                    ))}
                  </select>
                </label>
                <button onClick={addBanner}>
                  <Plus size={16} />
                  添加卡池
                </button>
              </div>
            </div>
            {filteredBanners.length === 0 && (
              <p className="empty">该版本暂无卡池记录。</p>
            )}
            <div className="timeline">
              {filteredBanners.map((b) => {
                const set = (f: (v: Banner) => void) =>
                  update((d) => {
                    const current = d.banners.find((x) => x.id === b.id)!;
                    f(current);
                    current.featured = current.name;
                    if (current.kind === "manual")
                      current.recordKey = `manual:${current.id}`;
                    current.updatedAt = today();
                  });
                return (
                  <div className="timeline-entry" key={b.id}>
                    <div className="section-heading">
                      <h3>{b.name || "未命名卡池"}</h3>
                      <span className={b.official ? "tag" : "tag caution"}>
                        {b.official
                          ? "官方来源"
                          : b.sourceKind === "third-party"
                            ? "第三方资料"
                            : "手动记录"}
                      </span>
                    </div>
                    <small>
                      {b.version ? `${b.version} · 第 ${b.phase} 期 · ` : ""}
                      {b.kind === "debut"
                        ? "首次登场"
                        : b.kind === "rerun"
                          ? "复刻"
                          : b.kind === "special"
                            ? "特殊频道"
                            : "自定义"}
                    </small>
                    <div className="form-grid">
                      <TextField
                        label="卡池名称"
                        value={b.name}
                        onChange={(v) =>
                          set((x) => {
                            x.name = v;
                          })
                        }
                      />
                      <TextField
                        label="版本"
                        value={b.version}
                        onChange={(v) =>
                          set((x) => {
                            x.version = v;
                          })
                        }
                      />
                      <Select
                        label="频道"
                        value={b.channel}
                        options={[
                          { value: "agent", label: "角色" },
                          { value: "engine", label: "音擎" },
                        ]}
                        onChange={(v) =>
                          set((x) => {
                            x.channel = v as Channel;
                          })
                        }
                      />
                      <TextField
                        label="开始日期"
                        value={b.start}
                        type="date"
                        onChange={(v) =>
                          set((x) => {
                            x.start = v;
                          })
                        }
                      />
                      <TextField
                        label="结束日期"
                        value={b.end}
                        type="date"
                        onChange={(v) =>
                          set((x) => {
                            x.end = v;
                          })
                        }
                      />
                      <TextField
                        label="资料来源链接"
                        value={b.source}
                        onChange={(v) =>
                          set((x) => {
                            x.source = v;
                          })
                        }
                      />
                    </div>
                    <div className="inline-toggles">
                      {b.sourceKind === "manual" && (
                        <Toggle
                          label="来源为官方公告（需提供链接）"
                          checked={b.official}
                          onChange={(v) =>
                            set((x) => {
                              x.official = v && !!x.source;
                              x.sourceKind = x.official ? "official" : "manual";
                            })
                          }
                        />
                      )}
                      {b.source && <span>来源链接已移至“数据来源”页</span>}
                      <span>更新时间 {b.updatedAt}</span>
                      <button
                        className="icon danger"
                        title="删除卡池"
                        aria-label="删除卡池"
                        onClick={() => {
                          if (confirm("确定删除此卡池记录？"))
                            update((d) => {
                              d.banners = d.banners.filter(
                                (x) => x.id !== b.id,
                              );
                            });
                        }}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : tab === "reruns" ? (
        <section className="band">
          <div className="section-heading">
            <div>
              <h2>全角色复刻周期表</h2>
              <small>
                由卡池记录自动生成；手动写入新一期后，上期角色会自动进入离池计时。
              </small>
            </div>
            <span className="tag">{rerunRows.length} 名角色</span>
          </div>
          <div className="rerun-table">
            <div className="rerun-head">
              <strong>角色</strong>
              <strong>历史登场</strong>
              <strong>复刻间隔</strong>
              <strong>当前状态</strong>
              <strong>未来预测（最多 3 个）</strong>
            </div>
            {rerunRows.map((row) => (
              <div className="rerun-row" key={row.name}>
                <strong>{row.name}</strong>
                <div>
                  {row.history.map((record) => (
                    <small key={`${record.recordKey}:${record.kind}`}>
                      {record.version} 第 {record.phase} 期 · {record.start}
                      {record.kind === "special" ? "（特殊）" : ""}
                    </small>
                  ))}
                </div>
                <span>
                  {row.intervals.length
                    ? row.intervals.map((days) => `${days} 天`).join(" / ")
                    : "尚未复刻"}
                </span>
                <span>
                  {row.current
                    ? `当期进行中，${row.current.end} 结束`
                    : row.next
                      ? `已公布：${row.next.start}`
                      : row.daysSince === null
                        ? row.status === "announced"
                          ? "已公布立绘，尚未实装"
                          : "尚未离池"
                        : `离池 ${row.daysSince} 天`}
                </span>
                <div>
                  {row.predictions.length ? (
                    row.predictions.map((prediction) => (
                      <small key={`${prediction.version}:${prediction.phase}`}>
                        {prediction.kind === "debut" ? "预计实装" : "预计复刻"}
                        ：{prediction.version} 第 {prediction.phase} 期 ·{" "}
                        {pct(prediction.probability)}
                      </small>
                    ))
                  ) : (
                    <small>暂无有效预测；请补充有效来源。</small>
                  )}
                </div>
              </div>
            ))}
          </div>
          <section className="band announced-panel">
            <div className="section-heading">
              <div>
                <h2>已公布立绘资料补充</h2>
                <small>
                  仅收录有来源链接的角色；官方资料优先，第三方资料可在数据来源页停用或删除。
                </small>
              </div>
              <span className="tag">
                {data.announcedCharacters.length} 条补充资料
              </span>
            </div>
            {data.announcedCharacters.length === 0 && (
              <p className="warning">
                当前网络环境没有取得可稳定交叉核验的“未实装但已公布立绘”名单。请补充：角色中文名、公布日期、官方/第三方公告链接和（如有）预计版本；否则此类角色不会被擅自写入规划。
              </p>
            )}
            {data.announcedCharacters.map((character) => (
              <div className="comparison-row" key={character.id}>
                <div>
                  <strong>{character.name}</strong>
                  <small>
                    {character.announcedAt} · {character.sourceName}
                  </small>
                  {character.expectedVersion && (
                    <small>预计版本：{character.expectedVersion}</small>
                  )}
                </div>
                <button
                  className="danger"
                  onClick={() =>
                    update((d) => {
                      d.announcedCharacters = d.announcedCharacters.filter(
                        (item) => item.id !== character.id,
                      );
                    })
                  }
                >
                  <RotateCcw size={16} />
                  删除并回滚
                </button>
              </div>
            ))}
            <div className="form-grid">
              <TextField
                label="已公布角色名称"
                value={announcedDraft.name}
                onChange={(value) =>
                  setAnnouncedDraft((draft) => ({ ...draft, name: value }))
                }
              />
              <TextField
                label="公布/核验日期"
                value={announcedDraft.announcedAt}
                type="date"
                onChange={(value) =>
                  setAnnouncedDraft((draft) => ({
                    ...draft,
                    announcedAt: value,
                  }))
                }
              />
              <Select
                label="资料来源类型"
                value={announcedDraft.sourceId}
                options={announcedCharacterSources.map((source) => ({
                  value: source.id,
                  label: source.name,
                }))}
                onChange={(value) =>
                  setAnnouncedDraft((draft) => ({ ...draft, sourceId: value }))
                }
              />
              <TextField
                label="公告链接"
                value={announcedDraft.source}
                onChange={(value) =>
                  setAnnouncedDraft((draft) => ({ ...draft, source: value }))
                }
              />
              <TextField
                label="预计实装版本（可选）"
                value={announcedDraft.expectedVersion}
                onChange={(value) =>
                  setAnnouncedDraft((draft) => ({
                    ...draft,
                    expectedVersion: value,
                  }))
                }
              />
            </div>
            <button
              className="primary"
              disabled={
                !announcedDraft.name.trim() || !announcedDraft.source.trim()
              }
              onClick={addAnnouncedCharacter}
            >
              <Plus size={16} />
              加入目标下拉与实装预测
            </button>
            <p className="note">资料来源链接与引用统一移至“数据来源”页查看。</p>
          </section>
        </section>
      ) : null}
    </>
  );
}
type SpecialHistoryPeriod = {
  id: string;
  version: string;
  start: string;
  end: string;
  source: string;
  families: Record<SpecialFamily, { targets: string[] }>;
};
const specialHistory = specialHistoryRaw.periods as SpecialHistoryPeriod[];
type SpecialWorkerResult = {
  exact?: SpecialAnalysis;
  simulation?: {
    probability: number;
    meanSearches: number;
    meanTapes: number;
    interval: [number, number];
    iterations: number;
  };
  error?: string;
};
function useSpecialAnalysis(data: AppData, family: SpecialFamily) {
  const [result, setResult] = useState<SpecialWorkerResult | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const plan = data.specialPlans[family];
    const special = data.rules.specialChannels[family];
    const base = data.rules.channels[special.baseChannel];
    if (!special.usesBaseChannelRates) {
      setResult({ error: "特殊频道基础概率补丁未启用，无法计算" });
      setBusy(false);
      return;
    }
    setBusy(true);
    setResult(null);
    const worker = new Worker(
      new URL("../worker/special.worker.ts", import.meta.url),
      { type: "module" },
    );
    const timer = setTimeout(
      () =>
        worker.postMessage({
          base,
          special,
          plan,
          iterations: data.settings.simulations,
          seed: data.settings.seed,
        }),
      250,
    );
    worker.onmessage = (event: MessageEvent<SpecialWorkerResult>) => {
      setResult(event.data);
      setBusy(false);
      worker.terminate();
    };
    worker.onerror = () => {
      setResult({ error: "特殊频道计算线程出错" });
      setBusy(false);
      worker.terminate();
    };
    return () => {
      clearTimeout(timer);
      worker.terminate();
    };
  }, [data, family]);
  return { result, busy };
}
function SpecialPage({
  data,
  update,
}: {
  data: AppData;
  update: (f: (d: AppData) => void) => void;
}) {
  const [family, setFamily] = useState<SpecialFamily>("rescreening");
  const [periodId, setPeriodId] = useState(
    specialHistory.at(-1)?.id ?? "custom",
  );
  const { result, busy } = useSpecialAnalysis(data, family);
  const plan = data.specialPlans[family];
  const special = data.rules.specialChannels[family];
  const base = data.rules.channels[special.baseChannel];
  const period = specialHistory.find((item) => item.id === periodId);
  const familyName = family === "rescreening" ? "角色特殊复映" : "音擎特殊谐振";
  const setPlan = (change: (value: typeof plan) => void) =>
    update((d) => change(d.specialPlans[family]));
  return (
    <>
      <Heading
        title="特殊频道"
        subtitle="独立规划“独家重映”与“音擎回响”；常驻频段不纳入。"
      />
      <p className="warning">
        截至 2026-09-18，3.2 当前官方频道索引没有特殊频道。本页用于复盘 2.5、3.1
        机制及模拟未来同机制频道。
      </p>
      <p className="note">
        3.1 起的“S
        级信号自选”只改变普通限定频道歪出时的候选对象，不改变当期限定命中率或保底状态，因此不另建概率状态机。未来机制若不是
        {` ${special.mechanic} `}，应用会拒绝套用本模型。
      </p>
      <div className="segmented" role="tablist">
        <button
          role="tab"
          aria-selected={family === "rescreening"}
          className={family === "rescreening" ? "selected" : ""}
          onClick={() => setFamily("rescreening")}
        >
          角色特殊复映
        </button>
        <button
          role="tab"
          aria-selected={family === "reverberation"}
          className={family === "reverberation" ? "selected" : ""}
          onClick={() => setFamily("reverberation")}
        >
          音擎特殊谐振
        </button>
      </div>
      <section className="band">
        <div className="section-heading">
          <h2>历史特殊频道</h2>
          <span className="tag">共 {specialHistory.length} 期</span>
        </div>
        <div className="form-grid">
          <Select
            label="选择历史周期"
            value={periodId}
            options={specialHistory.map((item) => ({
              value: item.id,
              label: `${item.version} · ${item.start} 至 ${item.end}`,
            }))}
            onChange={setPeriodId}
          />
          <Select
            label="该期可选目标"
            value={
              period?.families[family].targets.includes(plan.targetName)
                ? plan.targetName
                : (period?.families[family].targets[0] ?? plan.targetName)
            }
            options={(
              period?.families[family].targets ?? [plan.targetName]
            ).map((name) => ({ value: name, label: name }))}
            onChange={(value) =>
              update((d) => {
                d.specialPlans[family] = changeSpecialSelection(
                  d.specialPlans[family],
                  d.rules.specialChannels[family],
                  value,
                );
              })
            }
          />
        </div>
        <div className="actions">
          <button
            onClick={() => {
              if (!period) return;
              const target =
                period.families[family].targets[0] ?? plan.targetName;
              if (
                confirm(
                  `载入 ${period.version} 特殊频道并按新一期规则重置特殊保证与折扣？`,
                )
              )
                update((d) => {
                  d.specialPlans[family] = resetSpecialPeriod(
                    d.specialPlans[family],
                    d.rules.specialChannels[family],
                    period.id,
                    target,
                  );
                });
            }}
          >
            <RotateCcw size={16} />
            载入周期并重置当期状态
          </button>
          {period && <span>本期公告链接已移至“数据来源”页</span>}
        </div>
      </section>
      <section className="band">
        <div className="section-heading">
          <h2>{familyName}状态</h2>
          <span className="tag">{plan.periodId}</span>
        </div>
        <div className="form-grid">
          <TextField
            label="自选目标"
            value={plan.targetName}
            onChange={(value) =>
              update((d) => {
                d.specialPlans[family] = changeSpecialSelection(
                  d.specialPlans[family],
                  d.rules.specialChannels[family],
                  value,
                );
              })
            }
          />
          <Field
            label="特殊频道当前垫数"
            value={plan.pity}
            max={base.hardPity - 1}
            onChange={(value) =>
              setPlan((item) => {
                item.pity = value;
              })
            }
          />
          <Field
            label="目标数量"
            value={plan.copies}
            min={1}
            max={6}
            onChange={(value) =>
              setPlan((item) => {
                item.copies = value;
              })
            }
          />
          <Field
            label="最多投入加密母带"
            value={plan.maxTapes}
            max={1200}
            onChange={(value) =>
              setPlan((item) => {
                item.maxTapes = value;
              })
            }
          />
        </div>
        <div className="inline-toggles">
          <Toggle
            label="特殊频道常规保证：下一次常规 S 必定为自选目标"
            checked={plan.standardGuaranteed}
            onChange={(value) =>
              setPlan((item) => {
                item.standardGuaranteed = value;
              })
            }
          />
          <Toggle
            label="本期特殊保证仍可用"
            checked={plan.specialGuaranteeAvailable}
            onChange={(value) =>
              setPlan((item) => {
                item.specialGuaranteeAvailable = value;
              })
            }
          />
          <Toggle
            label="本期首个十连折扣仍可用"
            checked={plan.discountAvailable}
            onChange={(value) =>
              setPlan((item) => {
                item.discountAvailable = value;
              })
            }
          />
          <Toggle
            label="本次规划使用 8 张母带折扣十连"
            checked={plan.useDiscount}
            onChange={(value) =>
              setPlan((item) => {
                item.useDiscount = value;
              })
            }
          />
        </div>
        <div className="actions">
          <button
            onClick={() =>
              setPlan((item) => {
                item.maxTapes = currentPulls(data.resources, data.rules);
              })
            }
          >
            <Wallet size={16} />
            使用当前可用抽数作为预算
          </button>
        </div>
        <p className="note">
          特殊保证命中时不会消耗已有标准保证。折扣是一次完整十连：即使目标较早出现，仍会结算
          10 次检索并花费 8 张母带。
        </p>
        <p className="note">
          逐抽 S
          概率沿用当前对应角色/音擎模型；停用该类型的软保底来源后，特殊频道也会同步回退到基础概率加硬保底。
        </p>
        <p className="note">
          与普通{special.baseChannel === "agent" ? "角色限定" : "音擎限定"}
          频道：垫数
          {special.inheritance.regular.pity === "independent" ? "独立" : "共享"}
          ，常规歪后保证
          {special.inheritance.regular.standardGuarantee === "independent"
            ? "独立"
            : "共享"}
          。同一期切换目标会
          {special.inheritance.selection.pity === "carry" ? "保留" : "重置"}
          垫数；跨特殊期会
          {special.inheritance.period.pity === "carry" ? "保留" : "重置"}
          垫数，并
          {special.inheritance.period.standardGuarantee === "carry"
            ? "保留"
            : "重置"}
          特殊频道常规保证。
        </p>
        <p className="note">{special.confidence}</p>
      </section>
      <section className="band">
        <h2>特殊频道概率结果</h2>
        {busy ? (
          <p className="notice">正在计算特殊频道状态…</p>
        ) : result?.error ? (
          <p className="warning" role="alert">
            {result.error}。可在“数据来源”页检查特殊频道第三方补丁。
          </p>
        ) : result?.exact && result.simulation ? (
          <>
            <div className="metrics">
              <Metric
                label="完成目标概率"
                value={pct(result.exact.probability)}
                detail={`${plan.copies} 个 ${plan.targetName}`}
              />
              <Metric
                label="平均检索次数"
                value={`${result.exact.meanSearches.toFixed(1)} 抽`}
              />
              <Metric
                label="平均母带消耗"
                value={`${result.exact.meanTapes.toFixed(1)} 张`}
              />
              <Metric
                label="理论最坏母带"
                value={
                  result.exact.worstTapes === null
                    ? "无有限上界"
                    : `${result.exact.worstTapes} 张`
                }
                detail={
                  result.exact.worstSearches === null
                    ? "歪后无保证"
                    : `${result.exact.worstSearches} 次检索`
                }
              />
            </div>
            <div className="metrics small-metrics">
              <Metric
                label="母带消耗中位"
                value={`${result.exact.medianTapes} 张`}
              />
              <Metric
                label="90% 消耗分位"
                value={`${result.exact.p90Tapes} 张`}
              />
              <Metric
                label="95% 消耗分位"
                value={`${result.exact.p95Tapes} 张`}
              />
              <Metric
                label="模拟 95% 区间"
                value={`${pct(result.simulation.interval[0])}～${pct(result.simulation.interval[1])}`}
                detail={`${result.simulation.iterations.toLocaleString()} 次`}
              />
            </div>
            <p className="note">
              精确状态转移探索了 {result.exact.exploredStates.toLocaleString()}{" "}
              个状态；模拟完成率 {pct(result.simulation.probability)}
              。第三方补丁停用后不会继续展示推断概率。
            </p>
          </>
        ) : null}
      </section>
    </>
  );
}
function DistributionChart({ analysis }: { analysis: Analysis }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let chart: ReturnType<typeof import("echarts").init> | null = null;
    let observer: ResizeObserver | null = null;
    void import("echarts").then((echarts) => {
      if (!ref.current || disposed) return;
      chart = echarts.init(ref.current);
      chart.setOption({
        backgroundColor: "transparent",
        textStyle: { color: getComputedStyle(document.body).color },
        grid: { left: 54, right: 16, top: 16, bottom: 42 },
        tooltip: {
          trigger: "axis",
          formatter: (params: unknown) => {
            const p = (params as { axisValue: string; data: number }[])[0];
            return p
              ? `${p.axisValue} 抽：累计 ${(p.data * 100).toFixed(1)}%`
              : "";
          },
        },
        xAxis: {
          type: "category",
          name: "抽数",
          data: analysis.distribution.map((x) => x.pulls),
          axisLabel: {
            color: getComputedStyle(document.body).color,
            interval: Math.max(0, Math.floor(analysis.distribution.length / 7)),
          },
        },
        yAxis: {
          type: "value",
          min: 0,
          max: 1,
          axisLabel: {
            formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
            color: getComputedStyle(document.body).color,
          },
        },
        series: [
          {
            type: "line",
            symbol: "none",
            areaStyle: { opacity: 0.16 },
            lineStyle: { width: 3, color: "#e7ce31" },
            itemStyle: { color: "#e7ce31" },
            data: analysis.distribution.reduce((result: number[], point) => {
              result.push((result.at(-1) ?? 0) + point.probability);
              return result;
            }, []),
          },
        ],
      });
      observer = new ResizeObserver(() => chart?.resize());
      observer.observe(ref.current);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      chart?.dispose();
    };
  }, [analysis]);
  return (
    <div
      ref={ref}
      className="chart"
      role="img"
      aria-label="规划实际消耗抽数的累计概率曲线"
    />
  );
}
type WorkerResult = {
  exact: Analysis;
  simulation: {
    probability: number;
    mean: number;
    meanReturnedPulls: number;
    interval: [number, number];
    iterations: number;
  };
  error?: string;
};
function useAnalysis(data: AppData, plan: Plan | undefined) {
  const [result, setResult] = useState<WorkerResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!plan || plan.targets.filter((t) => !t.skipped).length === 0) {
      setResult(null);
      setError("");
      setBusy(false);
      return;
    }
    setResult(null);
    setBusy(true);
    const worker = new Worker(
      new URL("../worker/analysis.worker.ts", import.meta.url),
      { type: "module" },
    );
    const timer = setTimeout(
      () => worker.postMessage({ data, plan, token: 1 }),
      300,
    );
    worker.onmessage = (event: MessageEvent<WorkerResult>) => {
      if (event.data.error) {
        setError(event.data.error);
        setResult(null);
      } else {
        setError("");
        setResult(event.data);
      }
      setBusy(false);
      worker.terminate();
    };
    worker.onerror = () => {
      setError("计算线程出错，请减少目标数量并重试");
      setBusy(false);
      worker.terminate();
    };
    return () => {
      clearTimeout(timer);
      worker.terminate();
    };
  }, [data, plan]);
  return { result, error, busy };
}
function Advice({
  data,
  plan,
  result,
}: {
  data: AppData;
  plan: Plan;
  result: WorkerResult;
}) {
  const targets = plan.targets.filter((t) => !t.skipped);
  const ordered = [...targets].sort((a, b) => a.priority - b.priority);
  const available = availableAt(data, targets.at(-1)?.stopDate ?? today());
  return (
    <section className="band">
      <h2>规划建议</h2>
      <div className="advice">
        <p>
          <strong>推荐关注顺序：</strong>
          {ordered.map((t) => t.name).join(" → ")}
          。依据是你填写的优先级；实际抽取仍按目标列表顺序。
        </p>
        <p>
          <strong>高风险：</strong>
          {targets
            .filter((t, i) => result.exact.targetProbabilities[i]! < 0.5)
            .map((t) => t.name)
            .join("、") || "当前模型下没有低于 50% 的目标"}
          。 这只是示例曲线下的概率，不代表确定结果。
        </p>
        <p>
          <strong>提前出货：</strong>
          如果目标较早获得，未投入的抽数可以留给下一目标或保存。
          <strong> 理论边界：</strong>最坏需求 {worstLabel(result.exact.worst)}
          ，截止时可用 {available} 抽，缺口 {deficitLabel(result.exact.deficit)}
          。 预算不足时可减少目标数量或延后目标。
        </p>
        <p>
          <strong>角色 / 音擎 / 保存：</strong>
          音擎与角色保底独立。分配抽数给音擎会减少可给角色的抽数；
          保存资源则保留未来选择权。建议优先核对目标日期和收入来源，再按个人喜好取舍。
        </p>
      </div>
    </section>
  );
}
function AnalysisPage({
  data,
  plan,
  result,
  error,
  busy,
}: {
  data: AppData;
  plan: Plan;
  result: WorkerResult | null;
  error: string;
  busy: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const targets = plan.targets.filter((t) => !t.skipped);
  return (
    <>
      <Heading
        title="概率分析"
        subtitle="精确状态转移针对当前配置模型；未核验逐抽曲线时，不是官方真实概率。"
        action={
          <div className="actions">
            <button
              title="导出图片"
              disabled={!result}
              onClick={() => {
                if (ref.current)
                  void downloadImage(ref.current).catch(() =>
                    alert("导出图片失败"),
                  );
              }}
            >
              <Download size={16} />
              图片
            </button>
            <button
              title="打印或另存为 PDF"
              disabled={!result}
              onClick={() => window.print()}
            >
              <FileDown size={16} />
              PDF
            </button>
          </div>
        }
      />
      {targets.length === 0 ? (
        <p className="empty">先在目标编辑页添加目标。</p>
      ) : busy ? (
        <p className="notice" role="status">
          正在计算计划，请稍候…
        </p>
      ) : error ? (
        <p className="warning" role="alert">
          {error}
        </p>
      ) : (
        result && (
          <div ref={ref} className="print-area">
            <div className="warning">
              <ShieldAlert size={18} />
              {data.rules.modelLabel}。游戏内规则可能与示例不同，结果不是保证。
            </div>
            <div className="metrics">
              <Metric
                label="整套计划完成概率"
                value={pct(result.exact.probability)}
                detail="所有未跳过目标均完成"
              />
              <Metric
                label="平均实际投入"
                value={`${result.exact.mean.toFixed(1)} 抽`}
                detail="包含停止和失败结果"
              />
              <Metric
                label="理论最坏需求"
                value={worstLabel(result.exact.worst)}
                detail={`资源缺口 ${deficitLabel(result.exact.deficit)}`}
              />
            </div>
            <section className="band">
              <h2>每个目标</h2>
              <div className="result-list">
                {targets.map((t, i) => (
                  <div key={t.id}>
                    <span>
                      {channelName(t.channel)} · {t.name}
                    </span>
                    <strong>{pct(result.exact.targetProbabilities[i]!)}</strong>
                    <small>在其截止日期及投入上限内完成</small>
                  </div>
                ))}
              </div>
            </section>
            <section className="band">
              <h2>完成概率覆盖线</h2>
              <div className="metrics small-metrics">
                <Metric
                  label="75% 完成线"
                  value={
                    result.exact.successLines.p75 === null
                      ? "不可达"
                      : `${result.exact.successLines.p75} 抽`
                  }
                />
                <Metric
                  label="90% 完成线"
                  value={
                    result.exact.successLines.p90 === null
                      ? "不可达"
                      : `${result.exact.successLines.p90} 抽`
                  }
                />
                <Metric
                  label="95% 完成线"
                  value={
                    result.exact.successLines.p95 === null
                      ? "不可达"
                      : `${result.exact.successLines.p95} 抽`
                  }
                />
              </div>
              <p className="note">
                在截止日期、资源及投入上限内，整套计划完成率累计达到该比例所需的投入抽数。总完成率低于阈值时显示不可达。仅适用于当前配置模型，不是游戏保证。
              </p>
            </section>
            <section className="band">
              <h2>实际计划消耗分布</h2>
              <div className="metrics small-metrics">
                <Metric label="中位" value={`${result.exact.median} 抽`} />
                <Metric label="75% 分位" value={`${result.exact.p75} 抽`} />
                <Metric label="90% 分位" value={`${result.exact.p90} 抽`} />
                <Metric label="95% 分位" value={`${result.exact.p95} 抽`} />
                <Metric
                  label="模拟平均返还"
                  value={`${result.simulation.meanReturnedPulls.toFixed(1)} 抽`}
                  detail="副产物兑换所得"
                />
              </div>
              <p className="note">
                这里是当前投入上限下的<b>消耗分位</b>
                ，失败而提前停止也包含在内，不能把它当成“获得目标的保障线”。理论最坏需求单独列出。
              </p>
              <DistributionChart analysis={result.exact} />
            </section>
            <section className="band">
              <h2>计算过程与交叉验证</h2>
              <p>
                从两个频道各自的垫数与保证状态出发，逐抽枚举“未出 S / 出非限定 S
                / 出限定 S”；
                达成目标、达到上限或耗尽截止日期资源时停止。状态传播了{" "}
                {result.exact.exploredStates.toLocaleString()} 个节点。
              </p>
              <p>
                独立模拟 {result.simulation.iterations.toLocaleString()}{" "}
                次：完成率 {pct(result.simulation.probability)}， 95% Wilson
                区间 {pct(result.simulation.interval[0])}～
                {pct(result.simulation.interval[1])}； 与精确模型差距{" "}
                {pct(
                  Math.abs(
                    result.simulation.probability - result.exact.probability,
                  ),
                )}
                。 区间只反映模拟抽样误差，<b>不包含规则未知造成的误差</b>。
              </p>
              <p className="note">
                <CircleHelp size={16} />
                “90%”表示同样输入重复很多次时约九成能完成，不表示某一次必定成功。先在游戏内频道详情核对规则。
              </p>
            </section>
            <Advice data={data} plan={plan} result={result} />
          </div>
        )
      )}
    </>
  );
}
function ComparePage({
  data,
  update,
}: {
  data: AppData;
  update: (f: (d: AppData) => void) => void;
}) {
  const active = data.plans.find((p) => p.id === data.activePlanId)!;
  const [comparisons, setComparisons] = useState<
    Record<string, { analysis?: Analysis; error?: string }>
  >({});
  useEffect(() => {
    const workers: Worker[] = [];
    setComparisons({});
    for (const plan of data.plans) {
      if (!plan.targets.some((t) => !t.skipped)) continue;
      const worker = new Worker(
        new URL("../worker/analysis.worker.ts", import.meta.url),
        { type: "module" },
      );
      workers.push(worker);
      worker.onmessage = (event: MessageEvent<WorkerResult>) => {
        setComparisons((previous) => ({
          ...previous,
          [plan.id]: event.data.error
            ? { error: event.data.error }
            : { analysis: event.data.exact },
        }));
        worker.terminate();
      };
      worker.postMessage({ data, plan, token: 1 });
    }
    return () => workers.forEach((worker) => worker.terminate());
  }, [data]);
  const clone = (
    name: string,
    mode?: "conservative" | "balanced" | "aggressive",
  ) =>
    update((d) => {
      const source = d.plans.find((p) => p.id === d.activePlanId)!;
      const plan = structuredClone(source);
      plan.id = id();
      plan.name = name;
      if (mode === "conservative") {
        const ranked = [...plan.targets].sort(
          (a, b) => a.priority - b.priority,
        );
        const keep = ranked
          .slice(0, Math.max(1, Math.ceil(ranked.length / 2)))
          .map((t) => t.id);
        plan.targets.forEach((t) => {
          t.skipped = !keep.includes(t.id);
        });
      }
      if (mode === "balanced")
        plan.targets.forEach((t) => {
          t.maxPulls = Math.min(
            t.maxPulls,
            d.rules.channels[t.channel].hardPity * (t.copies + 1),
          );
        });
      if (mode === "aggressive")
        plan.targets.forEach((t) => {
          t.skipped = false;
          t.maxPulls = Math.min(
            1200,
            t.copies * d.rules.channels[t.channel].hardPity * 2,
          );
        });
      d.plans.push(plan);
      d.activePlanId = plan.id;
    });
  return (
    <>
      <Heading
        title="方案比较"
        subtitle="各方案独立计算完成率、平均投入与缺口。三种建议方案只是投入边界的不同取舍。"
        action={
          <button onClick={() => clone(`${active.name} 副本`)}>
            <Plus size={16} />
            保存副本
          </button>
        }
      />
      <div className="actions mode-actions">
        <button onClick={() => clone("保守方案", "conservative")}>保守</button>
        <button onClick={() => clone("均衡方案", "balanced")}>均衡</button>
        <button onClick={() => clone("激进方案", "aggressive")}>激进</button>
      </div>
      <div className="comparison">
        {data.plans.map((p) => (
          <div
            className={`comparison-row ${p.id === active.id ? "current" : ""}`}
            key={p.id}
          >
            <div>
              <strong>{p.name}</strong>
              <small>
                {p.targets.filter((t) => !t.skipped).length} 个参与目标 ·
                理论最大投入{" "}
                {p.targets
                  .filter((t) => !t.skipped)
                  .reduce((v, t) => v + t.maxPulls, 0)}{" "}
                抽
              </small>
              {comparisons[p.id]?.analysis ? (
                <small>
                  模型完成率 {pct(comparisons[p.id]!.analysis!.probability)} ·
                  平均 {comparisons[p.id]!.analysis!.mean.toFixed(1)} 抽 ·
                  理论缺口 {deficitLabel(comparisons[p.id]!.analysis!.deficit)}
                </small>
              ) : (
                <small>{comparisons[p.id]?.error ?? "待计算 / 无目标"}</small>
              )}
            </div>
            <div className="actions">
              <button
                onClick={() =>
                  update((d) => {
                    d.activePlanId = p.id;
                  })
                }
                aria-current={p.id === active.id ? "page" : undefined}
              >
                {p.id === active.id ? (
                  <Check size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
                {p.id === active.id ? "当前" : "选择"}
              </button>
              <button
                className="icon danger"
                title="删除方案"
                aria-label={`删除方案 ${p.name}`}
                disabled={data.plans.length < 2}
                onClick={() => {
                  if (confirm(`确定删除方案“${p.name}”？此操作不可撤销。`))
                    update((d) => {
                      d.plans = d.plans.filter((x) => x.id !== p.id);
                      if (d.activePlanId === p.id)
                        d.activePlanId = d.plans[0]!.id;
                    });
                }}
              >
                <Trash2 size={17} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="note">
        保守：只保留较高优先级的半数目标；均衡：缩小单目标投入上限；激进：恢复目标并按理论最坏需求设上限。模型成功率不是保证。
      </p>
    </>
  );
}
function SourcesPage({
  data,
  update,
}: {
  data: AppData;
  update: (f: (d: AppData) => void) => void;
}) {
  const bannerRecordSources = data.banners.filter((banner) => banner.source);
  const announcedRecordSources = data.announcedCharacters.filter(
    (character) => character.source,
  );
  const incomeSources = data.incomes.filter((income) => income.source);
  const specialRecordSources = [
    ...new Map(
      specialHistory.map((period) => [period.source, period]),
    ).values(),
  ];
  return (
    <>
      <Heading
        title="数据来源"
        subtitle={`规则记录核验日期 ${data.rules.verifiedAt}。在线公告不会静默覆盖你的本地配置。`}
      />
      <section className="band">
        <h2>来源与可信度</h2>
        <div className="source-list">
          {officialRuleSources.map((source) => (
            <div key={source.id}>
              <span>{source.name}</span>
              <strong>{source.confidence}</strong>
              <a href={source.url} target="_blank" rel="noreferrer">
                查看来源 ↗
              </a>
            </div>
          ))}
        </div>
      </section>
      <section className="band">
        <h2>运行时资料引用</h2>
        <p className="note">
          其他页面不再直接展示外部链接；卡池、特殊频道、已公布立绘和收入记录的资料引用统一在这里查看。
        </p>
        <div className="source-list">
          {bannerRecordSources.map((banner) => (
            <div key={`banner-source-${banner.id}`}>
              <span>
                卡池：{banner.name || "未命名"} · {banner.version || "未标版本"}
              </span>
              <strong>
                {banner.sourceKind === "official" ? "官方" : "手工/第三方"}
              </strong>
              <a href={banner.source} target="_blank" rel="noreferrer">
                查看来源 ↗
              </a>
            </div>
          ))}
          {specialRecordSources.map((period) => (
            <div key={`special-source-${period.id}`}>
              <span>
                特殊频道：{period.version}（{period.start} 至 {period.end}）
              </span>
              <strong>官方公告</strong>
              <a href={period.source} target="_blank" rel="noreferrer">
                查看来源 ↗
              </a>
            </div>
          ))}
          {announcedRecordSources.map((character) => (
            <div key={`announced-source-${character.id}`}>
              <span>已公布角色：{character.name}</span>
              <strong>{character.sourceName}</strong>
              <a href={character.source} target="_blank" rel="noreferrer">
                查看来源 ↗
              </a>
            </div>
          ))}
          {incomeSources.map((income) => (
            <div key={`income-source-${income.id}`}>
              <span>收入记录：{income.name}</span>
              <strong>
                {income.certainty === "confirmed" ? "已确认" : "估算"}
              </strong>
              <a href={income.source} target="_blank" rel="noreferrer">
                查看来源 ↗
              </a>
            </div>
          ))}
          {!bannerRecordSources.length &&
            !specialRecordSources.length &&
            !announcedRecordSources.length &&
            !incomeSources.length && (
              <p className="note">当前没有额外的运行时资料链接。</p>
            )}
        </div>
      </section>
      <section className="band">
        <h2>版本资源资料</h2>
        <div className="source-list">
          {versionResourceSources.map((source) => (
            <div key={source.id}>
              <span>{source.name}</span>
              <strong>手工记录</strong>
              <small>{source.description}</small>
            </div>
          ))}
        </div>
        <p className="note">
          版本资源页仅录入活动页面显示的菲林与抽数；本地计算不会把未在此页核验的外部资源数字作为默认值。
        </p>
      </section>
      <section className="band">
        <div className="section-heading">
          <div>
            <h2>卡池资料来源 · 可回滚</h2>
            <small>
              内置官方历史记录可单独停用并恢复；时间轴不再提供第三方联网来源。
            </small>
          </div>
        </div>
        <div className="comparison">
          {bannerSources.map((source) => {
            const controlsData =
              source.id === bannerHistorySourceId ||
              source.id === onlineBannerSourceId;
            const enabled = !data.bannerSync.disabledSourceIds.includes(
              source.id,
            );
            return (
              <div
                className={`comparison-row ${
                  controlsData && enabled ? "current" : ""
                }`}
                key={source.id}
              >
                <div>
                  <strong>{source.name}</strong>
                  <small>{source.confidence}</small>
                  <small>{source.summary}</small>
                  <small>最近人工检查：{source.checkedAt}</small>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    查看第三方来源 ↗
                  </a>
                </div>
                {controlsData ? (
                  <button
                    className={enabled ? "danger" : ""}
                    onClick={() => {
                      const verb = enabled ? "停用并回滚" : "重新启用";
                      if (
                        confirm(
                          `${verb}“${source.name}”？只会影响该来源写入的卡池记录。`,
                        )
                      )
                        update((current) => {
                          setBannerSourceEnabled(current, source.id, !enabled);
                        });
                    }}
                  >
                    {enabled ? <RotateCcw size={16} /> : <Check size={16} />}
                    {enabled ? "停用并回滚" : "重新启用"}
                  </button>
                ) : (
                  <span className="tag caution">仅交叉检查</span>
                )}
              </div>
            );
          })}
        </div>
      </section>
      <section className="band">
        <div className="section-heading">
          <div>
            <h2>已公布立绘资料来源 · 可回滚</h2>
            <small>
              当前默认没有把无法稳定核验的爆料写入名单；时间轴可添加带链接的资料，删除后会立即从目标下拉和预测中移除。
            </small>
          </div>
          <span className="tag">
            {data.announcedCharacters.length} 条用户补充
          </span>
        </div>
        <div className="source-list">
          {announcedCharacterSources.map((source) => (
            <div key={source.id}>
              <span>{source.name}</span>
              <strong>{source.confidence}</strong>
              <a href={source.url} target="_blank" rel="noreferrer">
                查看来源 ↗
              </a>
              <button
                className={
                  data.announcedCharacters.some(
                    (item) => item.sourceId === source.id,
                  )
                    ? "danger"
                    : ""
                }
                onClick={() =>
                  update((d) => {
                    const enabled = d.announcedCharacters.some(
                      (item) => item.sourceId === source.id,
                    );
                    if (enabled) {
                      d.announcedCharacters = d.announcedCharacters.filter(
                        (item) => item.sourceId !== source.id,
                      );
                    } else {
                      d.announcedCharacters.push(
                        ...bundledAnnouncedCharactersForSource(source.id),
                      );
                    }
                  })
                }
              >
                {data.announcedCharacters.some(
                  (item) => item.sourceId === source.id,
                )
                  ? "停用并回滚"
                  : "恢复内置资料"}
              </button>
            </div>
          ))}
        </div>
        <p className="note">
          缺少资料时请补充角色中文名、官方公告链接、公布日期、所属频道，以及官方是否已经给出版本或仅公开立绘。不同网站有冲突时，保留官方记录并删除第三方记录即可回滚。
        </p>
      </section>
      <section className="band">
        <div className="section-heading">
          <h2>第三方规则补丁 · 可独立回滚</h2>
          <span className="tag">
            已启用 {data.rules.enabledSourceIds.length} / {ruleSources.length}
          </span>
        </div>
        <p>
          开关只重置该来源声明控制的字段，不会清除资源、目标或方案。若你手动修改过同一字段，回滚也会恢复为官方基线。
        </p>
        <div className="comparison">
          {ruleSources.map((source) => {
            const enabled = data.rules.enabledSourceIds.includes(source.id);
            return (
              <div
                className={`comparison-row ${enabled ? "current" : ""}`}
                key={source.id}
              >
                <div>
                  <strong>{source.name}</strong>
                  <small>{source.confidence}</small>
                  <small>{source.summary}</small>
                  <small>控制字段：{source.appliesTo.join("、")}</small>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    查看第三方来源 ↗
                  </a>
                </div>
                <button
                  className={enabled ? "danger" : ""}
                  onClick={() => {
                    const verb = enabled ? "停用并回滚" : "启用并应用";
                    if (
                      confirm(
                        `${verb}“${source.name}”？这会重置其控制的规则字段。`,
                      )
                    )
                      update((d) => {
                        d.rules = setRuleSourceEnabled(
                          d.rules,
                          source.id,
                          !enabled,
                        );
                      });
                  }}
                >
                  {enabled ? <RotateCcw size={16} /> : <Check size={16} />}
                  {enabled ? "停用并回滚" : "启用并应用"}
                </button>
              </div>
            );
          })}
        </div>
      </section>
      <section className="band">
        <h2>模型与官方综合概率核对</h2>
        <div className="metrics small-metrics">
          {(["agent", "engine"] as Channel[]).map((channel) => {
            const rule = data.rules.channels[channel];
            return (
              <Metric
                key={channel}
                label={`${channelName(channel)} S 综合概率`}
                value={`${pct(modeledConsolidatedChance(rule))} / 官方 ${pct(rule.officialConsolidatedChance)}`}
                detail={
                  rule.rateSteps.length
                    ? "当前逐抽模型 / 官方公布值"
                    : "无软保底曲线时会产生偏差"
                }
              />
            );
          })}
        </div>
        <div className="actions">
          <button
            onClick={() => {
              if (
                confirm(
                  "恢复仅官方规则？所有第三方补丁及手工规则参数将被重置。",
                )
              )
                update((d) => {
                  d.rules = restoreOfficialRules();
                });
            }}
          >
            <ShieldAlert size={16} />
            恢复仅官方规则
          </button>
          <button
            className="danger"
            onClick={() => {
              if (
                confirm(
                  `恢复 ${legacyRules.verifiedAt} 更新前规则快照？当前规则参数将被覆盖。`,
                )
              )
                update((d) => {
                  d.rules = restoreLegacyRules();
                });
            }}
          >
            <RotateCcw size={16} />
            恢复更新前快照
          </button>
        </div>
        <p className="note">
          官方基线标识：{officialRules.profileId}；当前配置标识：
          {data.rules.profileId}。
        </p>
      </section>
      <section className="band">
        <h2>需要再次确认</h2>
        <p>
          官方没有逐抽披露软保底曲线；音擎第 65
          抽起点和两个线性增幅仍属于第三方模型。
          官方当前文字明确同类型计数累计，但跨不同限定目标的歪后保证继承仍由第三方补充。
          特殊定向频道和未来机制仍需单独核验。
        </p>
        <p className="warning">
          当前计算对所选配置是精确的，但第三方软保底曲线仍是模型，不等于官方逐抽概率表。
        </p>
      </section>
    </>
  );
}
function SettingsPage({
  data,
  update,
  replace,
  setError,
}: {
  data: AppData;
  update: (f: (d: AppData) => void) => void;
  replace: (d: AppData) => void;
  setError: (v: string) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <>
      <Heading
        title="设置"
        subtitle="全部数据保存在本设备；离线可用，不需要游戏账号。"
      />
      <section className="band">
        <h2>计算选项</h2>
        <div className="form-grid">
          <Field
            label="模拟次数"
            value={data.settings.simulations}
            min={100}
            max={200000}
            onChange={(v) =>
              update((d) => {
                d.settings.simulations = v;
              })
            }
          />
          <Field
            label="随机种子"
            value={data.settings.seed}
            max={4294967295}
            onChange={(v) =>
              update((d) => {
                d.settings.seed = v;
              })
            }
          />
        </div>
        <Toggle
          label="将未来资源累计计入可用资源（默认开启）"
          checked={data.settings.includeEstimates}
          onChange={(v) =>
            update((d) => {
              d.settings.includeEstimates = v;
            })
          }
        />
        <section className="band inset-band">
          <h3>抽卡副产物估算</h3>
          <Toggle
            label="将抽卡获得的副产物计入模拟（默认开启）"
            checked={data.settings.gachaProceeds.enabled}
            onChange={(v) =>
              update((d) => {
                d.settings.gachaProceeds.enabled = v;
              })
            }
          />
          <div className="form-grid">
            <Field
              label="角色频道每抽信号余波"
              value={data.settings.gachaProceeds.agentAfterglowPerPull}
              step={0.01}
              onChange={(v) =>
                update((d) => {
                  d.settings.gachaProceeds.agentAfterglowPerPull = v;
                })
              }
            />
            <Field
              label="角色频道每抽信号残响"
              value={data.settings.gachaProceeds.agentResidualPerPull}
              step={0.01}
              onChange={(v) =>
                update((d) => {
                  d.settings.gachaProceeds.agentResidualPerPull = v;
                })
              }
            />
            <Field
              label="音擎频道每抽信号余波"
              value={data.settings.gachaProceeds.engineAfterglowPerPull}
              step={0.01}
              onChange={(v) =>
                update((d) => {
                  d.settings.gachaProceeds.engineAfterglowPerPull = v;
                })
              }
            />
            <Field
              label="音擎频道每抽信号残响"
              value={data.settings.gachaProceeds.engineResidualPerPull}
              step={0.01}
              onChange={(v) =>
                update((d) => {
                  d.settings.gachaProceeds.engineResidualPerPull = v;
                })
              }
            />
          </div>
          <p className="note">
            按账号实际重复率填写“平均每抽”而不是单次掉落量。模拟会在每次抽取后即时累计副产物，达到兑换门槛就增加后续可用抽数；精确状态转移仍按不含未来返还的保守资源线计算。
          </p>
        </section>
        <Toggle
          label="浅色模式"
          checked={data.settings.theme === "light"}
          onChange={(v) =>
            update((d) => {
              d.settings.theme = v ? "light" : "dark";
            })
          }
        />
      </section>
      <section className="band">
        <h2>频道规则 · 可编辑</h2>
        <p className="warning">{data.rules.modelLabel}</p>
        {(["agent", "engine"] as Channel[]).map((channel) => {
          const rule = data.rules.channels[channel];
          return (
            <div className="rule-row" key={channel}>
              <h3>{channelName(channel)}频道</h3>
              <div className="form-grid">
                <Field
                  label="硬保底"
                  value={rule.hardPity}
                  min={1}
                  max={200}
                  onChange={(v) =>
                    update((d) => {
                      d.rules.channels[channel].hardPity = v;
                      d.pity[channel].count = Math.min(
                        d.pity[channel].count,
                        v - 1,
                      );
                    })
                  }
                />
                <Field
                  label="S 为当期限定的概率 %"
                  value={rule.featuredChance * 100}
                  max={100}
                  step={0.1}
                  onChange={(v) =>
                    update((d) => {
                      d.rules.channels[channel].featuredChance = v / 100;
                    })
                  }
                />
                <Field
                  label="基础单抽 S 概率 %"
                  value={rule.baseChance * 100}
                  max={100}
                  step={0.01}
                  onChange={(v) =>
                    update((d) => {
                      d.rules.channels[channel].baseChance = v / 100;
                    })
                  }
                />
              </div>
              <div className="inline-toggles">
                <Toggle
                  label="歪后下一次 S 必定限定"
                  checked={rule.guaranteeAfterMiss}
                  onChange={(v) =>
                    update((d) => {
                      d.rules.channels[channel].guaranteeAfterMiss = v;
                    })
                  }
                />
                <Toggle
                  label="跨目标继承垫数"
                  checked={rule.pityCarriesAcrossTargets}
                  onChange={(v) =>
                    update((d) => {
                      d.rules.channels[channel].pityCarriesAcrossTargets = v;
                    })
                  }
                />
                <Toggle
                  label="跨目标继承限定保证状态"
                  checked={rule.guaranteeCarriesAcrossTargets}
                  onChange={(v) =>
                    update((d) => {
                      d.rules.channels[channel].guaranteeCarriesAcrossTargets =
                        v;
                    })
                  }
                />
              </div>
              <p className="note">
                以上为普通限定频道示例机制。跨目标代表依次抽取同类型不同目标；特殊频道须另行核对，不应套用。
              </p>
              <h4>逐抽概率阶梯（示例默认空）</h4>
              {rule.rateSteps.map((step, i) => (
                <div className="step-row" key={i}>
                  <Field
                    label={`从第 ${i + 1} 阶抽数`}
                    value={step.fromPull}
                    min={1}
                    max={rule.hardPity}
                    onChange={(v) =>
                      update((d) => {
                        d.rules.channels[channel].rateSteps[i]!.fromPull = v;
                      })
                    }
                  />
                  <Field
                    label="该阶概率 %"
                    value={step.probability * 100}
                    max={100}
                    step={0.01}
                    onChange={(v) =>
                      update((d) => {
                        d.rules.channels[channel].rateSteps[i]!.probability =
                          v / 100;
                      })
                    }
                  />
                  <button
                    className="icon danger"
                    aria-label="删除概率阶梯"
                    title="删除阶梯"
                    onClick={() =>
                      update((d) => {
                        d.rules.channels[channel].rateSteps.splice(i, 1);
                      })
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  update((d) => {
                    d.rules.channels[channel].rateSteps.push({
                      fromPull: Math.max(1, rule.hardPity - 15),
                      probability: rule.baseChance,
                    });
                  })
                }
              >
                <Plus size={16} />
                添加概率阶梯
              </button>
              <p className="note">{rule.confidence}</p>
            </div>
          );
        })}
      </section>
      <section className="band">
        <h2>本地数据</h2>
        <div className="actions">
          <button onClick={() => exportJson(data)}>
            <Download size={16} />
            导出 JSON
          </button>
          <button onClick={() => file.current?.click()}>
            <Upload size={16} />
            导入 JSON
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label="选择 JSON 文件"
            onChange={async (e) => {
              const selected = e.target.files?.[0];
              if (!selected) return;
              try {
                if (selected.size > 5_000_000) throw new Error("文件大于 5 MB");
                const imported = migrate(JSON.parse(await selected.text()));
                if (
                  confirm("导入会覆盖当前本地数据，建议先导出备份。确定继续？")
                )
                  replace(imported);
              } catch (error) {
                setError(
                  `导入失败：${error instanceof Error ? error.message : String(error)}`,
                );
              }
              e.target.value = "";
            }}
          />
          <button
            onClick={() =>
              update((d) => {
                d.rules = structuredClone(initialData().rules);
              })
            }
          >
            <RotateCcw size={16} />
            恢复默认核验规则
          </button>
          <button
            className="danger"
            onClick={() => {
              if (
                confirm("确定清空全部规划、资源和规则？此操作不可撤销。") &&
                confirm("请再次确认：清空所有本地数据？")
              ) {
                void clearData()
                  .then(() => replace(initialData()))
                  .catch((e) => setError(`清空失败：${String(e)}`));
              }
            }}
          >
            <Trash2 size={16} />
            清空全部
          </button>
        </div>
        <p className="note">
          导出的 JSON
          不含账号密码。请妥善保存自己的备份；浏览器清理站点数据会删除本地规划。
        </p>
      </section>
    </>
  );
}
function HomePage({
  data,
  plan,
  result,
  setView,
}: {
  data: AppData;
  plan: Plan;
  result: WorkerResult | null;
  setView: (v: View) => void;
}) {
  const active = plan.targets.filter((t) => !t.skipped);
  const date = active.at(-1)?.stopDate ?? plusDays(60);
  return (
    <>
      <Heading
        title="抽卡规划台"
        subtitle="把资源、保底和目标放在同一张账本上。"
        action={
          <button className="primary" onClick={() => setView("targets")}>
            <Plus size={16} />
            编辑目标
          </button>
        }
      />
      <div className="warning">
        <ShieldAlert size={18} />
        概率曲线尚未由当前官方逐抽详情核验。所有成功率为可编辑配置模型估算。
      </div>
      <div className="metrics">
        <Metric
          label="当前限定抽数"
          value={currentPulls(data.resources, data.rules)}
          detail="菲林、加密母带与可兑换副产物"
        />
        <Metric
          label="截至目标日期"
          value={`${availableAt(data, date)} 抽`}
          detail={`日期 ${date}`}
        />
        <Metric
          label="目标数量"
          value={active.length}
          detail="跳过的目标不计入"
        />
        <Metric
          label="完成概率"
          value={result ? pct(result.exact.probability) : "待计算"}
          detail="仅配置模型"
        />
      </div>
      <section className="band">
        <div className="section-heading">
          <h2>当前方案 · {plan.name}</h2>
          <button onClick={() => setView("analysis")}>
            查看分析 <ChevronDown size={16} />
          </button>
        </div>
        {active.length ? (
          <div className="overview-list">
            {active.map((t, i) => (
              <div key={t.id}>
                <span className="index">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{t.name || "未命名目标"}</strong>
                  <small>
                    {channelName(t.channel)} · {t.copies} 个 · 截止 {t.stopDate}
                  </small>
                </div>
                <strong>
                  {result
                    ? pct(result.exact.targetProbabilities[i]!)
                    : "待计算"}
                </strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty">添加目标，开始一套属于自己的规划。</p>
        )}
      </section>
      <section className="band">
        <h2>频道余量</h2>
        <div className="metrics small-metrics">
          <Metric
            label="角色距离硬保底"
            value={`${data.rules.channels.agent.hardPity - data.pity.agent.count} 抽`}
          />
          <Metric
            label="音擎距离硬保底"
            value={`${data.rules.channels.engine.hardPity - data.pity.engine.count} 抽`}
          />
          <Metric
            label="估算收入"
            value={`${incomeUntil(data.incomes, date, data.rules, false).estimated.toFixed(1)} 抽`}
            detail={
              data.settings.includeEstimates ? "已选择计入" : "默认未计入"
            }
          />
        </div>
      </section>
    </>
  );
}
export default function App() {
  const { data, ready, error, update, replace, hydrate, setError } = useApp();
  const [view, setView] = useState<View>("home");
  const [moreOpen, setMoreOpen] = useState(false);
  const mobileNavigationRef = useRef<HTMLDivElement>(null);
  const plan = useMemo(
    () => data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0],
    [data],
  );
  const { result, error: calculationError, busy } = useAnalysis(data, plan);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  useEffect(() => {
    document.documentElement.dataset.theme = data.settings.theme;
  }, [data.settings.theme]);
  useEffect(() => {
    if (!moreOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !mobileNavigationRef.current?.contains(event.target)
      )
        setMoreOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [moreOpen]);
  if (!ready)
    return (
      <div className="loading" role="status">
        正在读取本地规划…
      </div>
    );
  const title = navigation.find((x) => x.id === view)?.name ?? "总览";
  return (
    <ErrorBoundary>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-mark">S/</span>
            <span>
              抽卡规划台<small>LOCAL SIGNAL LAB</small>
            </span>
          </div>
          <nav aria-label="主导航">
            {navigation.map((item) => (
              <button
                key={item.id}
                aria-current={view === item.id ? "page" : undefined}
                onClick={() => setView(item.id)}
                title={item.name}
              >
                <item.icon size={19} />
                <span>{item.name}</span>
              </button>
            ))}
          </nav>
          <div className="side-footer">
            <Archive size={16} />
            本地保存 · 离线可用
          </div>
        </aside>
        <main>
          <header className="topbar">
            <span className="breadcrumb">规划台 / {title}</span>
            <div className="top-actions">
              <span className="model-pill">
                {data.rules.enabledSourceIds.length
                  ? "官方 + 第三方模型"
                  : "仅官方规则基线"}
              </span>
              <button
                className="icon"
                title="切换深浅模式"
                aria-label="切换深浅模式"
                onClick={() =>
                  update((d) => {
                    d.settings.theme =
                      d.settings.theme === "dark" ? "light" : "dark";
                  })
                }
              >
                {data.settings.theme === "dark" ? (
                  <Sun size={18} />
                ) : (
                  <Moon size={18} />
                )}
              </button>
            </div>
          </header>
          {error && (
            <div className="warning" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="关闭错误提示">
                ×
              </button>
            </div>
          )}
          <div className="content" key={view}>
            {view === "home" && (
              <HomePage
                data={data}
                plan={plan!}
                result={result}
                setView={setView}
              />
            )}
            {view === "resources" && (
              <ResourcesPage data={data} update={update} />
            )}
            {view === "version-income" && (
              <VersionIncomePage data={data} update={update} />
            )}
            {view === "pity" && <PityPage data={data} update={update} />}
            {view === "targets" && <TargetsPage data={data} update={update} />}
            {view === "timeline" && (
              <TimelinePage data={data} update={update} />
            )}
            {view === "special" && <SpecialPage data={data} update={update} />}
            {view === "analysis" && (
              <AnalysisPage
                data={data}
                plan={plan!}
                result={result}
                error={calculationError}
                busy={busy}
              />
            )}
            {view === "compare" && <ComparePage data={data} update={update} />}
            {view === "sources" && <SourcesPage data={data} update={update} />}
            {view === "settings" && (
              <SettingsPage
                data={data}
                update={update}
                replace={replace}
                setError={setError}
              />
            )}
          </div>
        </main>
        <div className="mobile-navigation" ref={mobileNavigationRef}>
          <nav
            id="mobile-more-menu"
            className="mobile-more-menu"
            aria-label="更多页面"
            hidden={!moreOpen}
          >
            {mobileMoreNavigation.map((item) => (
              <button
                key={item.id}
                aria-current={view === item.id ? "page" : undefined}
                onClick={() => {
                  setView(item.id);
                  setMoreOpen(false);
                }}
              >
                <item.icon size={17} />
                <span>{item.name}</span>
              </button>
            ))}
          </nav>
          <nav className="mobile-nav" aria-label="手机导航">
            {mobileNavigation.map((item) => (
              <button
                key={item.id}
                aria-current={view === item.id ? "page" : undefined}
                onClick={() => {
                  setView(item.id);
                  setMoreOpen(false);
                }}
                title={item.name}
              >
                <item.icon size={19} />
                <span>{item.name}</span>
              </button>
            ))}
            <button
              aria-current={!mobilePrimaryViews.has(view) ? "page" : undefined}
              aria-expanded={moreOpen}
              aria-controls="mobile-more-menu"
              aria-label="更多页面"
              onClick={() => setMoreOpen((open) => !open)}
              title="更多"
            >
              <Ellipsis size={19} />
              <span>更多</span>
            </button>
          </nav>
        </div>
      </div>
    </ErrorBoundary>
  );
}
