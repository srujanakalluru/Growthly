/**
 * Chart.js helper functions, palette and custom plugins.
 * Types around Chart.js config objects are intentionally loose (`any`).
 */
import { BABY_CONFIG } from '../../../core/config/baby-config';
import { DailyEntry, GrowthPoint } from '../../../core/models/feeding.models';

export const CHART_COLORS = {
  production: '#34495e',
  consumption: '#27ae60',
  formula: '#e67e22',
  weight: '#2980b9',
  height: '#8e44ad',
  headCirc: '#c0392b',
  bmi: '#e67e22',
  avgWeek1: '#3498db',
  avgWeek2: '#9b59b6',
  avgWeek4: '#e74c3c',
  whoP3: '#95a5a6',
  whoP15: '#3498db',
  whoP50: '#27ae60',
  whoP85: '#e67e22',
  whoP97: '#e74c3c',
  anomaly: '#e74c3c',
  lightGray: '#bdc3c7',
  equalLine: '#7f8c8d',
  acceleration: '#007aff',
  accelPositive: '#34c759',
  accelNegative: '#ff9f0a',
};

export const OUTPUT_COLOR_BANDS: { threshold: number; color: string; label: string }[] = [
  { threshold: 50, color: '#f5f7ff', label: '≤50 ml' },
  { threshold: 200, color: '#dbeafe', label: '50–200 ml' },
  { threshold: 400, color: '#bfdbfe', label: '200–400 ml' },
  { threshold: 600, color: '#93c5fd', label: '400–600 ml' },
  { threshold: 750, color: '#60a5fa', label: '600–750 ml' },
  { threshold: 850, color: '#3b82f6', label: '750–850 ml' },
  { threshold: 900, color: '#2563eb', label: '850–900 ml' },
  { threshold: 950, color: '#1d4ed8', label: '900–950 ml' },
  { threshold: 1000, color: '#172554', label: '950–1000 ml' },
  { threshold: Infinity, color: '#0a0a23', label: '>1000 ml' },
];

export function pumpSessionCount(d: DailyEntry): number {
  if (!Array.isArray(d.sessions)) {
    return 0;
  }
  return d.sessions.filter((s) => (s.pumpLeft || 0) > 0 || (s.pumpRight || 0) > 0).length;
}

export function parseDateForCharts(dateStr: string | null | undefined): Date | null {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }
  const parts = dateStr.split('/');
  if (parts.length !== 3) {
    return null;
  }
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) {
    return null;
  }
  return new Date(year, month, day);
}

export function dataDays(d: { date: string }): number | null {
  const dateObj = parseDateForCharts(d.date);
  return dateObj
    ? Math.floor((dateObj.getTime() - BABY_CONFIG.birthDate.getTime()) / 86400000)
    : null;
}

export function daysToWeekLabel(value: number): string {
  if (value === 0) {
    return '';
  }
  const week = Math.floor(value / 7);
  const step = window.innerWidth <= 768 ? 28 : 14;
  return value % step === 0 ? `W${week}` : '';
}

interface MonthMarker {
  value: number;
  label: string;
  color: string;
  borderDash: number[];
}

function getMonthlyMarkers(minDays: number, maxDays: number): MonthMarker[] {
  const markers: MonthMarker[] = [];
  const monthsInRange = Math.ceil(maxDays / 30.4);
  for (let month = 1; month <= monthsInRange; month++) {
    const dayValue = month * 30.4;
    if (dayValue >= minDays && dayValue <= maxDays) {
      markers.push({
        value: dayValue,
        label: `Month ${month}`,
        color: 'rgba(0, 0, 0, 0.75)',
        borderDash: [3, 3],
      });
    }
  }
  return markers;
}

