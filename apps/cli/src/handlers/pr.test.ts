import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Context } from "../types.ts";
import type { PrInfo } from "../infra/github.ts";

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => "{}"),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});
vi.mock("@laoda/capability", () => ({
  copyFolder: vi.fn(),
  duplicateFolder: vi.fn(() => "/home/user/voyager-1"),
}));
vi.mock("../infra/zellij.ts", () => ({ spawnTab: vi.fn() }));
vi.mock("../infra/git.ts", () => ({ findEnvFiles: vi.fn(() => []), prepareGitBranch: vi.fn() }));
vi.mock("../infra/workspace.ts", () => ({ isGitClean: vi.fn(() => false) }));
vi.mock("../render.ts", () => ({
  renderReuse: vi.fn(),
  renderDuplicating: vi.fn(),
  renderDuplicated: vi.fn(),
  renderPreparingBranch: vi.fn(),
  renderBranchReady: vi.fn(),
  renderTabCreated: vi.fn(),
  renderCancelled: vi.fn(),
  renderInfo: vi.fn(),
  renderSuccess: vi.fn(),
  renderFetching: vi.fn(),
  promptQuestion: vi.fn((s: string) => s),
}));
vi.mock("../infra/worker.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../infra/worker.ts")>();
  return { ...actual, saveRegistry: vi.fn() };
});

import { writeFileSync } from "fs";
import { spawnTab } from "../infra/zellij.ts";
import { handlePr } from "./pr.ts";

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

const pr: PrInfo = {
  number: 1416,
  title: "feat: UI style updates",
  branch: "ws/homepage-animation",
  author: "wanshanX",
  url: "https://github.com/org/repo/pull/1416",
};

const mockQuestion: any = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handlePr", () => {
  it("cancels when user picks 3", async () => {
    mockQuestion.mockResolvedValueOnce("3");
    const ctx = makeCtx();
    const result = await handlePr(ctx, pr, mockQuestion);
    expect(result).toBe(ctx);
    expect(spawnTab).not.toHaveBeenCalled();
  });

  it("defaults to OtherWork for unknown author, pick 1 → review flow", async () => {
    // pick 1 = default = other work (since author != userName)
    // then confirm execute
    mockQuestion
      .mockResolvedValueOnce("1") // pick: other work (default)
      .mockResolvedValueOnce("y"); // execute
    const ctx = makeCtx();
    const result = await handlePr(ctx, pr, mockQuestion);

    // Should have registered wanshanX as worker
    expect(result.registry.workers).toHaveLength(1);
    expect(result.registry.workers[0]).toMatchObject({
      type: "other",
      name: "wanshanX",
    });
  });

  it("defaults to MyWork when author matches userName", async () => {
    const myPr: PrInfo = { ...pr, author: "bl" };
    // pick 1 = default = my work (since author == userName)
    // then confirm execute
    mockQuestion
      .mockResolvedValueOnce("1") // pick: my work (default)
      .mockResolvedValueOnce("y"); // execute
    const ctx = makeCtx();
    const result = await handlePr(ctx, myPr, mockQuestion);

    // Should create a MyWorker, not OtherWorker
    expect(result.registry.workers).toHaveLength(1);
    expect(result.registry.workers[0]).toMatchObject({
      type: "my",
      index: 1,
      status: "busy",
    });
  });

  it("override: pick 2 on other-default → becomes MyWork + saves author", async () => {
    mockQuestion
      .mockResolvedValueOnce("2") // override to my work
      .mockResolvedValueOnce("y"); // execute
    const ctx = makeCtx();
    const result = await handlePr(ctx, pr, mockQuestion);

    // Saved author preference
    expect(writeFileSync).toHaveBeenCalled();

    // Created MyWorker
    expect(result.registry.workers).toHaveLength(1);
    expect(result.registry.workers[0]).toMatchObject({ type: "my" });
  });

  it("override: pick 2 on my-default → asks for role + becomes OtherWork", async () => {
    const myPr: PrInfo = { ...pr, author: "bl" };
    mockQuestion
      .mockResolvedValueOnce("2") // override to other work
      .mockResolvedValueOnce("2") // role: product
      .mockResolvedValueOnce("y"); // execute
    const ctx = makeCtx();
    const result = await handlePr(ctx, myPr, mockQuestion);

    // Saved author preference
    expect(writeFileSync).toHaveBeenCalled();

    // Created OtherWorker
    expect(result.registry.workers).toHaveLength(1);
    expect(result.registry.workers[0]).toMatchObject({
      type: "other",
      name: "bl",
      userType: "product",
    });
  });

  it("empty input defaults to pick 1", async () => {
    mockQuestion
      .mockResolvedValueOnce("") // empty → default pick 1
      .mockResolvedValueOnce("y"); // execute
    const ctx = makeCtx();
    const result = await handlePr(ctx, pr, mockQuestion);

    // Default for unknown author is "other"
    expect(result.registry.workers[0]).toMatchObject({
      type: "other",
      name: "wanshanX",
    });
  });
});
