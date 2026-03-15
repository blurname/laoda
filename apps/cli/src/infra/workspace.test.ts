import { describe, it, expect } from "vitest";
import { getProjectName } from "./workspace.ts";

describe("getProjectName", () => {
  it("returns name as-is when no numeric suffix", () => {
    expect(getProjectName("/home/user/my-app")).toBe("my-app");
  });

  it("strips numeric suffix", () => {
    expect(getProjectName("/home/user/my-app-3")).toBe("my-app");
  });

  it("strips large numeric suffix", () => {
    expect(getProjectName("/home/user/my-app-123")).toBe("my-app");
  });

  it("does not strip non-numeric suffix", () => {
    expect(getProjectName("/home/user/my-app-name")).toBe("my-app-name");
  });

  it("handles single-word names", () => {
    expect(getProjectName("/home/user/project")).toBe("project");
  });

  it("handles single-word name with numeric suffix", () => {
    expect(getProjectName("/home/user/project-2")).toBe("project");
  });

  it("handles nested paths", () => {
    expect(getProjectName("/a/b/c/d/my-project-5")).toBe("my-project");
  });
});
