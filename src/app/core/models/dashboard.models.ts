/** View-model types for the dashboard's text/stat sections. */

export interface GrowthTrendAlert {
  alert: 'insufficient_data' | 'success' | 'info' | 'warning';
  severity?: 'none' | 'low' | 'moderate' | 'high';
  message: string;
  currentVelocity?: string;
  avgVelocity?: string;
  whoRange?: { min: number; max: number };
  accelerationStatus?: string | null;
  recommendation: string;
  action?: string;
  confidence?: string;
}

/** A single summary stat card. */
export interface StatCard {
  id: string;
  label: string;
  value: string;
  detail: string;
}

/** Day/night and expressed/formula split cards have two values. */
export interface SplitStatCard {
  label: string;
  primaryLabel: string;
  primaryValue: string;
  secondaryLabel: string;
  secondaryValue: string;
  detail: string;
}

export interface DashboardStats {
  weightGain: StatCard;
  avgProduction: StatCard;
  dayNight: SplitStatCard;
  formulaFree: StatCard;
  milkConsumed: SplitStatCard;
  bmSavings: StatCard;
  avgFeedSession: StatCard;
}

export interface FormulaCostRow {
  label: string;
  formulaMl: number;
  formulaCost: number;
  bmMl: number;
  bmSavings: number;
  days: number;
}

export interface FormulaCostPanel {
  totalFormulaCost: number;
  netSavings: number;
  packsUsed: number;
  packsLabel: string;
  packPrice: number;
  packSizeG: number;
  packYieldMl: number;
  pricePerMl: number;
  product: string;
  sourceNote: string;
  rows: FormulaCostRow[];
  totalFormulaMl: number;
  totalBmMl: number;
  totalBmSavings: number;
}
