// OPUS reusable charts — Apache ECharts wrapped as theme-aware React components.
// One shared config keeps fonts, tooltips, colours and dark-mode consistent
// across every portal. Import what you need:
//   import { TrendChart, StatusDonut, BarComparison, RecruitmentFunnel,
//            HealthGauge, ActivityHeatmap } from '../../components/charts.jsx';
import { useRef, useEffect, useState, useMemo } from 'react';
import * as echarts from 'echarts';

const PALETTE = ['#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#2563eb', '#16a34a', '#d97706', '#dc2626'];

// Track <html class="dark"> so charts recolour when the theme toggles.
function useDark() {
  const [dark, setDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setDark(el.classList.contains('dark')));
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

function tokens(dark) {
  return {
    text: dark ? '#94a3b8' : '#6b7280',
    axisLine: dark ? '#24314a' : '#e8eaf0',
    split: dark ? '#1c2740' : '#f0f1f5',
    tipBg: dark ? '#131c2e' : '#ffffff',
    tipBorder: dark ? '#24314a' : '#e8eaf0',
    tipText: dark ? '#f1f5f9' : '#171923',
    gaugeTrack: dark ? '#24314a' : '#eceaf5',
    gaugeText: dark ? '#f1f5f9' : '#171923'
  };
}

function baseTooltip(t, trigger = 'item') {
  return {
    trigger,
    backgroundColor: t.tipBg,
    borderColor: t.tipBorder,
    borderWidth: 1,
    textStyle: { color: t.tipText, fontSize: 12 },
    extraCssText: 'box-shadow:0 4px 16px rgba(16,24,40,.14);border-radius:8px;'
  };
}

function axis(t, type = 'value', data) {
  return {
    type,
    data,
    axisLine: { lineStyle: { color: t.axisLine } },
    axisLabel: { color: t.text, fontSize: 11 },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: t.split } }
  };
}

// Core wrapper: mounts an ECharts instance, keeps it in sync, resizes.
function EChart({ option, height = 250, className = '' }) {
  const el = useRef(null);
  const chart = useRef(null);

  useEffect(() => {
    if (!el.current) return undefined;
    chart.current = echarts.init(el.current);
    const onResize = () => chart.current && chart.current.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.current && chart.current.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    if (chart.current) chart.current.setOption(option, true);
  }, [option]);

  return <div ref={el} className={className} style={{ width: '100%', height }} />;
}

const commonText = { textStyle: { fontFamily: 'Inter, system-ui, sans-serif' }, color: PALETTE };

// ---- Line / Area trend ----
export function TrendChart({ categories = [], series = [], area = true, height = 250 }) {
  const dark = useDark();
  const option = useMemo(() => {
    const t = tokens(dark);
    return {
      ...commonText,
      tooltip: baseTooltip(t, 'axis'),
      legend: series.length > 1 ? { bottom: 0, textStyle: { color: t.text, fontSize: 11 }, icon: 'circle' } : undefined,
      grid: { left: 10, right: 16, top: 18, bottom: series.length > 1 ? 30 : 6, containLabel: true },
      xAxis: axis(t, 'category', categories),
      yAxis: axis(t, 'value'),
      series: series.map((s, i) => ({
        name: s.name,
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 3 },
        areaStyle: area && series.length === 1 ? { opacity: 0.12 } : undefined,
        data: s.data
      }))
    };
  }, [dark, categories, series, area]);
  return <EChart option={option} height={height} />;
}

// ---- Donut (status distribution) ----
export function StatusDonut({ data = [], height = 250 }) {
  const dark = useDark();
  const option = useMemo(() => {
    const t = tokens(dark);
    return {
      ...commonText,
      tooltip: baseTooltip(t, 'item'),
      legend: { bottom: 0, textStyle: { color: t.text, fontSize: 11 }, icon: 'circle' },
      series: [{
        type: 'pie', radius: ['52%', '74%'], center: ['50%', '44%'],
        label: { show: false }, data
      }]
    };
  }, [dark, data]);
  return <EChart option={option} height={height} />;
}

// ---- Bar comparison ----
export function BarComparison({ categories = [], data = [], height = 250 }) {
  const dark = useDark();
  const option = useMemo(() => {
    const t = tokens(dark);
    return {
      ...commonText,
      tooltip: baseTooltip(t, 'axis'),
      grid: { left: 10, right: 16, top: 18, bottom: 6, containLabel: true },
      xAxis: axis(t, 'category', categories),
      yAxis: axis(t, 'value'),
      series: [{ type: 'bar', barWidth: '52%', itemStyle: { borderRadius: [6, 6, 0, 0] }, data }]
    };
  }, [dark, categories, data]);
  return <EChart option={option} height={height} />;
}

// ---- Recruitment funnel ----
export function RecruitmentFunnel({ data = [], height = 250 }) {
  const dark = useDark();
  const option = useMemo(() => {
    const t = tokens(dark);
    return {
      ...commonText,
      tooltip: baseTooltip(t, 'item'),
      series: [{
        type: 'funnel', left: '6%', right: '6%', top: 6, bottom: 6, minSize: '26%', gap: 2,
        label: { color: '#fff', fontWeight: 700, fontSize: 11 }, data
      }]
    };
  }, [dark, data]);
  return <EChart option={option} height={height} />;
}

// ---- Health gauge ----
export function HealthGauge({ value = 0, color = '#7c3aed', height = 200 }) {
  const dark = useDark();
  const option = useMemo(() => {
    const t = tokens(dark);
    return {
      ...commonText,
      series: [{
        type: 'gauge', startAngle: 210, endAngle: -30, min: 0, max: 100,
        progress: { show: true, width: 12, itemStyle: { color } },
        axisLine: { lineStyle: { width: 12, color: [[1, t.gaugeTrack]] } },
        axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
        pointer: { show: false }, anchor: { show: false }, title: { show: false },
        detail: { fontSize: 26, fontWeight: 800, offsetCenter: [0, 0], formatter: '{value}%', color: t.gaugeText },
        data: [{ value }]
      }]
    };
  }, [dark, value, color]);
  return <EChart option={option} height={height} />;
}

// ---- Activity heatmap ----
export function ActivityHeatmap({ xLabels = [], yLabels = [], data = [], height = 250 }) {
  const dark = useDark();
  const option = useMemo(() => {
    const t = tokens(dark);
    return {
      ...commonText,
      tooltip: { ...baseTooltip(t, 'item'), position: 'top' },
      grid: { left: 10, right: 16, top: 10, bottom: 22, containLabel: true },
      xAxis: { ...axis(t, 'category', xLabels), splitArea: { show: true } },
      yAxis: { ...axis(t, 'category', yLabels), splitArea: { show: true } },
      visualMap: { show: false, min: 0, max: 80, inRange: { color: ['#f2edff', '#8b5cf6', '#6d28d9'] } },
      series: [{ type: 'heatmap', data, itemStyle: { borderColor: dark ? '#0b1120' : '#fff', borderWidth: 2, borderRadius: 4 } }]
    };
  }, [dark, xLabels, yLabels, data]);
  return <EChart option={option} height={height} />;
}
