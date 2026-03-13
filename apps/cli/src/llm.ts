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

export type IntentUnknown = {
  type: "unknown";
  message: string;
};

export type Intent = IntentTask | IntentReview | IntentChangeModel | IntentUnknown;

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

async function chat(messages: ChatMessage[], maxTokens = 100): Promise<string> {
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
    throw new Error(`OpenRouter API error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  const content = (data.choices?.[0]?.message?.content ?? "").trim();
  logLlmResponse(content);
  return content;
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

  const raw = await chat(
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

3. User wants to change/switch the LLM model → {"type":"change_model","query":"<search keyword>"}
   - Extract the model name or keyword they want to search for
   - If no specific model mentioned, use empty string as query

4. Cannot determine intent → {"type":"unknown","message":"<brief explanation>"}

Return ONLY the JSON object, no markdown fences, no extra text.`,
      },
      { role: "user", content: input },
    ],
    200,
  );

  const json = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  try {
    const parsed = JSON.parse(json);
    if (parsed.type === "task" || parsed.type === "review") {
      parsed.branchName = sanitizeBranchName(parsed.branchName || "");
    }
    return parsed as Intent;
  } catch {
    return { type: "unknown", message: `Failed to parse LLM response: ${raw}` };
  }
}

import type { UserType } from "./types.ts";

export async function classifyUnregistered(
  folderNames: string[],
): Promise<{ name: string; userType: UserType }[]> {
  if (folderNames.length === 0) return [];

  const raw = await chat(
    [
      {
        role: "system",
        content: `You are classifying workspace folder suffixes. Each suffix is a person's short name.
For each name, guess if they are a "designer" or "product" person.
Return a JSON array: [{"name":"<suffix>","userType":"designer"|"product"}]
Return ONLY the JSON array, no markdown fences, no extra text.`,
      },
      { role: "user", content: folderNames.join(", ") },
    ],
    200,
  );

  const json = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  try {
    return JSON.parse(json) as { name: string; userType: UserType }[];
  } catch {
    return folderNames.map((name) => ({ name, userType: "designer" as UserType }));
  }
}
