// Shared UI kit — prototype design system (compact cards, pills, list items,
// stat tiles, and a month calendar) plus the original shared components.
import { useState, useEffect, useRef } from 'react';
import { RefreshCw, X, Download, ChevronDown } from 'lucide-react';
import { API_BASE } from '../lib/api.js';
import { OpusMark } from './Logo.jsx';

function PageHeader({ title, subtitle, action, crumb }) {
  return (
    <div className="mb-5">
      {crumb && <Breadcrumb {...crumb} />}

      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-0.5 text-[13px] text-slate-500">{subtitle}</p>}
        </div>

        {action}
      </div>
    </div>
  );
}

/* Breadcrumb — "Admin / Job Sources". Section is muted, page is emphasised. */
function Breadcrumb({ section, page }) {
  return (
    <p className="mb-1.5 text-xs text-slate-400">
      <span className="font-bold text-slate-500">{section}</span>
      {page ? <> {'/'} {page}</> : null}
    </p>
  );
}

function Card({ title, action, hint, children, className = '' }) {
  return (
    <div className={`mb-4 rounded-2xl border border-slate-200 bg-white p-[18px] ${className}`}>
      {(title || action) && (
        <div className={`flex items-center justify-between ${hint ? 'mb-1' : 'mb-3'}`}>
          {title && <h2 className="text-base font-extrabold text-slate-900">{title}</h2>}
          {action}
        </div>
      )}
      {hint && <p className="mb-3.5 text-xs text-slate-400">{hint}</p>}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Feed — activity list: coloured icon tile, text, timestamp.
 * items: [{ icon: LucideIcon, text, meta, tone }]
 * ------------------------------------------------------------------ */
const FEED_TONES = {
  violet: 'bg-violet-50 text-violet-600',
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-green-50 text-green-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
  slate: 'bg-slate-100 text-slate-600'
};

function Feed({ items = [] }) {
  if (!items.length) return <EmptyState text="No recent activity." />;

  return (
    <div className="flex flex-col">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <div
            key={index}
            className="flex gap-3 border-b border-slate-100 py-2.5 last:border-b-0"
          >
            <span
              className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] ${
                FEED_TONES[item.tone] || FEED_TONES.violet
              }`}
            >
              {Icon ? <Icon size={15} /> : null}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] text-slate-700">{item.text}</p>
              {item.meta && (
                <p className="mt-px text-[11.5px] text-slate-400">{item.meta}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatTile({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[13px] text-slate-500">{label}</p>
      <p className="mt-1 text-[28px] font-extrabold leading-none text-slate-900">{value}</p>
    </div>
  );
}

const PILL_TONES = {
  green: 'bg-green-50 text-green-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  violet: 'bg-violet-50 text-violet-700',
  blue: 'bg-blue-50 text-blue-700',
  slate: 'bg-slate-100 text-slate-600'
};

function pillToneForStatus(status) {
  const value = String(status || '').toLowerCase();
  if (['applied', 'active', 'open', 'approved', 'healthy', 'ok', 'scheduled', 'accepted', 'connected'].includes(value)) return 'green';
  if (['hold', 'pending', 'under review', 'unassigned', 'warn', 'expired', 'rescheduled', 'online assessment'].includes(value)) return 'amber';
  if (['rejected', 'failing', 'declined', 'closed', 'cancelled', 'inactive', 'withdrawn'].includes(value)) return 'red';
  if (['technical interview', 'final interview', 'interview', 'offer', 'assigned'].includes(value)) return 'violet';
  return 'slate';
}

function Pill({ tone, children }) {
  const resolved = tone || pillToneForStatus(children);
  return (
    <span className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-bold ${PILL_TONES[resolved] || PILL_TONES.slate}`}>
      {children}
    </span>
  );
}

