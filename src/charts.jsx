// Onyx charts: small SVG charts drawn to one scale, animated as they enter and
// between values, with a tooltip that follows the pointer or a finger.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { fmt, fmtCompact } from "./calc.js";
import { prefersReducedMotion, easeOutCubic } from "./motion.jsx";

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

// The smallest round number at or above `v` (1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6
// or 8 × 10ⁿ), so the top gridline is round and the chart uses its height.
export function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v - 1e-9) return m * p;
  return 10 * p;
}

// A series that glides from its previous values to new ones (resampled when
// the length changes), so a chart moves rather than jumps when data changes.
function useTweenedSeries(values, duration = 520) {
  const key = values.map((v) => Math.round(v)).join(",");
  const [shown, setShown] = useState(values);
  const lastRef = useRef({ key, values });
  useEffect(() => {
    const last = lastRef.current;
    if (last.key === key) return undefined;
    const from = last.values;
    lastRef.current = { key, values };
    if (prefersReducedMotion() || from.length === 0) {
      setShown(values);
      return undefined;
    }
    const sample = (i) => {
      if (from.length === 1) return from[0];
      const x = (i / Math.max(values.length - 1, 1)) * (from.length - 1);
      const lo = Math.floor(x);
      const hi = Math.min(lo + 1, from.length - 1);
      return from[lo] + (from[hi] - from[lo]) * (x - lo);
    };
    const start = values.map((_, i) => sample(i));
    let raf;
    let t0 = null;
    const step = (now) => {
      if (t0 == null) t0 = now;
      const k = Math.min((now - t0) / duration, 1);
      const e = easeOutCubic(k);
      setShown(values.map((v, i) => start[i] + (v - start[i]) * e));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // `key` stands for `values`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return shown.length === values.length ? shown : values;
}

// A smooth curve through the points that never overshoots them (monotone
// cubic), so a balance that only falls is never drawn dipping below zero.
function smoothPath(xs, ys) {
  const n = xs.length;
  if (n === 0) return "";
  if (n === 1) return `M${xs[0]},${ys[0]}`;
  const m = [];
  for (let i = 0; i < n - 1; i++) m.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i] || 1));
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      t[i] = tau * a * m[i];
      t[i + 1] = tau * b * m[i];
    }
  }
  let d = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = (xs[i + 1] - xs[i]) / 3;
    d += `C${(xs[i] + h).toFixed(1)},${(ys[i] + t[i] * h).toFixed(1)} ${(xs[i + 1] - h).toFixed(1)},${(
      ys[i + 1] - t[i + 1] * h
    ).toFixed(1)} ${xs[i + 1].toFixed(1)},${ys[i + 1].toFixed(1)}`;
  }
  return d;
}

// Keeps a floating tooltip inside the chart's width.
const tipLeft = (x, width) => Math.min(Math.max(x, 70), Math.max(width - 70, 70));

