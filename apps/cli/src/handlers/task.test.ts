import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Context } from "../types.ts";
import type { IntentTask } from "../llm.ts";

vi.mock("../zellij.ts", () => ({ spawnTab: vi.fn() }));
vi.mock("../git.ts", () => ({ findEnvFiles: vi.fn(() => []), prepareGitBranch: vi.fn() }));
vi.mock("@laoda/capability", () => ({ duplicateFolder: vi.fn(() => "/home/user/cool-oss-1") }));
vi.mock("../logger.ts", () => ({ logAction: vi.fn() }));
vi.mock("../render.ts", () => ({
  renderReuse: vi.fn(),
  renderDuplicating: vi.fn(),
  renderDuplicated: vi.fn(),
  renderPreparingBranch: vi.fn(),
  renderBranchReady: vi.fn(),
  renderTabCreated: vi.fn(),
  renderCancelled: vi.fn(),
  renderInfo: vi.fn(),
  promptQuestion: vi.fn((s: string) => s),
}));
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, existsSync: vi.fn(() => true) };
});
vi.mock("../workspace.ts", () => ({ isGitClean: vi.fn(() => false) }));
vi.mock("../worker.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../worker.ts")>();
  return { ...actual, saveRegistry: vi.fn() };
});

import { spawnTab } from "../zellij.ts";
import { prepareGitBranch } from "../git.ts";
import { duplicateFolder } from "@laoda/capability";
import { saveRegistry } from "../worker.ts";
import { existsSync } from "fs";
import { isGitClean } from "../workspace.ts";
import { handleTask } from "./task.ts";

function makeCtx(workers: Context["registry"]["workers"] = []): Context {
  return {
    cwd: "/home/user/cool-oss",
    userName: "bl",
    project: "cool-oss",
    registry: { project: "cool-oss", workers, updatedAt: 0 },
  };
}

const mockQuestion: any = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(isGitClean).mockReturnValue(false);
});

describe("handleTask", () => {
  const intent: IntentTask = { type: "task", task: "add dark mode", branchName: "add-dark-mode" };

  it("cancels when user says no", async () => {
    mockQuestion.mockResolvedValueOnce("n");
    const ctx = makeCtx();
    const result = await handleTask(ctx, intent, mockQuestion);
    expect(result).toBe(ctx);
    expect(spawnTab).not.toHaveBeenCalled();
  });

  it("creates new worker when none exist", async () => {
    mockQuestion.mockResolvedValueOnce("y");
    const ctx = makeCtx();
    const result = await handleTask(ctx, intent, mockQuestion);

    expect(duplicateFolder).toHaveBeenCalledWith("/home/user/cool-oss", []);
    expect(prepareGitBranch).toHaveBeenCalled();
    expect(spawnTab).toHaveBeenCalledWith("add-dark-mode", "add dark mode", "/home/user/cool-oss-1");
    expect(saveRegistry).toHaveBeenCalled();
    expect(result.registry.workers).toHaveLength(1);
    expect(result.registry.workers[0]).toMatchObject({
      type: "my",
      index: 1,
      status: "busy",
      task: "add dark mode",
    });
  });

  it("reuses idle worker with clean git", async () => {
    mockQuestion.mockResolvedValueOnce("y");
    vi.mocked(isGitClean).mockReturnValue(true);
    const ctx = makeCtx([{ type: "my", index: 1, status: "idle" }]);
    const result = await handleTask(ctx, intent, mockQuestion);

    expect(duplicateFolder).not.toHaveBeenCalled();
    expect(prepareGitBranch).toHaveBeenCalled();
    expect(spawnTab).toHaveBeenCalled();
    expect(result.registry.workers[0]).toMatchObject({
      type: "my",
      index: 1,
      status: "busy",
      task: "add dark mode",
      branch: "bl/add-dark-mode",
    });
  });

  it("creates new worker when existing is busy and dirty", async () => {
    mockQuestion.mockResolvedValueOnce("y");
    vi.mocked(isGitClean).mockReturnValue(false);
    const ctx = makeCtx([{ type: "my", index: 1, status: "busy", task: "other", branch: "bl/other" }]);
    const result = await handleTask(ctx, intent, mockQuestion);

    expect(duplicateFolder).toHaveBeenCalled();
    expect(result.registry.workers).toHaveLength(2);
    expect(result.registry.workers[1]).toMatchObject({ type: "my", index: 2, status: "busy" });
  });

  it("returns new context immutably", async () => {
    mockQuestion.mockResolvedValueOnce("y");
    const ctx = makeCtx();
    const result = await handleTask(ctx, intent, mockQuestion);
    expect(result).not.toBe(ctx);
    expect(result.registry).not.toBe(ctx.registry);
    expect(ctx.registry.workers).toHaveLength(0);
  });
});
