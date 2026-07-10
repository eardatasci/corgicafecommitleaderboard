"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export interface AllTimeEntry {
  username: string;
  avatarUrl: string;
  totalCommits: number;
}

export interface HereNowEntry {
  username: string;
  avatarUrl: string;
  sessionCommits: number;
  since: string;
  statusText: string | null;
}

export interface Board {
  allTime: AllTimeEntry[];
  hereNow: HereNowEntry[];
}

export interface Me {
  username: string;
  avatarUrl: string;
  totalCommits: number;
  present: boolean;
  sessionCommits: number;
  sessionStatus: string | null;
  sessionSince: string | null;
  lastStatusText: string | null;
}

interface CafeData {
  board: Board | null;
  me: Me | null;
  loaded: boolean;
  setSessionStatus: (statusText: string | null) => void;
}

const LEADERBOARD_POLL_MS = 20_000;
const HEARTBEAT_MS = 45_000;

const CafeDataContext = createContext<CafeData | null>(null);

export function useCafeData(): CafeData {
  const data = useContext(CafeDataContext);
  if (!data) {
    throw new Error("useCafeData must be used inside CafeDataProvider");
  }
  return data;
}

export function CafeDataProvider({ children }: { children: React.ReactNode }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Leaderboard poll
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/leaderboard");
        if (res.ok) setBoard(await res.json());
      } catch {
        /* transient network error — next poll retries */
      }
    };
    load();
    const id = setInterval(load, LEADERBOARD_POLL_MS);
    return () => clearInterval(id);
  }, []);

  // Who am I
  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setMe(d.user))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Heartbeat while logged in
  const loggedIn = Boolean(me);
  useEffect(() => {
    if (!loggedIn) return;
    const beat = async () => {
      try {
        const res = await fetch("/api/heartbeat", { method: "POST" });
        if (!res.ok) return;
        const d = await res.json();
        setMe((m) =>
          m
            ? {
                ...m,
                present: d.present,
                sessionCommits: d.sessionCommits,
                sessionStatus: d.sessionStatus,
                sessionSince: d.sessionSince,
              }
            : m,
        );
      } catch {
        /* transient network error — next beat retries */
      }
    };
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loggedIn]);

  const setSessionStatus = useCallback((statusText: string | null) => {
    setMe((m) =>
      m
        ? {
            ...m,
            sessionStatus: statusText,
            lastStatusText: statusText ?? m.lastStatusText,
          }
        : m,
    );
  }, []);

  return (
    <CafeDataContext.Provider value={{ board, me, loaded, setSessionStatus }}>
      {children}
    </CafeDataContext.Provider>
  );
}
