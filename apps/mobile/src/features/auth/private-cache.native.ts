import { Directory, Paths } from "expo-file-system";
export async function clearPrivateCache() {
  // Only this application's disposable cache: camera copies, transformations,
  // exports and downloaded thumbnails. Never touch documents or the photo library.
  for (const entry of new Directory(Paths.cache).list())
    (entry as unknown as { delete: () => void }).delete();
}
