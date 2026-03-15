import { describe, it, expect, vi } from "vitest";
import { flow, guard } from "./flow.ts";
import type { Capability, CapIn, CapOut } from "./flow.ts";
import type { Context } from "./types.ts";

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

describe("FlowBuilder", () => {
  it("pipes a single capability", async () => {
    const f = flow<{ n: number }>()
      .pipe(double, (t) => ({ n: t.n }))
      .build();

    const result = await f.run(makeCtx(), { n: 5 }, noAsk);
    expect(result.value).toEqual({ n: 5, doubled: 10 });
    expect(result.abort).toBeUndefined();
  });

  it("chains multiple capabilities with glue", async () => {
    const f = flow<{ n: number }>()
      .pipe(double, (t) => ({ n: t.n }))
      .pipe(addOne, (t) => ({ doubled: t.doubled }))
      .build();

    const result = await f.run(makeCtx(), { n: 3 }, noAsk);
    expect(result.value).toEqual({ n: 3, doubled: 6, plusOne: 7 });
  });

  it("accumulates all outputs in token", async () => {
    const f = flow<{ n: number; name: string }>()
      .pipe(double, (t) => ({ n: t.n }))
      .pipe(greet, (t) => ({ name: t.name }))
      .build();

    const result = await f.run(makeCtx(), { n: 4, name: "alice" }, noAsk);
    expect(result.value).toEqual({ n: 4, name: "alice", doubled: 8, greeting: "hi alice" });
  });

  it("glue can transform between steps", async () => {
    // doubled becomes the new n for another double
    const f = flow<{ n: number }>()
      .pipe(double, (t) => ({ n: t.n }))
      .pipe(double, (t) => ({ n: t.doubled }))
      .build();

    const result = await f.run(makeCtx(), { n: 3 }, noAsk);
    // First double: 3→6, second double: 6→12
    // Token: { n: 3, doubled: 12 } (second overwrites first)
    expect(result.value.doubled).toBe(12);
  });

  it("propagates abort and preserves token up to that point", async () => {
    const f = flow<{ n: number }>()
      .pipe(failIfNeg, (t) => ({ n: t.n }))
      .pipe(double, (t) => ({ n: t.n }))
      .build();

    // Negative: aborts before double
    const aborted = await f.run(makeCtx(), { n: -1 }, noAsk);
    expect(aborted.abort).toBe(true);
    expect(aborted.value).toEqual({ n: -1, positive: false });
    expect((aborted.value as Record<string, unknown>).doubled).toBeUndefined();

    // Positive: continues to double
    const ok = await f.run(makeCtx(), { n: 5 }, noAsk);
    expect(ok.abort).toBeUndefined();
    expect(ok.value).toEqual({ n: 5, positive: true, doubled: 10 });
  });

  it("propagates context changes through steps", async () => {
    const f = flow<{ newUser: string; name: string }>()
      .pipe(updateCtx, (t) => ({ newUser: t.newUser }))
      .pipe(greet, (t) => ({ name: t.name }))
      .build();

    const result = await f.run(makeCtx(), { newUser: "bob", name: "world" }, noAsk);
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
    expect(result.abort).toBeUndefined();
    expect(result.value.doubled).toBe(10);
  });

  it("aborts when field is false", async () => {
    const f = flow<{ ok: boolean; n: number }>()
      .pipe(guard("ok"), (t) => ({ ok: t.ok }))
      .pipe(double, (t) => ({ n: t.n }))
      .build();

    const result = await f.run(makeCtx(), { ok: false, n: 5 }, noAsk);
    expect(result.abort).toBe(true);
    expect((result.value as Record<string, unknown>).doubled).toBeUndefined();
  });
});

describe("nested flows (flow as capability)", () => {
  it("a built flow can be used as a capability in another flow", async () => {
    const inner = flow<{ n: number }>()
      .pipe(double, (t) => ({ n: t.n }))
      .pipe(addOne, (t) => ({ doubled: t.doubled }))
      .build();

    const outer = flow<{ n: number; name: string }>()
      .pipe(inner, (t) => ({ n: t.n }))
      .pipe(greet, (t) => ({ name: t.name }))
      .build();

    const result = await outer.run(makeCtx(), { n: 3, name: "x" }, noAsk);
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
      .pipe(inner, (t) => ({ n: t.n }))
      .pipe(greet, (t) => ({ name: t.name }))
      .build();

    const result = await outer.run(makeCtx(), { n: -1, name: "x" }, noAsk);
    expect(result.abort).toBe(true);
    expect((result.value as Record<string, unknown>).greeting).toBeUndefined();
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
