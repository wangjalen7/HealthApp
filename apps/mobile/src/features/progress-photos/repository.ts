import { entryTimestamp } from "../../lib/entry-date";
import { runMutation, changeRecord } from "../../lib/mutations";
import { z } from "zod";

import { supabase } from "../../lib/supabase";
import { createId } from "../vitals/storage";
import type { PreparedProgressPhoto } from "./image";
import { localPhotoDay, progressPhotoMaxBytes } from "./model";

const bucket = "progress-photos";
const rowSchema = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
  user_id: z.string().uuid(),
  weight_sample_id: z.string().uuid().nullable(),
  object_path: z.string().min(1),
  taken_at: z.string().min(1),
  local_day: z.string().min(1),
  width: z.coerce.number().int().positive(),
  height: z.coerce.number().int().positive(),
  byte_size: z.coerce.number().int().positive(),
});

export type ProgressPhoto = {
  id: string;
  version: number;
  userId: string;
  weightSampleId?: string;
  objectPath: string;
  takenAt: string;
  localDay: string;
  width: number;
  height: number;
  byteSize: number;
  signedUrl: string;
};

const weightSampleIdRowSchema = z.object({
  weight_sample_id: z.string().uuid().nullable(),
});

function mapRow(
  row: z.infer<typeof rowSchema>,
  signedUrl: string,
): ProgressPhoto {
  return {
    id: row.id,
    version: row.version,
    userId: row.user_id,
    weightSampleId: row.weight_sample_id ?? undefined,
    objectPath: row.object_path,
    takenAt: row.taken_at,
    localDay: row.local_day,
    width: row.width,
    height: row.height,
    byteSize: row.byte_size,
    signedUrl,
  };
}

export async function getProgressPhotos(
  userId: string,
  weightSampleId: string,
  offset = 0,
  limit = 250,
): Promise<ProgressPhoto[]> {
  const { data, error } = await supabase
    .from("progress_photos")
    .select(
      "id, version, user_id, weight_sample_id, object_path, taken_at, local_day, width, height, byte_size",
    )
    .eq("user_id", userId)
    .eq("weight_sample_id", weightSampleId)
    .order("taken_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  const rows = z.array(rowSchema).parse(data ?? []);
  if (!rows.length) return [];
  const { data: urls, error: signedUrlError } = await supabase.storage
    .from(bucket)
    .createSignedUrls(
      rows.map((row) => row.object_path),
      60 * 60,
    );
  if (signedUrlError) throw new Error(signedUrlError.message);
  const urlsByPath = new Map(
    urls.map((value) => [value.path, value.signedUrl]),
  );
  return rows.map((row) => {
    const url = urlsByPath.get(row.object_path);
    if (!url) throw new Error("Could not open a progress photo.");
    return mapRow(row, url);
  });
}

/** Counts all attachments for this entry, independently of gallery paging. */
export async function getEntryProgressPhotoCount(
  userId: string,
  weightSampleId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("progress_photos")
    .select("id")
    .eq("user_id", userId)
    .eq("weight_sample_id", weightSampleId);
  if (error) throw new Error(error.message);
  return (data ?? []).length;
}

/** Fetches only metadata for the visible Weight History photo indicators. */
export async function getWeightSampleIdsWithProgressPhotos(
  userId: string,
  weightSampleIds: string[],
): Promise<Set<string>> {
  const ids = [...new Set(weightSampleIds)];
  const result = new Set<string>();
  const batchSize = 100;
  for (let start = 0; start < ids.length; start += batchSize) {
    const { data, error } = await supabase
      .from("progress_photos")
      .select("weight_sample_id")
      .eq("user_id", userId)
      .in("weight_sample_id", ids.slice(start, start + batchSize));
    if (error) throw new Error(error.message);
    for (const row of z.array(weightSampleIdRowSchema).parse(data ?? [])) {
      if (row.weight_sample_id) result.add(row.weight_sample_id);
    }
  }
  return result;
}

export async function uploadProgressPhoto(
  userId: string,
  photo: PreparedProgressPhoto,
  weightSampleId: string,
  entryDay?: string,
): Promise<ProgressPhoto> {
  const takenAt = entryTimestamp(entryDay);
  if (photo.byteSize > progressPhotoMaxBytes) {
    throw new Error("Progress photos must be 2 MB or smaller.");
  }
  const rows = await runMutation<Record<string, unknown>[]>(
    userId,
    `photo:create:${weightSampleId}`,
    {
      weightSampleId,
      entryDay,
      base64: photo.base64,
      width: photo.width,
      height: photo.height,
    },
    () => {
      const localDay = localPhotoDay(takenAt);
      const id = createId();
      const objectPath = `${userId}/${localDay}/${id}.jpg`;
      return {
        table: "progress_photos",
        action: "create",
        upload: { base64: photo.base64, path: objectPath },
        rows: [
          {
            id,
            version: 0,
            values: {
              byte_size: photo.byteSize,
              height: photo.height,
              local_day: localDay,
              object_path: objectPath,
              taken_at: takenAt,
              weight_sample_id: weightSampleId,
              width: photo.width,
            },
          },
        ],
      };
    },
  );
  return mapRow(rowSchema.parse(rows[0]), String(rows[0].signed_url));
}

export async function deleteProgressPhoto(
  userId: string,
  photo: ProgressPhoto,
): Promise<void> {
  await changeRecord(userId, "progress_photos", photo.id, photo.version);
}
