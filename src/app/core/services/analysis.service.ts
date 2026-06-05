import { Injectable, inject } from '@angular/core';

import { BABY_CONFIG } from '../config/baby-config';
import {
  AccelerationPoint,
  DailyEntry,
  DowRhythmRow,
  PumpFrequencyPoint,
  VelocityPoint,
} from '../models/feeding.models';
import { GrowthTrendAlert } from '../models/dashboard.models';
import { MILLISECONDS_PER_DAY, parseDate } from '../../shared/utils/date-utils';
import { DashboardRuntime } from './dashboard-runtime';
import { FeedingDataService } from './feeding-data.service';

interface Regression {
  slope: number;
  intercept: number;
  r2: number;
}

/**
 * Statistical analysis: linear regression, growth-trend detection,
 * pump-frequency aggregation and the day-of-week rhythm. Pure computation —
 * results are returned or written to the shared {@link DashboardRuntime}.
 */
@Injectable({ providedIn: 'root' })
export class AnalysisService {
  private readonly feeding = inject(FeedingDataService);
  private readonly runtime = inject(DashboardRuntime);

  calculateLinearRegression(values: number[]): Regression {
    const n = values.length;
    if (n < 2) {
      return { slope: 0, intercept: 0, r2: 0 };
    }

    const sumX = (n * (n - 1)) / 2;
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((sum, y, i) => sum + i * y, 0);

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) {
      return { slope: 0, intercept: 0, r2: 0 };
    }

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    const yMean = sumY / n;
    const ssTotal = values.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
    const ssResidual = values.reduce(
      (sum, y, i) => sum + Math.pow(y - (slope * i + intercept), 2),
      0,
    );
    const r2 = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

