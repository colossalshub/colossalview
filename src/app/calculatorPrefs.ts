export interface CalculatorPrefs {
  riskPercent: string;
  mode: 'whole' | 'fractional';
  precision: number;
  maxPositionPct: string;
}

export const DEFAULT_CALCULATOR_PREFS: CalculatorPrefs = {
  riskPercent: '1',
  mode: 'whole',
  precision: 0,
  maxPositionPct: '',
};

const KEY = 'colossalview.calculator';

export function readCalculatorPrefs(): CalculatorPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_CALCULATOR_PREFS;
    const parsed = JSON.parse(raw) as Partial<CalculatorPrefs>;
    const precision = Number(parsed.precision);
    return {
      riskPercent: typeof parsed.riskPercent === 'string' ? parsed.riskPercent : DEFAULT_CALCULATOR_PREFS.riskPercent,
      mode: parsed.mode === 'fractional' ? 'fractional' : 'whole',
      precision: Number.isInteger(precision) && precision >= 0 && precision <= 8 ? precision : 0,
      maxPositionPct: typeof parsed.maxPositionPct === 'string' ? parsed.maxPositionPct : '',
    };
  } catch {
    return DEFAULT_CALCULATOR_PREFS;
  }
}

export function writeCalculatorPrefs(prefs: CalculatorPrefs): void {
  localStorage.setItem(KEY, JSON.stringify(prefs));
}