function drawMonthBadge(ctx: CanvasRenderingContext2D, x: number, y: number, label: string): void {
  ctx.save();
  ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const textWidth = ctx.measureText(label).width;
  const padX = 8;
  const w = textWidth + padX * 2;
  const h = 21;
  const r = 4;
  const bx = x - w / 2;
  const by = y - h / 2;

  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + w - r, by);
  ctx.arcTo(bx + w, by, bx + w, by + r, r);
  ctx.lineTo(bx + w, by + h - r);
  ctx.arcTo(bx + w, by + h, bx + w - r, by + h, r);
  ctx.lineTo(bx + r, by + h);
  ctx.arcTo(bx, by + h, bx, by + h - r, r);
  ctx.lineTo(bx, by + r);
  ctx.arcTo(bx, by, bx + r, by, r);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = 'rgba(60, 60, 67, 0.85)';
  ctx.fillText(label, x, y);
  ctx.restore();
}

export function createMonthlyAnnotationPlugin(minDays: number, maxDays: number): any {
  const markers = getMonthlyMarkers(minDays, maxDays);
  return {
    id: 'monthlyMarkers',
    afterDatasetsDraw(chart: any) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea || !scales.x) {
        return;
      }
      ctx.save();
      markers.forEach((marker) => {
        const xPos = scales.x.getPixelForValue(marker.value);
        ctx.strokeStyle = marker.color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash(marker.borderDash);
        ctx.beginPath();
        ctx.moveTo(xPos, chartArea.top);
        ctx.lineTo(xPos, chartArea.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        drawMonthBadge(ctx, xPos, chartArea.top + 14, marker.label);
      });
      ctx.restore();
    },
  };
}

function drawLactationBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  color: string,
): void {
  ctx.save();
  ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const textWidth = ctx.measureText(label).width;
  const padX = 6;
  const w = textWidth + padX * 2;
  const h = 18;
  const r = 9;
  const bx = x - w / 2;
  const by = y - h / 2;

  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + w - r, by);
  ctx.arcTo(bx + w, by, bx + w, by + r, r);
  ctx.lineTo(bx + w, by + h - r);
  ctx.arcTo(bx + w, by + h, bx + w - r, by + h, r);
  ctx.lineTo(bx + r, by + h);
  ctx.arcTo(bx, by + h, bx, by + h - r, r);
  ctx.lineTo(bx, by + r);
  ctx.arcTo(bx, by, bx + r, by, r);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.92;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff';
  ctx.fillText(label, x, y);
  ctx.restore();
}

export function createLactationStagePlugin(minDays: number, maxDays: number): any {
  const stages = BABY_CONFIG.lactationStages.filter((s) => s.day >= minDays && s.day <= maxDays);
  return {
    id: 'lactationStages',
    afterDatasetsDraw(chart: any) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea || !scales.x) {
        return;
      }
      ctx.save();
      stages.forEach((stage) => {
        const xPos = scales.x.getPixelForValue(stage.day);
        ctx.strokeStyle = stage.color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(xPos, chartArea.top);
        ctx.lineTo(xPos, chartArea.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        drawLactationBadge(ctx, xPos, chartArea.bottom - stage.yOffset, stage.label, stage.color);
      });
      ctx.restore();
    },
  };
}

export function getWHOValue(
  days: number,
  percentile: number,
  measurementType: string,
): number | null {
  const lms = BABY_CONFIG.getInterpolatedLMS(days, measurementType);
  if (!lms) {
    return null;
  }
  const { L, M, S } = lms;
  const p = percentile / 100;
  let z: number;

  if (p === 0.5) {
    z = 0;
  } else if (p < 0.5) {
    const t = Math.sqrt(-2 * Math.log(p));
    z = -(t - (2.515517 + 0.802853 * t + 0.010328 * t * t) /
      (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t));
  } else {
    const t = Math.sqrt(-2 * Math.log(1 - p));
    z = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) /
      (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
  }

  if (Math.abs(L) < 0.01) {
    return M * Math.exp(S * z);
  }
  return M * Math.pow(1 + L * S * z, 1 / L);
}

