import { File, Paths, type FileHandle } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { strToU8, Zip, ZipDeflate, ZipPassThrough } from "fflate";

import { supabase } from "../../lib/supabase";
import { assertAccount } from "../../lib/mutations";
import { createUuid } from "../../lib/id";
import type { HealthDataExport } from "./model";
import { exportTextFiles } from "./model";

type ProgressPhotoRow = {
  id: string;
  object_path: string;
  local_day?: string;
  daily_slot?: number;
};

export type ExportProgress = {
  completedPhotos: number;
  totalPhotos: number;
};

type NativeWritableFile = File & {
  create(): void;
  delete(): void;
  exists: boolean;
  open(): FileHandle;
  uri: string;
};

function progressPhotoRows(data: HealthDataExport): ProgressPhotoRow[] {
  return (data.datasets.progress_photos ?? []).flatMap((row) => {
    if (typeof row.id !== "string" || typeof row.object_path !== "string")
      return [];
    return [
      {
        id: row.id,
        object_path: row.object_path,
        local_day:
          typeof row.local_day === "string" ? row.local_day : undefined,
        daily_slot:
          typeof row.daily_slot === "number" ? row.daily_slot : undefined,
      },
    ];
  });
}

function photoFilename(photo: ProgressPhotoRow): string {
  const day = photo.local_day ?? "unknown-date";
  const slot = photo.daily_slot ? `-${photo.daily_slot}` : "";
  return `progress-photos/${day}${slot}-${photo.id}.jpg`;
}

export async function shareHealthDataExport(
  data: HealthDataExport,
  includePhotos: boolean,
  onProgress?: (progress: ExportProgress) => void,
): Promise<void> {
  const user = String(data.datasets.account?.[0]?.id ?? "");
  await assertAccount(user);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device.");
  }
  const stamp = data.exportedAt.slice(0, 10);
  // Expo's platform-suffixed declarations resolve the web base class during
  // the shared TypeScript pass; these members are provided by the native File.
  const file = new File(
    Paths.cache,
    `Sustain-data-${stamp}-${createUuid()}.zip`,
  ) as NativeWritableFile;
  if (file.exists) file.delete();
  file.create();
  const handle = file.open();
  let archiveError: Error | undefined;
  const zip = new Zip((error, chunk) => {
    if (error) {
      archiveError = error;
      return;
    }
    handle.writeBytes(chunk);
  });

  try {
    for (const [filename, contents] of Object.entries(exportTextFiles(data))) {
      const entry = new ZipDeflate(filename, { level: 6 });
      zip.add(entry);
      entry.push(strToU8(contents), true);
    }

    const photos = includePhotos ? progressPhotoRows(data) : [];
    onProgress?.({ completedPhotos: 0, totalPhotos: photos.length });
    for (const [index, photo] of photos.entries()) {
      await assertAccount(user);
      const { data: blob, error } = await supabase.storage
        .from("progress-photos")
        .download(photo.object_path);
      if (error)
        throw new Error(`Progress photo ${index + 1}: ${error.message}`);
      const entry = new ZipPassThrough(photoFilename(photo));
      zip.add(entry);
      entry.push(new Uint8Array(await blob.arrayBuffer()), true);
      onProgress?.({
        completedPhotos: index + 1,
        totalPhotos: photos.length,
      });
    }
    zip.end();
    if (archiveError) throw archiveError;
    handle.close();
    await assertAccount(user);
    await Sharing.shareAsync(file.uri, {
      dialogTitle: "Export HealthApp data",
      mimeType: "application/zip",
      UTI: "com.pkware.zip-archive",
    });
  } finally {
    try {
      handle.close();
    } catch {
      // The handle is already closed after a successful archive write.
    }
    if (file.exists) file.delete();
  }
}
