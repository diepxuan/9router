"use client";

import PropTypes from "prop-types";
import Tooltip from "@/shared/components/Tooltip";

/**
 * Compact limit badge renderer for ModelRow.
 *
 * Renders small monospace pills for each present field in the resolved limits
 * object: rpm / tpm / rph / rpd / concurrency. Hover shows tooltip with the
 * numeric value + the resolution source chain so Sếp/operator can debug.
 *
 * Fork-layer component (src/diepxuan/) — does not touch base upstream files.
 */
function fmt(n) {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return `${n}`;
}

const FIELD_META = {
  rpm: { label: "rpm", desc: "Requests / minute" },
  tpm: { label: "tpm", desc: "Tokens / minute" },
  rph: { label: "rph", desc: "Requests / hour" },
  rpd: { label: "rpd", desc: "Requests / day" },
  concurrency: { label: "cc", desc: "Max concurrent" },
};

export default function ModelLimitBadge({ limits }) {
  if (!limits || typeof limits !== "object") return null;
  const fields = ["rpm", "tpm", "rph", "rpd", "concurrency"];
  const active = fields.filter((k) => Number.isFinite(limits[k]) && limits[k] > 0);
  if (active.length === 0) return null;

  const source = limits.source || "registry";
  const policy = limits.policy ? `, policy=${limits.policy}` : "";
  const tooltipText = active
    .map((k) => `${FIELD_META[k].desc}: ${limits[k]}`)
    .join("\n") + `\nsource: ${source}${policy}`;

  return (
    <Tooltip text={tooltipText}>
      <span className="inline-flex items-center gap-0.5 cursor-help text-[9px] text-text-muted/70">
        {active.map((k) => (
          <span
            key={k}
            className="inline-flex items-center gap-0.5 rounded border border-text-muted/20 px-1 font-mono"
          >
            <span className="opacity-60">{FIELD_META[k].label}</span>
            <span>{fmt(limits[k])}</span>
         </span>
        ))}
     </span>
   </Tooltip>
  );
}

ModelLimitBadge.propTypes = {
  limits: PropTypes.shape({
    rpm: PropTypes.number,
    tpm: PropTypes.number,
    rph: PropTypes.number,
    rpd: PropTypes.number,
    concurrency: PropTypes.number,
    policy: PropTypes.string,
    source: PropTypes.string,
  }),
};