// A line with a soft gradient beneath: how a balance changes over time.
// `points` = [{ label, value }]; `endMarker` marks the last point (debt-free).
export function AreaChart({ points, height = 200, endMarker = false, tipValue = (v) => fmt(v), ariaLabel }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const gid = "ox-g" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const values = useTweenedSeries(points.map((p) => Math.max(Number(p.value) || 0, 0)));
  const n = points.length;
  const padTop = 18;
  const padBottom = 26;
  const padRight = endMarker ? 10 : 4;
  const w = Math.max(width, 1);
  const max = niceMax(Math.max(...points.map((p) => Number(p.value) || 0), 1));
  const x = (i) => (n <= 1 ? w / 2 : (i / (n - 1)) * (w - padRight));
  const y = (v) => padTop + (1 - v / max) * (height - padTop - padBottom);
  const xs = values.map((_, i) => x(i));
  const ys = values.map((v) => y(v));
  const line = smoothPath(xs, ys);
  const area = n > 1 ? `${line}L${xs[n - 1].toFixed(1)},${y(0)}L${xs[0].toFixed(1)},${y(0)}Z` : "";
  const ticks = [max, max / 2, 0];
  const labelIdx = n > 2 ? [0, Math.round((n - 1) / 2), n - 1] : n === 2 ? [0, 1] : [0];

  function pick(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = n <= 1 ? 0 : Math.round((px / Math.max(w - padRight, 1)) * (n - 1));
    setHover(Math.min(Math.max(i, 0), n - 1));
  }

  return (
    <div className="ox-chart" ref={ref} style={{ height }} role="img" aria-label={ariaLabel}>
      {width > 0 && n > 0 && (
        <svg
          width={w}
          height={height}
          viewBox={`0 0 ${w} ${height}`}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--accent)", stopOpacity: 0.26 }} />
              <stop offset="100%" style={{ stopColor: "var(--accent)", stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line className="ox-chart-grid" x1={0} x2={w} y1={y(t)} y2={y(t)} />
              {t > 0 && (
                <text className="ox-chart-axis" x={0} y={y(t) - 6}>
                  {fmtCompact(t)}
                </text>
              )}
            </g>
          ))}
          {labelIdx.map((i, k) => (
            <text
              key={i}
              className="ox-chart-axis"
              x={x(i)}
              y={height - 6}
              textAnchor={k === 0 ? "start" : k === labelIdx.length - 1 ? "end" : "middle"}
            >
              {points[i].label}
            </text>
          ))}
          {area && <path className="ox-chart-area" d={area} fill={`url(#${gid})`} />}
          <path className="ox-chart-line draw" d={line} pathLength="1" />
          {endMarker && n > 1 && (
            <g>
              <circle className="ox-chart-end-ring" cx={xs[n - 1]} cy={ys[n - 1]} r={5} />
              <circle className="ox-chart-end" cx={xs[n - 1]} cy={ys[n - 1]} r={4.5} />
            </g>
          )}
          {hover != null && (
            <g>
              <line className="ox-chart-cross" x1={xs[hover]} x2={xs[hover]} y1={padTop - 6} y2={y(0)} />
              <circle className="ox-chart-dot" cx={xs[hover]} cy={ys[hover]} r={5} />
            </g>
          )}
        </svg>
      )}
      {hover != null && points[hover] && (
        <div className="ox-tip" style={{ left: tipLeft(xs[hover], w), top: Math.max(ys[hover] - 64, -8) }}>
          <strong>{tipValue(points[hover].value)}</strong>
          <span>{points[hover].label}</span>
        </div>
      )}
    </div>
  );
}

