import { getOpenRouterKey, getModel } from "./config.ts";
import { logLlmRequest, logLlmResponse } from "./logger.ts";

export type IntentTask = {
  type: "task";
  task: string;
  branchName: string;
};

export type IntentReview = {
  type: "review";
  workerName: string;
  task: string;
  branchName: string;
};

export type IntentChangeModel = {
  type: "change_model";
  query: string;
};

export type IntentManageWorkers = {
  type: "manage_workers";
};

export type IntentUnknown = {
  type: "unknown";
  message: string;
};

export type Intent =
  | IntentTask
  | IntentReview
  | IntentChangeModel
  | IntentManageWorkers
  | IntentUnknown;

type OpenRouterModel = {
  id: string;
  name: string;
  pricing: { prompt: string; completion: string };
};

export async function fetchModels(): Promise<OpenRouterModel[]> {
  const res = await fetch("https://openrouter.ai/api/v1/models");
  if (!res.ok) {
    throw new Error(`Failed to fetch models: ${res.status}`);
  }
  const data = (await res.json()) as { data: OpenRouterModel[] };
  return data.data ?? [];
}

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type ChatResult = {
  content: string;
  model: string;
  rawBody: unknown;
};

async function chat(messages: ChatMessage[], maxTokens = 100): Promise<ChatResult> {
  const key = getOpenRouterKey();
  if (!key) {
    throw new Error("OpenRouter key not set. Run laoda with --set-key <key>");
  }

  const model = getModel();
  logLlmRequest(model, messages);

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[${model}] HTTP ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = (data.choices?.[0]?.message?.content ?? "").trim();
  logLlmResponse(content || `[empty] raw=${JSON.stringify(data)}`);
  return { content, model, rawBody: data };
}

export function sanitizeBranchName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

export async function classifyIntent(input: string, workerNames: string[] = []): Promise<Intent> {
  const workerCtx =
    workerNames.length > 0
      ? `\nKnown team members: ${workerNames.join(", ")}. If the user mentions one of them, it's a review intent.`
      : "";

  let result: ChatResult;
  try {
    result = await chat(
      [
        {
          role: "system",
          content: `You are an intent classifier for a CLI tool. Classify user input into one of these intents and return ONLY valid JSON:

1. User wants to execute a coding task (for themselves) → {"type":"task","task":"<original task>","branchName":"<kebab-case-short-name>"}
   - branchName: lowercase kebab-case, max 5 words, no prefix like feat/fix

2. User wants to review/improve someone else's code → {"type":"review","workerName":"<person name>","task":"<what to review/improve>","branchName":"<kebab-case-short-name>"}
   - This applies when user mentions reviewing, checking, improving, or fixing someone's work
   - workerName must be the person's name (lowercase)
   - branchName: lowercase kebab-case, max 5 words${workerCtx}

3. User wants to manage/organize/add/remove team workers → {"type":"manage_workers"}
   - e.g. "manage workers", "add worker", "整理 worker", "团队管理"

4. User wants to change/switch the LLM model → {"type":"change_model","query":"<search keyword>"}
   - Extract the model name or keyword they want to search for
   - If no specific model mentioned, use empty string as query

5. Cannot determine intent → {"type":"unknown","message":"<brief explanation>"}

Return ONLY the JSON object, no markdown fences, no extra text.`,
        },
        { role: "user", content: input },
      ],
      200,
    );
  } catch (e: any) {
    return {
      type: "unknown",
      message: `[classifyIntent] ${e.message}\n  input: ${input}`,
    };
  }

  const { content: raw, model, rawBody } = result;

  if (!raw) {
    return {
      type: "unknown",
      message: [
        `[classifyIntent] LLM returned empty content`,
        `  input: ${input}`,
        `  model: ${model}`,
        `  response: ${JSON.stringify(rawBody)}`,
      ].join("\n"),
    };
  }

  const json = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  try {
    const parsed = JSON.parse(json);
    if (parsed.type === "task" || parsed.type === "review") {
      return { ...parsed, branchName: sanitizeBranchName(parsed.branchName || "") } as Intent;
    }
    return parsed as Intent;
  } catch {
    return {
      type: "unknown",
      message: [
        `[classifyIntent] Failed to parse LLM JSON`,
        `  input: ${input}`,
        `  model: ${model}`,
        `  raw: ${raw}`,
      ].join("\n"),
    };
  }
}
