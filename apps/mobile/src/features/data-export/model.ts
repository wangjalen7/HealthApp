export type ExportRow = Record<string, unknown>;

export type ExportDatasets = Record<string, ExportRow[]>;

export type HealthDataExport = {
  exportVersion: 1;
  exportedAt: string;
  datasets: ExportDatasets;
};

function csvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const plain =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  const safe =
    // Guard spreadsheet formulas even when prefixed with invisible controls.
    // eslint-disable-next-line no-control-regex
    typeof value === "string" && /^[\s\u0000-\u001f]*[=+\-@]/.test(plain) ? `'${plain}` : plain;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function rowsToCsv(rows: ExportRow[]): string {
  if (!rows.length) return "";
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = [headers.map(csvValue).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvValue(row[header])).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function exportTextFiles(
  data: HealthDataExport,
): Record<string, string> {
  const rowCounts = Object.fromEntries(
    Object.entries(data.datasets).map(([name, rows]) => [name, rows.length]),
  );
  const manifest = {
    exportVersion: data.exportVersion,
    exportedAt: data.exportedAt,
    format: "HealthApp portable data export",
    rowCounts,
  };
  const readme = [
    "HealthApp data export",
    "",
    `Created: ${data.exportedAt}`,
    "",
    "The csv folder contains one spreadsheet-friendly file per data category.",
    "full-data.json contains the same structured data without flattening arrays or objects.",
    "Progress-photo files are included only when the export action says that photos are included.",
    "This archive contains private health information. Store and share it carefully.",
    "",
  ].join("\r\n");
  const files: Record<string, string> = {
    "README.txt": readme,
    "manifest.json": `${JSON.stringify(manifest, null, 2)}\n`,
    "full-data.json": `${JSON.stringify(data, null, 2)}\n`,
  };
  for (const [name, rows] of Object.entries(data.datasets)) {
    files[`csv/${name}.csv`] = rowsToCsv(rows);
  }
  return files;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
