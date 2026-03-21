import type { Context, QuestionFn } from "../types.ts";

// ─── Core abstractions ───

export type Step<T> = {
  ctx: Context;
  value: T;
  abort?: boolean;
  cleanup?: () => void;
};

export type Capability<In, Out> = {
  name: string;
  run: (ctx: Context, input: In, ask: QuestionFn) => Promise<Step<Out>>;
};

// ─── Error types ───

export type RollbackReport = {
  attempted: boolean;
  results: { step: string; ok: boolean; error?: unknown }[];
};

export type FlowError = {
  type: "flow_error";
  failedStep: string;
  stepIndex: number;
  cause: unknown;
  completedSteps: string[];
  rollback: RollbackReport;
};

export type FlowResult<T> =
  | { ok: true; ctx: Context; value: T; abort?: boolean }
  | { ok: false; error: FlowError; ctx: Context };

// ─── Flow ───
// Distinguished from Capability: returns FlowResult (error as value),
// handles rollback internally.

export type Flow<Init, Acc> = {
  name: string;
  run: (ctx: Context, init: Init, ask: QuestionFn) => Promise<FlowResult<Acc>>;
};

// ─── Type utilities ───

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CapIn<C> = C extends Capability<infer I, any> ? I : never;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CapOut<C> = C extends Capability<any, infer O> ? O : never;

// ─── Rollback executor ───

function runCleanups(cleanups: { name: string; fn: () => void }[]): RollbackReport {
  if (cleanups.length === 0) return { attempted: false, results: [] };
  const results: RollbackReport["results"] = [];
  for (let i = cleanups.length - 1; i >= 0; i--) {
    const c = cleanups[i]!;
    try {
      c.fn();
      results.push({ step: c.name, ok: true });
    } catch (error) {
      results.push({ step: c.name, ok: false, error });
    }
  }
  return { attempted: true, results };
}

// ─── FlowBuilder ───
// Accumulates token type via intersection at each .pipe() call.
// Init = the flow's input type (what the caller provides)
// Acc  = the accumulated token type (Init & Out1 & Out2 & ...)

type InternalStep = {
  cap: Capability<unknown, unknown>;
  glue: (acc: unknown) => unknown;
};

export class FlowBuilder<Init, Acc> {
  private readonly steps: InternalStep[];

  constructor(steps: InternalStep[] = []) {
    this.steps = steps;
  }

  pipe<Req, Out>(cap: Capability<Req, Out>, glue: (acc: Acc) => Req): FlowBuilder<Init, Acc & Out> {
    return new FlowBuilder<Init, Acc & Out>([
      ...this.steps,
      {
        cap: cap as Capability<unknown, unknown>,
        glue: glue as (acc: unknown) => unknown,
      },
    ]);
  }

  build(): Flow<Init, Acc> {
    const steps = [...this.steps];
    return {
      name: `flow(${steps.map((s) => s.cap.name).join(" → ")})`,
      run: async (ctx: Context, init: Init, ask: QuestionFn): Promise<FlowResult<Acc>> => {
        const initialCtx = ctx;
        const cleanups: { name: string; fn: () => void }[] = [];
        let acc: unknown = init;
        let currentCtx = ctx;

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i]!;
          const input = step.glue(acc);

          let result: Step<unknown>;
          try {
            result = await step.cap.run(currentCtx, input, ask);
          } catch (cause) {
            const rollback = runCleanups(cleanups);
            return {
              ok: false,
              error: {
                type: "flow_error",
                failedStep: step.cap.name,
                stepIndex: i,
                cause,
                completedSteps: cleanups.map((c) => c.name),
                rollback,
              },
              ctx: initialCtx,
            };
          }

          if (result.abort) {
            acc = { ...(acc as object), ...(result.value as object) };
            return { ok: true, ctx: result.ctx, value: acc as Acc, abort: true };
          }

          if (result.cleanup) {
            cleanups.push({ name: step.cap.name, fn: result.cleanup });
          }
          currentCtx = result.ctx;
          acc = { ...(acc as object), ...(result.value as object) };
        }

        return { ok: true, ctx: currentCtx, value: acc as Acc };
      },
    };
  }
}

export function flow<Init>(): FlowBuilder<Init, Init> {
  return new FlowBuilder<Init, Init>();
}

// ─── Guard ───
// Abort flow if a boolean field is false.
// Out = {} so Acc & {} = Acc (no type pollution).

export function guard<K extends string>(
  key: K,
): Capability<Record<K, boolean>, Record<string, never>> {
  return {
    name: `guard:${key}`,
    run: async (ctx, input) => {
      if (!input[key]) {
        return { ctx, value: {} as Record<string, never>, abort: true };
      }
      return { ctx, value: {} as Record<string, never> };
    },
  };
}

// ─── Bridge ───
// Convert a Flow back to a Capability for nested composition.
// The inner flow handles its own rollback; the outer flow sees a clean throw.

export function asCapability<Init, Acc>(f: Flow<Init, Acc>): Capability<Init, Acc> {
  return {
    name: f.name,
    run: async (ctx, input, ask) => {
      const result = await f.run(ctx, input, ask);
      if (!result.ok) throw result.error;
      return { ctx: result.ctx, value: result.value, abort: result.abort };
    },
  };
}

// ─── Type guard ───

export function isFlowError(e: unknown): e is FlowError {
  return typeof e === "object" && e !== null && (e as FlowError).type === "flow_error";
}
