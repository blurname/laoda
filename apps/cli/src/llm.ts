import OpenAI from "openai";
import { getLlmConfig, getBaseUrl } from "./config.ts";
import type { SubTask } from "./types.ts";

function createClient(): OpenAI {
  const llm = getLlmConfig();
  if (!llm || !llm.apiKey) {
    throw new Error(
      "LLM not configured. Run:\n  laoda config set llm.provider openrouter\n  laoda config set llm.apiKey <key>\n  laoda config set llm.model <model>",
    );
  }

  return new OpenAI({
    apiKey: llm.apiKey,
    baseURL: getBaseUrl(llm),
  });
}

const SYSTEM_PROMPT = `You are a task decomposition assistant. Given a high-level task, break it into independent subtasks that can be executed in parallel by separate Claude Code instances.

Each subtask should be self-contained and actionable. Return a JSON array of subtasks.

Rules:
- Each subtask has: id (number, 1-based), title (short), prompt (detailed instruction for Claude Code)
- The prompt should be detailed enough for Claude Code to execute without additional context
- Keep subtasks between 2-6
- Return ONLY valid JSON, no markdown fences, no extra text

Example output:
[
  {"id": 1, "title": "Setup project structure", "prompt": "Create a new Node.js project with..."},
  {"id": 2, "title": "Implement API routes", "prompt": "Create REST API endpoints for..."}
]`;

export async function decompose(task: string): Promise<SubTask[]> {
  const llm = getLlmConfig()!;
  const client = createClient();

  const response = await client.chat.completions.create({
    model: llm.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: task },
    ],
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("LLM returned empty response");
  }

  // Strip markdown fences if present
  const json = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

  try {
    const subtasks: SubTask[] = JSON.parse(json);
    return subtasks;
  } catch {
    throw new Error(`Failed to parse LLM response as JSON:\n${content}`);
  }
}
