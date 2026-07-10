import { describe, it, expect } from "vitest";
import { nextPollDelayMs } from "./poll-schedule";

const NOW = 1_000_000_000_000;
const MIN = 60_000;

describe("nextPollDelayMs", () => {
  it("polls at the floor when budget is unknown or plentiful", () => {
    expect(nextPollDelayMs(15, null, NOW)).toBe(15_000);
    expect(
      nextPollDelayMs(15, { remaining: 4800, resetAtMs: NOW + 30 * MIN }, NOW),
    ).toBe(15_000);
  });

  it("spreads a low budget across the time until reset", () => {
    // 50 points left, 50 minutes to reset -> one poll per minute
    expect(
      nextPollDelayMs(15, { remaining: 50, resetAtMs: NOW + 50 * MIN }, NOW),
    ).toBe(MIN);
  });

  it("waits for the reset when the budget is nearly gone", () => {
    expect(
      nextPollDelayMs(15, { remaining: 3, resetAtMs: NOW + 10 * MIN }, NOW),
    ).toBe(10 * MIN);
  });

  it("never goes below the floor", () => {
    expect(
      nextPollDelayMs(15, { remaining: 99, resetAtMs: NOW + 1000 }, NOW),
    ).toBe(15_000);
  });
});
