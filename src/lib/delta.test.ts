import { describe, it, expect } from "vitest";
import { sessionCommits } from "./delta";

describe("sessionCommits", () => {
  it("is the counter delta", () => {
    expect(sessionCommits(100, 107)).toBe(7);
  });

  it("clamps to zero when the counter decreases (force-push, deletes)", () => {
    expect(sessionCommits(100, 95)).toBe(0);
  });

  it("is zero for no change", () => {
    expect(sessionCommits(100, 100)).toBe(0);
  });
});
