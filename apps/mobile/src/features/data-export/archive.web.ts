import { strToU8, zipSync } from "fflate";

import { supabase } from "../../lib/supabase";
import { assertAccount } from "../../lib/mutations";
import type { HealthDataExport } from "./model";
import { exportTextFiles } from "./model";
import type { ExportProgress } from "./archive.native";

export type { ExportProgress } from "./archive.native";

export async function shareHealthDataExport(
  data: HealthDataExport,
  includePhotos: boolean,
  onProgress?: (progress: ExportProgress) => void,
): Promise<void> {
  const user = String(data.datasets.account?.[0]?.id ?? "");
  await assertAccount(user);
  const files: Record<string, Uint8Array> = Object.fromEntries(
    Object.entries(exportTextFiles(data)).map(([name, contents]) => [
      name,
      strToU8(contents),
    ]),
  );
  const photos = includePhotos ? (data.datasets.progress_photos ?? []) : [];
  onProgress?.({ completedPhotos: 0, totalPhotos: photos.length });
  for (const [index, row] of photos.entries()) {
    await assertAccount(user);
    if (typeof row.object_path !== "string" || typeof row.id !== "string")
      continue;
    const { data: blob, error } = await supabase.storage
      .from("progress-photos")
      .download(row.object_path);
    if (error) throw new Error(`Progress photo ${index + 1}: ${error.message}`);
    const day =
      typeof row.local_day === "string" ? row.local_day : "unknown-date";
    files[`progress-photos/${day}-${row.id}.jpg`] = new Uint8Array(
      await blob.arrayBuffer(),
    );
    onProgress?.({ completedPhotos: index + 1, totalPhotos: photos.length });
  }
  await assertAccount(user);
  const bytes = zipSync(files, { level: 6 });
  const url = URL.createObjectURL(
    new Blob([bytes], { type: "application/zip" }),
  );
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = `HealthApp-data-${data.exportedAt.slice(0, 10)}.zip`;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
