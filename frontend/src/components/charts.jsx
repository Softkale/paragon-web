import React, { createContext, useCallback, useContext, useState } from 'react';

// Gráficos sin librerías, según las reglas de la guía de visualización:
// una serie = un color, barras finas con extremo redondeado, valor en la punta,
// rejilla en hairline, tooltip al pasar el cursor o enfocar con teclado.
// Paleta: azul validado de la guía (modo oscuro) sobre la superficie del panel.

const INK = '#e9e9ef';
const MUTED = '#9da4b3';
const GRID = 'rgba(255,255,255,0.08)';
const BASE = 'rgba(255,255,255,0.20)';
export const SERIES = '#3987e5'; // categórico slot 1 (oscuro)
const SERIES_HOVER = '#5598e7';

// Rampa secuencial azul, de "casi cero" (oscuro) a máximo (claro): en fondo oscuro el ancla se invierte.
const RAMP = ['#0d366b', '#104281', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef', '#9ec5f4', '#b7d3f6'];

const fmt = (n) => (Number.isInteger(n) ? n.toLocaleString('es') : n.toLocaleString('es', { maximumFractionDigits: 2 }));
const compact = (n) => (n >= 1000 ? `${n / 1000}K` : String(n));

// ---------- Tooltip (uno solo para toda la pantalla) ----------
const TipContext = createContext({ show: () => {}, hide: () => {} });
export const useTip = () => useContext(TipContext);

export function TipProvider({ children }) {
  const [tip, setTip] = useState(null);
  const show = useCallback((point, content) => setTip({ x: point.clientX, y: point.clientY, content }), []);
  const hide = useCallback(() => setTip(null), []);
  return (
    <TipContext.Provider value={{ show, hide }}>
      {children}
      {tip && (
        <div className="viz-tip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 220), top: tip.y + 14 }} role="status">
          <div className="viz-tip__title">{tip.content.title}</div>
          {tip.content.rows.map((r) => (
            <div key={r.label} className="viz-tip__row">
              <strong>{r.value}</strong>
              <span>{r.label}</span>
            </div>
          ))}
        </div>
      )}
    </TipContext.Provider>
  );
}

// Handlers comunes: puntero y teclado muestran el mismo detalle.
function useTipHandlers(content) {
  const { show, hide } = useTip();
  return {
    onPointerMove: (e) => show(e, content),
    onPointerLeave: hide,
    onFocus: (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      show({ clientX: r.left + r.width / 2, clientY: r.top }, content);
    },
    onBlur: hide,
  };
}

// ---------- Estadística (stat tile) ----------
export function StatTile({ label, value, sub, hero }) {
  return (
    <div className={`stat-tile ${hero ? 'stat-tile--hero' : ''}`}>
      <span className="stat-tile__label">{label}</span>
      <strong className="stat-tile__value">{value}</strong>
      {sub && <small className="stat-tile__sub">{sub}</small>}
    </div>
  );
}

// ---------- Columnas ----------
function niceMax(max) {
  if (max <= 0) return 4;
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw);
  return step * 4;
}

function Column({ x, band, base, top, hovered, tipContent, label, barW }) {
  const handlers = useTipHandlers(tipContent);
  const h = base - top;
  const r = Math.min(4, h / 2, barW / 2);
  const bx = x + (band - barW) / 2;
  return (
    <g>
      {hovered && <rect x={x} y={14} width={band} height={base - 14} fill="rgba(255,255,255,0.04)" />}
      {h > 0 && (
        <path
          d={`M${bx},${base} V${top + r} Q${bx},${top} ${bx + r},${top} H${bx + barW - r} Q${bx + barW},${top} ${bx + barW},${top + r} V${base} Z`}
          fill={hovered ? SERIES_HOVER : SERIES}
        />
      )}
      {/* El área de hover cubre toda la columna: más grande que la barra. */}
      <rect x={x} y={14} width={band} height={base - 14} fill="transparent" tabIndex={0} aria-label={label} {...handlers} />
    </g>
  );
}

