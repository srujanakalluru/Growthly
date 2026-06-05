import { Injectable, inject } from '@angular/core';
import { Chart, registerables } from 'chart.js';

import { BABY_CONFIG } from '../../../core/config/baby-config';
import { DailyEntry, VelocityPoint, AccelerationPoint } from '../../../core/models/feeding.models';
import { DashboardRuntime } from '../../../core/services/dashboard-runtime';
import { FeedingDataService } from '../../../core/services/feeding-data.service';
import {
  CHART_COLORS,
  createLactationStagePlugin,
  createMonthlyAnnotationPlugin,
  dataDays,
  daysToWeekLabel,
  generateMeasurementGrowthData,
  getWFLValue,
  getWHOValue,
  makeEnhancedTooltip,
  parseDateForCharts,
  pumpSessionCount,
} from './chart-helpers';

Chart.register(...registerables);

/** Canvas map keyed by element id. */
export type CanvasMap = Record<string, HTMLCanvasElement | undefined>;

/**
 * Builds and updates every Chart.js chart for the dashboard. Canvases are
 * supplied by the host component.
 */
@Injectable({ providedIn: 'root' })
export class ChartManagerService {
  private readonly feeding = inject(FeedingDataService);
  private readonly runtime = inject(DashboardRuntime);

  private canvases: CanvasMap = {};
  private get charts(): Record<string, any> {
    return this.runtime.charts as unknown as Record<string, any>;
  }
  private get data(): DailyEntry[] {
    return this.feeding.data();
  }

  private canvas(id: string): HTMLCanvasElement | undefined {
    return this.canvases[id];
  }

  /** Build the initial set of charts. */
  initializeAllCharts(canvases: CanvasMap): void {
    this.canvases = canvases;
    this.runtime.destroyAllCharts();

    if (!this.data || this.data.length === 0) {
      return;
    }

    Chart.defaults.color = '#2c3e50';
    Chart.defaults.borderColor = 'rgba(0,0,0,0.06)';
    Chart.defaults.font.family =
      '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif';

    const isMobile = window.innerWidth <= 768;
    Chart.defaults.font.size = isMobile ? 11 : 16;
    (Chart.defaults.plugins.legend.labels.font as any) = { size: isMobile ? 10 : 14 };
    if (isMobile) {
      Chart.defaults.aspectRatio = 1.6;
      (Chart.defaults.plugins.tooltip.bodyFont as any) = { size: 11 };
      (Chart.defaults.plugins.tooltip.titleFont as any) = { size: 11 };
    }

    this.createProductionCharts();
    this.createCircadianCharts();
    this.createGrowthCharts();
    this.createAnthropometryCharts();
    this.createFormulaDaysChart();
  }

  resizeAll(): void {
    Object.values(this.charts).forEach((chart) => {
      if (chart && typeof chart.resize === 'function') {
        chart.resize();
      }
    });
  }