    return { slope, intercept, r2 };
  }

  detectGrowthTrends(
    velocityData: VelocityPoint[] | null,
    accelerationData: AccelerationPoint[] | null,
  ): GrowthTrendAlert {
    if (!velocityData || velocityData.length < 3) {
      return {
        alert: 'insufficient_data',
        message: 'Need at least 3 measurement intervals for trend analysis',
        recommendation: 'Continue tracking weight at regular intervals',
      };
    }

    const recent = velocityData.slice(-4);
    const velocities = recent.map((v) => v.velocity).filter((v) => !isNaN(v));

    if (velocities.length < 3) {
      return {
        alert: 'insufficient_data',
        message: 'Insufficient valid velocity data',
        recommendation: 'Continue tracking',
      };
    }

    const trend = this.calculateLinearRegression(velocities);
    const avgVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const latestVelocity = velocities[velocities.length - 1];
    const currentDays = recent[recent.length - 1].days;
    const whoRange = BABY_CONFIG.getWHOVelocityRange(currentDays);

    let accelerationStatus: string | null = null;
    if (accelerationData && accelerationData.length > 0) {
      const avgAccel =
        accelerationData.slice(-2).reduce((sum, a) => sum + a.acceleration, 0) / 2;
      if (avgAccel < -20) accelerationStatus = 'rapid_deceleration';
      else if (avgAccel < -10) accelerationStatus = 'moderate_deceleration';
      else if (avgAccel > 20) accelerationStatus = 'rapid_acceleration';
      else if (avgAccel > 10) accelerationStatus = 'moderate_acceleration';
      else accelerationStatus = 'stable';
    }

    if (trend.slope < -20 && trend.r2 > 0.6) {
      return {
        alert: 'warning',
        severity: 'moderate',
        message: `Declining growth velocity detected (${trend.slope.toFixed(1)} g/week)`,
        currentVelocity: latestVelocity.toFixed(0),
        avgVelocity: avgVelocity.toFixed(0),
        whoRange,
        accelerationStatus,
        recommendation: 'Monitor feeding and weight closely',
        action: 'Recheck weight in 1–2 weeks',
        confidence: (trend.r2 * 100).toFixed(0) + '%',
      };
    }

    if (latestVelocity < whoRange.min) {
      return {
        alert: 'warning',
        severity: 'high',
        message: `Growth velocity below reference (${latestVelocity.toFixed(0)} g/week)`,
        currentVelocity: latestVelocity.toFixed(0),
        whoRange,
        accelerationStatus,
        recommendation: 'Evaluate feeding adequacy',
        action: 'Consult pediatrician if persists',
      };
    }

    if (latestVelocity > whoRange.max) {
      return {
        alert: 'info',
        severity: 'low',
        message: `Rapid growth (${latestVelocity.toFixed(0)} g/week)`,
        currentVelocity: latestVelocity.toFixed(0),
        whoRange,
        accelerationStatus,
        recommendation: 'Likely catch-up growth',
        action: 'Routine monitoring',
      };
    }

    return {
      alert: 'success',
      severity: 'none',
      message: `Growth velocity within expected range (${latestVelocity.toFixed(0)} g/week)`,
      currentVelocity: latestVelocity.toFixed(0),
      avgVelocity: avgVelocity.toFixed(0),
      whoRange,
      accelerationStatus,
      recommendation: 'Continue current care',
      action: 'Routine monitoring',
    };
  }

  /** Report subtitle string. */
  computeSubtitle(): string {
    const data = this.feeding.data();
    if (data.length === 0) {
      return '';
    }

    const latestDataDate = parseDate(data[data.length - 1].date);
    if (!latestDataDate) {
      return '';
    }

    const ageInDays = Math.floor(
      (latestDataDate.getTime() - BABY_CONFIG.birthDate.getTime()) / MILLISECONDS_PER_DAY,
    );
    const correctedAgeDays = BABY_CONFIG.getCorrectedAgeDays(ageInDays);
    const correctedAgeMonths = (correctedAgeDays / 30.4).toFixed(1);

    let latestWeight: number | null = null;
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].weight != null) {
        latestWeight = data[i].weight;
        break;
      }
    }
    const weightText = latestWeight ? `${latestWeight.toFixed(3)} kg` : 'No weight data';

    return BABY_CONFIG.uiText.subtitle
      .replace('{birthDate}', BABY_CONFIG.birthDateString)
      .replace('{gestationalAge}', BABY_CONFIG.gestationalAge.display)
      .replace('{category}', BABY_CONFIG.gestationalAge.category)
      .replace('{currentDays}', String(ageInDays))
      .replace('{correctedDays}', String(correctedAgeDays))
      .replace('{correctedMonths}', correctedAgeMonths)
      .replace('{weight}', weightText);
  }

  /** Compute pump-frequency series and store it on the runtime. */
  analyzePumpFrequency(): void {
    const analysisData = this.feeding.filteredData();
    const { minDaysForPumpFrequency, pumpFrequencyWindow } = BABY_CONFIG.analysisParams;

    if (analysisData.length < minDaysForPumpFrequency) {
      this.runtime.pumpFrequencyData = null;
      return;
    }

    const dailyFrequency: PumpFrequencyPoint[] = analysisData.map((d) => ({
      date: d.date,
      sessions: d.sessions
        ? d.sessions.filter((s) => (s.pumpLeft || 0) > 0 || (s.pumpRight || 0) > 0).length
        : 0,
      totalOutput: d.total || 0,
      avgFrequency: null,
      avgOutput: null,
    }));

    dailyFrequency.forEach((d, i) => {
      if (i >= pumpFrequencyWindow - 1) {
        const win = dailyFrequency.slice(i - (pumpFrequencyWindow - 1), i + 1);
        const sorted = [...win.map((day) => day.sessions)].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        d.avgFrequency =
          Math.round(
            (sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) * 10,
          ) / 10;
        d.avgOutput = Math.round(
          win.reduce((sum, day) => sum + day.totalOutput, 0) / pumpFrequencyWindow,
        );
      }
    });

    this.runtime.pumpFrequencyData = dailyFrequency;
  }

  /** Compute day-of-week rhythm rows and store them on the runtime. */
  computeDowRhythm(): void {
    const analysisData = this.feeding.filteredData();
    if (!analysisData || analysisData.length < 7) {
      this.runtime.dowRhythmData = null;
      return;
    }

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const stats: Record<
      string,
      { prodSum: number; consumeSum: number; formSum: number; count: number }
    > = {};
    dayNames.forEach((n) => {
      stats[n] = { prodSum: 0, consumeSum: 0, formSum: 0, count: 0 };
    });

    analysisData.forEach((d: DailyEntry) => {
      const dt = parseDate(d.date);
      if (!dt) {
        return;
      }
      const dow = dayNames[dt.getDay()];
      stats[dow].prodSum += d.total || 0;
      stats[dow].consumeSum += (d.expr || 0) + (d.form || 0);
      stats[dow].formSum += d.form || 0;
      stats[dow].count++;
    });

    const rows: DowRhythmRow[] = dayNames.map((name) => {
      const s = stats[name];
      const avgProd = s.count > 0 ? Math.round(s.prodSum / s.count) : 0;
      const avgConsume = s.count > 0 ? Math.round(s.consumeSum / s.count) : 0;
      const avgForm = s.count > 0 ? Math.round(s.formSum / s.count) : 0;
      return {
        day: name,
        avgProduction: avgProd,
        avgConsumption: avgConsume,
        avgFormula: avgForm,
        gap: avgProd - avgConsume,
        count: s.count,
      };
    });

    this.runtime.dowRhythmData = rows;
  }
}
