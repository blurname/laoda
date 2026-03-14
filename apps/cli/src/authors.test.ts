import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { existsSync, readFileSync } from "fs";
import { loadAuthors, getAuthorWorkType, getAuthorRole } from "./authors.ts";

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

beforeEach(() => {
  mockExistsSync.mockReturnValue(false);
  mockReadFileSync.mockReturnValue("{}");
});

describe("loadAuthors", () => {
  it("returns empty object when file does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    expect(loadAuthors()).toEqual({});
  });

  it("returns parsed authors when file exists", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ alice: { workType: "other", workerRole: "designer" } }),
    );
    expect(loadAuthors()).toEqual({ alice: { workType: "other", workerRole: "designer" } });
  });

  it("returns empty object on invalid JSON", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("not json");
    expect(loadAuthors()).toEqual({});
  });
});

describe("getAuthorWorkType", () => {
  it("returns 'my' when author matches userName", () => {
    expect(getAuthorWorkType("bl", "bl")).toBe("my");
  });

  it("returns 'other' when author does not match userName", () => {
    expect(getAuthorWorkType("alice", "bl")).toBe("other");
  });

  it("returns stored workType when author is in file", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ alice: { workType: "my" } }));
    expect(getAuthorWorkType("alice", "bl")).toBe("my");
  });

  it("stored workType overrides userName match", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ bl: { workType: "other", workerRole: "product" } }),
    );
    expect(getAuthorWorkType("bl", "bl")).toBe("other");
  });
});

describe("getAuthorRole", () => {
  it("defaults to designer when author not in file", () => {
    expect(getAuthorRole("unknown")).toBe("designer");
  });

  it("defaults to designer when author has no workerRole", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ alice: { workType: "other" } }));
    expect(getAuthorRole("alice")).toBe("designer");
  });

  it("returns stored workerRole", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ alice: { workType: "other", workerRole: "product" } }),
    );
    expect(getAuthorRole("alice")).toBe("product");
  });
});
