import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { PumpFrequencyPoint } from '../../../../core/models/feeding.models';
import {
  OUTPUT_COLOR_BANDS,
  contrastTextColor,
  getCalendarColorByOutput,
} from '../../charts/chart-helpers';

interface CalendarCell {
  day: number;
  kind: 'empty' | 'before-tracking' | 'has-data' | 'no-data';
  sessions?: number;
  output?: number;
  date?: string;
  bg?: string;
  textColor?: string;
  title?: string;
}

interface CalendarMonth {
  name: string;
  cells: CalendarCell[];
}

interface LegendItem {
  color: string;
  label: string;
}

const PUMP_TRACKING_START = new Date(2024, 6, 22); // 22 Jun 2024

/**
 * Monthly heat calendar of daily pump output.
 */
@Component({
  selector: 'app-pump-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pump-calendar.html',
  styleUrl: './pump-calendar.css',
})
export class PumpCalendar {
  readonly data = input<PumpFrequencyPoint[] | null>(null);

  readonly bandLegend: LegendItem[] = OUTPUT_COLOR_BANDS.map((b) => ({
    color: b.color,
    label: b.label,
  }));

  readonly months = computed<CalendarMonth[]>(() => this.buildMonths(this.data()));

  private buildMonths(data: PumpFrequencyPoint[] | null): CalendarMonth[] {
    if (!data || data.length === 0) {
      return [];
    }

    const byMonth: Record<string, { year: number; month: number; days: Record<number, PumpFrequencyPoint> }> = {};
    data.forEach((d) => {
      const [day, month, year] = d.date.split('/');
      const key = `${year}-${month}`;
      (byMonth[key] ??= { year: +year, month: +month, days: {} }).days[+day] = d;
    });

    return Object.keys(byMonth)
      .sort()
      .map((key) => {
        const m = byMonth[key];
        const name = new Date(m.year, m.month - 1, 1).toLocaleString('default', {
          month: 'long',
          year: 'numeric',
        });
        const cells: CalendarCell[] = [];

        const firstDay = new Date(m.year, m.month - 1, 1).getDay();
        for (let i = 0; i < firstDay; i++) {
          cells.push({ day: 0, kind: 'empty' });
        }

        const daysInMonth = new Date(m.year, m.month, 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
          const current = new Date(m.year, m.month - 1, day);
          const dayData = m.days[day];

          if (current < PUMP_TRACKING_START) {
            cells.push({ day, kind: 'before-tracking', title: 'Before pump tracking started (16/10/2025)' });
          } else if (dayData) {
            const bg = getCalendarColorByOutput(dayData.totalOutput);
            cells.push({
              day,
              kind: 'has-data',
              sessions: dayData.sessions,
              output: dayData.totalOutput,
              date: dayData.date,
              bg,
              textColor: contrastTextColor(bg),
              title: `${dayData.date}: ${dayData.sessions} sessions, ${dayData.totalOutput}ml`,
            });
          } else {
            cells.push({ day, kind: 'no-data', title: 'No pump sessions recorded' });
          }
        }

        return { name, cells };
      });
  }
}
