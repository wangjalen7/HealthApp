import { decode } from "base64-arraybuffer";
import { z } from "zod";

import { supabase } from "../../lib/supabase";
import { createId } from "../vitals/storage";
import type { PreparedProgressPhoto } from "./image";
import {
  isProgressPhotoStorageFullError,
  localPhotoDay,
  progressPhotoEntryLimit,
  progressPhotoMaxBytes,
  progressPhotoStorageFullMessage,
} from "./model";

const bucket = "progress-photos";
const rowSchema = z.object({
  id: z.string().uuid(),
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
      "id, user_id, weight_sample_id, object_path, taken_at, local_day, width, height, byte_size",
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
): Promise<ProgressPhoto> {
  if (photo.byteSize > progressPhotoMaxBytes) {
    throw new Error("Progress photos must be 2 MB or smaller.");
  }
  const takenAt = new Date().toISOString();
  const localDay = localPhotoDay(takenAt);
  const count = await getEntryProgressPhotoCount(userId, weightSampleId);
  if (count >= progressPhotoEntryLimit) {
    throw new Error("Three progress photos are allowed per weight entry.");
  }

  const id = createId();
  const objectPath = `${userId}/${localDay}/${id}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(objectPath, decode(photo.base64), {
      cacheControl: "31536000",
      contentType: "image/jpeg",
      upsert: false,
    });
  if (uploadError) {
    if (isProgressPhotoStorageFullError(uploadError)) {
      throw new Error(progressPhotoStorageFullMessage);
    }
    throw new Error(uploadError.message);
  }
  const { data: url, error: signedUrlError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, 60 * 60);
  if (signedUrlError) {
    await supabase.storage.from(bucket).remove([objectPath]);
    throw new Error(signedUrlError.message);
  }

  const row = {
    byte_size: photo.byteSize,
    height: photo.height,
    id,
    local_day: localDay,
    object_path: objectPath,
    taken_at: takenAt,
    user_id: userId,
    weight_sample_id: weightSampleId,
    width: photo.width,
  };
  const { data, error } = await supabase
    .from("progress_photos")
    .insert(row)
    .select(
      "id, user_id, weight_sample_id, object_path, taken_at, local_day, width, height, byte_size",
    )
    .single();
  if (error) {
    await supabase.storage.from(bucket).remove([objectPath]);
    throw new Error(error.message);
  }
  const parsed = rowSchema.parse(data);
  return mapRow(parsed, url.signedUrl);
}

export async function deleteProgressPhoto(
  userId: string,
  photo: ProgressPhoto,
): Promise<void> {
  const { error: storageError } = await supabase.storage
    .from(bucket)
    .remove([photo.objectPath]);
  if (storageError) throw new Error(storageError.message);
  const { error } = await supabase
    .from("progress_photos")
    .delete()
    .eq("id", photo.id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
