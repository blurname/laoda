import { describe, it, expect, vi } from "vitest";
import { flow, guard, asCapability } from "./engine.ts";
import type { Capability, CapIn, CapOut } from "./engine.ts";
import type { Context } from "../types.ts";

function makeCtx(): Context {
  return {
    cwd: "/test",
    userName: "bl",
    project: "test",
    registry: { project: "test", workers: [], updatedAt: 0 },
    agent: "claude",
    logAction: vi.fn(),
  };
}

const noAsk = vi.fn();

// ─── Test capabilities ───

const double: Capability<{ n: number }, { doubled: number }> = {
  name: "double",
  run: async (ctx, { n }) => ({ ctx, value: { doubled: n * 2 } }),
};

const addOne: Capability<{ doubled: number }, { plusOne: number }> = {
  name: "addOne",
  run: async (ctx, { doubled }) => ({ ctx, value: { plusOne: doubled + 1 } }),
};

const greet: Capability<{ name: string }, { greeting: string }> = {
  name: "greet",
  run: async (ctx, { name }) => ({ ctx, value: { greeting: `hi ${name}` } }),
};

const failIfNeg: Capability<{ n: number }, { positive: boolean }> = {
  name: "failIfNeg",
  run: async (ctx, { n }) => {
    if (n < 0) return { ctx, value: { positive: false }, abort: true };
    return { ctx, value: { positive: true } };
  },
};

const updateCtx: Capability<{ newUser: string }, Record<string, never>> = {
  name: "updateCtx",
  run: async (ctx, { newUser }) => ({
    ctx: { ...ctx, userName: newUser },
    value: {} as Record<string, never>,
  }),
};

const boom: Capability<Record<string, never>, Record<string, never>> = {
  name: "boom",
  run: async () => {
    throw new Error("kaboom");
  },
};

function tracked(name: string, log: string[]): Capability<Record<string, never>, { tag: string }> {
  return {
    name,
    run: async (ctx) => ({
      ctx,
      value: { tag: name },
      cleanup: () => {
        log.push(name);
      },
    }),
  };
}

describe("FlowBuilder", () => {
  it("pipes a single capability", async () => {
    const f = flow<{ n: number }>()
      .pipe(double, (t) => ({ n: t.n }))
      .build();

    const result = await f.run(makeCtx(), { n: 5 }, noAsk);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ n: 5, doubled: 10 });
    expect(result.abort).toBeUndefined();
  });

  it("chains multiple capabilities with glue", async () => {
    const f = flow<{ n: number }>()
      .pipe(double, (t) => ({ n: t.n }))
      .pipe(addOne, (t) => ({ doubled: t.doubled }))
      .build();

    const result = await f.run(makeCtx(), { n: 3 }, noAsk);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ n: 3, doubled: 6, plusOne: 7 });
  });

  it("accumulates all outputs in token", async () => {
    const f = flow<{ n: number; name: string }>()
      .pipe(double, (t) => ({ n: t.n }))
      .pipe(greet, (t) => ({ name: t.name }))
      .build();

    const result = await f.run(makeCtx(), { n: 4, name: "alice" }, noAsk);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ n: 4, name: "alice", doubled: 8, greeting: "hi alice" });
  });

  it("glue can transform between steps", async () => {
    const f = flow<{ n: number }>()
      .pipe(double, (t) => ({ n: t.n }))
      .pipe(double, (t) => ({ n: t.doubled }))
      .build();

    const result = await f.run(makeCtx(), { n: 3 }, noAsk);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.doubled).toBe(12);
  });

  it("propagates abort and preserves token up to that point", async () => {
    const f = flow<{ n: number }>()
      .pipe(failIfNeg, (t) => ({ n: t.n }))
      .pipe(double, (t) => ({ n: t.n }))
      .build();

    const aborted = await f.run(makeCtx(), { n: -1 }, noAsk);
    expect(aborted.ok).toBe(true);
    if (!aborted.ok) return;
    expect(aborted.abort).toBe(true);
    expect(aborted.value).toEqual({ n: -1, positive: false });
    expect((aborted.value as Record<string, unknown>).doubled).toBeUndefined();

    const ok = await f.run(makeCtx(), { n: 5 }, noAsk);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.abort).toBeUndefined();
    expect(ok.value).toEqual({ n: 5, positive: true, doubled: 10 });
  });

  it("propagates context changes through steps", async () => {
    const f = flow<{ newUser: string; name: string }>()
      .pipe(updateCtx, (t) => ({ newUser: t.newUser }))
      .pipe(greet, (t) => ({ name: t.name }))
      .build();

    const result = await f.run(makeCtx(), { newUser: "bob", name: "world" }, noAsk);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ctx.userName).toBe("bob");
    expect(result.value.greeting).toBe("hi world");
  });

  it("generates descriptive name from capability names", async () => {
    const f = flow<{ n: number }>()
      .pipe(double, (t) => ({ n: t.n }))
      .pipe(addOne, (t) => ({ doubled: t.doubled }))
      .build();

    expect(f.name).toBe("flow(double → addOne)");
  });

  it("empty flow returns init unchanged", async () => {
    const f = flow<{ x: number }>().build();
    const ctx = makeCtx();
    const result = await f.run(ctx, { x: 42 }, noAsk);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ x: 42 });
    expect(result.ctx).toBe(ctx);
  });
});

