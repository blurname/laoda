import type { MessageKind } from "../types.ts";

type Sink = (kind: MessageKind, text: string) => void;

let sink: Sink = (_kind, text) => console.log(text);

export function setSink(fn: Sink): void {
  sink = fn;
}

export function emit(kind: MessageKind, text: string): void {
  sink(kind, text);
}
