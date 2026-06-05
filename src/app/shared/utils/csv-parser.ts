/**
 * Minimal CSV parser.
 * Numeric-looking cells are coerced to numbers; empty cells become null.
 */
export function parseCsv(csvText: string): Record<string, string | number | null>[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    return [];
  }

  const headers = lines[0].split(',').map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const values = line.split(',');
    const row: Record<string, string | number | null> = {};

    headers.forEach((header, index) => {
      const value = values[index]?.trim() ?? '';
      row[header] = value === '' ? null : isNaN(Number(value)) ? value : parseFloat(value);
    });

    return row;
  });
}
