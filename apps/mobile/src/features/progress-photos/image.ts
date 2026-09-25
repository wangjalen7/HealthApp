import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { stripJpegMetadata } from "../privacy/jpeg";
import { removeTemporaryPhoto } from "../privacy/photo-cache";

import {
  approximateBase64Bytes,
  progressPhotoMaxBytes,
  progressPhotoMaxDimension,
  progressPhotoTargetBytes,
} from "./model";

export type ProgressPhotoSource = "camera" | "library";

export type SelectedProgressPhoto = {
  uri: string;
  width: number;
  height: number;
};

export type PreparedProgressPhoto = SelectedProgressPhoto & {
  base64: string;
  byteSize: number;
};

export async function selectProgressPhoto(
  source: ProgressPhotoSource,
): Promise<SelectedProgressPhoto | undefined> {
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error("Camera access is required.");
  }
  const options: ImagePicker.ImagePickerOptions = {
    allowsEditing: false,
    exif: false,
    mediaTypes: ["images"],
    quality: 1,
    selectionLimit: 1,
  };
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return undefined;
  const asset = result.assets[0];
  if (!asset?.uri || !asset.width || !asset.height) {
    throw new Error("Could not read that photo.");
  }
  return { uri: asset.uri, width: asset.width, height: asset.height };
}

async function renderJpeg(
  selected: SelectedProgressPhoto,
  maxDimension: number,
  compress: number,
): Promise<PreparedProgressPhoto> {
  const scale = Math.min(
    1,
    maxDimension / Math.max(selected.width, selected.height),
  );
  const saved = await manipulateAsync(
    selected.uri,
    [
      {
        resize: {
          height: Math.max(1, Math.round(selected.height * scale)),
          width: Math.max(1, Math.round(selected.width * scale)),
        },
      },
    ],
    { base64: true, compress, format: SaveFormat.JPEG },
  );
  removeTemporaryPhoto(saved.uri);
  if (!saved.base64) throw new Error("Could not prepare that photo.");
  const cleanBase64 = stripJpegMetadata(saved.base64);
  return {
    base64: cleanBase64,
    byteSize: approximateBase64Bytes(cleanBase64),
    height: saved.height,
    uri: `data:image/jpeg;base64,${cleanBase64}`,
    width: saved.width,
  };
}

export async function prepareProgressPhoto(
  selected: SelectedProgressPhoto,
): Promise<PreparedProgressPhoto> {
  const attempts = [
    { maxDimension: progressPhotoMaxDimension, compress: 0.7 },
    { maxDimension: 1200, compress: 0.6 },
    { maxDimension: 960, compress: 0.52 },
    { maxDimension: 800, compress: 0.48 },
    { maxDimension: 640, compress: 0.42 },
  ];
  try {
    let latest: PreparedProgressPhoto | undefined;
    for (const attempt of attempts) {
      latest = await renderJpeg(
        selected,
        attempt.maxDimension,
        attempt.compress,
      );
      if (latest.byteSize <= progressPhotoTargetBytes) return latest;
    }
    if (!latest || latest.byteSize > progressPhotoMaxBytes) {
      throw new Error("This photo could not be reduced below 2 MB.");
    }
    if (latest.byteSize > progressPhotoTargetBytes) {
      throw new Error("This photo could not be reduced enough for storage.");
    }
    return latest;
  } finally {
    removeTemporaryPhoto(selected.uri);
  }
}