  private createProductionCharts(): void {
    const data = this.data;
    const minDays = dataDays(data[0]) ?? 0;
    const maxDays = dataDays(data[data.length - 1]) ?? minDays;

    const xScale: any = {
      type: 'linear',
      min: minDays,
      title: { display: true, text: 'Age (weeks)' },
      ticks: { stepSize: 7, autoSkip: false, maxRotation: 0, callback: daysToWeekLabel },
      grid: { color: 'rgba(0,0,0,0.05)' },
    };

    const dailyCanvas = this.canvas('dailyProductionChart');
    if (dailyCanvas) {
      this.charts['dailyProduction'] = new Chart(dailyCanvas, {
        type: 'line',
        data: {
          datasets: [
            {
              label: 'Daily Production',
              data: data.map((d) => ({ x: dataDays(d), y: d.total })) as any,
              borderColor: CHART_COLORS.lightGray,
              backgroundColor: 'rgba(189, 195, 199, 0.1)',
              borderWidth: 1,
              pointRadius: 2,
              pointHoverRadius: 6,
              fill: true,
              spanGaps: true,
            },
            {
              label: '7-Day Average',
              data: data.map((d) => ({ x: dataDays(d), y: d.roll7 })) as any,
              borderColor: CHART_COLORS.avgWeek1,
              borderWidth: 4,
              pointRadius: 0,
              pointHoverRadius: 6,
              tension: 0.4,
              spanGaps: true,
            },
            {
              label: '14-Day Average',
              data: data.map((d) => ({ x: dataDays(d), y: d.roll14 })) as any,
              borderColor: CHART_COLORS.avgWeek2,
              borderWidth: 3,
              pointRadius: 0,
              pointHoverRadius: 6,
              tension: 0.4,
              borderDash: [5, 5],
              spanGaps: true,
            },
          ],
        },
        options: {
          responsive: true,
          aspectRatio: 3.5,
          plugins: {
            legend: { labels: { padding: 20 } },
            title: { display: true, text: 'Daily Production Timeline', font: { size: 20, weight: 'bold' }, padding: { bottom: 20 } },
            tooltip: makeEnhancedTooltip(data),
          },
          scales: {
            y: { beginAtZero: true, title: { display: true, text: 'Volume (ml)' }, grid: { color: 'rgba(0,0,0,0.05)' } },
            x: xScale,
          },
        } as any,
        plugins: [createMonthlyAnnotationPlugin(minDays, maxDays)],
      });
    }

    const prodConsCanvas = this.canvas('productionConsumptionChart');
    if (prodConsCanvas) {
      this.charts['productionConsumption'] = new Chart(prodConsCanvas, {
        type: 'line',
        data: {
          datasets: [
            {
              label: 'Pumped (7d avg)',
              data: data.map((d) => ({ x: dataDays(d), y: d.roll7 })) as any,
              borderColor: CHART_COLORS.production,
              backgroundColor: 'rgba(52, 73, 94, 0.2)',
              borderWidth: 4,
              pointRadius: 0,
              pointHoverRadius: 6,
              tension: 0.4,
              fill: true,
              spanGaps: true,
            },
            {
              label: 'Expressed Milk Consumed (7d avg)',
              data: data.map((d) => ({ x: dataDays(d), y: d.roll7Expr })) as any,
              borderColor: CHART_COLORS.consumption,
              backgroundColor: 'rgba(39, 174, 96, 0.2)',
              borderWidth: 4,
              pointRadius: 0,
              pointHoverRadius: 6,
              tension: 0.4,
              fill: true,
              spanGaps: true,
            },
            {
              label: 'Formula (7d avg)',
              data: data.map((d) => ({ x: dataDays(d), y: d.roll7Form })) as any,
              borderColor: CHART_COLORS.formula,
              backgroundColor: 'rgba(230, 126, 34, 0.2)',
              borderWidth: 3,
              pointRadius: 0,
              pointHoverRadius: 6,
              tension: 0.4,
              fill: true,
              spanGaps: true,
            },
          ],
        },
        options: {
          responsive: true,
          aspectRatio: 3.5,
          plugins: {
            legend: { labels: { padding: 20 } },
            title: { display: true, text: 'Production vs Consumption (7-Day Averages)', font: { size: 20, weight: 'bold' }, padding: { bottom: 20 } },
            tooltip: makeEnhancedTooltip(data),
          },
          scales: {
            y: { beginAtZero: true, max: 1200, title: { display: true, text: 'Volume (ml)' }, grid: { color: 'rgba(0,0,0,0.05)' } },
            x: xScale,
          },
        } as any,
        plugins: [
          createMonthlyAnnotationPlugin(minDays, maxDays),
          createLactationStagePlugin(minDays, maxDays),
        ],
      });
    }

    const rollingCanvas = this.canvas('rollingAvgChart');
    if (rollingCanvas) {
      this.charts['rollingAvg'] = new Chart(rollingCanvas, {
        type: 'line',
        data: {
          datasets: [
            {
              label: 'Daily Production',
              data: data.map((d) => ({ x: dataDays(d), y: d.total })) as any,
              borderColor: CHART_COLORS.lightGray,
              borderWidth: 1,
              pointRadius: 0,
              spanGaps: true,
            },
            {
              label: '1-Week Average',
              data: data.map((d) => ({ x: dataDays(d), y: d.roll7 })) as any,
              borderColor: CHART_COLORS.avgWeek1,
              borderWidth: 3,
              pointRadius: 0,
              tension: 0.4,
              spanGaps: true,
            },
          ],
        },
        options: {
          responsive: true,
          aspectRatio: 3.5,
          plugins: {
            legend: { labels: { padding: 20 } },
            title: { display: true, text: 'Supply Stability Analysis', padding: { bottom: 20 } },
          },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
            x: xScale,
          },
        } as any,
        plugins: [createMonthlyAnnotationPlugin(minDays, maxDays)],
      });
    }
  }

  private createFormulaDaysChart(): void {
    const canvas = this.canvas('formulaDaysChart');
    if (!canvas) {
      return;
    }
    const data = this.data;
    const formulaDays = data.filter((d) => (d.form || 0) > 0);
    if (formulaDays.length === 0) {
      return;
    }

    const labels = formulaDays.map((d) => d.date);
    const breastmilkData = formulaDays.map((d) => d.expr || 0);
    const formulaData = formulaDays.map((d) => d.form || 0);
    const totalData = formulaDays.map((d) => (d.expr || 0) + (d.form || 0));

    this.charts['formulaDays'] = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Breastmilk Consumed',
            data: breastmilkData,
            backgroundColor: 'rgba(39, 174, 96, 0.2)',
            borderColor: 'rgba(39, 174, 96, 0.85)',
            borderWidth: 2,
            pointRadius: formulaDays.length > 40 ? 0 : 3,
            pointHoverRadius: 6,
            fill: 'origin',
            tension: 0.35,
            order: 2,
          },
          {
            label: 'Formula',
            data: formulaData,
            backgroundColor: 'rgba(230, 126, 34, 0.18)',
            borderColor: 'rgba(230, 126, 34, 0.85)',
            borderWidth: 2,
            pointRadius: formulaDays.length > 40 ? 0 : 3,
            pointHoverRadius: 6,
            fill: 'origin',
            tension: 0.35,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        aspectRatio: window.innerWidth <= 768 ? 1.4 : 3,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { padding: 20 } },
          tooltip: {
            callbacks: {
              title: (ctx: any) => 'Date: ' + ctx[0].label,
              afterBody: (ctx: any) => {
                const i = ctx[0].dataIndex;
                const total = totalData[i];
                const formula = formulaData[i];
                const pct = total > 0 ? Math.round((formula / total) * 100) : 0;
                return ['', `Total consumed: ${total} ml`, `Formula share: ${pct}%`, `Breastmilk share: ${100 - pct}%`];
              },
            },
          },
        },
        scales: {
          x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 30 }, grid: { display: false } },
          y: { beginAtZero: true, title: { display: true, text: 'Volume (ml)' }, grid: { color: 'rgba(0,0,0,0.05)' } },
        },
      } as any,
    });
  }


  private createCircadianCharts(): void {
    const circadianCanvas = this.canvas('circadianChart');
    if (circadianCanvas) {
      this.charts['circadian'] = new Chart(circadianCanvas, {
        type: 'radar',
        data: { labels: ['9 PM', '12 AM', '3 AM', '6 AM', '9 AM', '12 PM', '3 PM', '6 PM'], datasets: [] },
        options: {
          responsive: true,
          aspectRatio: 0.65,
          plugins: {
            legend: { labels: { padding: 20 } },
            title: { display: true, text: 'By Time Slot Intervals', font: { size: 18, weight: 'bold' }, padding: { bottom: 20 } },
            subtitle: { display: true, text: 'Based on filtered date range', font: { size: 15, style: 'italic' }, color: '#666' },
          },
          scales: { r: { beginAtZero: true, suggestedMax: 120, ticks: { stepSize: 20 } } },
        } as any,
      });
    }

    const circadianActualCanvas = this.canvas('circadianActualChart');
    if (circadianActualCanvas) {
      this.charts['circadianActual'] = new Chart(circadianActualCanvas, {
        type: 'radar',
        data: { labels: [], datasets: [] },
        options: {
          responsive: true,
          aspectRatio: 0.65,
          plugins: {
            legend: { labels: { padding: 20 } },
            title: { display: true, text: 'By Actual Feed/Pump Times', font: { size: 18, weight: 'bold' }, padding: { bottom: 20 } },
            subtitle: { display: true, text: 'Based on filtered date range', font: { size: 15, style: 'italic' }, color: '#666' },
          },
          scales: {
            r: {
              beginAtZero: true,
              suggestedMax: 120,
              ticks: { stepSize: 20 },
              pointLabels: { font: { size: 12 }, callback: (label: string, index: number) => (index % 2 === 0 ? label : '') },
            },
          },
        } as any,
      });
    }
  }

  updateCircadianChart(filteredData: DailyEntry[]): void {
    if (!filteredData || filteredData.length === 0 || !this.charts['circadian']) {
      return;
    }

    const timeSlots = ['9:00 PM', '12:00 AM', '3:00 AM', '6:00 AM', '9:00 AM', '12:00 PM', '3:00 PM', '6:00 PM'];
    const production: Record<string, number> = {};
    const consumption: Record<string, number> = {};
    const counts: Record<string, number> = {};
    timeSlots.forEach((slot) => {
      production[slot] = 0;
      consumption[slot] = 0;
      counts[slot] = 0;
    });

    filteredData.forEach((day) => {
      if (!day.sessions) {
        return;
      }
      day.sessions.forEach((session) => {
        const slot = session.timeSlot;
        if (timeSlots.includes(slot)) {
          production[slot] += session.pumpTotal || 0;
          consumption[slot] += session.feedTotal || 0;
          counts[slot]++;
        }
      });
    });

    const avgProduction: Record<string, number> = {};
    const avgConsumption: Record<string, number> = {};
    timeSlots.forEach((slot) => {
      avgProduction[slot] = counts[slot] > 0 ? Math.round(production[slot] / counts[slot]) : 0;
      avgConsumption[slot] = counts[slot] > 0 ? Math.round(consumption[slot] / counts[slot]) : 0;
    });

    const circadian = this.charts['circadian'];
    circadian.data.datasets = [
      {
        label: 'Production per Session (ml)',
        data: timeSlots.map((slot) => avgProduction[slot]),
        backgroundColor: 'rgba(52, 73, 94, 0.2)',
        borderColor: CHART_COLORS.production,
        borderWidth: 3,
        pointBackgroundColor: CHART_COLORS.production,
        pointRadius: 6,
      },
      {
        label: 'Consumption per Session (ml)',
        data: timeSlots.map((slot) => avgConsumption[slot]),
        backgroundColor: 'rgba(39, 174, 96, 0.2)',
        borderColor: CHART_COLORS.consumption,
        borderWidth: 3,
        pointBackgroundColor: CHART_COLORS.consumption,
        pointRadius: 6,
      },
    ];

    const totalSessions = filteredData.reduce((sum, d) => sum + pumpSessionCount(d), 0);
    circadian.options.plugins.subtitle.text = `${filteredData.length} days, ${totalSessions} sessions`;

    const maxValueSlot = Math.max(
      ...timeSlots.map((slot) => avgProduction[slot]),
      ...timeSlots.map((slot) => avgConsumption[slot]),
      100,
    );

    circadian.update();
    this.updateCircadianActualChart(filteredData, maxValueSlot);
  }

  private updateCircadianActualChart(filteredData: DailyEntry[], maxFromChart1: number): void {
    const chart = this.charts['circadianActual'];
    if (!chart) {
      return;
    }
    if (!filteredData || filteredData.length === 0) {
      chart.data.datasets = [];
      chart.options.plugins.subtitle.text = 'No data available';
      chart.update();
      return;
    }

    const timeToInterval = (timeStr: string | null): number | null => {
      if (!timeStr || timeStr === 'null' || timeStr === '') {
        return null;
      }
      const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!match) {
        return null;
      }
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const ampm = match[3].toUpperCase();
      if (ampm === 'PM' && hours !== 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      return hours * 2 + (minutes >= 30 ? 1 : 0);
    };

    const generate48Labels = (): string[] => {
      const labels: string[] = [];
      for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 30) {
          const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
          const ampm = h < 12 ? 'AM' : 'PM';
          labels.push(m === 0 ? `${hour12} ${ampm}` : `${hour12}:30 ${ampm}`);
        }
      }
      return labels;
    };

    const productionByInterval = new Array(48).fill(0);
    const consumptionByInterval = new Array(48).fill(0);
    const countsProduction = new Array(48).fill(0);
    const countsConsumption = new Array(48).fill(0);

    filteredData.forEach((day) => {
      if (!day.sessions || day.sessions.length === 0) {
        return;
      }
      day.sessions.forEach((session) => {
        if (session.pumpTime && session.pumpTotal > 0) {
          const interval = timeToInterval(session.pumpTime);
          if (interval !== null && interval >= 0 && interval < 48) {
            productionByInterval[interval] += session.pumpTotal;
            countsProduction[interval]++;
          }
        }
        if (session.feedTime && session.feedTotal > 0) {
          const interval = timeToInterval(session.feedTime);
          if (interval !== null && interval >= 0 && interval < 48) {
            consumptionByInterval[interval] += session.feedTotal;
            countsConsumption[interval]++;
          }
        }
      });
    });

    const avgProductionByInterval = productionByInterval.map((sum, i) =>
      countsProduction[i] > 0 ? Math.round(sum / countsProduction[i]) : 0,
    );
    const avgConsumptionByInterval = consumptionByInterval.map((sum, i) =>
      countsConsumption[i] > 0 ? Math.round(sum / countsConsumption[i]) : 0,
    );

    const maxValueActual = Math.max(...avgProductionByInterval, ...avgConsumptionByInterval, 100);
    const sharedMax = Math.ceil(Math.max(maxValueActual, maxFromChart1 || 0) / 20) * 20;
    const labels48 = generate48Labels();

    chart.data.labels = labels48;
    chart.data.datasets = [
      {
        label: 'Production per Session (ml)',
        data: avgProductionByInterval,
        backgroundColor: 'rgba(52, 73, 94, 0.15)',
        borderColor: CHART_COLORS.production,
        borderWidth: 2,
        pointBackgroundColor: CHART_COLORS.production,
        pointBorderColor: '#fff',
        pointRadius: 2,
        pointHoverRadius: 5,
      },
      {
        label: 'Consumption per Session (ml)',
        data: avgConsumptionByInterval,
        backgroundColor: 'rgba(39, 174, 96, 0.15)',
        borderColor: CHART_COLORS.consumption,
        borderWidth: 2,
        pointBackgroundColor: CHART_COLORS.consumption,
        pointBorderColor: '#fff',
        pointRadius: 2,
        pointHoverRadius: 5,
      },
    ];

    const startDate = filteredData[0].date;
    const endDate = filteredData[filteredData.length - 1].date;
    const totalSessionsProduction = countsProduction.reduce((sum, c) => sum + c, 0);
    const totalSessionsConsumption = countsConsumption.reduce((sum, c) => sum + c, 0);

    chart.options.plugins.subtitle.text = `${filteredData.length} days (${startDate} - ${endDate}), Pump: ${totalSessionsProduction} / Feed: ${totalSessionsConsumption} sessions`;
    chart.options.scales.r.suggestedMax = sharedMax;
    chart.options.scales.r.max = sharedMax;
    chart.update();

    const circadian = this.charts['circadian'];
    if (circadian) {
      circadian.options.scales.r.suggestedMax = sharedMax;
      circadian.options.scales.r.max = sharedMax;
      circadian.update();
    }
  }


  private createGrowthCharts(): void {
    const growthData = generateMeasurementGrowthData(this.data);
    this.runtime.measurementGrowthData = growthData;
    if (!growthData || growthData.length === 0) {
      return;
    }

    const minDays = Math.min(...growthData.map((d) => d.days));
    const maxDays = Math.max(...growthData.map((d) => d.days));

    const weightCanvas = this.canvas('weightChart');
    if (weightCanvas) {
      this.charts['weight'] = new Chart(weightCanvas, {
        type: 'line',
        data: {
          datasets: [
            { label: 'Measured Weight', data: growthData.map((d) => ({ x: d.days, y: d.weight })) as any, borderColor: CHART_COLORS.weight, backgroundColor: 'rgba(41,128,185,0.15)', borderWidth: 4, pointRadius: 6, fill: true, tension: 0.2 },
            { label: 'WHO 97th', data: growthData.map((d) => ({ x: d.days, y: d.who97 })) as any, borderColor: CHART_COLORS.whoP97, borderDash: [6, 6], borderWidth: 2, pointRadius: 0 },
            { label: 'WHO 85th', data: growthData.map((d) => ({ x: d.days, y: d.who85 })) as any, borderColor: CHART_COLORS.whoP85, borderDash: [6, 6], borderWidth: 2, pointRadius: 0 },
            { label: 'WHO 50th', data: growthData.map((d) => ({ x: d.days, y: d.who50 })) as any, borderColor: CHART_COLORS.whoP50, borderWidth: 3, pointRadius: 0 },
            { label: 'WHO 15th', data: growthData.map((d) => ({ x: d.days, y: d.who15 })) as any, borderColor: CHART_COLORS.whoP15, borderDash: [6, 6], borderWidth: 2, pointRadius: 0 },
            { label: 'WHO 3rd', data: growthData.map((d) => ({ x: d.days, y: d.who3 })) as any, borderColor: CHART_COLORS.whoP3, borderDash: [6, 6], borderWidth: 2, pointRadius: 0 },
          ],
        },
        options: {
          responsive: true,
          aspectRatio: 2.5,
          layout: { padding: { top: 20, bottom: 20 } },
          plugins: {
            legend: { labels: { padding: 20 } },
            title: { display: true, text: 'Weight Measurements vs WHO Growth Standards', font: { size: 20, weight: 'bold' }, padding: { bottom: 20 } },
            tooltip: {
              callbacks: {
                label: (ctx: any) => {
                  const d = growthData.find((g) => g.days === ctx.parsed.x);
                  const z = d ? BABY_CONFIG.calculateZScore(ctx.parsed.x, ctx.parsed.y, 'weight') : null;
                  return [`${ctx.dataset.label}`, `Age: ${ctx.parsed.x} d (${d ? d.date : ''})`, `Weight: ${ctx.parsed.y.toFixed(3)} kg`, z !== null ? `WHO Z: ${z.toFixed(2)} SD` : ''].filter(Boolean);
                },
              },
            },
          },
          scales: {
            x: { type: 'linear', min: 0, title: { display: true, text: 'Age (weeks)' }, ticks: { stepSize: 7, autoSkip: false, maxRotation: 0, callback: daysToWeekLabel }, grid: { color: 'rgba(0,0,0,0.05)' } },
            y: {
              title: { display: true, text: 'Weight (kg)' },
              min: 0,
              ticks: {
                stepSize: 0.2,
                callback: (value: number) => {
                  const minWeight = Math.min(...growthData.map((d) => d.weight));
                  const minTick = Math.floor(minWeight / 0.2) * 0.2;
                  return value < minTick ? '' : value.toFixed(1) + ' kg';
                },
              },
              grid: { color: 'rgba(0,0,0,0.05)' },
            },
          },
        } as any,
        plugins: [createMonthlyAnnotationPlugin(minDays, maxDays)],
      });
    }

    const velocityData: VelocityPoint[] = [];
    for (let i = 1; i < growthData.length; i++) {
      const prev = growthData[i - 1];
      const curr = growthData[i];
      const deltaDays = curr.days - prev.days;
      if (deltaDays <= 0) {
        continue;
      }
      const gainG = (curr.weight - prev.weight) * 1000;
      const gPerWeek = (gainG / deltaDays) * 7;
      velocityData.push({
        days: curr.days,
        velocity: Math.round(gPerWeek),
        whoRange: BABY_CONFIG.getWHOVelocityRange(curr.days),
        date: curr.date,
      });
    }
    this.runtime.measurementVelocityData = velocityData;

    const velocityCanvas = this.canvas('velocityChart');
    if (velocityCanvas && velocityData.length > 0) {
      this.charts['velocity'] = new Chart(velocityCanvas, {
        type: 'line',
        data: {
          datasets: [
            { label: 'WHO Reference (Max)', data: velocityData.map((v) => ({ x: v.days, y: v.whoRange.max })) as any, fill: '+1', backgroundColor: 'rgba(39,174,96,0.15)', borderColor: CHART_COLORS.consumption, borderWidth: 2, borderDash: [4, 4], pointRadius: 0 },
            { label: 'WHO Reference (Min)', data: velocityData.map((v) => ({ x: v.days, y: v.whoRange.min })) as any, borderColor: CHART_COLORS.consumption, borderWidth: 2, borderDash: [4, 4], pointRadius: 0 },
            { label: 'Observed Velocity', data: velocityData.map((v) => ({ x: v.days, y: v.velocity })) as any, borderColor: CHART_COLORS.weight, backgroundColor: 'rgba(41,128,185,0.2)', borderWidth: 4, pointRadius: 5, pointBackgroundColor: CHART_COLORS.weight, tension: 0.3, fill: false },
          ],
        },
        options: {
          responsive: true,
          aspectRatio: 3.5,
          plugins: {
            legend: { labels: { padding: 20 } },
            title: { display: true, text: 'Growth Velocity', font: { size: 20, weight: 'bold' }, padding: { bottom: 20 } },
            tooltip: {
              callbacks: {
                label: (ctx: any) => {
                  const v = velocityData.find((d) => d.days === ctx.parsed.x);
                  return [`${ctx.dataset.label}`, `Age: ${ctx.parsed.x} days`, `Velocity: ${ctx.parsed.y.toFixed(0)} g/week`, v ? `Date: ${v.date}` : ''].filter(Boolean);
                },
              },
            },
          },
          scales: {
            x: { type: 'linear', min: 0, title: { display: true, text: 'Age (weeks)' }, ticks: { stepSize: 7, autoSkip: false, maxRotation: 0, callback: daysToWeekLabel }, grid: { color: 'rgba(0,0,0,0.05)' } },
            y: { title: { display: true, text: 'g / week' }, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
          },
        } as any,
        plugins: [createMonthlyAnnotationPlugin(minDays, maxDays)],
      });
    }

    const accelerationData: AccelerationPoint[] = [];
    for (let i = 1; i < velocityData.length; i++) {
      const prevVelocity = velocityData[i - 1].velocity;
      const currVelocity = velocityData[i].velocity;
      accelerationData.push({
        days: velocityData[i].days,
        acceleration: currVelocity - prevVelocity,
        date: velocityData[i].date,
        prevVelocity,
        currVelocity,
      });
    }
    this.runtime.measurementAccelerationData = accelerationData;

    const accelerationCanvas = this.canvas('accelerationChart');
    if (accelerationCanvas && accelerationData.length > 0) {
      this.charts['acceleration'] = new Chart(accelerationCanvas, {
        type: 'line',
        data: {
          datasets: [
            {
              label: 'WHO Reference Range',
              data: [
                { x: accelerationData[0].days, y: -10 },
                { x: accelerationData[accelerationData.length - 1].days, y: -10 },
                { x: accelerationData[accelerationData.length - 1].days, y: 10 },
                { x: accelerationData[0].days, y: 10 },
                { x: accelerationData[0].days, y: -10 },
              ] as any,
              backgroundColor: 'rgba(39, 174, 96, 0.1)',
              borderColor: 'rgba(39, 174, 96, 0.3)',
              borderWidth: 1,
              borderDash: [4, 4],
              pointRadius: 0,
              fill: true,
              order: 2,
            },
            { label: 'Zero Line', data: accelerationData.map((a) => ({ x: a.days, y: 0 })) as any, borderColor: '#95a5a6', borderWidth: 2, borderDash: [5, 5], pointRadius: 0, fill: false, order: 1 },
            {
              label: 'Growth Acceleration',
              data: accelerationData.map((a) => ({ x: a.days, y: a.acceleration })) as any,
              borderColor: CHART_COLORS.acceleration,
              backgroundColor: 'rgba(0, 122, 255, 0.1)',
              borderWidth: 3,
              pointRadius: 5,
              pointBackgroundColor: accelerationData.map((a) =>
                a.acceleration > 10 ? CHART_COLORS.accelPositive : a.acceleration < -10 ? CHART_COLORS.accelNegative : CHART_COLORS.acceleration,
              ),
              pointBorderColor: '#fff',
              pointBorderWidth: 2,
              tension: 0.3,
              fill: false,
              order: 0,
            },
          ],
        },
        options: {
          responsive: true,
          aspectRatio: 3.5,
          plugins: {
            title: { display: true, text: 'Growth Acceleration (Change in Velocity Between Measurements)', font: { size: 20, weight: 'bold' }, padding: { bottom: 20 } },
            subtitle: { display: true, text: 'Positive = accelerating growth | Negative = decelerating growth (normal after 3 months)', font: { size: 16, style: 'italic' }, color: '#666', padding: { bottom: 10 } },
            tooltip: {
              callbacks: {
                label: (ctx: any) => {
                  if (ctx.dataset.label === 'WHO Reference Range') return 'Normal physiological range: ±10 g/week';
                  if (ctx.dataset.label === 'Zero Line') return 'Zero acceleration (constant velocity)';
                  const a = accelerationData.find((d) => d.days === ctx.parsed.x);
                  if (!a) return '';
                  return [`Age: ${ctx.parsed.x} days (${a.date})`, `Acceleration: ${ctx.parsed.y > 0 ? '+' : ''}${ctx.parsed.y.toFixed(0)} g/week`, `Previous velocity: ${a.prevVelocity} g/week`, `Current velocity: ${a.currVelocity} g/week`, '', ctx.parsed.y > 10 ? 'Rapid acceleration (catch-up growth)' : ctx.parsed.y < -10 ? 'Rapid deceleration (monitor closely)' : 'Normal variation'].filter(Boolean);
                },
              },
            },
            legend: { display: true, labels: { filter: (item: any) => item.text !== 'Zero Line' } },
          },
          scales: {
            x: { type: 'linear', min: 0, title: { display: true, text: 'Age (weeks)' }, ticks: { stepSize: 7, autoSkip: false, maxRotation: 0, callback: daysToWeekLabel }, grid: { color: 'rgba(0,0,0,0.05)' } },
            y: { title: { display: true, text: 'Acceleration (g/week change)' }, ticks: { callback: (value: number) => (value > 0 ? '+' + value : value) }, grid: { color: 'rgba(0,0,0,0.05)' } },
          },
        } as any,
        plugins: [createMonthlyAnnotationPlugin(minDays, maxDays)],
      });
    }
  }


  private createAnthropometryCharts(): void {
    const birthDate = BABY_CONFIG.birthDate;
    const data = this.data;

    interface AnthroPoint {
      days: number;
      date: string;
      height: number | null;
      headCirc: number | null;
      bmi: number | null;
      heightAnomaly: boolean;
      headAnomaly: boolean;
    }

    const bm = BABY_CONFIG.birthMeasurements;
    const birthEntry: AnthroPoint[] =
      bm && (bm.length || bm.headCirc)
        ? [
            {
              days: 0,
              date: BABY_CONFIG.birthDateString,
              height: bm.length ?? null,
              headCirc: bm.headCirc ?? null,
              bmi: bm.weight && bm.length ? bm.weight / Math.pow(bm.length / 100, 2) : null,
              heightAnomaly: false,
              headAnomaly: false,
            },
          ]
        : [];

    const earlyAnthro: AnthroPoint[] = (BABY_CONFIG.earlyWeightEntries || [])
      .filter((e) => e.height || e.headCirc)
      .map((e): AnthroPoint | null => {
        const entryDate = parseDateForCharts(e.date);
        if (!entryDate) return null;
        const days = Math.floor((entryDate.getTime() - birthDate.getTime()) / 86400000);
        return {
          days,
          date: e.date,
          height: e.height ?? null,
          headCirc: e.headCirc ?? null,
          bmi: e.weight && e.height ? e.weight / Math.pow(e.height / 100, 2) : null,
          heightAnomaly: false,
          headAnomaly: false,
        };
      })
      .filter((m): m is AnthroPoint => m !== null);

    const configDates = new Set<string>([
      BABY_CONFIG.birthDateString,
      ...(BABY_CONFIG.earlyWeightEntries || []).map((e) => e.date),
    ]);

    const csvMeasurements: AnthroPoint[] = data
      .filter((d) => !configDates.has(d.date))
      .map((d): AnthroPoint | null => {
        if (!d.height && !d.headCirc && !d.weight) return null;
        const entryDate = parseDateForCharts(d.date);
        if (!entryDate) return null;
        const days = Math.floor((entryDate.getTime() - birthDate.getTime()) / 86400000);
        return {
          days,
          date: d.date,
          height: d.height ?? null,
          headCirc: d.headCirc ?? null,
          bmi: d.weight && d.height ? d.weight / Math.pow(d.height / 100, 2) : null,
          heightAnomaly: false,
          headAnomaly: false,
        };
      })
      .filter((m): m is AnthroPoint => m !== null);

    const measurements = [...birthEntry, ...earlyAnthro, ...csvMeasurements].sort((a, b) => a.days - b.days);
    if (!measurements.length) {
      return;
    }

    const markAnomalies = (key: 'height' | 'headCirc', flagKey: 'heightAnomaly' | 'headAnomaly') => {
      for (let i = 1; i < measurements.length - 1; i++) {
        const p = measurements[i - 1][key];
        const c = measurements[i][key];
        const n = measurements[i + 1][key];
        if (p == null || c == null || n == null) continue;
        if ((p < c && c > n) || (p > c && c < n)) {
          measurements[i][flagKey] = true;
        }
      }
    };
    markAnomalies('height', 'heightAnomaly');
    markAnomalies('headCirc', 'headAnomaly');

    const minDays = Math.min(...measurements.map((m) => m.days));
    const maxDays = Math.max(...measurements.map((m) => m.days));

    const WHO_TYPE: Record<string, string> = { heightChart: 'length', headChart: 'headCirc', bmiChart: 'bmi' };

    const whoDataset = (label: string, percentile: number, measurementType: string, color: string, dash: number[] = []): any => {
      const points: { x: number; y: number }[] = [];
      for (let d = minDays; d <= maxDays; d += 7) {
        const val = getWHOValue(d, percentile, measurementType);
        if (val !== null) points.push({ x: d, y: parseFloat(val.toFixed(3)) });
      }
      return { label, data: points, borderColor: color, backgroundColor: 'transparent', borderWidth: 1.5, borderDash: dash, pointRadius: 0, pointHoverRadius: 4, tension: 0.4, spanGaps: true };
    };

    const makeChart = (canvasId: string, label: string, key: 'height' | 'headCirc' | 'bmi', anomalyKey: 'heightAnomaly' | 'headAnomaly' | null, color: string, anomalyColor: string) => {
      const canvas = this.canvas(canvasId);
      if (!canvas) {
        return;
      }
      const whoType = WHO_TYPE[canvasId];

      const lineData = measurements
        .filter((m) => m[key] !== null && (anomalyKey ? !m[anomalyKey] : true))
        .map((m) => ({ x: m.days, y: m[key], date: m.date }));

      const anomalyPoints = anomalyKey
        ? measurements.filter((m) => m[key] !== null && m[anomalyKey]).map((m) => ({ x: m.days, y: m[key], date: m.date }))
        : [];

      const datasets: any[] = [
        whoDataset('WHO 97th', 97, whoType, CHART_COLORS.whoP97, [4, 4]),
        whoDataset('WHO 85th', 85, whoType, CHART_COLORS.whoP85, [4, 4]),
        whoDataset('WHO 50th', 50, whoType, CHART_COLORS.whoP50, []),
        whoDataset('WHO 15th', 15, whoType, CHART_COLORS.whoP15, [4, 4]),
        whoDataset('WHO 3rd', 3, whoType, CHART_COLORS.whoP3, [4, 4]),
        { label, data: lineData, borderColor: color, backgroundColor: color, pointBackgroundColor: color, borderWidth: 3, pointRadius: 5, pointHoverRadius: 7, spanGaps: true, order: -1 },
        { label: `${label} (flagged)`, data: anomalyPoints, showLine: false, pointRadius: 7, pointBackgroundColor: anomalyColor, borderColor: anomalyColor, backgroundColor: anomalyColor, order: -2 },
      ];

      this.charts[canvasId] = new Chart(canvas, {
        type: 'line',
        data: { datasets },
        options: {
          responsive: true,
          aspectRatio: 3.5,
          scales: {
            x: { type: 'linear', min: 0, title: { display: true, text: 'Age (weeks)' }, ticks: { stepSize: 7, autoSkip: false, maxRotation: 0, callback: (value: number) => { const week = Math.floor(value / 7); return value % 14 === 0 ? `W${week}` : ''; } }, grid: { color: 'rgba(0,0,0,0.05)' } },
            y: { title: { display: true, text: label }, grid: { color: 'rgba(0,0,0,0.05)' } },
          },
          plugins: {
            legend: { display: true, labels: { filter: (item: any) => !item.text.includes('flagged'), padding: 12 } },
            tooltip: {
              callbacks: {
                label: (ctx: any) => {
                  if (ctx.dataset.label.startsWith('WHO')) return `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}`;
                  return [ctx.raw.date ?? '', `${label}: ${ctx.parsed.y}`, ctx.dataset.showLine === false ? '⚠ flagged' : ''].filter(Boolean);
                },
              },
            },
          },
        } as any,
        plugins: [createMonthlyAnnotationPlugin(minDays, maxDays)],
      });
    };

    makeChart('heightChart', 'Length (cm)', 'height', 'heightAnomaly', CHART_COLORS.height, CHART_COLORS.height);
    makeChart('headChart', 'Head Circumference (cm)', 'headCirc', 'headAnomaly', CHART_COLORS.headCirc, CHART_COLORS.anomaly);
    makeChart('bmiChart', 'BMI', 'bmi', null, CHART_COLORS.bmi, CHART_COLORS.bmi);

    this.createWeightForLengthChart();
  }

  private createWeightForLengthChart(): void {
    const canvas = this.canvas('wflChart');
    if (!canvas) {
      return;
    }
    const birthDate = BABY_CONFIG.birthDate;

    const configDates = new Set<string>([
      BABY_CONFIG.birthDateString,
      ...(BABY_CONFIG.earlyWeightEntries || []).map((e) => e.date),
    ]);

    const paired: { date: string; days: number; weight: number; length: number }[] = [];

    (BABY_CONFIG.earlyWeightEntries || []).forEach((e) => {
      if (e.weight && e.height) {
        const d = parseDateForCharts(e.date);
        const days = d ? Math.floor((d.getTime() - birthDate.getTime()) / 86400000) : 0;
        paired.push({ date: e.date, days, weight: e.weight, length: e.height });
      }
    });

    this.data.forEach((d) => {
      if (d.weight && d.height && !configDates.has(d.date)) {
        const dt = parseDateForCharts(d.date);
        const days = dt ? Math.floor((dt.getTime() - birthDate.getTime()) / 86400000) : 0;
        paired.push({ date: d.date, days, weight: d.weight, length: d.height });
      }
    });

    paired.sort((a, b) => a.days - b.days);
    if (paired.length === 0) {
      return;
    }

    const allLengths = paired.map((m) => m.length);
    const minLen = Math.max(45, Math.floor(Math.min(...allLengths)) - 2);
    const maxLen = Math.min(110, Math.ceil(Math.max(...allLengths)) + 6);

    const whoX: number[] = [];
    for (let l = minLen; l <= maxLen; l += 0.5) {
      whoX.push(l);
    }

    const whoWFLDataset = (label: string, percentile: number, borderColor: string, borderDash: number[]): any => ({
      label,
      data: whoX.map((l) => ({ x: l, y: getWFLValue(l, percentile) })).filter((p) => p.y !== null),
      borderColor,
      backgroundColor: 'transparent',
      borderWidth: borderDash.length ? 1.5 : 2.5,
      borderDash,
      showLine: true,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.4,
      spanGaps: true,
    });

    const zScores = paired.map((m) => {
      const z = BABY_CONFIG.calculateZScoreWFL(m.length, m.weight);
      const pct = z !== null ? BABY_CONFIG.zScoreToPercentile(z) : null;
      return { z: z !== null ? z.toFixed(2) : null, pct: pct !== null ? pct.toFixed(1) : null };
    });

    const actualDataset: any = {
      label: (BABY_CONFIG.name || 'Baby') + "'s Measurements",
      data: paired.map((m) => ({ x: m.length, y: m.weight, date: m.date, days: m.days })),
      borderColor: CHART_COLORS.weight,
      backgroundColor: 'rgba(41,128,185,0.18)',
      borderWidth: 3,
      pointRadius: 7,
      pointHoverRadius: 10,
      pointBackgroundColor: CHART_COLORS.weight,
      pointBorderColor: '#fff',
      pointBorderWidth: 2.5,
      tension: 0.25,
      fill: false,
      showLine: true,
      order: -1,
    };

    if (this.charts['wfl']) {
      this.charts['wfl'].destroy();
      delete this.charts['wfl'];
    }

    this.charts['wfl'] = new Chart(canvas, {
      type: 'scatter',
      data: {
        datasets: [
          whoWFLDataset('WHO 97th', 97, CHART_COLORS.whoP97, [5, 4]),
          whoWFLDataset('WHO 85th', 85, CHART_COLORS.whoP85, [5, 4]),
          whoWFLDataset('WHO 50th', 50, CHART_COLORS.whoP50, []),
          whoWFLDataset('WHO 15th', 15, CHART_COLORS.whoP15, [5, 4]),
          whoWFLDataset('WHO 3rd', 3, CHART_COLORS.whoP3, [5, 4]),
          actualDataset,
        ],
      },
      options: {
        responsive: true,
        aspectRatio: window.innerWidth <= 768 ? 1.6 : 3,
        layout: { padding: { top: 16, bottom: 8 } },
        plugins: {
          legend: { labels: { padding: 18 } },
          title: { display: true, text: 'Weight-for-Length vs WHO Growth Standards', font: { size: 20, weight: 'bold' }, padding: { bottom: 16 } },
          subtitle: { display: true, text: 'Each point = one paired measurement. Chronological order left→right as length increases.', font: { size: 13, style: 'italic' }, color: '#6e6e73', padding: { bottom: 8 } },
          tooltip: {
            callbacks: {
              label: (ctx: any) => {
                const label = ctx.dataset.label || '';
                if (!label.includes('Measurements')) {
                  return `${label}: ${ctx.parsed.y !== null ? ctx.parsed.y.toFixed(2) : 'N/A'} kg`;
                }
                const i = ctx.dataIndex;
                const m = paired[i];
                const zs = zScores[i];
                return [`Date: ${m.date}  (Day ${m.days})`, `Length: ${m.length} cm`, `Weight: ${m.weight} kg`, zs.z !== null ? `WFL Z-score: ${zs.z} SD  (${zs.pct}th percentile)` : ''].filter(Boolean);
              },
            },
          },
        },
        scales: {
          x: { type: 'linear', title: { display: true, text: 'Recumbent Length (cm)' }, min: minLen, max: maxLen, ticks: { stepSize: 2, callback: (v: number) => (v % 4 === 0 ? v + ' cm' : '') }, grid: { color: 'rgba(0,0,0,0.05)' } },
          y: { title: { display: true, text: 'Weight (kg)' }, ticks: { callback: (v: number) => v.toFixed(1) + ' kg', stepSize: 0.5 }, grid: { color: 'rgba(0,0,0,0.05)' } },
        },
      } as any,
    });
  }


  createPumpFrequencyChart(): void {
    const canvas = this.canvas('pumpFrequencyChart');
    if (!canvas) {
      return;
    }
    const data = this.runtime.pumpFrequencyData;
    if (!data || data.length === 0) {
      return;
    }

    if (this.charts['pumpFrequency']) {
      this.charts['pumpFrequency'].destroy();
    }

    const minDays = dataDays(data[0]) ?? 0;
    const maxDays = dataDays(data[data.length - 1]) ?? minDays;

    this.charts['pumpFrequency'] = new Chart(canvas, {
      type: 'line',
      data: {
        datasets: [
          { label: 'Raw Sessions/Day', data: data.map((d) => ({ x: dataDays(d), y: d.sessions })) as any, borderColor: 'rgba(88, 86, 214, 0.3)', backgroundColor: 'transparent', borderWidth: 1.5, borderDash: [4, 4], pointRadius: 2, pointHoverRadius: 5, stepped: true, spanGaps: false, yAxisID: 'y-frequency' },
          { label: '7-Day Median Frequency', data: data.map((d) => ({ x: dataDays(d), y: d.avgFrequency })) as any, borderColor: '#5856d6', backgroundColor: '#5856d6', borderWidth: 3, pointRadius: 0, pointHoverRadius: 7, stepped: true, spanGaps: false, yAxisID: 'y-frequency' },
          { label: 'Raw Daily Output', data: data.map((d) => ({ x: dataDays(d), y: d.totalOutput })) as any, borderColor: 'rgba(255, 149, 0, 0.3)', backgroundColor: 'transparent', borderWidth: 1.5, borderDash: [4, 4], pointRadius: 2, pointHoverRadius: 5, tension: 0.2, spanGaps: false, yAxisID: 'y-output' },
          { label: '7-Day Avg Output', data: data.map((d) => ({ x: dataDays(d), y: d.avgOutput })) as any, borderColor: '#ff9500', backgroundColor: 'rgba(255, 149, 0, 0.1)', borderWidth: 3, pointRadius: 0, pointHoverRadius: 6, tension: 0.4, spanGaps: false, yAxisID: 'y-output' },
        ],
      },
      options: {
        responsive: true,
        aspectRatio: 3.5,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true, position: 'top', labels: { padding: 20 } },
          title: { display: true, text: 'Pump Frequency & Output Timeline', font: { size: 20, weight: 'bold' }, padding: { bottom: 20 } },
          tooltip: {
            callbacks: {
              title: (context: any) => {
                const dayVal = context[0].parsed.x;
                const d = data.find((e) => dataDays(e) === dayVal);
                return d ? 'Date: ' + d.date : `Day ${dayVal}`;
              },
              afterBody: (context: any) => {
                const dayVal = context[0].parsed.x;
                const d = data.find((e) => dataDays(e) === dayVal);
                if (!d) return [];
                return ['', `Raw sessions: ${d.sessions}`, `7d median frequency: ${d.avgFrequency ?? '—'}`, `Raw output: ${d.totalOutput} ml`, `7d avg output: ${d.avgOutput != null ? d.avgOutput + ' ml' : '—'}`, `Output/session: ${d.sessions > 0 ? Math.round(d.totalOutput / d.sessions) : 0} ml`];
              },
            },
          },
        },
        scales: {
          'y-frequency': { type: 'linear', position: 'left', title: { display: true, text: 'Sessions per Day' }, beginAtZero: false, min: 2, suggestedMax: 10, ticks: { stepSize: 1, precision: 0 }, grid: { drawOnChartArea: true, color: 'rgba(0,0,0,0.05)' } },
          'y-output': { type: 'linear', position: 'right', title: { display: true, text: 'Output (ml)' }, beginAtZero: true, grid: { drawOnChartArea: false } },
          x: { type: 'linear', min: minDays, title: { display: true, text: 'Age (weeks)' }, ticks: { stepSize: 7, autoSkip: false, maxRotation: 0, callback: daysToWeekLabel }, grid: { color: 'rgba(0,0,0,0.05)' } },
        },
      } as any,
      plugins: [createMonthlyAnnotationPlugin(minDays, maxDays)],
    });
  }

  updatePumpFrequencyChart(): void {
    const chart = this.charts['pumpFrequency'];
    const data = this.runtime.pumpFrequencyData;
    if (chart && data) {
      const minDays = dataDays(data[0]) ?? 0;
      chart.data.datasets[0].data = data.map((d) => ({ x: dataDays(d), y: d.sessions }));
      chart.data.datasets[1].data = data.map((d) => ({ x: dataDays(d), y: d.avgFrequency }));
      chart.data.datasets[2].data = data.map((d) => ({ x: dataDays(d), y: d.totalOutput }));
      chart.data.datasets[3].data = data.map((d) => ({ x: dataDays(d), y: d.avgOutput }));
      chart.options.scales.x.min = minDays;
      chart.update();
    } else {
      this.createPumpFrequencyChart();
    }
  }


  createDowRhythmChart(): void {
    const canvas = this.canvas('dowRhythmChart');
    if (!canvas) {
      return;
    }
    const rows = this.runtime.dowRhythmData;
    if (!rows || rows.length === 0) {
      return;
    }

    if (this.charts['dowRhythm']) {
      this.charts['dowRhythm'].destroy();
    }

    const labels = rows.map((r) => r.day);
    const prod = rows.map((r) => r.avgProduction);
    const cons = rows.map((r) => r.avgConsumption);
    const gaps = rows.map((r) => r.gap);

    const gapColors = gaps.map((g) => (g >= 0 ? 'rgba(52,199,89,0.75)' : 'rgba(255,59,48,0.75)'));
    const gapBorder = gaps.map((g) => (g >= 0 ? '#34c759' : '#ff3b30'));

    // Draw the numeric value above each production and consumption bar.
    const barValueLabels = {
      id: 'dowValueLabels',
      afterDatasetsDraw(chart: any) {
        const { ctx } = chart;
        ctx.save();
        ctx.font = '700 10px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        [0, 1].forEach((di) => {
          const meta = chart.getDatasetMeta(di);
          if (!meta || meta.hidden || !meta.data) return;
          const color = di === 0 ? '#0071e3' : '#0e7c8b';
          meta.data.forEach((bar: any, i: number) => {
            const v = chart.data.datasets[di].data[i];
            if (v == null || !bar) return;
            const x = bar.x;
            const y = bar.y - 3;
            // White halo first, then the coloured value, so it reads on any background.
            ctx.strokeText(String(v), x, y);
            ctx.fillStyle = color;
            ctx.fillText(String(v), x, y);
          });
        });
        ctx.restore();
      },
    };

    this.charts['dowRhythm'] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Production (ml)', data: prod, backgroundColor: 'rgba(0,113,227,0.75)', borderColor: '#0071e3', borderWidth: 1.5, borderRadius: 4, order: 2 },
          { label: 'Consumption (ml)', data: cons, backgroundColor: 'rgba(48,176,199,0.65)', borderColor: '#30b0c7', borderWidth: 1.5, borderRadius: 4, order: 2 },
          { label: 'Gap (surplus/deficit)', data: gaps, backgroundColor: gapColors, borderColor: gapBorder, borderWidth: 1.5, borderRadius: 4, type: 'bar', yAxisID: 'y-gap', order: 1 },
        ],
      },
      options: {
        responsive: true,
        aspectRatio: window.innerWidth <= 768 ? 1.6 : 3,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true, position: 'top', labels: { padding: 20, usePointStyle: true } },
          title: { display: true, text: 'Day-of-Week Production vs Consumption (all-time averages)', font: { size: 18, weight: 'bold' }, padding: { bottom: 16 } },
          tooltip: {
            callbacks: {
              afterBody: (context: any) => {
                const i = context[0].dataIndex;
                const row = rows[i];
                const gapStr = row.gap >= 0 ? '+' + row.gap + ' ml surplus' : row.gap + ' ml deficit';
                return ['', 'Net gap: ' + gapStr, 'Avg formula used: ' + row.avgFormula + ' ml', 'Days in sample: ' + row.count];
              },
            },
          },
        },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.04)' } },
          y: { position: 'left', title: { display: true, text: 'Volume (ml/day)' }, beginAtZero: true, suggestedMax: Math.max(...prod, ...cons) * 1.3, grid: { color: 'rgba(0,0,0,0.05)' } },
          'y-gap': { position: 'right', title: { display: true, text: 'Gap (ml)' }, grid: { drawOnChartArea: false }, ticks: { callback: (v: number) => (v >= 0 ? '+' : '') + v } },
        },
      } as any,
      plugins: [barValueLabels],
    });
  }


  updateRangedCharts(): void {
    const filtered = this.feeding.filteredData();
    const chartsToUpdate = ['dailyProduction', 'productionConsumption', 'formula', 'rollingAvg'];

    chartsToUpdate.forEach((chartName) => {
      const chart = this.charts[chartName];
      if (!chart?.data) {
        return;
      }
      chart.data.datasets.forEach((dataset: any) => {
        dataset.data = this.getDataForDataset(dataset.label, filtered);
      });
      chart.update();
    });
  }

  private getDataForDataset(label: string, data: DailyEntry[]): { x: number | null; y: number | null }[] {
    const datasetMap: Record<string, (d: DailyEntry) => number | null | undefined> = {
      'Daily Production': (d) => d.total,
      Daily: (d) => d.total,
      '7-Day': (d) => d.roll7,
      '1-Week': (d) => d.roll7,
      '14-Day': (d) => d.roll14,
      Pumped: (d) => d.roll7,
      'Expressed Milk Consumed': (d) => d.roll7Expr ?? null,
      Formula: (d) => d.roll7Form ?? null,
    };

    const entry = Object.entries(datasetMap).find(([key]) => label.includes(key));
    const extractor = entry ? entry[1] : () => 0;
    return data.map((d) => ({ x: dataDays(d), y: extractor(d) ?? null }));
  }
}
