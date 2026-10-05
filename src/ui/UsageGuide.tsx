import { useEffect, useRef } from "react";
import { CircleHelp, X } from "lucide-react";

export const guideStartupLabel = "下次打开网页时自动显示使用指引";
const steps = [
  {
    title: "填写当前资源",
    detail:
      "在「当前资源」录入菲林、加密母带及可兑换副产物。原装母带不能用于限定频道；金额预算不会自动换算成抽数。",
  },
  {
    title: "确认卡池状态",
    detail:
      "在「卡池状态」分别填写角色与音擎的当前垫数、限定保证。特殊频道请到「特殊频道」独立配置，不要直接套用普通限定状态。",
  },
  {
    title: "添加并排序目标",
    detail:
      "在「目标编辑」添加角色或音擎，设置数量、限额与截止日期，并按实际抽取顺序排序。未来卡池候选只是预测，请核对官方公告。",
  },
  {
    title: "核对未来收入",
    detail:
      "在「版本资源」和「版本时间轴」检查领取进度、月卡与收入；未来资源默认计入，请按实际资格调整，避免重复计算已领取资源。",
  },
  {
    title: "查看分析与比较",
    detail:
      "在「概率分析」查看整套计划完成概率、缺口与消耗分布，在「方案比较」比较不同安排。结果只适用于当前配置模型，不保证抽卡成功。",
  },
  {
    title: "保存与备份",
    detail:
      "规划会自动保存在当前浏览器。请在「设置」定期导出 JSON 备份，换设备时可导入；清除站点数据会删除本地规划与指引偏好。",
  },
];

export function UsageGuide({
  showOnStartup,
  onShowOnStartupChange,
  onClose,
}: {
  showOnStartup: boolean;
  onShowOnStartupChange: (value: boolean) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    // 原生模态对话框隔离背景；显式恢复焦点以兼容 React 卸载和 StrictMode。
    dialog.showModal();
    headingRef.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="usage-guide"
      aria-labelledby="usage-guide-title"
      aria-describedby="usage-guide-description"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
          ),
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        const focused = document.activeElement;
        if (
          event.shiftKey &&
          (focused === first || !controls.includes(focused as HTMLElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (focused === last || !controls.includes(focused as HTMLElement))
        ) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="guide-layout">
        <header className="guide-header">
          <div>
            <span className="guide-kicker">
              <CircleHelp size={16} /> 开始你的抽卡规划
            </span>
            <h2 id="usage-guide-title" ref={headingRef} tabIndex={-1}>
              使用指引
            </h2>
            <p id="usage-guide-description">
              先核对资源与保底，再安排目标。无需游戏账号，也不需要密码或令牌。
            </p>
          </div>
          <button
            className="icon"
            aria-label="关闭使用指引"
            title="关闭使用指引"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div
          className="guide-body"
          role="region"
          tabIndex={0}
          aria-label="指引内容"
        >
          <ol className="guide-steps">
            {steps.map((step, index) => (
              <li key={step.title}>
                <span className="guide-step-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="guide-caution">
            非官方工具：请在「数据来源」核对规则与资料日期。第三方软保底拟合、未来收入和复刻预测不等于官方承诺。
          </p>
        </div>
        <footer className="guide-footer">
          <div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={showOnStartup}
                onChange={(event) =>
                  onShowOnStartupChange(event.target.checked)
                }
              />
              <span>{guideStartupLabel}</span>
            </label>
            <p>随时可从页面右上角「使用指引」或「设置」重新打开。</p>
          </div>
          <button className="primary" onClick={onClose}>
            开始规划
          </button>
        </footer>
      </div>
    </dialog>
  );
}
