import type {
  CapabilityCatalogDto,
  CapabilityDto,
  CapabilityStatus,
  CapabilityType,
} from "../api/capabilities.js";

interface CapabilityPanelProps {
  catalog?: CapabilityCatalogDto;
  loading: boolean;
  error?: string;
  onRetry: () => void;
}

function typeLabel(type: CapabilityType): string {
  if (type === "tool") return "Tool";
  return "Skill";
}

function statusLabel(status: CapabilityStatus): string {
  if (status === "available") return "可用";
  return "规划中";
}

function capabilityCounts(catalog?: CapabilityCatalogDto): {
  toolCount: number;
  skillReady: boolean;
} {
  const capabilities = catalog?.capabilities ?? [];
  return {
    toolCount: capabilities.filter(
      (capability) => capability.type === "tool" && capability.enabled,
    ).length,
    skillReady: Boolean(catalog?.supportedTypes.includes("skill")),
  };
}

function CapabilityRow({ capability }: { capability: CapabilityDto }) {
  return (
    <li className="capability-row">
      <div className="capability-row-main">
        <span className="capability-name">{capability.displayName}</span>
        <span className="capability-description">{capability.description}</span>
      </div>
      <div className="capability-meta">
        <span className={`capability-type capability-type-${capability.type}`}>
          {typeLabel(capability.type)}
        </span>
        <span className={`capability-status capability-status-${capability.status}`}>
          {statusLabel(capability.status)}
        </span>
      </div>
    </li>
  );
}

export function CapabilityPanel({
  catalog,
  loading,
  error,
  onRetry,
}: CapabilityPanelProps) {
  const capabilities = catalog?.capabilities ?? [];
  const counts = capabilityCounts(catalog);

  return (
    <aside className="capability-panel" aria-label="能力中心">
      <div className="capability-header">
        <span>能力中心</span>
        <span className="capability-version">
          {catalog?.schemaVersion ?? "capability.v1"}
        </span>
      </div>

      {error && (
        <div className="capability-error">
          <span>{error}</span>
          <button type="button" onClick={onRetry}>
            重试
          </button>
        </div>
      )}

      {loading && <div className="capability-loading">加载中...</div>}

      {!loading && !error && (
        <>
          <div className="capability-metrics">
            <div>
              <strong>{counts.toolCount}</strong>
              <span>Tools</span>
            </div>
            <div>
              <strong>{counts.skillReady ? "Skill" : "-"}</strong>
              <span>Next</span>
            </div>
          </div>

          <ol className="capability-list">
            {capabilities.map((capability) => (
              <CapabilityRow capability={capability} key={capability.id} />
            ))}
          </ol>

          {capabilities.length === 0 && (
            <div className="capability-empty">暂无可用能力</div>
          )}

          {counts.skillReady && (
            <div className="skill-extension-slot">
              <span>Skill</span>
              <strong>扩展位已预留</strong>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
