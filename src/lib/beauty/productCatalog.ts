import type { CatalogProduct } from "./types";

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Parses data/product_database.csv. Shared by the dev server's /api/products and the browser
 * build, which bundles the CSV so the app runs from static hosting with no server.
 */
export function parseProductCatalogCsv(raw: string): CatalogProduct[] {
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  const rows: CatalogProduct[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length < headers.length) continue;
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = values[idx] ?? "";
    });
    rows.push({
      id: i,
      product_name: record.product_name,
      brand: record.brand,
      product_type: record.product_type,
      texture_type: record.texture_type,
      hex_color: record.hex_color,
      shade_name: record.shade_name,
      undertone: record.undertone,
      best_seasons: record.best_seasons,
    });
  }
  return rows;
}
