import { Injectable, inject } from '@angular/core';

import { BABY_CONFIG } from '../config/baby-config';
import { DailyEntry, WeightGainResult } from '../models/feeding.models';
import {
  DashboardStats,
  FormulaCostPanel,
  FormulaCostRow,
} from '../models/dashboard.models';
import {
  daysBetween,
  ddmmyyyyToIso,
  getDaysFromBirth,
  parseDate,
} from '../../shared/utils/date-utils';
import { FeedingDataService } from './feeding-data.service';

// Formula cost basis comes from the Excel "Setup" sheet (via baby-data.ts), so
// no product/price is hardcoded. Fallbacks keep the panel working if unset.
const COST_BASIS = BABY_CONFIG.formulaCostBasis;
const PACK_YIELD_ML = COST_BASIS.packYieldMl > 0 ? COST_BASIS.packYieldMl : 2800;
const PACK_PRICE = COST_BASIS.packPrice > 0 ? COST_BASIS.packPrice : 1000;
const PACK_SIZE_G = COST_BASIS.packSizeG > 0 ? COST_BASIS.packSizeG : 400;
const PRICE_PER_ML = PACK_PRICE / PACK_YIELD_ML;
const FORMULA_PRODUCT = COST_BASIS.product || 'Infant formula';
const FORMULA_SOURCE_NOTE = COST_BASIS.sourceNote || '';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Summary statistics and the formula-cost / breastmilk-savings panel.
 * Returns view-models for the dashboard to render.
 */
