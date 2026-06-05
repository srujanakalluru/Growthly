import { Injectable } from '@angular/core';
import type { Chart } from 'chart.js';

import {
  AccelerationPoint,
  GrowthPoint,
  DowRhythmRow,
  PumpFrequencyPoint,
  VelocityPoint,
} from '../models/feeding.models';

/**
 * Shared mutable runtime for derived state (`allCharts`,
 * `measurementGrowthData`, `pumpFrequencyData`, …).
 *
 * The chart layer writes the derived growth arrays here while building charts;
 * the analysis layer reads them back to drive the growth-trend alert and to
 * feed the pump-frequency / day-of-week charts.
 */
@Injectable({ providedIn: 'root' })
export class DashboardRuntime {
  /** Live Chart.js instances, keyed by logical chart name. */
  readonly charts: Record<string, Chart> = {};

  measurementGrowthData: GrowthPoint[] = [];
  measurementVelocityData: VelocityPoint[] = [];
  measurementAccelerationData: AccelerationPoint[] = [];
  pumpFrequencyData: PumpFrequencyPoint[] | null = null;
  dowRhythmData: DowRhythmRow[] | null = null;

  destroyAllCharts(): void {
    for (const key of Object.keys(this.charts)) {
      const chart = this.charts[key];
      if (chart && typeof chart.destroy === 'function') {
        chart.destroy();
      }
      delete this.charts[key];
    }
  }
}
