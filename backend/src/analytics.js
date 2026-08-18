// Dashboard analytics computed from records that already exist.
//
// No snapshot table, no cron job: growth comes from user.createdAt, activity
// from application.appliedAt, and so on. That means the charts are correct the
// moment you deploy, rather than only after a week of collecting history.
//
// Every function returns empty arrays when there is nothing to show, so the UI
// can render an honest "no data yet" state instead of a fabricated line.

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Funnel order. Anything not listed is grouped under "Other" so a custom
// status never silently disappears from the chart.
const PIPELINE_ORDER = [
  'Applied',
  'Under Review',
  'Online Assessment',
  'Technical Interview',
  'Final Interview',
  'Offer'
];

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Cumulative users and applications per month, for the last `months` months.
 * Cumulative rather than per-month because "platform growth" means total size,
 * and a young platform's monthly counts are too small to read.
 */
function platformGrowth(users = [], applications = [], months = 6) {
  const now = new Date();
  const buckets = [];

  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: monthKey(date),
      label: MONTH_LABELS[date.getMonth()],
      cutoff: new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
    });
  }

  const userDates = users.map((u) => parseDate(u.createdAt)).filter(Boolean);
  const appDates = applications
    .map((a) => parseDate(a.appliedAt || a.createdAt))
    .filter(Boolean);

  if (!userDates.length && !appDates.length) {
    return { categories: [], series: [] };
  }

  const countUpTo = (dates, cutoff) => dates.filter((d) => d <= cutoff).length;

  return {
    categories: buckets.map((b) => b.label),
    series: [
      { name: 'Users', data: buckets.map((b) => countUpTo(userDates, b.cutoff)) },
      { name: 'Applications', data: buckets.map((b) => countUpTo(appDates, b.cutoff)) }
    ]
  };
}

/** Applications grouped by the source that produced the listing. */
function applicationsBySource(applications = []) {
  const counts = {};

  for (const application of applications) {
    const source = String(application.source || 'Internal').trim() || 'Internal';
    counts[source] = (counts[source] || 0) + 1;
  }

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return {
    categories: entries.map(([name]) => name),
    data: entries.map(([, count]) => count)
  };
}

/**
 * Recruitment funnel. Each stage counts applications that reached AT LEAST
 * that stage, so the funnel narrows properly instead of showing a snapshot of
 * who happens to be sitting in each status right now.
 */
function recruitmentPipeline(applications = []) {
  if (!applications.length) return [];

  const rank = new Map(PIPELINE_ORDER.map((status, index) => [status, index]));

  const reached = PIPELINE_ORDER.map(() => 0);
  let rejected = 0;

  for (const application of applications) {
    const status = application.status || 'Applied';

    if (status === 'Rejected') {
      rejected += 1;
      // A rejected application still passed through the earlier stages.
      continue;
    }

    const index = rank.has(status) ? rank.get(status) : 0;
    for (let i = 0; i <= index; i += 1) reached[i] += 1;
  }

  // Everyone applied, including those later rejected.
  reached[0] += rejected;

  const data = PIPELINE_ORDER.map((name, index) => ({ name, value: reached[index] }))
    .filter((entry) => entry.value > 0);

  return data;
}

/**
 * Application volume by weekday and time of day, from appliedAt.
 * Returns ECharts heatmap triples: [xIndex, yIndex, value].
 */
function activityHeatmap(applications = []) {
  const xLabels = ['12–6am', '6–9am', '9am–12', '12–3pm', '3–6pm', '6pm–12'];
  const yLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const bucketFor = (hour) => {
    if (hour < 6) return 0;
    if (hour < 9) return 1;
    if (hour < 12) return 2;
    if (hour < 15) return 3;
    if (hour < 18) return 4;
    return 5;
  };

  const grid = {};
  let total = 0;

  for (const application of applications) {
    const date = parseDate(application.appliedAt || application.createdAt);
    if (!date) continue;

    // getDay(): 0 = Sunday. Shift so Monday is row 0.
    const y = (date.getDay() + 6) % 7;
    const x = bucketFor(date.getHours());

    grid[`${x}:${y}`] = (grid[`${x}:${y}`] || 0) + 1;
    total += 1;
  }

  if (!total) return { xLabels: [], yLabels: [], data: [], max: 0 };

  const data = [];
  let max = 0;

  for (let x = 0; x < xLabels.length; x += 1) {
    for (let y = 0; y < yLabels.length; y += 1) {
      const value = grid[`${x}:${y}`] || 0;
      data.push([x, y, value]);
      if (value > max) max = value;
    }
  }

  return { xLabels, yLabels, data, max };
}

export {
  platformGrowth,
  applicationsBySource,
  recruitmentPipeline,
  activityHeatmap
};
