"use client";

import { useEffect, useState } from "react";
import { useCafeData } from "./cafe-data";

/**
 * "What are you working on today?" — shown while present with no status
 * this visit. Skipping is remembered per visit (sessionStorage keyed by the
 * session start), so it never nags within one sitting.
 */
export function StatusBanner() {
  const { me, setSessionStatus } = useCafeData();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  const dismissKey = me?.sessionSince
    ? `cccl-status-skip:${me.sessionSince}`
    : null;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (dismissKey) setDismissed(sessionStorage.getItem(dismissKey) === "1");
  }, [dismissKey]);

  if (!me?.present) return null;

  const showForm = editing || (!me.sessionStatus && !dismissed);

  if (!showForm) {
    if (!me.sessionStatus) return null;
    return (
      <div
        className="font-data mx-auto mb-6 flex w-full max-w-xl items-baseline justify-center gap-2 text-xs"
        style={{ color: "var(--crema-dim)" }}
      >
        <span className="truncate">
          working on: <span style={{ color: "var(--crema)" }}>{me.sessionStatus}</span>
        </span>
        <button
          type="button"
          onClick={() => {
            setDraft(me.sessionStatus);
            setEditing(true);
          }}
          className="cursor-pointer shrink-0 underline underline-offset-2"
        >
          edit
        </button>
      </div>
    );
  }

  const value = draft ?? me.sessionStatus ?? me.lastStatusText ?? "";

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFailed(false);
    try {
      const res = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const d = await res.json();
      setSessionStatus(d.statusText);
      setEditing(false);
      setDraft(null);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const dismiss = () => {
    if (!editing && dismissKey) sessionStorage.setItem(dismissKey, "1");
    setDismissed(true);
    setEditing(false);
    setDraft(null);
    setFailed(false);
  };

  return (
    <div
      className="mx-auto mb-6 w-full max-w-xl rounded-lg border p-4"
      style={{ background: "var(--roast)", borderColor: "var(--fawn-deep)" }}
    >
      <p className="font-display text-lg">What are you working on today?</p>
      <form onSubmit={save} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={200}
          placeholder="e.g. corgi cam firmware"
          autoFocus
          className="font-data min-w-0 flex-1 rounded-md border bg-transparent px-3 py-2 text-sm outline-none"
          style={{ borderColor: "var(--line)", color: "var(--crema)" }}
        />
        <button
          type="submit"
          disabled={saving}
          className="cursor-pointer rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
          style={{ background: "var(--fawn)", color: "var(--espresso)" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="cursor-pointer text-xs underline-offset-2 hover:underline"
          style={{ color: "var(--crema-dim)" }}
        >
          {editing ? "cancel" : "skip"}
        </button>
      </form>
      {failed ? (
        <p className="font-data mt-2 text-xs" style={{ color: "var(--fawn)" }}>
          couldn&apos;t save — try again
        </p>
      ) : null}
    </div>
  );
}
