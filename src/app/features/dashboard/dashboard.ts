import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { BABY_CONFIG } from '../../core/config/baby-config';
import { PumpFrequencyPoint } from '../../core/models/feeding.models';
import { AnalysisService } from '../../core/services/analysis.service';
import { DashboardRuntime } from '../../core/services/dashboard-runtime';
import { FeedingDataService } from '../../core/services/feeding-data.service';
import { InferenceService } from '../../core/services/inference.service';
import { StatsService } from '../../core/services/stats.service';
import { ddmmyyyyToIso, isoToDdmmyyyy } from '../../shared/utils/date-utils';
import { CanvasMap, ChartManagerService } from './charts/chart-manager.service';
import { InferenceBlock } from './components/inference-block/inference-block';
import { PumpCalendar } from './components/pump-calendar/pump-calendar';

/**
 * Top-level dashboard page. Orchestrates data loading, chart construction and
 * the reactive stat/cost view-models.
 */
@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InferenceBlock, PumpCalendar, DecimalPipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit, AfterViewInit {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly feeding = inject(FeedingDataService);
  private readonly analysis = inject(AnalysisService);
  private readonly stats = inject(StatsService);
  private readonly charts = inject(ChartManagerService);
  private readonly inference = inject(InferenceService);
  private readonly runtime = inject(DashboardRuntime);

  private readonly startInput = viewChild<ElementRef<HTMLInputElement>>('startInput');
  private readonly endInput = viewChild<ElementRef<HTMLInputElement>>('endInput');

  readonly config = BABY_CONFIG;
  readonly brand = 'Growthly';
  readonly title = BABY_CONFIG.uiText.title.replace('{name}', BABY_CONFIG.name);

  readonly dataReady = signal(false);
  readonly scrolled = signal(false);
  private chartsBuilt = signal(false);
  readonly pumpCalendarData = signal<PumpFrequencyPoint[] | null>(null);

  // Reactive view-models — recompute automatically when data / range changes.
  readonly subtitle = computed(() => (this.dataReady() ? this.analysis.computeSubtitle() : 'Loading…'));
  readonly stats$ = computed(() => (this.dataReady() ? this.stats.computeStats() : null));
  readonly costPanel = computed(() => (this.dataReady() ? this.stats.computeFormulaCostPanel() : null));

  /**
   * Feeding mode + section capabilities. Auto-detected from the data (any
   * formula → formula present; any pumped output or expressed milk → breastmilk
   * present); an optional `feedingMode` from the Setup sheet overrides it. Drives
   * which sections render so formula-only / breastfeeding-only families don't see
   * irrelevant supply or formula sections.
   */
  readonly cap = computed(() => {
    const data = this.feeding.data();
    let hasFormula = false, hasExpressed = false, hasPump = false;
    for (const d of data) {
      if ((d.form ?? 0) > 0) hasFormula = true;
      if ((d.expr ?? 0) > 0) hasExpressed = true;
      if ((d.total ?? 0) > 0) hasPump = true;
    }
    const override = (BABY_CONFIG as { feedingMode?: string }).feedingMode;
    const hasMilk = hasExpressed || hasPump;
    let mode: 'combination' | 'formula-only' | 'breastfeeding-only';
    if (override && override !== 'auto') {
      mode = override as typeof mode;
    } else if (hasFormula && !hasMilk) {
      mode = 'formula-only';
    } else if (!hasFormula && hasMilk) {
      mode = 'breastfeeding-only';
    } else {
      mode = 'combination';
    }
    return {
      mode,
      supply: mode !== 'formula-only',
      formula: mode !== 'breastfeeding-only',
      topUp: mode === 'combination',
      bmSavings: mode !== 'formula-only',
      cost: true,
    };
  });

  readonly firstIso = computed(() => {
    const d = this.feeding.data();
    return d.length ? ddmmyyyyToIso(d[0].date) : '';
  });
  readonly lastIso = computed(() => {
    const d = this.feeding.data();
    return d.length ? ddmmyyyyToIso(d[d.length - 1].date) : '';
  });

  readonly twoWeekLabel = computed(() =>
    this.feeding.showingLastTwoWeeks() ? 'Show Overall' : 'Show Last 2 Weeks',
  );
  readonly fourWeekLabel = computed(() =>
    this.feeding.showingLastFourWeeks() ? 'Show Overall' : 'Show Last 4 Weeks',
  );

  constructor() {
    // Build charts once data is ready and the canvases are in the DOM.
    effect(() => {
      if (this.dataReady() && !this.chartsBuilt()) {
        this.buildCharts();
      }
    });

    // React to date-range changes after the initial build.
    effect(() => {
      this.feeding.dateRange();
      if (this.chartsBuilt()) {
        this.charts.updateRangedCharts();
        this.refreshAnalysisAndCharts();
      }
    });

    // Keep the native date inputs in sync with the active range.
    effect(() => {
      const range = this.feeding.dateRange();
      const data = this.feeding.data();
      const start = this.startInput()?.nativeElement;
      const end = this.endInput()?.nativeElement;
      if (range && data.length && start && end) {
        start.value = ddmmyyyyToIso(data[range.start].date);
        end.value = ddmmyyyyToIso(data[range.end].date);
      }
    });
  }

  ngOnInit(): void {
    document.title = 'Growthly';
    void this.initData();
  }

  ngAfterViewInit(): void {
    window.addEventListener('resize', this.onResize, { passive: true });
    window.addEventListener('scroll', this.onScroll, { passive: true });
  }

  private readonly onScroll = (): void => this.scrolled.set(window.scrollY > 4);

  private async initData(): Promise<void> {
    await Promise.all([this.feeding.load(), this.inference.load()]);
    this.dataReady.set(true);
  }

  private buildCharts(): void {
    const map: CanvasMap = {};
    this.host.nativeElement.querySelectorAll('canvas').forEach((c: HTMLCanvasElement) => {
      map[c.id] = c;
    });
    this.charts.initializeAllCharts(map);
    this.refreshAnalysisAndCharts();
    this.chartsBuilt.set(true);
  }

  /** Recompute pump/dow analysis and refresh the dependent charts. */
  private refreshAnalysisAndCharts(): void {
    if (this.feeding.filteredData().length === 0) {
      return;
    }
    this.analysis.analyzePumpFrequency();
    this.analysis.computeDowRhythm();
    this.charts.updateCircadianChart(this.feeding.filteredData());
    this.charts.createDowRhythmChart();
    this.charts.updatePumpFrequencyChart();
    this.pumpCalendarData.set(this.runtime.pumpFrequencyData);
  }

  private readonly onResize = (): void => this.charts.resizeAll();


  applyDateRange(): void {
    const start = this.startInput()?.nativeElement;
    const end = this.endInput()?.nativeElement;
    if (!start || !end) {
      return;
    }
    const data = this.feeding.data();
    const startIndex = data.findIndex((d) => d.date === isoToDdmmyyyy(start.value));
    const endIndex = data.findIndex((d) => d.date === isoToDdmmyyyy(end.value));
    if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
      return;
    }
    this.feeding.setDateRange(startIndex, endIndex);
  }

  toggleTwoWeeks(): void {
    if (this.feeding.showingLastTwoWeeks()) {
      this.feeding.showFullPeriod();
    } else {
      this.feeding.showLastTwoWeeks();
    }
  }

  toggleFourWeeks(): void {
    if (this.feeding.showingLastFourWeeks()) {
      this.feeding.showFullPeriod();
    } else {
      this.feeding.showLastFourWeeks();
    }
  }

  formatInr(n: number): string {
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }
}