function ListItem({ title, meta, right }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2.5 rounded-xl bg-slate-50 px-3.5 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-slate-900">{title}</p>
        {meta && <p className="mt-0.5 truncate text-xs text-slate-500">{meta}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="mb-3.5 block">
      <span className="mb-1.5 block text-[13px] font-bold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] outline-none focus:border-violet-500';

const btnClass =
  'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-bold text-slate-700 hover:bg-slate-50';

const btnPrimaryClass =
  'rounded-lg bg-violet-600 px-3 py-1.5 text-[13px] font-bold text-white hover:bg-violet-700 disabled:opacity-60';

const btnSmClass =
  'rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50';

function MonthCalendar({ monthDate, markedDays = [], onPrev, onNext, legend = 'Interview day' }) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = monthDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const cells = [];
  for (let i = 0; i < firstDow; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-extrabold text-slate-900">{monthLabel}</h2>
        <div className="flex gap-1 text-slate-500">
          <button onClick={onPrev} className={btnSmClass}>&lsaquo;</button>
          <button onClick={onNext} className={btnSmClass}>&rsaquo;</button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={`${d}${i}`} className="py-1 text-center text-[11px] text-slate-400">{d}</div>
        ))}
        {cells.map((d, i) => (
          <div
            key={i}
            className={`rounded-lg py-2 text-center text-[13px] ${
              d && markedDays.includes(d)
                ? 'bg-violet-600 font-extrabold text-white'
                : 'text-slate-700'
            }`}
          >
            {d || ''}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[13px] text-slate-500">
        <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded bg-violet-600 align-[-1px]" />
        {legend}
      </p>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, tone = 'blue' }) {
  const toneMap = {
    blue: 'bg-blue-50 text-blue-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    green: 'bg-green-50 text-green-600',
    violet: 'bg-violet-50 text-violet-600'
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneMap[tone] || toneMap.blue}`}>
            <Icon size={20} />
          </div>
        )}
        <div>
          <p className="text-[13px] text-slate-500">{title}</p>
          <h2 className="text-2xl font-extrabold text-slate-900">{value}</h2>
        </div>
      </div>
    </div>
  );
}

function Badge({ children }) {
  return <Pill>{children}</Pill>;
}

function EmptyState({ text }) {
  return (
    <p className="text-[13px] text-slate-500">{text || 'No data found.'}</p>
  );
}

function FilterInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
  min,
  max,
  step,
  autoComplete
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-bold text-slate-600">{label}</span>

      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        autoComplete={autoComplete}
        className={`w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[13px] outline-none transition ${
          disabled
            ? 'cursor-not-allowed bg-slate-100 text-slate-400'
            : 'bg-white focus:border-violet-500'
        }`}
      />
    </label>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-bold text-slate-600">{label}</span>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] outline-none focus:border-violet-500"
      >
        <option value="">All</option>

        {options.filter(Boolean).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function DataTable({ headers, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className={`bg-slate-50 px-2.5 py-2 text-[11px] font-bold uppercase text-slate-500 ${
                  i === headers.length - 1 && h === '' ? 'text-right' : 'text-left'
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function SessionVerificationScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <div className="mb-3 flex justify-center"><OpusMark size={56} /></div>
        <RefreshCw className="mx-auto animate-spin text-violet-600" size={22} />
        <p className="mt-3 font-extrabold text-slate-900">Verifying your session...</p>
      </div>
    </div>
  );
}

function Toast({ message }) {
  if (!message) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-900 px-4.5 py-3 text-[13px] font-semibold text-white shadow-xl">
      {message}
    </div>
  );
}


/* ------------------------------------------------------------------ *
 * KpiCard — headline metric with an icon, an optional change line and
 * an optional progress bar. Replaces a bare StatTile where the number
 * alone does not tell the whole story.
 * ------------------------------------------------------------------ */
const KPI_TONES = {
  violet: { icon: 'bg-violet-50 text-violet-600', bar: 'bg-violet-600', hover: 'hover:border-violet-300' },
  blue:   { icon: 'bg-blue-50 text-blue-600',     bar: 'bg-blue-600',   hover: 'hover:border-blue-300' },
  teal:   { icon: 'bg-teal-50 text-teal-600',     bar: 'bg-teal-600',   hover: 'hover:border-teal-300' },
  green:  { icon: 'bg-green-50 text-green-600',   bar: 'bg-green-600',  hover: 'hover:border-green-300' },
  amber:  { icon: 'bg-amber-50 text-amber-600',   bar: 'bg-amber-500',  hover: 'hover:border-amber-300' },
  red:    { icon: 'bg-red-50 text-red-600',       bar: 'bg-red-600',    hover: 'hover:border-red-300' },
  slate:  { icon: 'bg-slate-100 text-slate-600',  bar: 'bg-slate-600',  hover: 'hover:border-slate-300' }
};