// Money in beside money out, month by month. `data` = [{ label, a, b }].
export function BarPairs({ data, height = 190, names = ["Income", "Expenses"], ariaLabel }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const n = data.length;
  const padTop = 16;
  const padBottom = 24;
  const w = Math.max(width, 1);
  const max = niceMax(Math.max(...data.flatMap((d) => [d.a, d.b]), 1));
  const band = w / Math.max(n, 1);
  const barW = Math.max(Math.min(14, band * 0.26), 3);
  const y = (v) => padTop + (1 - Math.max(v, 0) / max) * (height - padTop - padBottom);
  const every = n > 8 ? 2 : 1;
  return (
    <div className="ox-chart" ref={ref} style={{ height }} role="img" aria-label={ariaLabel}>
      {width > 0 && (
        <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} onPointerLeave={() => setHover(null)}>
          {[max, max / 2, 0].map((t) => (
            <g key={t}>
              <line className="ox-chart-grid" x1={0} x2={w} y1={y(t)} y2={y(t)} />
              {t > 0 && (
                <text className="ox-chart-axis" x={0} y={y(t) - 6}>
                  {fmtCompact(t)}
                </text>
              )}
            </g>
          ))}
          {data.map((d, i) => {
            const cx = band * i + band / 2;
            return (
              <g key={d.label + i}>
                <rect
                  className={"ox-bar-hit" + (hover === i ? " on" : "")}
                  x={band * i + 2}
                  y={padTop - 8}
                  width={Math.max(band - 4, 1)}
                  height={height - padTop - padBottom + 8}
                  rx={8}
                  onPointerEnter={() => setHover(i)}
                  onPointerDown={() => setHover(i)}
                />
                <g className="ox-bars" style={{ pointerEvents: "none" }}>
                  <rect
                    className="ox-bar-in"
                    x={cx - barW - 1.5}
                    y={y(d.a)}
                    width={barW}
                    height={Math.max(y(0) - y(d.a), 0)}
                    rx={Math.min(3, barW / 2)}
                    style={{ animationDelay: i * 45 + "ms" }}
                  />
                  <rect
                    className="ox-bar-out"
                    x={cx + 1.5}
                    y={y(d.b)}
                    width={barW}
                    height={Math.max(y(0) - y(d.b), 0)}
                    rx={Math.min(3, barW / 2)}
                    style={{ animationDelay: i * 45 + 60 + "ms" }}
                  />
                </g>
                {i % every === 0 && (
                  <text className="ox-chart-axis" x={cx} y={height - 6} textAnchor="middle">
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hover != null && data[hover] && (
        <div className="ox-tip" style={{ left: tipLeft(band * hover + band / 2, w), top: -8 }}>
          <strong className={data[hover].a - data[hover].b < 0 ? "ox-neg" : "ox-pos"}>
            {data[hover].a - data[hover].b < 0 ? "−" + fmt(data[hover].b - data[hover].a) + " loss" : fmt(data[hover].a - data[hover].b) + " profit"}
          </strong>
          <span>
            {data[hover].full || data[hover].label} · {names[0]} {fmt(data[hover].a)} · {names[1]} {fmt(data[hover].b)}
          </span>
        </div>
      )}
      <div className="ox-legend">
        <span>
          <i className="ox-dot" style={{ background: "var(--positive)" }} /> {names[0]}
        </span>
        <span>
          <i className="ox-dot" style={{ background: "var(--bar-out)" }} /> {names[1]}
        </span>
      </div>
    </div>
  );
}

// A progress ring that sweeps to `value` (0–1), with its label inside.
export function Ring({ value, size = 92, stroke = 8, tone = "accent", children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const target = Math.max(0, Math.min(1, Number(value) || 0));
  const [shown, setShown] = useState(prefersReducedMotion() ? target : 0);
  useEffect(() => {
    const t = setTimeout(() => setShown(target), 60);
    return () => clearTimeout(t);
  }, [target]);
  return (
    <div className="ox-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle className="ox-ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          className={"ox-ring-fill" + (tone === "pos" ? " pos" : "")}
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown)}
        />
      </svg>
      <div className="ox-ring-label">{children}</div>
    </div>
  );
}

// One bar split into parts (who you owe most), with a list beneath.
// `items` = [{ id, name, value, color }].
export function SegmentBar({ items, onPick }) {
  const total = items.reduce((s, it) => s + it.value, 0) || 1;
  const [ready, setReady] = useState(prefersReducedMotion());
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 60);
    return () => clearTimeout(t);
  }, []);
  return (
    <div>
      <div className="ox-segbar" role="img" aria-label={items.map((it) => `${it.name} ${Math.round((it.value / total) * 100)}%`).join(", ")}>
        {items.map((it) => (
          <i key={it.id} style={{ flexGrow: ready ? it.value : 0.001, flexBasis: 0, background: it.color }} />
        ))}
      </div>
      <div className="ox-seglist">
        {items.map((it) => (
          <div
            className={"ox-segitem" + (onPick && it.id !== "other" ? " fl-tap" : "")}
            key={it.id}
            onClick={onPick && it.id !== "other" ? () => onPick(it.id) : undefined}
          >
            <i className="ox-dot" style={{ background: it.color }} />
            <span className="ox-segitem-name">{it.name}</span>
            <span className="ox-segitem-pct">{Math.round((it.value / total) * 100)}%</span>
            <span className="ox-segitem-amt">{fmt(it.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
