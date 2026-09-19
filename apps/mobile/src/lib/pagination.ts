/** Immutable UUID keysets avoid offset shifts when another device deletes rows.
 * Continue until an empty page, even if the service cap is smaller than requested.
 * New records behind this traversal's cursor appear on the next full refresh. */
export async function collectPages<T extends { id: string }>(
  read: (
    after?: string,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | undefined;
  for (;;) {
    const { data, error } = await read(after);
    if (error) throw new Error(error.message);
    if (!data?.length) return rows;
    const next = data.at(-1)!.id;
    if (after && next <= after)
      throw new Error("History pagination did not advance. Please retry.");
    rows.push(...data);
    after = next;
  }
}