@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly feeding = inject(FeedingDataService);


  private getActualMeasurements(): { date: string; days: number; wt: number | null }[] {
    return this.feeding
      .data()
      .map((d) => {
        const entryDate = parseDate(d.date);
        if (!entryDate) {
          return null;
        }
        const days = daysBetween(BABY_CONFIG.birthDate, entryDate);
        return { date: d.date, days, wt: d.weight };
      })
      .filter((m): m is { date: string; days: number; wt: number | null } => m !== null && !!m.wt);
  }

  calculateWeightGainRate(): WeightGainResult {
    const actualMeasurements = this.getActualMeasurements();
    if (actualMeasurements.length < 2) {
      return { rate: 0, detail: 'Insufficient data' };
    }

    const filtered = this.feeding.filteredData();
    if (filtered.length === 0) {
      return { rate: 0, detail: 'No data in range' };
    }

    const startDay = getDaysFromBirth(filtered[0].date, BABY_CONFIG.birthDate);
    const endDay = getDaysFromBirth(filtered[filtered.length - 1].date, BABY_CONFIG.birthDate);
    if (startDay === null || endDay === null) {
      return { rate: 0, detail: 'Invalid range' };
    }

    const measurementsInRange = actualMeasurements.filter(
      (m) => m.days >= startDay && m.days <= endDay,
    );
    if (measurementsInRange.length < 2) {
      return { rate: 0, detail: 'Need 2+ measurements in range' };
    }

    const first = measurementsInRange[0];
    const last = measurementsInRange[measurementsInRange.length - 1];
    if (!first.wt || !last.wt) {
      return { rate: 0, detail: 'Missing weight data' };
    }

    const weightGainGrams = (last.wt - first.wt) * 1000;
    const daysDiff = last.days - first.days;
    if (daysDiff === 0) {
      return { rate: 0, detail: 'Same measurement date' };
    }

    const rate = parseFloat((weightGainGrams / daysDiff).toFixed(1));
    const whoTarget = BABY_CONFIG.getWHOWeightGainTarget(first.days);

    const detail =
      rate >= whoTarget.target
        ? 'Exceeds WHO target'
        : rate >= whoTarget.target * BABY_CONFIG.analysisParams.whoWithinRangeThreshold
          ? 'Within WHO range'
          : 'Below WHO target';

    return { rate, detail };
  }


  computeStats(): DashboardStats {
    const filtered = this.feeding.filteredData();
    const weightGain = this.calculateWeightGainRate();

    const weightGainCard = {
      id: 'weightGain',
      label: 'Weight Gain Rate',
      value: `${weightGain.rate} g/day`,
      detail: weightGain.detail,
    };

    const daysWithProduction = filtered.filter((d) => d.total > 0 || d.expr > 0 || d.form > 0);

    if (daysWithProduction.length === 0) {
      return {
        weightGain: weightGainCard,
        avgProduction: { id: 'avgProd', label: 'Average Production', value: '0 ml/day', detail: 'No production data in range' },
        dayNight: { label: 'Day / Night Production', primaryLabel: '☀︎ Day', primaryValue: '0 ml', secondaryLabel: '☾ Night', secondaryValue: '0 ml', detail: '% of daily avg' },
        formulaFree: { id: 'formulaFree', label: 'Formula-Free Rate', value: '0%', detail: 'No feeding data in range' },
        milkConsumed: { label: 'Milk Consumed', primaryLabel: '🍶 Expressed', primaryValue: '0.0 L', secondaryLabel: '🥛 Formula', secondaryValue: '0.0 L', detail: 'No feeding data in range' },
        bmSavings: { id: 'bmSavings', label: 'Breastmilk Savings', value: '₹0', detail: 'vs full formula cost' },
        avgFeedSession: { id: 'avgFeedSession', label: 'Avg Feed / Session', value: '0 ml', detail: 'No sessions in range' },
      };
    }

    return {
      weightGain: weightGainCard,
      ...this.computeProductionStats(daysWithProduction),
    };
  }

  private computeProductionStats(
    daysWithProduction: DailyEntry[],
  ): Omit<DashboardStats, 'weightGain'> {
    const totalProduction = daysWithProduction.reduce((sum, d) => sum + d.total, 0);
    const avgProd = Math.round(totalProduction / daysWithProduction.length);
    const count = daysWithProduction.length;
    const startDate = daysWithProduction[0].date;
    const endDate = daysWithProduction[count - 1].date;

    const { nightSlots, daySlots } = BABY_CONFIG.timeSlots;

    let totalNightPump = 0;
    let totalDayPump = 0;
    daysWithProduction.forEach((d) => {
      (d.sessions || []).forEach((s) => {
        const pump = (s.pumpLeft || 0) + (s.pumpRight || 0);
        if ((nightSlots as readonly string[]).includes(s.timeSlot)) totalNightPump += pump;
        else if ((daySlots as readonly string[]).includes(s.timeSlot)) totalDayPump += pump;
      });
    });

    // Fallback split used only when no session-level pump data exists in range.
    const DEFAULT_NIGHT_PCT = 45;
    const totalSessionPump = totalNightPump + totalDayPump;
    const nightPct =
      totalSessionPump > 0
        ? Math.round((totalNightPump / totalSessionPump) * 100)
        : DEFAULT_NIGHT_PCT;
    const dayPct = totalSessionPump > 0 ? 100 - nightPct : 100 - DEFAULT_NIGHT_PCT;
    const nightProd = Math.round(avgProd * (nightPct / 100));
    const morningProd = Math.round(avgProd * (dayPct / 100));

    const formulaFreeDays = daysWithProduction.filter((d) => d.form === 0).length;
    const formulaFreeRate = ((formulaFreeDays / count) * 100).toFixed(1);

    const totalFormula = daysWithProduction.reduce((sum, d) => sum + (d.form || 0), 0);
    const totalFormulaLiters = (totalFormula / 1000).toFixed(1);
    const totalExpr = daysWithProduction.reduce((sum, d) => sum + (d.expr || 0), 0);
    const totalExprLiters = (totalExpr / 1000).toFixed(1);

    const allData = this.feeding.data();
    const allFormulaMl = allData.reduce((s, d) => s + (d.form || 0), 0);
    const allBmMl = allData.reduce((s, d) => s + (d.expr || 0), 0);
    const loggedPurchases = BABY_CONFIG.formulaPurchases ?? [];
    const formulaSpend =
      loggedPurchases.length > 0
        ? loggedPurchases.reduce((s, p) => s + p.units * p.pricePerUnit, 0)
        : Math.round(allFormulaMl * PRICE_PER_ML);
    const bmValue = Math.round(allBmMl * PRICE_PER_ML);
    const netSavings = bmValue - formulaSpend;
    const fmtINR = (n: number) => '₹' + Math.abs(n).toLocaleString('en-IN');

    const allFeedSessions = daysWithProduction.flatMap((d) =>
      (d.sessions || []).filter((s) => (s.exprMilk || 0) + (s.formula || 0) > 0),
    );
    const avgFeedPerSession =
      allFeedSessions.length > 0
        ? Math.round(
            allFeedSessions.reduce((sum, s) => sum + (s.exprMilk || 0) + (s.formula || 0), 0) /
              allFeedSessions.length,
          )
        : 0;
    const feedSessionCount = allFeedSessions.length;

    return {
      avgProduction: {
        id: 'avgProd',
        label: 'Average Production',
        value: `${avgProd} ml/day`,
        detail: `${count} day average (${startDate} – ${endDate})`,
      },
      dayNight: {
        label: 'Day / Night Production',
        primaryLabel: '☀︎ Day',
        primaryValue: `${morningProd} ml`,
        secondaryLabel: '☾ Night',
        secondaryValue: `${nightProd} ml`,
        detail: `${dayPct}% day · ${nightPct}% night of daily avg`,
      },
      formulaFree: {
        id: 'formulaFree',
        label: 'Formula-Free Rate',
        value: `${formulaFreeRate}%`,
        detail: `${formulaFreeDays} of ${count} days formula-free`,
      },
      milkConsumed: {
        label: 'Milk Consumed',
        primaryLabel: '🍶 Expressed',
        primaryValue: `${totalExprLiters} L`,
        secondaryLabel: '🥛 Formula',
        secondaryValue: `${totalFormulaLiters} L`,
        detail: `Over ${count} days (${startDate} – ${endDate})`,
      },
      bmSavings: {
        id: 'bmSavings',
        label: 'Breastmilk Savings',
        value: fmtINR(netSavings),
        detail: 'Saved vs full formula (all-time)',
      },
      avgFeedSession: {
        id: 'avgFeedSession',
        label: 'Avg Feed / Session',
        value: `${avgFeedPerSession} ml`,
        detail: `across ${feedSessionCount} feed sessions`,
      },
    };
  }


  computeFormulaCostPanel(): FormulaCostPanel | null {
    const allData = this.feeding.data();
    if (!allData.length) {
      return null;
    }

    const byMonth: Record<string, { formulaMl: number; bmMl: number; days: number }> = {};
    allData.forEach((d) => {
      const iso = ddmmyyyyToIso(d.date);
      const ym = iso.slice(0, 7);
      (byMonth[ym] ??= { formulaMl: 0, bmMl: 0, days: 0 });
      byMonth[ym].formulaMl += d.form || 0;
      byMonth[ym].bmMl += d.expr || 0;
      byMonth[ym].days++;
    });

    const months = Object.keys(byMonth).sort();

    const purchases = BABY_CONFIG.formulaPurchases ?? [];
    const totalUnitsPurchased = purchases.reduce((s, p) => s + p.units, 0);
    const totalPurchasedCost = purchases.reduce((s, p) => s + p.units * p.pricePerUnit, 0);

    const lastPurchaseYM =
      purchases.length > 0
        ? purchases.reduce((latest, p) => {
            const [, m, y] = p.date.split('/');
            const ym = `${y}-${m}`;
            return ym > latest ? ym : latest;
          }, '0000-00')
        : null;

    const packsUsed =
      totalUnitsPurchased > 0
        ? totalUnitsPurchased
        : Math.ceil(Object.values(byMonth).reduce((s, m) => s + m.formulaMl, 0) / PACK_YIELD_ML);
    const packsLabel =
      totalUnitsPurchased > 0 ? 'purchased (recorded)' : 'purchased (estimated)';

    const purchasePeriodMl = lastPurchaseYM
      ? Object.keys(byMonth)
          .filter((ym) => ym <= lastPurchaseYM)
          .reduce((s, ym) => s + byMonth[ym].formulaMl, 0)
      : 0;

    let totalFormulaMl = 0;
    let totalBmMl = 0;

    const rows: FormulaCostRow[] = months.map((ym) => {
      const { formulaMl, bmMl, days } = byMonth[ym];
      totalFormulaMl += formulaMl;
      totalBmMl += bmMl;

      let formulaCost = 0;
      if (formulaMl > 0) {
        if (lastPurchaseYM && ym <= lastPurchaseYM && purchasePeriodMl > 0) {
          formulaCost = (formulaMl / purchasePeriodMl) * totalPurchasedCost;
        } else {
          formulaCost = formulaMl * PRICE_PER_ML;
        }
      }

      const bmSavings = bmMl * PRICE_PER_ML;
      const [yr, mo] = ym.split('-');
      const label = `${MONTH_NAMES[+mo - 1]} ${yr}`;
      return { label, formulaMl, formulaCost, bmMl, bmSavings, days };
    });

    const futureMl = Object.keys(byMonth)
      .filter((ym) => !lastPurchaseYM || ym > lastPurchaseYM)
      .reduce((s, ym) => s + byMonth[ym].formulaMl, 0);
    const totalFormulaCost = totalPurchasedCost + futureMl * PRICE_PER_ML;
    const totalBmSavings = totalBmMl * PRICE_PER_ML;
    const netSavings = totalBmSavings - totalFormulaCost;

    return {
      totalFormulaCost,
      netSavings,
      packsUsed,
      packsLabel,
      packPrice: PACK_PRICE,
      packSizeG: PACK_SIZE_G,
      packYieldMl: PACK_YIELD_ML,
      pricePerMl: PRICE_PER_ML,
      product: FORMULA_PRODUCT,
      sourceNote: FORMULA_SOURCE_NOTE,
      rows,
      totalFormulaMl,
      totalBmMl,
      totalBmSavings,
    };
  }
}
