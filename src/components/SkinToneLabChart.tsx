import React, { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import {
  analyzeSkinLabVariance,
  type FacialZoneLabPoint,
  type IdealNeutralReference,
  type SkinPixelLabSample,
  type ZoneLuminanceRole,
} from "../lib/beauty/skinLabVariance";
import type { ConsultationReport, FaceLandmarksBox } from "../lib/beauty/types";

interface SkinToneLabChartProps {
  report: ConsultationReport;
  faceBox: FaceLandmarksBox;
}

type ChartMode = "luminance" | "channels" | "scatter";

function formatSigned(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
}

const ROLE_LABELS: Record<FacialZoneLabPoint["role"], { text: string; toneClass: string }> = {
  highlight: { text: "Highlight tự nhiên", toneClass: "text-amber-700" },
  neutral: { text: "Cân bằng trung tính", toneClass: "text-emerald-700" },
  shadow: { text: "Shadow tự nhiên", toneClass: "text-[#525252]" },
};

interface TooltipPayloadEntry<T> {
  payload?: T;
}

const ZoneTooltip: React.FC<{
  active?: boolean;
  payload?: Array<TooltipPayloadEntry<FacialZoneLabPoint>>;
  idealNeutral: IdealNeutralReference;
}> = ({ active, payload, idealNeutral }) => {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  const roleMeta = ROLE_LABELS[item.role];

  return (
    <div className="bg-white border border-[#D4D4D4] shadow-lg p-3 max-w-[265px] text-xs space-y-2">
      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[#EFEFEF]">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-4 h-4 rounded-[2px] border border-black/15 shrink-0"
            style={{ backgroundColor: item.hex }}
            aria-hidden="true"
          />
          <span className="font-bold text-[#111111] truncate">{item.labelVi}</span>
        </div>
        <span className={`text-[10px] font-semibold whitespace-nowrap ${roleMeta.toneClass}`}>
          {roleMeta.text}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 font-mono tabular-nums text-[11px]">
        <div>
          <div className="text-[10px] font-sans text-[#737373]">L* (Sáng)</div>
          <div className="font-semibold text-[#111111]">{item.L.toFixed(1)}</div>
          <div className="text-[10px] text-[#525252]">{formatSigned(item.deltaL)}</div>
        </div>
        <div>
          <div className="text-[10px] font-sans text-[#737373]">a* (Đỏ)</div>
          <div className="font-semibold text-[#111111]">{item.a.toFixed(1)}</div>
          <div className="text-[10px] text-[#DC2626]">{formatSigned(item.deltaA)}</div>
        </div>
        <div>
          <div className="text-[10px] font-sans text-[#737373]">b* (Vàng)</div>
          <div className="font-semibold text-[#111111]">{item.b.toFixed(1)}</div>
          <div className="text-[10px] text-amber-700">{formatSigned(item.deltaB)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-[#666666] pt-1 border-t border-[#F5F5F5]">
        <span>
          Lệch chuẩn ΔE: <strong className="text-[#111111]">{item.deltaE.toFixed(1)}</strong>
        </span>
        <span>Chuẩn L* {idealNeutral.L.toFixed(1)}</span>
      </div>

      <p className="text-[11px] text-[#404040] leading-snug">{item.makeupNoteVi}</p>
    </div>
  );
};

interface ScatterDatum {
  a: number;
  b: number;
  L: number;
  hex: string;
  title: string;
  subtitle: string;
  deltaL: number;
  deltaA: number;
  deltaB: number;
  role: ZoneLuminanceRole;
  kind: "pixel" | "zone" | "ideal";
}

const ChromaticityTooltip: React.FC<{
  active?: boolean;
  payload?: Array<TooltipPayloadEntry<ScatterDatum>>;
}> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;

  return (
    <div className="bg-white border border-[#D4D4D4] shadow-lg p-2.5 max-w-[230px] text-xs space-y-1.5">
      <div className="flex items-center gap-2">
        <span
          className="w-3.5 h-3.5 rounded-[2px] border border-black/15 shrink-0"
          style={{ backgroundColor: pt.hex }}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <div className="font-semibold text-[#111111] truncate">{pt.title}</div>
          <div className="text-[10px] text-[#666666] truncate">{pt.subtitle}</div>
        </div>
      </div>
      <div className="font-mono tabular-nums text-[11px] text-[#262626] flex items-center gap-2.5">
        <span>L* {pt.L.toFixed(1)}</span>
        <span>a* {pt.a.toFixed(1)}</span>
        <span>b* {pt.b.toFixed(1)}</span>
      </div>
      {pt.kind !== "ideal" && (
        <div className="font-mono tabular-nums text-[10px] text-[#666666]">
          So với trung tính: ΔL {formatSigned(pt.deltaL)} · Δa {formatSigned(pt.deltaA)} · Δb{" "}
          {formatSigned(pt.deltaB)}
        </div>
      )}
    </div>
  );
};

export const SkinToneLabChart: React.FC<SkinToneLabChartProps> = ({ report, faceBox }) => {
  const [mode, setMode] = useState<ChartMode>("luminance");

  const analysis = useMemo(() => analyzeSkinLabVariance(report, faceBox), [report, faceBox]);

  const { lDomain, deltaDomain, aDomain, bDomain } = useMemo(() => {
    const { zones, pixelCloud, idealNeutral } = analysis;
    const allL = [idealNeutral.L, ...zones.map((z) => z.L)];
    const minL = Math.max(0, Math.floor(Math.min(...allL) - 7));
    const maxL = Math.min(100, Math.ceil(Math.max(...allL) + 7));

    const allDeltas = zones.flatMap((z) => [z.deltaL, z.deltaA, z.deltaB]);
    const maxAbsDelta = Math.max(6, Math.ceil(Math.max(4, ...allDeltas.map(Math.abs)) + 2));

    const allA = [idealNeutral.a, ...zones.map((z) => z.a), ...pixelCloud.map((p) => p.a)];
    const allB = [idealNeutral.b, ...zones.map((z) => z.b), ...pixelCloud.map((p) => p.b)];
    const minA = Math.floor(Math.min(...allA) - 3);
    const maxA = Math.ceil(Math.max(...allA) + 3);
    const minB = Math.floor(Math.min(...allB) - 3);
    const maxB = Math.ceil(Math.max(...allB) + 3);

    return {
      lDomain: [minL, maxL] as [number, number],
      deltaDomain: [-maxAbsDelta, maxAbsDelta] as [number, number],
      aDomain: [minA, maxA] as [number, number],
      bDomain: [minB, maxB] as [number, number],
    };
  }, [analysis]);

  const scatterPixels = useMemo<ScatterDatum[]>(
    () =>
      analysis.pixelCloud.map((p: SkinPixelLabSample) => ({
        a: p.a,
        b: p.b,
        L: p.L,
        hex: p.hex,
        title: p.regionVi,
        subtitle: ROLE_LABELS[p.role].text,
        deltaL: p.deltaL,
        deltaA: p.deltaA,
        deltaB: p.deltaB,
        role: p.role,
        kind: "pixel",
      })),
    [analysis.pixelCloud]
  );

  const scatterZones = useMemo<ScatterDatum[]>(
    () =>
      analysis.zones.map((z) => ({
        a: z.a,
        b: z.b,
        L: z.L,
        hex: z.hex,
        title: z.labelVi,
        subtitle: `Trung bình vùng (${z.sampleCount} px)`,
        deltaL: z.deltaL,
        deltaA: z.deltaA,
        deltaB: z.deltaB,
        role: z.role,
        kind: "zone",
      })),
    [analysis.zones]
  );

  const scatterIdeal = useMemo<ScatterDatum[]>(
    () => [
      {
        a: analysis.idealNeutral.a,
        b: analysis.idealNeutral.b,
        L: analysis.idealNeutral.L,
        hex: analysis.idealNeutral.hex,
        title: "Màu trung tính lý tưởng",
        subtitle: `Mốc cân bằng Hue ${analysis.idealNeutral.hueDeg}°`,
        deltaL: 0,
        deltaA: 0,
        deltaB: 0,
        role: "neutral",
        kind: "ideal",
      },
    ],
    [analysis.idealNeutral]
  );

  if (!analysis.hasData) {
    return (
      <section
        data-testid="skin-lab-variance-chart"
        className="bg-[#FAFAFA] border border-[#E5E5E5] p-4 sm:p-5 text-xs text-[#666666]"
      >
        Chưa đủ điểm da sạch để vẽ biểu đồ phân bố CIELAB (L*, a*, b*). Hãy chọn ảnh rõ mặt hơn hoặc điều chỉnh khung vùng đo.
      </section>
    );
  }

  const { idealNeutral, zones, brightestZone, darkestZone, luminanceSpread, meanDeltaE } = analysis;

  return (
    <section
      data-testid="skin-lab-variance-chart"
      aria-label="Biểu đồ phân bố sắc da L*, a*, b* trên khuôn mặt"
      className="bg-white border border-[#E5E5E5] flex flex-col divide-y divide-[#E5E5E5] h-full"
    >
      {/* Header & Mode Switcher */}
      <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="metric-label">Biến thiên sắc da (L* · a* · b*)</div>
          <h2 className="text-lg sm:text-xl font-bold text-[#0A0A0A] tracking-[-0.025em] leading-tight">
            Vùng sáng &amp; bóng tự nhiên trên mặt
          </h2>
        </div>

        <div
          role="tablist"
          aria-label="Chọn góc nhìn biểu đồ sắc da"
          className="grid grid-cols-3 sm:inline-flex items-center gap-0.5 p-0.5 bg-[#EFEFEF] rounded-[4px] shrink-0"
        >
          {(
            [
              ["luminance", "Sáng / Tối"],
              ["channels", "Đỏ & Vàng"],
              ["scatter", "Phân bố a–b"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              data-testid={`lab-chart-mode-${id}`}
              onClick={() => setMode(id)}
              className={`min-w-0 min-h-[32px] px-2.5 py-1 text-[11px] rounded-[3px] whitespace-nowrap transition-colors cursor-pointer ${
                mode === id
                  ? "bg-white text-[#0A0A0A] font-semibold shadow-2xs"
                  : "text-[#666666] hover:text-[#0A0A0A] font-medium"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Consistent 3-Column Display-Sans KPI Strip */}
      <div className="grid grid-cols-3 divide-x divide-[#E5E5E5] bg-[#FAFAFA]">
        <div className="px-4 sm:px-5 py-3.5 space-y-1">
          <div className="metric-label truncate">Chuẩn trung tính L*</div>
          <div className="metric-display-sm text-xl sm:text-2xl font-bold text-[#0A0A0A]">
            {idealNeutral.L.toFixed(1)}
          </div>
        </div>
        <div className="px-4 sm:px-5 py-3.5 space-y-1">
          <div className="metric-label truncate">Biên độ sáng ΔL*</div>
          <div className="metric-display-sm text-xl sm:text-2xl font-bold text-[#0A0A0A]">
            {luminanceSpread.toFixed(1)}
          </div>
        </div>
        <div className="px-4 sm:px-5 py-3.5 space-y-1">
          <div className="metric-label truncate">Lệch màu ΔE TB</div>
          <div className="metric-display-sm text-xl sm:text-2xl font-bold text-[#DC2626]">
            {meanDeltaE.toFixed(1)}
          </div>
        </div>
      </div>

      {/* Main Recharts Canvas (Zero Nested Card Border) */}
      <div className="p-4 sm:p-5 space-y-3 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#525252]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {mode === "luminance" && (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-2.5 rounded-[2px] border border-[#111111]/40 bg-[#D7A994]" />
                  <span>Độ sáng L*</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 border-t-2 border-dashed border-[#111111]" />
                  <span className="font-mono tabular-nums">
                    Chuẩn trung tính (L* {idealNeutral.L.toFixed(1)})
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 border-t-2 border-[#DC2626]" />
                  <span>Độ lệch màu ΔE</span>
                </span>
              </>
            )}
            {mode === "channels" && (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-[#111111]" />
                  <span>ΔL* (Sáng / Tối)</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-[#DC2626]" />
                  <span>Δa* (Ửng đỏ)</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-[#D97706]" />
                  <span>Δb* (Vàng ấm)</span>
                </span>
              </>
            )}
            {mode === "scatter" && (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#C49A84] opacity-70" />
                  <span>Đám mây điểm da ({scatterPixels.length} mẫu)</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full border-2 border-[#111111] bg-[#D7A994]" />
                  <span>Tâm 8 vùng khuôn mặt</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-[#DC2626] ring-2 ring-[#DC2626]/25" />
                  <span className="font-mono tabular-nums">
                    Mốc trung tính ({idealNeutral.a.toFixed(1)}, {idealNeutral.b.toFixed(1)})
                  </span>
                </span>
              </>
            )}
          </div>

          {mode !== "luminance" && (
            <span className="font-mono tabular-nums text-[11px] text-[#737373]">
              {mode === "channels"
                ? "Mốc 0 = Màu trung tính lý tưởng"
                : "Trục a* (Hồng/Đỏ) × b* (Vàng/Ấm)"}
            </span>
          )}
        </div>

        <div className="h-[290px] sm:h-[320px] w-full" data-testid={`lab-chart-canvas-${mode}`}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            {mode === "luminance" ? (
              <ComposedChart
                data={zones}
                margin={{ top: 22, right: 14, left: 2, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEF" vertical={false} />
                <ReferenceArea
                  yAxisId="left"
                  y1={Math.min(lDomain[1], idealNeutral.L + 2.2)}
                  y2={lDomain[1]}
                  fill="#FEF3C7"
                  fillOpacity={0.38}
                />
                <ReferenceArea
                  yAxisId="left"
                  y1={lDomain[0]}
                  y2={Math.max(lDomain[0], idealNeutral.L - 2.2)}
                  fill="#F4F4F5"
                  fillOpacity={0.75}
                />
                <XAxis
                  dataKey="shortLabelVi"
                  tick={{ fontSize: 10.5, fill: "#404040" }}
                  axisLine={{ stroke: "#E5E5E5" }}
                  tickLine={false}
                  interval={0}
                  angle={-28}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  yAxisId="left"
                  domain={lDomain}
                  tick={{ fontSize: 11, fill: "#525252", fontFamily: "JetBrains Mono, monospace" }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                  label={{
                    value: "L*",
                    position: "top",
                    offset: 8,
                    style: { fontSize: 11, fill: "#111111", fontWeight: 700 },
                  }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, (dataMax: number) => Math.max(12, Math.ceil(dataMax + 3))]}
                  tick={{ fontSize: 10.5, fill: "#DC2626", fontFamily: "JetBrains Mono, monospace" }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                  label={{
                    value: "ΔE",
                    position: "top",
                    offset: 8,
                    style: { fontSize: 11, fill: "#DC2626", fontWeight: 700 },
                  }}
                />
                <Tooltip
                  content={<ZoneTooltip idealNeutral={idealNeutral} />}
                  cursor={{ fill: "rgba(17,17,17,0.04)" }}
                />
                <ReferenceLine
                  yAxisId="left"
                  y={idealNeutral.L}
                  stroke="#111111"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  label={{
                    value: `Trung tính L* ${idealNeutral.L.toFixed(1)}`,
                    position: "insideTopRight",
                    fill: "#111111",
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                />
                <Bar
                  yAxisId="left"
                  dataKey="L"
                  name="Độ sáng L*"
                  barSize={26}
                  radius={[3, 3, 0, 0]}
                  stroke="#111111"
                  strokeOpacity={0.35}
                  strokeWidth={1}
                  animationDuration={300}
                >
                  {zones.map((entry) => (
                    <Cell key={entry.id} fill={entry.hex} />
                  ))}
                </Bar>
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="deltaE"
                  name="Độ lệch ΔE"
                  stroke="#DC2626"
                  strokeWidth={2}
                  animationDuration={300}
                  dot={{ r: 3.5, fill: "#FFFFFF", stroke: "#DC2626", strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: "#DC2626", stroke: "#FFFFFF", strokeWidth: 2 }}
                />
              </ComposedChart>
            ) : mode === "channels" ? (
              <BarChart
                data={zones}
                margin={{ top: 18, right: 12, left: 0, bottom: 10 }}
                barGap={2}
                barCategoryGap="20%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEF" vertical={false} />
                <XAxis
                  dataKey="shortLabelVi"
                  tick={{ fontSize: 10.5, fill: "#404040" }}
                  axisLine={{ stroke: "#E5E5E5" }}
                  tickLine={false}
                  interval={0}
                  angle={-28}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  domain={deltaDomain}
                  tick={{ fontSize: 11, fill: "#525252", fontFamily: "JetBrains Mono, monospace" }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  tickFormatter={(v: number) => (v > 0 ? `+${v}` : `${v}`)}
                />
                <Tooltip
                  content={<ZoneTooltip idealNeutral={idealNeutral} />}
                  cursor={{ fill: "rgba(17,17,17,0.04)" }}
                />
                <ReferenceLine y={0} stroke="#111111" strokeWidth={1.5} />
                <Bar dataKey="deltaL" name="ΔL* (Sáng/Tối)" fill="#111111" radius={[2, 2, 0, 0]} animationDuration={300} />
                <Bar dataKey="deltaA" name="Δa* (Ửng đỏ)" fill="#DC2626" radius={[2, 2, 0, 0]} animationDuration={300} />
                <Bar dataKey="deltaB" name="Δb* (Vàng ấm)" fill="#D97706" radius={[2, 2, 0, 0]} animationDuration={300} />
              </BarChart>
            ) : (
              <ScatterChart margin={{ top: 14, right: 18, left: -8, bottom: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEF" />
                <XAxis
                  type="number"
                  dataKey="a"
                  name="a* (Hồng/Đỏ)"
                  domain={aDomain}
                  tick={{ fontSize: 11, fill: "#525252", fontFamily: "JetBrains Mono, monospace" }}
                  axisLine={{ stroke: "#E5E5E5" }}
                  tickLine={false}
                  label={{
                    value: "a* (Ánh hồng / ửng đỏ →)",
                    position: "insideBottom",
                    offset: -10,
                    style: { fontSize: 11, fill: "#525252" },
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="b"
                  name="b* (Vàng/Ấm)"
                  domain={bDomain}
                  tick={{ fontSize: 11, fill: "#525252", fontFamily: "JetBrains Mono, monospace" }}
                  axisLine={false}
                  tickLine={false}
                  width={46}
                  label={{
                    value: "b* (Vàng ↑)",
                    angle: -90,
                    position: "insideLeft",
                    offset: 16,
                    style: { fontSize: 11, fill: "#525252" },
                  }}
                />
                <ZAxis range={[36, 36]} />
                <Tooltip
                  content={<ChromaticityTooltip />}
                  cursor={{ strokeDasharray: "3 3", stroke: "#A3A3A3" }}
                />
                <ReferenceLine
                  x={idealNeutral.a}
                  stroke="#111111"
                  strokeDasharray="4 4"
                  strokeOpacity={0.55}
                />
                <ReferenceLine
                  y={idealNeutral.b}
                  stroke="#111111"
                  strokeDasharray="4 4"
                  strokeOpacity={0.55}
                />
                {/* Sampled skin pixel cloud */}
                <Scatter name="Điểm da toàn mặt" data={scatterPixels} isAnimationActive={false}>
                  {scatterPixels.map((pt, idx) => (
                    <Cell
                      key={`px-${idx}`}
                      fill={pt.hex}
                      fillOpacity={0.58}
                      stroke={pt.role === "highlight" ? "#D97706" : pt.role === "shadow" ? "#404040" : "none"}
                      strokeWidth={pt.role === "neutral" ? 0 : 0.75}
                    />
                  ))}
                </Scatter>
                {/* 8 anatomical zone centroids */}
                <Scatter name="Tâm 8 vùng mặt" data={scatterZones} isAnimationActive={false}>
                  {scatterZones.map((pt) => (
                    <Cell
                      key={`zn-${pt.title}`}
                      fill={pt.hex}
                      stroke="#111111"
                      strokeWidth={2}
                      r={6.5}
                    />
                  ))}
                </Scatter>
                {/* Ideal neutral reference crosshair target */}
                <Scatter name="Màu trung tính lý tưởng" data={scatterIdeal} isAnimationActive={false}>
                  <Cell fill="#DC2626" stroke="#FFFFFF" strokeWidth={2.5} r={7.5} />
                </Scatter>
              </ScatterChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Highlight / Shadow zone interpretation caption */}
        {mode === "luminance" && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#F0F0F0] text-[11px] text-[#666666]">
            <span>
              <strong className="text-amber-700 font-semibold">Vùng nền vàng nhạt (phía trên):</strong>{" "}
              Vùng bắt sáng tự nhiên (Highlight, ΔL* ≥ +2.2)
            </span>
            <span>
              <strong className="text-[#404040] font-semibold">Vùng nền xám nhạt (phía dưới):</strong>{" "}
              Vùng đổ bóng tạo khối (Shadow, ΔL* ≤ −2.2)
            </span>
          </div>
        )}
      </div>

      {/* Bottom 3-Column Comparison Strip: Brightest Highlight vs Ideal Neutral vs Deepest Shadow */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#E5E5E5] bg-[#FAFAFA]">
        {brightestZone && (
          <div className="px-4 py-3.5 space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="metric-label">Sáng nhất</span>
              <span className="font-display tabular-nums text-sm font-bold text-[#B45309]">
                {formatSigned(brightestZone.deltaL)} L*
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <span
                className="w-6 h-6 border border-black/15 shrink-0"
                style={{ backgroundColor: brightestZone.hex }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#0A0A0A] truncate">
                  {brightestZone.labelVi}
                </div>
                <div className="font-mono tabular-nums text-[10px] text-[#737373]">
                  L* {brightestZone.L.toFixed(1)} · a* {brightestZone.a.toFixed(1)}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="px-4 py-3.5 space-y-1.5 bg-white">
          <div className="flex items-baseline justify-between gap-2">
            <span className="metric-label">Mốc trung tính</span>
            <span className="font-display tabular-nums text-sm font-bold text-[#0A0A0A]">
              {idealNeutral.hueDeg}°
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <span
              className="w-6 h-6 border border-black/15 shrink-0"
              style={{ backgroundColor: idealNeutral.hex }}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#0A0A0A] truncate">
                Sắc da cân bằng
              </div>
              <div className="font-mono tabular-nums text-[10px] text-[#737373]">
                L* {idealNeutral.L.toFixed(1)} · b* {idealNeutral.b.toFixed(1)}
              </div>
            </div>
          </div>
        </div>

        {darkestZone && (
          <div className="px-4 py-3.5 space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="metric-label">Tối nhất</span>
              <span className="font-display tabular-nums text-sm font-bold text-[#0A0A0A]">
                {formatSigned(darkestZone.deltaL)} L*
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <span
                className="w-6 h-6 border border-black/15 shrink-0"
                style={{ backgroundColor: darkestZone.hex }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#0A0A0A] truncate">
                  {darkestZone.labelVi}
                </div>
                <div className="font-mono tabular-nums text-[10px] text-[#737373]">
                  L* {darkestZone.L.toFixed(1)} · a* {darkestZone.a.toFixed(1)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
