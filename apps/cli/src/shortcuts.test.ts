import { describe, it, expect } from "vitest";
import { parsePrShortcut } from "./shortcuts.ts";

describe("parsePrShortcut", () => {
  it("returns 'me' for 'pr'", () => {
    expect(parsePrShortcut("pr")).toEqual({ type: "list_pr", target: "me" });
  });

  it("returns 'me' for 'get pr'", () => {
    expect(parsePrShortcut("get pr")).toEqual({ type: "list_pr", target: "me" });
  });

  it("returns 'me' for 'Get PR' (case insensitive)", () => {
    expect(parsePrShortcut("Get PR")).toEqual({ type: "list_pr", target: "me" });
  });

  it("returns 'me' for 'my pr'", () => {
    expect(parsePrShortcut("my pr")).toEqual({ type: "list_pr", target: "me" });
  });

  it("returns author for 'alice pr'", () => {
    expect(parsePrShortcut("alice pr")).toEqual({ type: "list_pr", target: "alice" });
  });

  it("returns author for 'review alice pr'", () => {
    expect(parsePrShortcut("review alice pr")).toEqual({ type: "list_pr", target: "alice" });
  });

  it("returns author for 'alice 的 pr'", () => {
    expect(parsePrShortcut("alice 的 pr")).toEqual({ type: "list_pr", target: "alice" });
  });

  it("returns author for 'review alice 的 PR'", () => {
    expect(parsePrShortcut("review alice 的 PR")).toEqual({ type: "list_pr", target: "alice" });
  });

  it("returns null for unrelated input", () => {
    expect(parsePrShortcut("add dark mode")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parsePrShortcut("")).toBeNull();
  });
});
