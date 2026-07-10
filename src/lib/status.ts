import { db } from "./db";

export const STATUS_MAX_LEN = 200;

export type SetStatusResult =
  | { ok: true; statusText: string | null }
  | { ok: false; reason: "not_present" };

/**
 * Save "what I'm working on" onto the caller's open session. The latest
 * non-empty status is also copied to the user as the pre-fill for their
 * next visit; clearing (empty text) leaves that carry-over intact.
 */
export async function setStatus(
  userId: number,
  rawText: string,
): Promise<SetStatusResult> {
  const text = rawText.trim().slice(0, STATUS_MAX_LEN).trimEnd();
  const open = await db.session.findFirst({ where: { userId, status: "open" } });
  if (!open) return { ok: false, reason: "not_present" };

  const statusText = text === "" ? null : text;
  await db.$transaction([
    db.session.update({ where: { id: open.id }, data: { statusText } }),
    ...(statusText
      ? [db.user.update({ where: { id: userId }, data: { lastStatusText: statusText } })]
      : []),
  ]);
  return { ok: true, statusText };
}
