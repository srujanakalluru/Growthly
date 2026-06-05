/**
 * Domain models for the infant feeding & growth dashboard.
 *
 * These types describe the shape of the data after it has been parsed from the
 * source CSV files and enriched by `FeedingDataService`.
 */

/** A single pump/feed session within a day. */
export interface FeedingSession {
  timeSlot: string;
  exprMilk: number;
  formula: number;
  feedTotal: number;
  pumpLeft: number;
  pumpRight: number;
  pumpTotal: number;
  feedTime: string | null;
  pumpTime: string | null;
}

/**
 * A fully processed day of feeding/growth data.
 */
export interface DailyEntry {
  date: string;
  /** Pump left (ml). */
  pL: number;
  /** Pump right (ml). */
  pR: number;
  /** Total pumped (ml). */
  total: number;
  /** Expressed milk consumed (ml). */
  expr: number;
  /** Formula consumed (ml). */
  form: number;
  /** consumed - total. */
  deficit: number;
  sessions: FeedingSession[];
  weight: number | null;
  height: number | null;
  headCirc: number | null;

  roll7: number | null;
  roll14: number | null;
  roll28: number | null;
  roll7Expr?: number | null;
  roll7Form?: number | null;
}

/** Raw CSV daily row, before processing. */
export interface RawDailyRow {
  date: string;
  fullDate: string | null;
  weight: number | null;
  height: number | null;
  headCirc: number | null;
  pumpLeft: number | null;
  pumpRight: number | null;
  expr: number | null;
  form: number | null;
  pumpCount: number | null;
}

/** Raw CSV session row, before processing. */
export interface RawSessionRow {
  date: string;
  timeSlot: string | null;
  exprMilk: number | null;
  formula: number | null;
  pumpLeft: number | null;
  pumpRight: number | null;
  feedTime: string | null;
  pumpTime: string | null;
}

/** WHO LMS parameter triple. */
export interface Lms {
  L: number;
  M: number;
  S: number;
}

/** Min/target/max weight-gain band (g/day). */
export interface WeightGainBand {
  min: number;
  target: number;
  max: number;
}

/** Min/max growth-velocity band (g/week). */
export interface VelocityBand {
  min: number;
  max: number;
}

/** A measured weight point enriched with WHO percentile values. */
export interface GrowthPoint {
  date: string;
  days: number;
  weight: number;
  zScore: number | null;
  who3: number | null;
  who15: number | null;
  who50: number | null;
  who85: number | null;
  who97: number | null;
}

/** A growth-velocity interval. */
export interface VelocityPoint {
  days: number;
  velocity: number;
  whoRange: VelocityBand;
  date: string;
}

/** A growth-acceleration interval. */
export interface AccelerationPoint {
  days: number;
  acceleration: number;
  date: string;
  prevVelocity: number;
  currVelocity: number;
}

/** Daily pump-frequency record used by the pump charts and calendar. */
export interface PumpFrequencyPoint {
  date: string;
  sessions: number;
  totalOutput: number;
  avgFrequency: number | null;
  avgOutput: number | null;
}

/** Day-of-week rhythm aggregate row. */
export interface DowRhythmRow {
  day: string;
  avgProduction: number;
  avgConsumption: number;
  avgFormula: number;
  gap: number;
  count: number;
}

/** Inclusive index range over the daily-data array. */
export interface DateRange {
  start: number;
  end: number;
}

/** Result of a weight-gain-rate calculation. */
export interface WeightGainResult {
  rate: number;
  detail: string;
}
