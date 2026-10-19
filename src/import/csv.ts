export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? '';
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (char === '\n') {
      row.push(field);
      field = '';
      if (!(row.length === 1 && row[0] === '')) rows.push(row);
      row = [];
      continue;
    }
    if (char === '\r') continue;
    field += char;
  }
  if (quoted) throw new Error('CSV quote was not closed.');
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
  }
  return rows;
}

export function serializeCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((value) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value))
        .join(','),
    )
    .join('\n');
}

export function rowsToRecords(rows: string[][]): { headers: string[]; records: Record<string, string>[] } {
  const headers = rows[0];
  if (!headers || headers.length === 0) throw new Error('CSV header is required.');
  const records = rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? '';
    });
    return record;
  });
  return { headers, records };
}
