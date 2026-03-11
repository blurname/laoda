import { getOpenRouterKey, getModel } from "./config.ts";

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

async function chat(messages: ChatMessage[]): Promise<string> {
  const key = getOpenRouterKey();
  if (!key) {
    throw new Error("OpenRouter key not set. Run laoda with --set-key <key>");
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: getModel(),
      messages,
      temperature: 0,
      max_tokens: 60,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

export async function generateBranchName(task: string): Promise<string> {
  const raw = await chat([
    {
      role: "system",
      content: `Generate a short git branch name from the task description. Rules:
- Use lowercase kebab-case (e.g. add-login-page, fix-nav-bug)
- Max 5 words, no special characters except hyphens
- No prefix like feat/ or fix/
- Return ONLY the branch name, nothing else`,
    },
    { role: "user", content: task },
  ]);

  // Sanitize: lowercase, replace non-alphanumeric with hyphens, trim hyphens
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}
