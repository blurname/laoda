import type { Context, QuestionFn } from "./types.ts";

// ─── Core abstractions ───

export type Step<T> = {
  ctx: Context;
  value: T;
  abort?: boolean;
};

export type Capability<In, Out> = {
  name: string;
  run: (ctx: Context, input: In, ask: QuestionFn) => Promise<Step<Out>>;
};

// ─── Type utilities ───

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CapIn<C> = C extends Capability<infer I, any> ? I : never;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CapOut<C> = C extends Capability<any, infer O> ? O : never;

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

  build(): Capability<Init, Acc> {
    const steps = [...this.steps];
    return {
      name: `flow(${steps.map((s) => s.cap.name).join(" → ")})`,
      run: async (ctx: Context, init: Init, ask: QuestionFn): Promise<Step<Acc>> => {
        let acc: unknown = init;
        let currentCtx = ctx;
        for (const step of steps) {
          const input = step.glue(acc);
          const result = await step.cap.run(currentCtx, input, ask);
          if (result.abort) {
            acc = { ...(acc as object), ...(result.value as object) };
            return { ctx: result.ctx, value: acc as Acc, abort: true };
          }
          currentCtx = result.ctx;
          acc = { ...(acc as object), ...(result.value as object) };
        }
        return { ctx: currentCtx, value: acc as Acc };
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
