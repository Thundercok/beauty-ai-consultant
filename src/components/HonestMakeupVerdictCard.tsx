import React from "react";
import { AlertTriangle, CheckCircle2, Info, Sparkles, XCircle } from "lucide-react";
import type {
  AuditCheckStatus,
  HonestMakeupAuditResult,
  HonestVerdictTier,
} from "../lib/beauty/honestMakeupAudit";

interface HonestMakeupVerdictCardProps {
  audit: HonestMakeupAuditResult;
  onApplyBestAiPair?: () => void;
  showAiPairCta?: boolean;
}

const TIER_TEXT_STYLES: Record<HonestVerdictTier, string> = {
  buy: "text-emerald-700",
  conditional: "text-amber-700",
  risky: "text-rose-700",
  skip: "text-rose-700",
};

const TIER_BAR_STYLES: Record<HonestVerdictTier, string> = {
  buy: "bg-emerald-600",
  conditional: "bg-amber-500",
  risky: "bg-rose-600",
  skip: "bg-rose-700",
};

function renderStatusIcon(status: AuditCheckStatus) {
  if (status === "pass") {
    return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />;
  }
  if (status === "warn") {
    return <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-hidden="true" />;
  }
  return <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" aria-hidden="true" />;
}

function statusTextClass(status: AuditCheckStatus): string {
  if (status === "pass") return "text-emerald-700";
  if (status === "warn") return "text-amber-700";
  return "text-rose-700";
}

export const HonestMakeupVerdictCard: React.FC<HonestMakeupVerdictCardProps> = ({
  audit,
  onApplyBestAiPair,
  showAiPairCta = false,
}) => {
  const needsCorrection =
    audit.verdictTier === "risky" ||
    audit.verdictTier === "skip" ||
    audit.checks.some((c) => c.status === "fail");

  return (
    <section
      data-testid="honest-makeup-audit"
      data-verdict-tier={audit.verdictTier}
      data-honest-score={audit.overallScore}
      aria-label="Đánh giá thẳng thắn màu son và phấn má"
      className="bg-white rounded-3xl border border-zinc-200/85 p-5 sm:p-6 space-y-4 shadow-[0_2px_16px_rgba(0,0,0,0.03)]"
    >
      {/* Editorial Header + Real Un-Floored Score */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-xs font-medium text-zinc-500">
            Đánh giá thẳng thắn · Đo theo sắc da &amp; nền môi thật
          </div>
          <div
            className={`text-xs font-bold tabular-nums inline-flex items-center gap-1.5 ${
              TIER_TEXT_STYLES[audit.verdictTier]
            }`}
          >
            <span>{audit.overallScore}/100</span>
            <span aria-hidden="true">·</span>
            <span>{audit.verdictTagVi}</span>
          </div>
        </div>

        {/* Hairline Score Bar */}
        <div className="h-1.5 w-full rounded-full bg-zinc-100 overflow-hidden" aria-hidden="true">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              TIER_BAR_STYLES[audit.verdictTier]
            }`}
            style={{ width: `${audit.overallScore}%` }}
          />
        </div>

        <div className="space-y-1 pt-0.5">
          <h2 className="text-sm sm:text-base font-bold tracking-tight text-zinc-950 leading-snug">
            {audit.headlineVi}
          </h2>
          <p className="text-xs text-zinc-700 leading-relaxed">{audit.brutalSummaryVi}</p>
        </div>
      </div>

      {/* Structured Colorimetric Check Rows */}
      <div className="divide-y divide-zinc-100 border-t border-zinc-100">
        {audit.checks.map((check) => (
          <div key={check.id} className="py-2.5 space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-zinc-600">{check.label}</span>
              <span
                className={`font-semibold inline-flex items-center gap-1 shrink-0 ${statusTextClass(
                  check.status
                )}`}
              >
                {renderStatusIcon(check.status)}
                <span>{check.verdictShort}</span>
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-zinc-500 leading-relaxed">
              {check.detailVi}
            </p>
          </div>
        ))}
      </div>

      {/* Actionable Advice + Instant AI Best-Pair Fix when Clashing */}
      <div className="pt-3 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-zinc-800 leading-relaxed">
          <span className="font-semibold text-zinc-950">Lời khuyên thật: </span>
          {audit.actionableTipVi}
        </p>

        {onApplyBestAiPair && (needsCorrection || showAiPairCta) && (
          <button
            type="button"
            data-testid="apply-best-ai-pair-btn"
            onClick={onApplyBestAiPair}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Dùng cặp AI chuẩn nhất</span>
          </button>
        )}
      </div>

      {/* Radical Transparency: Photo Lighting & Measurement Caveat */}
      {audit.measurementCaveatVi && (
        <div className="pt-2.5 border-t border-zinc-100 flex items-start gap-2 text-[11px] text-zinc-500 leading-relaxed">
          <Info className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{audit.measurementCaveatVi}</span>
        </div>
      )}
    </section>
  );
};