export function ColumnChart({ data, format = fmt, height = 220 }) {
  const [hover, setHover] = useState(null);
  const W = 640;
  const pad = { l: 38, r: 8, t: 18, b: 28 };
  const innerW = W - pad.l - pad.r;
  const base = height - pad.b;
  const innerH = base - pad.t;
  const yMax = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const y = (v) => base - (v / yMax) * innerH;
  const band = innerW / data.length;
  const barW = Math.min(24, band * 0.6);
  const every = Math.ceil(data.length / 8);
  const labelValues = data.length <= 8;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="viz-svg" role="img" aria-label={`Gráfico de columnas con ${data.length} valores`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const v = (yMax / 4) * i;
        return (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={i === 0 ? BASE : GRID} strokeWidth="1" />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill={MUTED}>{compact(Math.round(v * 100) / 100)}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const x = pad.l + i * band;
        return (
          <g key={d.label + i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
            <Column x={x} band={band} base={base} top={y(d.value)} hovered={hover === i} barW={barW} label={`${d.label}: ${format(d.value)}`}
              tipContent={{ title: d.title || d.label, rows: d.rows || [{ label: d.unit || 'Total', value: format(d.value) }] }} />
            {labelValues && d.value > 0 && <text x={x + band / 2} y={y(d.value) - 6} textAnchor="middle" fontSize="11" fill={INK}>{format(d.value)}</text>}
            {i % every === 0 && <text x={x + band / 2} y={base + 16} textAnchor="middle" fontSize="10" fill={MUTED}>{d.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

// ---------- Barras horizontales ----------
function HBarRow({ label, value, max, rows, title, format }) {
  const handlers = useTipHandlers({ title: title || label, rows: rows || [{ label: 'Total', value: format(value) }] });
  const ratio = max > 0 ? value / max : 0;
  return (
    <div className="hbar" tabIndex={0} aria-label={`${label}: ${format(value)}`} {...handlers}>
      <span className="hbar__label">{label}</span>
      <div className="hbar__track">
        <div className="hbar__fill" style={{ width: `calc((100% - 56px) * ${ratio})` }} />
        <span className="hbar__value">{format(value)}</span>
      </div>
    </div>
  );
}

export function HBarChart({ data, format = fmt }) {
  const max = Math.max(0, ...data.map((d) => d.value));
  return <div className="hbars">{data.map((d) => <HBarRow key={d.label} {...d} max={max} format={format} />)}</div>;
}

// ---------- Mapa de calor (días × horarios) ----------
function HeatCell({ value, max, content }) {
  const handlers = useTipHandlers(content);
  const idx = value > 0 ? Math.min(RAMP.length - 1, Math.floor((value / max) * RAMP.length - 1e-9)) : -1;
  return (
    <div
      className={`heat__cell ${value > 0 ? '' : 'heat__cell--zero'}`}
      style={idx >= 0 ? { background: RAMP[idx], color: idx >= 7 ? '#0b0b0b' : '#ffffff' } : undefined}
      tabIndex={0}
      aria-label={`${content.title}: ${value}`}
      {...handlers}
    >
      {value > 0 ? value : '·'}
    </div>
  );
}

export function Heatmap({ rows, columns, unit }) {
  const max = Math.max(1, ...rows.flatMap((r) => r.values));
  return (
    <div className="heat">
      <div className="heat__grid" style={{ gridTemplateColumns: `110px repeat(${columns.length}, 1fr)` }}>
        <span />
        {columns.map((c) => <span key={c} className="heat__head">{c}</span>)}
        {rows.map((r) => (
          <React.Fragment key={r.label}>
            <span className="heat__row">{r.label}</span>
            {r.values.map((v, i) => (
              <HeatCell key={columns[i]} value={v} max={max} content={{ title: `${r.label} · ${columns[i]}`, rows: [{ label: unit, value: String(v) }, ...(r.extra?.[i] || [])] }} />
            ))}
          </React.Fragment>
        ))}
      </div>
      <div className="heat__legend" aria-hidden="true">
        <span>0</span>
        <div className="heat__scale">{RAMP.map((c) => <i key={c} style={{ background: c }} />)}</div>
        <span>{max}</span>
      </div>
    </div>
  );
}