function KpiCard({ label, value, icon: Icon, progress, tone = 'violet', onClick }) {
  const clickable = typeof onClick === 'function';
  const palette = KPI_TONES[tone] || KPI_TONES.violet;

  return (
    <div
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={(event) => {
        if (!clickable) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
      title={clickable ? `Open ${label}` : undefined}
      className={`rounded-xl border border-slate-200 bg-white p-3 transition ${
        clickable
          ? `cursor-pointer hover:-translate-y-px hover:shadow-sm ${palette.hover}`
          : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11.5px] font-semibold text-slate-500">{label}</span>
        {Icon && (
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${palette.icon}`}
          >
            <Icon size={15} />
          </span>
        )}
      </div>

      <p className="mt-1.5 text-[22px] font-extrabold leading-none text-slate-900">{value}</p>

      {progress != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <span
            className={`block h-full rounded-full ${palette.bar}`}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Timeline — a vertical run of events, newest first.
 * ------------------------------------------------------------------ */
function Timeline({ items = [] }) {
  if (!items.length) return <EmptyState text="No activity yet." />;

  return (
    <div className="relative pl-[22px]">
      <span className="absolute bottom-1 left-[6px] top-1 w-0.5 bg-slate-200" />
      {items.map((item, index) => (
        <div key={index} className="relative pb-4 last:pb-0">
          <span className="absolute -left-[19px] top-[3px] h-[11px] w-[11px] rounded-full border-2 border-white bg-violet-600" />
          <p className="text-[13px] font-bold text-slate-900">{item.title}</p>
          {item.meta && <p className="text-[11.5px] text-slate-400">{item.meta}</p>}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * ConfirmModal — a real dialog in place of window.confirm().
 * ------------------------------------------------------------------ */
function ConfirmModal({ open, title, body, confirmLabel = 'Confirm', tone = 'violet', onConfirm, onCancel }) {
  if (!open) return null;

  const confirmClass =
    tone === 'red'
      ? 'bg-red-600 hover:bg-red-700'
      : 'bg-violet-600 hover:bg-violet-700';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-extrabold text-slate-900">{title}</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <X size={17} />
          </button>
        </div>

        {body && <p className="mt-1.5 text-[13px] leading-6 text-slate-500">{body}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button className={btnClass} onClick={onCancel}>Cancel</button>
          <button
            className={`rounded-lg px-3 py-1.5 text-[13px] font-bold text-white ${confirmClass}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * KanbanBoard — columns of draggable cards.
 *
 * `columns`  : [{ key, label, color }]
 * `items`    : any[]
 * `getKey`   : item  -> unique id
 * `getColumn`: item  -> column key
 * `renderCard`: item -> JSX
 * `onMove`   : (item, nextColumnKey) -> void   (omit to make it read-only)
 * ------------------------------------------------------------------ */
function KanbanBoard({ columns = [], items = [], getKey, getColumn, renderCard, onMove }) {
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState('');
  const draggable = typeof onMove === 'function';

  function handleDrop(columnKey) {
    setOver('');
    if (!dragging) return;
    const item = dragging;
    setDragging(null);
    if (getColumn(item) === columnKey) return;
    onMove(item, columnKey);
  }

  return (
    <div className="flex gap-3.5 overflow-x-auto pb-2">
      {columns.map((column) => {
        const columnItems = items.filter((item) => getColumn(item) === column.key);
        const isOver = over === column.key;

        return (
          <div
            key={column.key}
            onDragOver={(event) => {
              if (!draggable) return;
              event.preventDefault();
              setOver(column.key);
            }}
            onDragLeave={() => setOver((value) => (value === column.key ? '' : value))}
            onDrop={() => draggable && handleDrop(column.key)}
            className={`min-w-[230px] flex-1 rounded-xl border p-2.5 transition ${
              isOver ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div className="mb-2.5 flex items-center justify-between px-1">
              <span className="text-[13px] font-bold text-slate-700">{column.label}</span>
              <span className="rounded-full border border-slate-200 bg-white px-2 py-px text-[11px] text-slate-500">
                {columnItems.length}
              </span>
            </div>

            {columnItems.map((item) => (
              <div
                key={getKey(item)}
                draggable={draggable}
                onDragStart={() => setDragging(item)}
                onDragEnd={() => { setDragging(null); setOver(''); }}
                className={`mb-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${
                  draggable ? 'cursor-grab active:cursor-grabbing' : ''
                } ${dragging && getKey(dragging) === getKey(item) ? 'opacity-40' : ''}`}
              >
                <span className="block h-[3px]" style={{ background: column.color }} />
                <div className="p-2.5">{renderCard(item)}</div>
              </div>
            ))}

            {!columnItems.length && (
              <p className="px-1 py-4 text-center text-[11.5px] text-slate-400">
                {draggable ? 'Drop here' : 'Empty'}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}


/* ------------------------------------------------------------------ *
 * ExportMenu — download button with an optional date range.
 *
 * options: [{ label, path }]  path is a backend export route, e.g.
 *          '/api/exports/my-applications.csv'
 *
 * The chosen range is sent as ?from=YYYY-MM-DD&to=YYYY-MM-DD. Leaving both
 * blank exports everything.
 * ------------------------------------------------------------------ */
const EXPORT_PRESETS = [
  ['7', 'Last 7 days'],
  ['30', 'Last 30 days'],
  ['90', 'Last 90 days'],
  ['', 'All time']
];

function isoDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - Number(days));
  return date.toISOString().slice(0, 10);
}

function ExportMenu({ label = 'Export', options = [], onLocalExport, localLabel }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const boxRef = useRef(null);

  useEffect(() => {
    function onClickAway(event) {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  function applyPreset(days) {
    if (!days) {
      setFrom('');
      setTo('');
      return;
    }
    setFrom(isoDaysAgo(days));
    setTo(new Date().toISOString().slice(0, 10));
  }

  function download(path) {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const query = params.toString();
    window.open(`${API_BASE}${path}${query ? `?${query}` : ''}`, '_blank');
    setOpen(false);
  }

  const rangeSummary =
    from || to ? `${from || 'start'} → ${to || 'today'}` : 'All time';

  return (
    <div ref={boxRef} className="relative inline-block">
      <button
        onClick={() => setOpen((value) => !value)}
        className={`${btnClass} inline-flex items-center gap-2`}
      >
        <Download size={15} />
        {label}
        <ChevronDown size={14} className="text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 top-[42px] z-40 w-[300px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
            Date range
          </p>

          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {EXPORT_PRESETS.map(([days, presetLabel]) => (
              <button
                key={presetLabel}
                onClick={() => applyPreset(days)}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11.5px] font-bold text-slate-600 hover:border-violet-300 hover:text-violet-700"
              >
                {presetLabel}
              </button>
            ))}
          </div>

          <div className="mb-2 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-slate-500">From</span>
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => setFrom(event.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-slate-500">To</span>
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => setTo(event.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <p className="mb-2.5 text-[11.5px] text-slate-400">
            Exporting: <span className="font-bold text-slate-600">{rangeSummary}</span>
          </p>

          <div className="border-t border-slate-100 pt-2">
            {options.map((option) => (
              <button
                key={option.path}
                onClick={() => download(option.path)}
                className="block w-full rounded-lg px-2.5 py-2 text-left text-[13px] font-bold text-slate-700 hover:bg-slate-50"
              >
                {option.label}
              </button>
            ))}

            {onLocalExport && (
              <button
                onClick={() => { onLocalExport(); setOpen(false); }}
                className="block w-full rounded-lg px-2.5 py-2 text-left text-[13px] font-bold text-slate-700 hover:bg-slate-50"
              >
                {localLabel || 'Export what is on screen (CSV)'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


/* ------------------------------------------------------------------ *
 * Tabs — sub-navigation inside one page.
 * items: [{ key, label, count }]
 * ------------------------------------------------------------------ */
function Tabs({ items = [], active, onChange }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
      {items.map((item) => {
        const on = item.key === active;
        return (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2 text-[13.5px] font-bold transition ${
              on
                ? 'border-violet-600 text-violet-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            {item.label}
            {item.count > 0 && (
              <span
                className={`rounded-full px-1.5 text-[11px] font-extrabold ${
                  on ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export {
  PageHeader,
  Tabs,
  ExportMenu,
  Breadcrumb,
  Feed,
  KpiCard,
  Timeline,
  ConfirmModal,
  KanbanBoard,
  Card,
  StatTile,
  Pill,
  pillToneForStatus,
  ListItem,
  Field,
  inputClass,
  btnClass,
  btnPrimaryClass,
  btnSmClass,
  MonthCalendar,
  DataTable,
  StatCard,
  Badge,
  EmptyState,
  FilterInput,
  FilterSelect,
  Toast,
  SessionVerificationScreen
};
