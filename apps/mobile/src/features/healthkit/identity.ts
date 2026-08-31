import { v5 as uuidV5 } from "uuid";

export function healthKitRecordId(
  userId: string,
  kind: string,
  externalId: string,
): string {
  return uuidV5(`${kind}:${externalId}`, userId);
}
