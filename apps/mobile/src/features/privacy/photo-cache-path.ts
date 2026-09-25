export function isDisposablePhotoUri(uri: string, cache: string): boolean {
  try {
    const file = new URL(uri);
    const root = new URL(cache);
    return (
      file.protocol === "file:" &&
      root.protocol === "file:" &&
      file.host === root.host &&
      !/%2f|%5c/i.test(file.pathname) &&
      file.pathname.length > root.pathname.replace(/\/$/, "").length + 1 &&
      file.pathname.startsWith(root.pathname.replace(/\/$/, "") + "/")
    );
  } catch {
    return false;
  }
}
