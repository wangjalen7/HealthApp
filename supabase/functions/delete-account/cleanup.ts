/** Each step is idempotent. Never declare completion after a failed required step. */
export async function cleanupAccount(deps: {
  list: () => Promise<{ bucket_id: string; name: string }[]>;
  remove: (bucket: string, paths: string[]) => Promise<void>;
  deleteAuth: () => Promise<void>;
  finish: () => Promise<void>;
}) {
  for (let batch = 0; batch < 100; batch++) {
    const objects = await deps.list();
    if (!objects.length) { await deps.deleteAuth(); await deps.finish(); return; }
    for (const bucket of new Set(objects.map((o) => o.bucket_id)))
      await deps.remove(bucket, objects.filter((o) => o.bucket_id === bucket).map((o) => o.name));
  }
  throw new Error("More files remain. Retry to continue deletion.");
}
