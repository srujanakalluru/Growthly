import { Injectable, computed, signal } from '@angular/core';

import { BABY_CONFIG } from '../config/baby-config';
import {
  DailyEntry,
  DateRange,
  FeedingSession,
  RawDailyRow,
  RawSessionRow,
} from '../models/feeding.models';
import { calculateRollingAverage } from '../../shared/utils/array-utils';
import { isValidDate } from '../../shared/utils/date-utils';
import { parseCsv } from '../../shared/utils/csv-parser';

const DAILY_CSV = 'data/feeding-data.csv';
const SESSIONS_CSV = 'data/sessions-data.csv';

/**
 * Loads and exposes the feeding/growth data set as reactive signals: `data()`
 * is the fully processed daily array, `dateRange()` is the active index window,
 * and `filteredData()` is the derived slice the charts and stats render.
 */
@Injectable({ providedIn: 'root' })
export class FeedingDataService {
  private readonly _data = signal<DailyEntry[]>([]);
  private readonly _dateRange = signal<DateRange | null>(null);
  private readonly _loaded = signal(false);

  readonly showingLastTwoWeeks = signal(false);
  readonly showingLastFourWeeks = signal(false);

  /** Full processed daily data. */
  readonly data = this._data.asReadonly();
  readonly dateRange = this._dateRange.asReadonly();
  readonly loaded = this._loaded.asReadonly();

  /** Data within the active date range (inclusive). */
  readonly filteredData = computed<DailyEntry[]>(() => {
    const range = this._dateRange();
    const all = this._data();
    if (!range || all.length === 0) {
      return [];
    }
    return all.slice(range.start, range.end + 1);
  });

  /** Fetch the CSV sources, process them, and seed the signals. */
  async load(): Promise<void> {
    if (this._loaded()) {
      return;
    }

    const [dailyText, sessionsText] = await Promise.all([
      fetch(DAILY_CSV).then((r) => r.text()),
      fetch(SESSIONS_CSV).then((r) => r.text()),
    ]);

    const dailyRows = parseCsv(dailyText) as unknown as RawDailyRow[];
    const sessionRows = parseCsv(sessionsText) as unknown as RawSessionRow[];

    const sessionsByDate = this.groupSessionsByDate(sessionRows);
    const processed = this.processData(dailyRows, sessionsByDate);
    this.calculateRollingAverages(processed);
    this.calculateConsumptionRollingAverages(processed);

    this._data.set(processed);
    this._dateRange.set({ start: 0, end: processed.length - 1 });
    this._loaded.set(true);
  }

  setDateRange(start: number, end: number): void {
    this._dateRange.set({ start, end });
  }

  showFullPeriod(): void {
    const all = this._data();
    this._dateRange.set({ start: 0, end: all.length - 1 });
    this.showingLastTwoWeeks.set(false);
    this.showingLastFourWeeks.set(false);
  }

  showLastTwoWeeks(): void {
    const all = this._data();
    const endIndex = all.length - 1;
    const startIndex = Math.max(
      0,
      endIndex - (BABY_CONFIG.analysisParams.toggleTwoWeeksDays - 1),
    );
    this._dateRange.set({ start: startIndex, end: endIndex });
    this.showingLastTwoWeeks.set(true);
    this.showingLastFourWeeks.set(false);
  }

  showLastFourWeeks(): void {
    const all = this._data();
    const endIndex = all.length - 1;
    const startIndex = Math.max(
      0,
      endIndex - (BABY_CONFIG.analysisParams.toggleFourWeeksDays - 1),
    );
    this._dateRange.set({ start: startIndex, end: endIndex });
    this.showingLastFourWeeks.set(true);
    this.showingLastTwoWeeks.set(false);
  }


  private groupSessionsByDate(
    sessionsData: RawSessionRow[],
  ): Record<string, FeedingSession[]> {
    const sessionsByDate: Record<string, FeedingSession[]> = {};

    sessionsData.forEach((session) => {
      if (!isValidDate(session.date)) {
        return;
      }

      (sessionsByDate[session.date] ??= []).push({
        timeSlot: session.timeSlot || 'Unknown',
        exprMilk: session.exprMilk || 0,
        formula: session.formula || 0,
        feedTotal: (session.exprMilk || 0) + (session.formula || 0),
        pumpLeft: session.pumpLeft || 0,
        pumpRight: session.pumpRight || 0,
        pumpTotal: (session.pumpLeft || 0) + (session.pumpRight || 0),
        feedTime: session.feedTime || null,
        pumpTime: session.pumpTime || null,
      });
    });

    return sessionsByDate;
  }

  private processData(
    dailyData: RawDailyRow[],
    sessionsByDate: Record<string, FeedingSession[]>,
  ): DailyEntry[] {
    return dailyData
      .filter((d) => isValidDate(d.date))
      .map((d) => {
        const total = (d.pumpLeft || 0) + (d.pumpRight || 0);
        const consumed = (d.expr || 0) + (d.form || 0);

        return {
          date: d.date,
          pL: d.pumpLeft || 0,
          pR: d.pumpRight || 0,
          total,
          expr: d.expr || 0,
          form: d.form || 0,
          deficit: consumed - total,
          sessions: sessionsByDate[d.date] || [],
          weight: d.weight ?? null,
          height: d.height ?? null,
          headCirc: d.headCirc ?? null,
          roll7: null,
          roll14: null,
          roll28: null,
        } satisfies DailyEntry;
      });
  }

  private calculateRollingAverages(data: DailyEntry[]): void {
    const windows: { size: number; key: 'roll7' | 'roll14' | 'roll28' }[] = [
      { size: 7, key: 'roll7' },
      { size: 14, key: 'roll14' },
      { size: 28, key: 'roll28' },
    ];

    data.forEach((d, i) => {
      windows.forEach(({ size, key }) => {
        d[key] = calculateRollingAverage(data, i, size, (item) => item.total);
      });
    });
  }

  /** roll7Expr / roll7Form — computed at load. */
  private calculateConsumptionRollingAverages(data: DailyEntry[]): void {
    data.forEach((d, i) => {
      d.roll7Expr = calculateRollingAverage(data, i, 7, (item) => item.expr || 0);
      d.roll7Form = calculateRollingAverage(data, i, 7, (item) => item.form || 0);
    });
  }
}
