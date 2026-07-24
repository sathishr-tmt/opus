// Shared UI kit — prototype design system (compact cards, pills, list items,
// stat tiles, and a month calendar) plus the original shared components.
import { RefreshCw } from 'lucide-react';
import { OpusMark } from './Logo.jsx';

function PageHeader({ title, subtitle, action }) {
  return (
    <div className="mb-5 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-slate-500">{subtitle}</p>}
      </div>

      {action}
    </div>
  );
}

function Card({ title, action, children, className = '' }) {
  return (
    <div className={`mb-4 rounded-2xl border border-slate-200 bg-white p-[18px] ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <h2 className="text-base font-extrabold text-slate-900">{title}</h2>}
          {action}
        </div>
      )}
      {children}
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

export {
  PageHeader,
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
