import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { stripJpegMetadata } from "../privacy/jpeg";
import { removeTemporaryPhoto } from "../privacy/photo-cache";

export async function selectMealImage(source: "camera" | "library") {
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted)
      throw new Error(
        "Allow camera access in Settings to photograph your meal, or choose a photo.",
      );
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: false,
    exif: false,
    quality: 1,
    selectionLimit: 1,
  };
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return undefined;
  const asset = result.assets[0];
  if (!asset?.width || !asset.height)
    throw new Error("Could not read that photo.");
  const scale = Math.min(1, 1440 / Math.max(asset.width, asset.height));
  try {
    const image = await manipulateAsync(
      asset.uri,
      [
        {
          resize: {
            width: Math.round(asset.width * scale),
            height: Math.round(asset.height * scale),
          },
        },
      ],
      { base64: true, compress: 0.7, format: SaveFormat.JPEG },
    );
    removeTemporaryPhoto(image.uri);
    if (!image.base64 || image.base64.length > 2_796_200)
      throw new Error("Choose a smaller photo (up to 2 MB after preparation).");
    const base64 = stripJpegMetadata(image.base64);
    return { uri: `data:image/jpeg;base64,${base64}`, base64 };
  } finally {
    removeTemporaryPhoto(asset.uri);
  }
}
