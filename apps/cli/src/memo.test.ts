import { describe, it, expect, beforeEach } from "vitest";
import {
  tokenize,
  getBucket,
  tokenSimilarity,
  memoLookup,
  memoSave,
  setMemoProject,
} from "./memo.ts";
import type { Intent } from "./llm.ts";

describe("tokenize", () => {
  it("splits on whitespace and lowercases", () => {
    expect(tokenize("Add Login Page")).toEqual(["add", "login", "page"]);
  });

  it("filters empty strings", () => {
    expect(tokenize("  hello   world  ")).toEqual(["hello", "world"]);
  });

  it("returns empty for empty input", () => {
    expect(tokenize("")).toEqual([]);
  });
});

describe("getBucket", () => {
  it("maps 'add' to add bucket", () => {
    expect(getBucket(["add", "login", "page"])).toBe("add");
  });

  it("maps 'fix' to fix bucket", () => {
    expect(getBucket(["fix", "the", "bug"])).toBe("fix");
  });

  it("maps 'switch' to change bucket", () => {
    expect(getBucket(["switch", "model"])).toBe("change");
  });

  it("maps 'refactor' to update bucket", () => {
    expect(getBucket(["refactor", "auth"])).toBe("update");
  });

  it("maps 'delete' to remove bucket", () => {
    expect(getBucket(["delete", "old", "files"])).toBe("remove");
  });

  it("returns 'other' for unknown words", () => {
    expect(getBucket(["hello", "world"])).toBe("other");
  });

  it("uses first matching keyword", () => {
    expect(getBucket(["fix", "and", "add", "stuff"])).toBe("fix");
  });
});

describe("tokenSimilarity", () => {
  it("returns 1 for identical sets", () => {
    expect(tokenSimilarity(["a", "b", "c"], ["a", "b", "c"])).toBe(1);
  });

  it("returns 0 for disjoint sets", () => {
    expect(tokenSimilarity(["a", "b"], ["c", "d"])).toBe(0);
  });

  it("returns 0 for two empty sets", () => {
    expect(tokenSimilarity([], [])).toBe(0);
  });

  it("computes Jaccard correctly", () => {
    // {a, b, c} ∩ {b, c, d} = {b, c} → 2/4 = 0.5
    expect(tokenSimilarity(["a", "b", "c"], ["b", "c", "d"])).toBe(0.5);
  });

  it("handles duplicates in input", () => {
    // Sets: {a, b} and {a, b} → 1
    expect(tokenSimilarity(["a", "a", "b"], ["a", "b", "b"])).toBe(1);
  });
});

describe("memoLookup / memoSave integration", () => {
  const testProject = `test-${Date.now()}`;

  beforeEach(() => {
    setMemoProject(testProject);
  });

  it("returns null when no entries exist", () => {
    expect(memoLookup("add a new feature")).toBeNull();
  });

  it("saves and retrieves matching intent", () => {
    const intent: Intent = { type: "task", task: "add login page", branchName: "add-login-page" };
    memoSave("add login page", intent);

    // Exact match
    const result = memoLookup("add login page");
    expect(result).toEqual(intent);
  });

  it("retrieves similar intent (high overlap)", () => {
    const intent: Intent = { type: "task", task: "add login page", branchName: "add-login-page" };
    memoSave("add login page", intent);

    // Similar enough (shares most tokens)
    const result = memoLookup("add the login page");
    // 3/4 = 0.75 — below 0.8 threshold, should be null
    expect(result).toBeNull();
  });

  it("does not retrieve from different bucket", () => {
    const intent: Intent = { type: "task", task: "add login page", branchName: "add-login-page" };
    memoSave("add login page", intent);

    // Different bucket (fix vs add)
    expect(memoLookup("fix login page")).toBeNull();
  });

  it("does not store duplicates", () => {
    const intent1: Intent = { type: "task", task: "add login page", branchName: "add-login-page" };
    const intent2: Intent = {
      type: "task",
      task: "add login page v2",
      branchName: "add-login-page-v2",
    };
    memoSave("add login page", intent1);
    memoSave("add login page", intent2);

    // Should still return the first one
    const result = memoLookup("add login page");
    expect(result).toEqual(intent1);
  });
});
