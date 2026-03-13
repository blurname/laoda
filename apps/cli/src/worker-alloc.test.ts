import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WorkerRegistry, MyWorker } from "./types.ts";

// Mock dependencies before importing worker.ts
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, existsSync: vi.fn(() => true) };
});

vi.mock("./workspace.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./workspace.ts")>();
  return { ...actual, isGitClean: vi.fn(() => false) };
});

import { existsSync } from "fs";
import { isGitClean } from "./workspace.ts";
import { allocateMyWorker, markWorkerBusy } from "./worker.ts";

const mockExistsSync = vi.mocked(existsSync);
const mockIsGitClean = vi.mocked(isGitClean);

function makeRegistry(workers: WorkerRegistry["workers"] = []): WorkerRegistry {
  return { project: "cool-oss", workers, updatedAt: 0 };
}

beforeEach(() => {
  mockExistsSync.mockReturnValue(true);
  mockIsGitClean.mockReturnValue(false);
});

describe("allocateMyWorker - multi-PR simulation", () => {
  it("Task A: no workers → create index 1", () => {
    const registry = makeRegistry();
    const result = allocateMyWorker("/home/user/cool-oss", registry);

    expect(result).toEqual({ action: "create", index: 1 });
  });

  it("Task B: worker-1 busy + git dirty → create index 2", () => {
    const w1: MyWorker = {
      type: "my",
      index: 1,
      status: "busy",
      task: "add dark mode",
      branch: "bl/add-dark-mode",
    };
    const registry = makeRegistry([w1]);

    // worker-1 is busy and git is dirty (claude still working)
    mockIsGitClean.mockReturnValue(false);

    const result = allocateMyWorker("/home/user/cool-oss", registry);
    expect(result).toEqual({ action: "create", index: 2 });
  });

  it("Task C: worker-1 busy + git clean → reuse worker-1 (task done)", () => {
    const w1: MyWorker = {
      type: "my",
      index: 1,
      status: "busy",
      task: "add dark mode",
      branch: "bl/add-dark-mode",
    };
    const w2: MyWorker = {
      type: "my",
      index: 2,
      status: "busy",
      task: "fix pagination",
      branch: "bl/fix-pagination",
    };
    const registry = makeRegistry([w1, w2]);

    // worker-1 git clean (claude finished), worker-2 still dirty
    mockIsGitClean.mockImplementation((dir: string) => dir.endsWith("cool-oss-1"));

    const result = allocateMyWorker("/home/user/cool-oss", registry);
    expect(result).toEqual({
      action: "reuse",
      worker: expect.objectContaining({ index: 1, status: "idle" }),
      path: expect.stringContaining("cool-oss-1"),
    });
  });

  it("idle worker with clean git → reuse without physical scan of busy workers", () => {
    const w1: MyWorker = { type: "my", index: 1, status: "idle" };
    const w2: MyWorker = {
      type: "my",
      index: 2,
      status: "busy",
      task: "some task",
      branch: "bl/some",
    };
    const registry = makeRegistry([w1, w2]);

    // w1 is idle and git clean
    mockIsGitClean.mockImplementation((dir: string) => dir.endsWith("cool-oss-1"));

    const result = allocateMyWorker("/home/user/cool-oss", registry);
    expect(result).toEqual({
      action: "reuse",
      worker: expect.objectContaining({ index: 1 }),
      path: expect.stringContaining("cool-oss-1"),
    });
  });

  it("idle worker but folder missing → skip to create", () => {
    const w1: MyWorker = { type: "my", index: 1, status: "idle" };
    const registry = makeRegistry([w1]);

    mockExistsSync.mockReturnValue(false);

    const result = allocateMyWorker("/home/user/cool-oss", registry);
    expect(result).toEqual({ action: "create", index: 2 });
  });

  it("idle worker but git dirty → skip to create", () => {
    const w1: MyWorker = { type: "my", index: 1, status: "idle" };
    const registry = makeRegistry([w1]);

    mockIsGitClean.mockReturnValue(false);

    const result = allocateMyWorker("/home/user/cool-oss", registry);
    expect(result).toEqual({ action: "create", index: 2 });
  });

  it("full flow: 3 tasks sequentially, worker-1 finishes mid-way", () => {
    const registry = makeRegistry();

    // --- Task A: "add dark mode" ---
    const r1 = allocateMyWorker("/home/user/cool-oss", registry);
    expect(r1).toEqual({ action: "create", index: 1 });
    const w1: MyWorker = { type: "my", index: 1, status: "idle" };
    registry.workers.push(w1);
    markWorkerBusy(w1, "add dark mode", "bl/add-dark-mode");
    expect(w1.status).toBe("busy");

    // --- Task B: "fix pagination" (worker-1 still busy) ---
    mockIsGitClean.mockReturnValue(false);
    const r2 = allocateMyWorker("/home/user/cool-oss", registry);
    expect(r2).toEqual({ action: "create", index: 2 });
    const w2: MyWorker = { type: "my", index: 2, status: "idle" };
    registry.workers.push(w2);
    markWorkerBusy(w2, "fix pagination", "bl/fix-pagination");

    // --- Task C: "add search" (worker-1 done, worker-2 still busy) ---
    mockIsGitClean.mockImplementation((dir: string) => dir.endsWith("cool-oss-1"));
    const r3 = allocateMyWorker("/home/user/cool-oss", registry);
    expect(r3.action).toBe("reuse");
    if (r3.action === "reuse") {
      expect(r3.worker.index).toBe(1);
      expect(r3.worker.status).toBe("idle");
      expect(r3.path).toContain("cool-oss-1");
    }

    // After reuse, mark busy again
    markWorkerBusy(w1, "add search", "bl/add-search");
    expect(w1.status).toBe("busy");
    expect(w1.task).toBe("add search");

    // --- Verify final state ---
    expect(registry.workers).toHaveLength(2);
    expect(w1.status).toBe("busy");
    expect(w2.status).toBe("busy");
  });
});
