"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCafeData, type Me } from "./cafe-data";

export function Navbar() {
  const { me, loaded } = useCafeData();
  const pathname = usePathname();

  return (
    <nav className="border-b" style={{ borderColor: "var(--line)" }}>
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 sm:px-8">
        <Link href="/" className="font-display text-lg font-medium">
          Corgi Cafe
        </Link>

        <div className="font-data flex items-center gap-5 text-xs tracking-[0.15em] uppercase">
          <NavLink href="/" label="Cafe" active={pathname === "/"} />
          <NavLink
            href="/all-time"
            label="All-time"
            active={pathname === "/all-time"}
          />
        </div>

        <div className="ml-auto flex items-center gap-3">
          {me ? (
            <>
              <PresenceChip me={me} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={me.avatarUrl}
                alt={me.username}
                className="h-8 w-8 rounded-full border"
                style={{ borderColor: "var(--line)" }}
              />
              <form action="/auth/logout" method="post">
                <button
                  type="submit"
                  className="cursor-pointer text-xs underline-offset-2 hover:underline"
                  style={{ color: "var(--crema-dim)" }}
                >
                  Sign out
                </button>
              </form>
            </>
          ) : loaded ? (
            <a
              href="/auth/github"
              className="rounded-md px-3 py-1.5 text-xs font-medium transition-transform hover:-translate-y-0.5"
              style={{ background: "var(--fawn)", color: "var(--espresso)" }}
            >
              Sign in with GitHub
            </a>
          ) : null}
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={active ? "underline underline-offset-8" : "hover:underline underline-offset-8"}
      style={{ color: active ? "var(--fawn)" : "var(--crema-dim)" }}
    >
      {label}
    </Link>
  );
}

function PresenceChip({ me }: { me: Me }) {
  if (me.present) {
    return (
      <span
        className="font-data hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs sm:flex"
        style={{ borderColor: "var(--matcha)", color: "var(--matcha)" }}
      >
        <span className="pulse-dot" />
        checked in · +{me.sessionCommits} this visit
      </span>
    );
  }
  return (
    <span
      className="font-data hidden rounded-full border px-3 py-1.5 text-xs sm:block"
      style={{ borderColor: "var(--line)", color: "var(--crema-dim)" }}
    >
      not at the cafe
    </span>
  );
}