describe("guard", () => {
  it("passes when field is true", async () => {
    const f = flow<{ ok: boolean; n: number }>()
      .pipe(guard("ok"), (t) => ({ ok: t.ok }))
      .pipe(double, (t) => ({ n: t.n }))
      .build();

    const result = await f.run(makeCtx(), { ok: true, n: 5 }, noAsk);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.abort).toBeUndefined();
    expect(result.value.doubled).toBe(10);
  });

  it("aborts when field is false", async () => {
    const f = flow<{ ok: boolean; n: number }>()
      .pipe(guard("ok"), (t) => ({ ok: t.ok }))
      .pipe(double, (t) => ({ n: t.n }))
      .build();

    const result = await f.run(makeCtx(), { ok: false, n: 5 }, noAsk);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.abort).toBe(true);
    expect((result.value as Record<string, unknown>).doubled).toBeUndefined();
  });
});

describe("nested flows (flow as capability via asCapability)", () => {
  it("a built flow can be used as a capability in another flow", async () => {
    const inner = flow<{ n: number }>()
      .pipe(double, (t) => ({ n: t.n }))
      .pipe(addOne, (t) => ({ doubled: t.doubled }))
      .build();

    const outer = flow<{ n: number; name: string }>()
      .pipe(asCapability(inner), (t) => ({ n: t.n }))
      .pipe(greet, (t) => ({ name: t.name }))
      .build();

    const result = await outer.run(makeCtx(), { n: 3, name: "x" }, noAsk);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.doubled).toBe(6);
    expect(result.value.plusOne).toBe(7);
    expect(result.value.greeting).toBe("hi x");
  });

  it("inner flow abort propagates to outer flow", async () => {
    const inner = flow<{ n: number }>()
      .pipe(failIfNeg, (t) => ({ n: t.n }))
      .pipe(double, (t) => ({ n: t.n }))
      .build();

    const outer = flow<{ n: number; name: string }>()
      .pipe(asCapability(inner), (t) => ({ n: t.n }))
      .pipe(greet, (t) => ({ name: t.name }))
      .build();

    const result = await outer.run(makeCtx(), { n: -1, name: "x" }, noAsk);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.abort).toBe(true);
    expect((result.value as Record<string, unknown>).greeting).toBeUndefined();
  });
});