export function getWFLValue(lengthCm: number, percentile: number): number | null {
  const lms = BABY_CONFIG.getLMSForLength(lengthCm);
  if (!lms) {
    return null;
  }
  const { L, M, S } = lms;
  const p = percentile / 100;
  let z: number;
  if (p === 0.5) {
    z = 0;
  } else if (p < 0.5) {
    const t = Math.sqrt(-2 * Math.log(p));
    z = -(t - (2.515517 + 0.802853 * t + 0.010328 * t * t) /
      (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t));
  } else {
    const t = Math.sqrt(-2 * Math.log(1 - p));
    z = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) /
      (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
  }
  if (Math.abs(L) < 0.01) {
    return M * Math.exp(S * z);
  }
  return M * Math.pow(1 + L * S * z, 1 / L);
}

/** Merge config early-weight entries with CSV data and enrich with WHO values. */
export function generateMeasurementGrowthData(data: DailyEntry[]): GrowthPoint[] {
  const birthDate = BABY_CONFIG.birthDate;

  const earlyEntries = (BABY_CONFIG.earlyWeightEntries || []).map((e) => ({
    date: e.date,
    weight: e.weight,
    height: e.height || null,
    headCirc: e.headCirc || null,
  }));
  const csvDates = new Set(data.map((d) => d.date));
  const uniqueEarly = earlyEntries.filter((e) => !csvDates.has(e.date));
  const allEntries = [...uniqueEarly, ...data].sort((a, b) => {
    const da = parseDateForCharts(a.date);
    const db = parseDateForCharts(b.date);
    return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
  });

  return allEntries
    .map((d): GrowthPoint | null => {
      if (!d.weight) {
        return null;
      }
      const entryDate = parseDateForCharts(d.date);
      if (!entryDate) {
        return null;
      }
      const days = Math.floor((entryDate.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24));
      const zScore = BABY_CONFIG.calculateZScore(days, d.weight, 'weight');
      return {
        date: d.date,
        days,
        weight: d.weight,
        zScore,
        who3: getWHOValue(days, 3, 'weight'),
        who15: getWHOValue(days, 15, 'weight'),
        who50: getWHOValue(days, 50, 'weight'),
        who85: getWHOValue(days, 85, 'weight'),
        who97: getWHOValue(days, 97, 'weight'),
      };
    })
    .filter((d): d is GrowthPoint => d !== null);
}

/** Tooltip config closing over the active data array. */
export function makeEnhancedTooltip(data: DailyEntry[]): any {
  return {
    callbacks: {
      title(context: any) {
        const dayVal = context[0].parsed.x;
        const entry = data.find((d) => dataDays(d) === dayVal);
        return entry ? 'Date: ' + entry.date : `Day ${dayVal}`;
      },
      afterBody(context: any) {
        const dayVal = context[0].parsed.x;
        const d = data.find((e) => dataDays(e) === dayVal);
        if (!d) {
          return [];
        }
        return [
          '',
          'Left: ' + (d.pL || 0) + 'ml',
          'Right: ' + (d.pR || 0) + 'ml',
          'Total: ' + (d.total || 0) + 'ml',
          'Consumed: ' + ((d.expr || 0) + (d.form || 0)) + 'ml',
          'Deficit: ' + (d.deficit || 0) + 'ml',
        ];
      },
    },
  };
}

export function getCalendarColorByOutput(totalOutput: number): string {
  if (!totalOutput || totalOutput === 0) {
    return '#e0e0e0';
  }
  for (const band of OUTPUT_COLOR_BANDS) {
    if (totalOutput <= band.threshold) {
      return band.color;
    }
  }
  return OUTPUT_COLOR_BANDS[OUTPUT_COLOR_BANDS.length - 1].color;
}

function hexLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrastTextColor(hex: string): string {
  return hexLuminance(hex) > 0.35 ? '#1c1c1e' : '#ffffff';
}
