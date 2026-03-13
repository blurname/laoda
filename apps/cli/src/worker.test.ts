import { describe, it, expect } from "vitest";
import {
  workerFolderName,
  classifyFolderSuffix,
  findUnregistered,
  findOtherWorker,
  findNextMyWorkerIndex,
  getOtherWorkerNames,
} from "./worker.ts";
import type { WorkerRegistry, OtherWorker } from "./types.ts";

describe("workerFolderName", () => {
  it("names MyWorker with numeric suffix", () => {
    expect(workerFolderName("luv-sic", { type: "my", index: 1, status: "idle" })).toBe("luv-sic-1");
  });

  it("names OtherWorker with name suffix", () => {
    expect(workerFolderName("luv-sic", { type: "other", name: "zar", userType: "designer" })).toBe(
      "luv-sic-zar",
    );
  });
});

describe("classifyFolderSuffix", () => {
  it("classifies numeric suffix", () => {
    expect(classifyFolderSuffix("luv-sic", "luv-sic-3")).toEqual({ type: "numeric", index: 3 });
  });

  it("classifies named suffix", () => {
    expect(classifyFolderSuffix("luv-sic", "luv-sic-zar")).toEqual({ type: "named", name: "zar" });
  });

  it("returns null for non-matching prefix", () => {
    expect(classifyFolderSuffix("luv-sic", "other-project-1")).toBeNull();
  });

  it("returns null for invalid suffix", () => {
    expect(classifyFolderSuffix("luv-sic", "luv-sic-")).toBeNull();
  });

  it("returns null for uppercase suffix", () => {
    expect(classifyFolderSuffix("luv-sic", "luv-sic-Zar")).toBeNull();
  });
});

describe("findUnregistered", () => {
  const base: WorkerRegistry = {
    project: "luv-sic",
    workers: [
      { type: "my", index: 1, status: "idle" },
      { type: "other", name: "zar", userType: "designer" },
    ],
    updatedAt: 0,
  };

  it("returns empty when all folders are registered", () => {
    expect(findUnregistered(base, ["luv-sic-1", "luv-sic-zar"])).toEqual([]);
  });

  it("finds unregistered numeric folder", () => {
    expect(findUnregistered(base, ["luv-sic-1", "luv-sic-2", "luv-sic-zar"])).toEqual(["2"]);
  });

  it("finds unregistered named folder", () => {
    expect(findUnregistered(base, ["luv-sic-1", "luv-sic-zar", "luv-sic-cws"])).toEqual(["cws"]);
  });
});

describe("findOtherWorker", () => {
  const registry: WorkerRegistry = {
    project: "luv-sic",
    workers: [
      { type: "my", index: 1, status: "idle" },
      { type: "other", name: "zar", userType: "designer" },
      { type: "other", name: "cws", userType: "product" },
    ],
    updatedAt: 0,
  };

  it("finds by name", () => {
    const result = findOtherWorker(registry, "zar") as OtherWorker;
    expect(result).not.toBeNull();
    expect(result.name).toBe("zar");
    expect(result.userType).toBe("designer");
  });

  it("returns null for unknown name", () => {
    expect(findOtherWorker(registry, "unknown")).toBeNull();
  });

  it("does not match MyWorker", () => {
    expect(findOtherWorker(registry, "1")).toBeNull();
  });
});

describe("findNextMyWorkerIndex", () => {
  it("returns 1 for empty registry", () => {
    expect(findNextMyWorkerIndex({ project: "p", workers: [], updatedAt: 0 })).toBe(1);
  });

  it("returns next after highest index", () => {
    expect(
      findNextMyWorkerIndex({
        project: "p",
        workers: [
          { type: "my", index: 1, status: "idle" },
          { type: "my", index: 3, status: "idle" },
        ],
        updatedAt: 0,
      }),
    ).toBe(4);
  });

  it("ignores OtherWorkers", () => {
    expect(
      findNextMyWorkerIndex({
        project: "p",
        workers: [{ type: "other", name: "zar", userType: "designer" }],
        updatedAt: 0,
      }),
    ).toBe(1);
  });
});

describe("getOtherWorkerNames", () => {
  it("returns only OtherWorker names", () => {
    const registry: WorkerRegistry = {
      project: "p",
      workers: [
        { type: "my", index: 1, status: "idle" },
        { type: "other", name: "zar", userType: "designer" },
        { type: "my", index: 2, status: "idle" },
        { type: "other", name: "cws", userType: "product" },
      ],
      updatedAt: 0,
    };
    expect(getOtherWorkerNames(registry)).toEqual(["zar", "cws"]);
  });

  it("returns empty for no OtherWorkers", () => {
    const registry: WorkerRegistry = {
      project: "p",
      workers: [{ type: "my", index: 1, status: "idle" }],
      updatedAt: 0,
    };
    expect(getOtherWorkerNames(registry)).toEqual([]);
  });
});
