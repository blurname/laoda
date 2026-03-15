import { describe, it, expect } from "vitest";
import { parsePrUrl } from "./github.ts";

describe("parsePrUrl", () => {
  it("parses a standard PR URL", () => {
    const result = parsePrUrl("https://github.com/org/repo/pull/123");
    expect(result).toEqual({ owner: "org", repo: "repo", number: 123 });
  });

  it("parses PR URL with trailing path", () => {
    const result = parsePrUrl("https://github.com/org/repo/pull/456/files");
    expect(result).toEqual({ owner: "org", repo: "repo", number: 456 });
  });

  it("parses PR URL embedded in text", () => {
    const result = parsePrUrl("review https://github.com/org/repo/pull/789 please");
    expect(result).toEqual({ owner: "org", repo: "repo", number: 789 });
  });

  it("parses http (non-https) URL", () => {
    const result = parsePrUrl("http://github.com/org/repo/pull/42");
    expect(result).toEqual({ owner: "org", repo: "repo", number: 42 });
  });

  it("parses URL with hyphenated org and repo", () => {
    const result = parsePrUrl("https://github.com/my-org/cool-repo/pull/1");
    expect(result).toEqual({ owner: "my-org", repo: "cool-repo", number: 1 });
  });

  it("returns null for non-PR URL", () => {
    expect(parsePrUrl("https://github.com/org/repo")).toBeNull();
  });

  it("returns null for non-GitHub URL", () => {
    expect(parsePrUrl("https://gitlab.com/org/repo/pull/1")).toBeNull();
  });

  it("returns null for random text", () => {
    expect(parsePrUrl("fix the login bug")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parsePrUrl("")).toBeNull();
  });
});
