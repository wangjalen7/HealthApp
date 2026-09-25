import { File, Paths } from "expo-file-system";
import { isDisposablePhotoUri } from "./photo-cache-path";

export function removeTemporaryPhoto(uri: string): void {
  const cache = Paths.cache as unknown as { uri: string };
  if (!isDisposablePhotoUri(uri, cache.uri)) return;
  try {
    const file = new File(uri) as unknown as {
      exists: boolean;
      delete(): void;
    };
    if (file.exists) file.delete();
  } catch {
    // Best effort cache cleanup. Account deletion also clears the app cache.
    // Never log a private filename or fail a successfully prepared image.
  }
}
