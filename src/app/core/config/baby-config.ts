/**
 * Baby growth & feeding configuration (WHO LMS tables, targets, UI text).
 */
import { parseDate, daysBetween } from '../../shared/utils/date-utils';
import { Lms, WeightGainBand, VelocityBand } from '../models/feeding.models';
import { WHO_LMS_BOYS, WHO_LMS_GIRLS, WhoLmsSet, LmsTable } from './who-lms';
import { BABY_DATA } from './baby-data';


export const BABY_CONFIG = {
  // Per-baby fields (name, sex, birthDate, gestationalAge, birthMeasurements,
  // earlyWeightEntries, formulaPurchases) come from baby-data.ts — a gitignored
  // file generated from the Excel "Setup" sheet by `npm run data`.
  ...BABY_DATA,

  anomalousMeasurements: {
    height: [{ days: 42, reason: 'Measurement error suspected' }]
  },

  whoTargets: {
    weightGain: {
      days0to90: { min: 17.5, target: 25, max: 36 },
      days91plus: { min: 14, target: 20, max: 29 }
    },
    velocity: {
      weeks0to13: { min: 175, max: 245 },
      weeks14plus: { min: 140, max: 210 }
    }
  },

  whoLMSTables: WHO_LMS_BOYS as WhoLmsSet,

  productionThresholds: {
    highRisk: 400,
    moderateRisk: 0.85,
    milestones: [300, 400, 500, 600]
  },

  analysisParams: {
    minDaysForRiskAssessment: 7,
    minDaysForCorrelation: 10,
    minDaysForHeatmap: 7,
    recentDataWindow: 7,
    minDaysForPumpFrequency: 7,
    pumpFrequencyWindow: 7,
    whoWithinRangeThreshold: 0.8,
    toggleTwoWeeksDays: 14,
    toggleFourWeeksDays: 28
  },

  timeSlots: {
    intervals: ['9:00 PM', '12:00 AM', '3:00 AM', '6:00 AM', '9:00 AM', '12:00 PM', '3:00 PM', '6:00 PM'],
    nightSlots: ['9:00 PM', '12:00 AM', '3:00 AM', '6:00 AM'],
    daySlots: ['9:00 AM', '12:00 PM', '3:00 PM', '6:00 PM']
  },

  chartSettings: {
    maxTicksLimit: 30,
    pointRadius: {
      default: 2,
      hover: 6,
      measured: 8,
      interpolated: 4,
      anomalous: 12
    },
    colors: {
      production: '#34495e',
      consumption: '#27ae60',
      formula: '#e67e22',
      averages: {
        week1: '#3498db',
        week2: '#9b59b6',
        week4: '#e74c3c'
      },
      weight: '#2980b9',
      height: '#8e44ad',
      headCirc: '#c0392b',
      bmi: '#e67e22',
      whoPercentiles: {
        p3: '#95a5a6',
        p15: '#3498db',
        p50: '#27ae60',
        p85: '#e67e22',
        p97: '#e74c3c'
      }
    }
  },


  lactationStages: [
    { day: 0,  label: 'Colostrum',         color: '#f0a500', yOffset: 14 },
    { day: 4,  label: 'Transitional Milk', color: '#e07b39', yOffset: 38 },
    { day: 14, label: 'Mature Milk',        color: '#27ae60', yOffset: 14 },
    { day: 42, label: 'Supply Regulation',  color: '#2980b9', yOffset: 14 }
  ],

  uiText: {
    title: 'Medical Analysis Report: {name}',
    subtitle: 'Birth: {birthDate} ({gestationalAge} gestation, {category}) | Current: {currentDays} days, ({correctedMonths} months) | Weight: {weight}',
    noData: 'No data available',
    insufficientData: 'Insufficient data for analysis',
    formulaFreeDay: 'First Formula-Free Day',
    formulaFreeWeek: 'First Full Formula-Free Week',
    productionMilestone: 'Production Reached {threshold} ml/day'
  },


  /** Interpolate the WFL LMS table at a given recumbent length (cm). */
  getLMSForLength(lengthCm: number): Lms | null {
    const table = this.whoLMSTables['weightForLength'] as LmsTable;
    if (!table) return null;
    if (table[lengthCm] !== undefined) return table[lengthCm];
    const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
    if (lengthCm <= keys[0])               return table[keys[0]];
    if (lengthCm >= keys[keys.length - 1]) return table[keys[keys.length - 1]];
    let lo = keys[0], hi = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) {
      if (lengthCm >= keys[i] && lengthCm <= keys[i + 1]) { lo = keys[i]; hi = keys[i + 1]; break; }
    }
    const r = (lengthCm - lo) / (hi - lo);
    const a = table[lo], b = table[hi];
    return { L: a.L + (b.L - a.L) * r, M: a.M + (b.M - a.M) * r, S: a.S + (b.S - a.S) * r };
  },

  /**
   * WHO weight-for-length Z-score.
   * @param {number} lengthCm  – recumbent length in cm
   * @param {number} weightKg  – weight in kg
   */
  calculateZScoreWFL(lengthCm: number, weightKg: number | null): number | null {
    const lms = this.getLMSForLength(lengthCm);
    if (!lms || !weightKg) return null;

    const { L, M, S } = lms;
    const ratio = weightKg / M;

    if (Math.abs(L) < 1e-6) {
      return Math.log(ratio) / S;
    }

    return (Math.exp(L * Math.log(ratio)) - 1) / (L * S);
  },

  /** Convert a WFL Z-score to a percentile (0–100). */
  getWFLPercentile(lengthCm: number, weightKg: number | null): number | null {
    const z = this.calculateZScoreWFL(lengthCm, weightKg);
    return z !== null ? this.zScoreToPercentile(z) : null;
  },

  getCorrectedAgeDays(actualDays: number): number {
    const gestationalWeeks = this.gestationalAge.weeks + (this.gestationalAge.days / 7);
    if (gestationalWeeks >= 37) return actualDays;

    const correctionDays = (40 - gestationalWeeks) * 7;
    return Math.round(actualDays - correctionDays);
  },

  getWHOWeightGainTarget(days: number): WeightGainBand {
    return days <= 90
      ? this.whoTargets.weightGain.days0to90
      : this.whoTargets.weightGain.days91plus;
  },

  getWHOVelocityRange(days: number): VelocityBand {
    return days <= 90
      ? this.whoTargets.velocity.weeks0to13
      : this.whoTargets.velocity.weeks14plus;
  },

  getAgeInDays(dateString: string): number {
    const date = parseDate(dateString);
    return date ? daysBetween(this.birthDate, date) : 0;
  },

  getLMSForAge(ageInDays: number, measurementType: string): Lms | null {
    const table = (this.whoLMSTables as unknown as Record<string, LmsTable>)[measurementType];
    if (!table) return null;
    if (table[ageInDays]) return table[ageInDays];

    return this.interpolateLMS(table, ageInDays);
  },

  interpolateLMS(table: LmsTable, days: number): Lms {
    const ages = Object.keys(table).map(Number).sort((a, b) => a - b);

    if (days < ages[0]) return table[ages[0]];
    if (days > ages[ages.length - 1]) return table[ages[ages.length - 1]];

    let lowerAge = ages[0];
    let upperAge = ages[ages.length - 1];

    for (let i = 0; i < ages.length - 1; i++) {
      if (days >= ages[i] && days <= ages[i + 1]) {
        lowerAge = ages[i];
        upperAge = ages[i + 1];
        break;
      }
    }

    const ratio = (days - lowerAge) / (upperAge - lowerAge);
    const lowerLMS = table[lowerAge];
    const upperLMS = table[upperAge];

    return {
      L: lowerLMS.L + (upperLMS.L - lowerLMS.L) * ratio,
      M: lowerLMS.M + (upperLMS.M - lowerLMS.M) * ratio,
      S: lowerLMS.S + (upperLMS.S - lowerLMS.S) * ratio
    };
  },

  getInterpolatedLMS(days: number, measurementType: string): Lms | null {
    return this.getLMSForAge(days, measurementType);
  },

  calculateZScore(ageInDays: number, measurement: number | null, measurementType: string): number | null {
    const lms = this.getLMSForAge(ageInDays, measurementType);
    if (!lms || !measurement) return null;

    const { L, M, S } = lms;

    if (Math.abs(L) < 0.01) {
      return Math.log(measurement / M) / S;
    }

    return (Math.pow(measurement / M, L) - 1) / (L * S);
  },

  zScoreToPercentile(zScore: number): number {
    const erf = (x: number): number => {
      const sign = x >= 0 ? 1 : -1;
      x = Math.abs(x);

      const t = 1 / (1 + 0.3275911 * x);
      const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t
        - 0.284496736) * t + 0.254829592) * t) * Math.exp(-x * x);

      return sign * y;
    };

    return 50 * (1 + erf(zScore / Math.sqrt(2)));
  },

  interpretZScore(zScore: number | null, measurementType?: string) {
    if (zScore === null || isNaN(zScore)) {
      return { category: 'unknown', description: 'Unable to calculate', color: '#95a5a6' };
    }

    const percentile = this.zScoreToPercentile(zScore);
    const ranges = [
      { max: -3, category: 'severely_low', desc: 'Severely low (<0.1st percentile)', color: '#c0392b', clinical: 'Requires immediate medical evaluation' },
      { max: -2, category: 'low', desc: `Low (${percentile.toFixed(1)}th percentile)`, color: '#e67e22', clinical: 'Below normal range, monitor closely' },
      { max: -1, category: 'below_average', desc: `Below average (${percentile.toFixed(1)}th percentile)`, color: '#f39c12', clinical: 'Within acceptable range, lower end' },
      { max: 1, category: 'normal', desc: `Normal range (${percentile.toFixed(1)}th percentile)`, color: '#27ae60', clinical: 'Healthy growth pattern' },
      { max: 2, category: 'above_average', desc: `Above average (${percentile.toFixed(1)}th percentile)`, color: '#3498db', clinical: 'Within acceptable range, higher end' },
      { max: 3, category: 'high', desc: `High (${percentile.toFixed(1)}th percentile)`, color: '#9b59b6', clinical: 'Above normal range, monitor for overfeeding' }
    ];

    for (const range of ranges) {
      if (zScore < range.max) {
        return {
          category: range.category,
          description: range.desc,
          percentile: percentile.toFixed(2),
          color: range.color,
          clinical: range.clinical
        };
      }
    }

    return {
      category: 'severely_high',
      description: `Severely high (>99.9th percentile)`,
      percentile: percentile.toFixed(2),
      color: '#8e44ad',
      clinical: 'Requires medical evaluation for excessive growth'
    };
  }
};

// Select the WHO LMS table set for the configured sex.
(BABY_CONFIG as { whoLMSTables: WhoLmsSet }).whoLMSTables =
  (BABY_CONFIG.sex as string) === 'female' ? WHO_LMS_GIRLS : WHO_LMS_BOYS;
