import { describe, it, expect } from "vitest";
import { sanitizeBranchName } from "./llm.ts";

describe("sanitizeBranchName", () => {
  it("lowercases and converts spaces to hyphens", () => {
    expect(sanitizeBranchName("Add Login Page")).toBe("add-login-page");
  });

  it("removes special characters", () => {
    expect(sanitizeBranchName("fix: bug #123")).toBe("fix-bug-123");
  });

  it("collapses multiple hyphens", () => {
    expect(sanitizeBranchName("a---b---c")).toBe("a-b-c");
  });

  it("trims leading and trailing hyphens", () => {
    expect(sanitizeBranchName("--hello--")).toBe("hello");
  });

  it("truncates to 50 chars", () => {
    const long = "a".repeat(60);
    expect(sanitizeBranchName(long).length).toBe(50);
  });

  it("handles empty string", () => {
    expect(sanitizeBranchName("")).toBe("");
  });

  it("handles unicode characters", () => {
    expect(sanitizeBranchName("添加登录页面")).toBe("");
  });

  it("preserves numbers", () => {
    expect(sanitizeBranchName("v2-release-3")).toBe("v2-release-3");
  });

  it("handles mixed case with symbols", () => {
    expect(sanitizeBranchName("Fix_Bug (urgent!)")).toBe("fix-bug-urgent");
  });
});
