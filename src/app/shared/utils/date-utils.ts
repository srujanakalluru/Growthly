/** Date helpers. */

export const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

/** Convert "DD/MM/YYYY" to ISO "YYYY-MM-DD". */
export function ddmmyyyyToIso(dateStr: string | null | undefined): string {
  const parts = dateStr?.split('/');
  return parts?.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : '';
}

/** Convert ISO "YYYY-MM-DD" to "DD/MM/YYYY". */
export function isoToDdmmyyyy(isoStr: string | null | undefined): string {
  const parts = isoStr?.split('-');
  return parts?.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : '';
}

/** Parse a "DD/MM/YYYY" string into a Date, or null when invalid. */
export function parseDate(dateStr: string | null | undefined): Date | null {
  const parts = dateStr?.split('/');
  if (parts?.length !== 3) {
    return null;
  }

  const [day, month, year] = parts.map((p) => parseInt(p, 10));
  if (isNaN(day) || isNaN(month) || isNaN(year)) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  return date.getDate() === day && date.getMonth() === month - 1 ? date : null;
}

export function isValidDate(dateStr: string | null | undefined): boolean {
  return parseDate(dateStr) !== null;
}

export function daysBetween(date1: Date, date2: Date): number {
  return Math.floor((date2.getTime() - date1.getTime()) / MILLISECONDS_PER_DAY);
}

export function getDaysFromBirth(
  dateStr: string | null | undefined,
  birthDate: Date,
): number | null {
  const date = parseDate(dateStr);
  return date ? daysBetween(birthDate, date) : null;
}