describe("error handling and rollback", () => {
  it("returns FlowError when a capability throws", async () => {
    const f = flow<{ n: number }>()
      .pipe(double, (t) => ({ n: t.n }))
      .pipe(boom, () => ({}) as Record<string, never>)
      .build();

    const result = await f.run(makeCtx(), { n: 5 }, noAsk);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("flow_error");
    expect(result.error.failedStep).toBe("boom");
    expect(result.error.stepIndex).toBe(1);
    expect((result.error.cause as Error).message).toBe("kaboom");
  });

  it("runs cleanups in reverse order on error", async () => {
    const log: string[] = [];

    const f = flow<Record<string, never>>()
      .pipe(tracked("step1", log), () => ({}) as Record<string, never>)
      .pipe(tracked("step2", log), () => ({}) as Record<string, never>)
      .pipe(boom, () => ({}) as Record<string, never>)
      .build();

    const result = await f.run(makeCtx(), {} as Record<string, never>, noAsk);
    expect(result.ok).toBe(false);
    expect(log).toEqual(["step2", "step1"]);
  });

  it("does NOT run cleanups on abort", async () => {
    const log: string[] = [];

    const withCleanup: Capability<Record<string, never>, { done: boolean }> = {
      name: "withCleanup",
      run: async (ctx) => ({
        ctx,
        value: { done: true },
        cleanup: () => log.push("cleaned"),
      }),
    };

    const alwaysAbort: Capability<Record<string, never>, Record<string, never>> = {
      name: "alwaysAbort",
      run: async (ctx) => ({
        ctx,
        value: {} as Record<string, never>,
        abort: true,
      }),
    };

    const f = flow<Record<string, never>>()
      .pipe(withCleanup, () => ({}) as Record<string, never>)
      .pipe(alwaysAbort, () => ({}) as Record<string, never>)
      .build();

    const result = await f.run(makeCtx(), {} as Record<string, never>, noAsk);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.abort).toBe(true);
    expect(log).toEqual([]);
  });

  it("captures cleanup errors in rollback report", async () => {
    const failingCleanup: Capability<Record<string, never>, { x: number }> = {
      name: "failingCleanup",
      run: async (ctx) => ({
        ctx,
        value: { x: 1 },
        cleanup: () => {
          throw new Error("cleanup failed");
        },
      }),
    };

    const f = flow<Record<string, never>>()
      .pipe(failingCleanup, () => ({}) as Record<string, never>)
      .pipe(boom, () => ({}) as Record<string, never>)
      .build();

    const result = await f.run(makeCtx(), {} as Record<string, never>, noAsk);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.rollback.attempted).toBe(true);
    expect(result.error.rollback.results).toHaveLength(1);
    expect(result.error.rollback.results[0]!.ok).toBe(false);
    expect((result.error.rollback.results[0]!.error as Error).message).toBe("cleanup failed");
  });

  it("returns initial ctx on error (world restored)", async () => {
    const ctx = makeCtx();

    const f = flow<{ newUser: string }>()
      .pipe(updateCtx, (t) => ({ newUser: t.newUser }))
      .pipe(boom, () => ({}) as Record<string, never>)
      .build();

    const result = await f.run(ctx, { newUser: "changed" }, noAsk);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.ctx).toBe(ctx);
    expect(result.ctx.userName).toBe("bl");
  });

  it("rollback report shows no attempt when no cleanups exist", async () => {
    const f = flow<Record<string, never>>()
      .pipe(boom, () => ({}) as Record<string, never>)
      .build();

    const result = await f.run(makeCtx(), {} as Record<string, never>, noAsk);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.rollback.attempted).toBe(false);
    expect(result.error.rollback.results).toEqual([]);
  });

  it("completedSteps tracks which cleanups were registered", async () => {
    const log: string[] = [];

    const f = flow<Record<string, never>>()
      .pipe(tracked("a", log), () => ({}) as Record<string, never>)
      .pipe(double, () => ({ n: 1 }))
      .pipe(tracked("b", log), () => ({}) as Record<string, never>)
      .pipe(boom, () => ({}) as Record<string, never>)
      .build();

    const result = await f.run(makeCtx(), {} as Record<string, never>, noAsk);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Only "a" and "b" have cleanups, "double" doesn't
    expect(result.error.completedSteps).toEqual(["a", "b"]);
  });
});

describe("type utilities", () => {
  it("CapIn extracts input type", () => {
    type In = CapIn<typeof double>;
    const _check: In = { n: 1 };
    expect(_check).toBeTruthy();
  });

  it("CapOut extracts output type", () => {
    type Out = CapOut<typeof double>;
    const _check: Out = { doubled: 2 };
    expect(_check).toBeTruthy();
  });
});
