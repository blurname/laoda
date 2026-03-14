import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Context } from "../types.ts";
import type { IntentReview } from "../llm.ts";

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, existsSync: vi.fn(() => false) };
});
vi.mock("@laoda/capability", () => ({ copyFolder: vi.fn() }));
vi.mock("../zellij.ts", () => ({ spawnTab: vi.fn() }));
vi.mock("../git.ts", () => ({ findEnvFiles: vi.fn(() => []), prepareGitBranch: vi.fn() }));
vi.mock("../render.ts", () => ({
  renderDuplicating: vi.fn(),
  renderDuplicated: vi.fn(),
  renderPreparingBranch: vi.fn(),
  renderBranchReady: vi.fn(),
  renderTabCreated: vi.fn(),
  renderCancelled: vi.fn(),
  renderInfo: vi.fn(),
  renderSuccess: vi.fn(),
  promptQuestion: vi.fn((s: string) => s),
}));
vi.mock("../worker.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../worker.ts")>();
  return { ...actual, saveRegistry: vi.fn() };
});

import { existsSync } from "fs";
import { copyFolder } from "@laoda/capability";
import { spawnTab } from "../zellij.ts";
import { saveRegistry } from "../worker.ts";
import { handleReview } from "./review.ts";

function makeCtx(workers: Context["registry"]["workers"] = []): Context {
  return {
    cwd: "/home/user/voyager",
    userName: "bl",
    project: "voyager",
    registry: { project: "voyager", workers, updatedAt: 0 },
    agent: "claude",
    logAction: vi.fn(),
  };
}

const mockQuestion: any = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(existsSync).mockReturnValue(false);
});

describe("handleReview", () => {
  const intent: IntentReview = {
    type: "review",
    workerName: "zar",
    workerRole: "designer",
    task: "review code",
    branchName: "review-zar-code",
  };

  it("cancels when user says no", async () => {
    mockQuestion.mockResolvedValueOnce("n");
    const ctx = makeCtx();
    const result = await handleReview(ctx, intent, mockQuestion);
    expect(result).toBe(ctx);
    expect(spawnTab).not.toHaveBeenCalled();
  });

  it("registers unregistered worker + duplicates folder + spawns tab", async () => {
    mockQuestion.mockResolvedValueOnce("y");
    const ctx = makeCtx();
    const result = await handleReview(ctx, intent, mockQuestion);

    // Worker registered
    expect(saveRegistry).toHaveBeenCalled();
    expect(result.registry.workers).toHaveLength(1);
    expect(result.registry.workers[0]).toMatchObject({
      type: "other",
      name: "zar",
      userType: "designer",
    });

    // Folder duplicated
    expect(copyFolder).toHaveBeenCalledWith(
      "/home/user/voyager",
      expect.stringContaining("voyager-zar"),
      [],
    );

    // Tab spawned with empty prompt
    expect(spawnTab).toHaveBeenCalledWith(
      "review-zar",
      "",
      expect.stringContaining("voyager-zar"),
      "claude",
    );
  });

  it("skips registration when worker already registered", async () => {
    mockQuestion.mockResolvedValueOnce("y");
    const ctx = makeCtx([{ type: "other", name: "zar", userType: "designer" }]);
    const result = await handleReview(ctx, intent, mockQuestion);

    // Registry unchanged (no new worker added)
    expect(result.registry.workers).toHaveLength(1);
    expect(spawnTab).toHaveBeenCalled();
  });

  it("skips duplication when folder exists", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    mockQuestion.mockResolvedValueOnce("y");
    const ctx = makeCtx([{ type: "other", name: "zar", userType: "designer" }]);
    await handleReview(ctx, intent, mockQuestion);

    expect(copyFolder).not.toHaveBeenCalled();
    expect(spawnTab).toHaveBeenCalled();
  });

  it("defaults workerRole to designer when not provided", async () => {
    mockQuestion.mockResolvedValueOnce("y");
    const intentNoRole = { ...intent, workerRole: undefined as any };
    const ctx = makeCtx();
    const result = await handleReview(ctx, intentNoRole, mockQuestion);

    expect(result.registry.workers[0]).toMatchObject({
      type: "other",
      name: "zar",
      userType: "designer",
    });
  });

  it("returns new context immutably", async () => {
    mockQuestion.mockResolvedValueOnce("y");
    const ctx = makeCtx();
    const result = await handleReview(ctx, intent, mockQuestion);
    expect(result).not.toBe(ctx);
    expect(ctx.registry.workers).toHaveLength(0);
  });
});
