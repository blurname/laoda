import { existsSync, rmSync } from "fs";
import { copyFolder, duplicateFolder } from "@laoda/capability";
import type { Capability } from "./engine.ts";
import type { PrInfo } from "../infra/github.ts";
import { getRepoSlug, listPrsForReview, listPrsByAuthor } from "../infra/github.ts";
import type { UserType, CapabilityError } from "../types.ts";
import type { AllocResult } from "../infra/worker.ts";
import {
  allocateMyWorker,
  findOtherWorker,
  workerDir,
  addWorker,
  makeWorkerBusy,
  replaceWorker,
  saveRegistry,
} from "../infra/worker.ts";
import { findEnvFiles, prepareGitBranch } from "../infra/git.ts";
import { spawnTab as zellijSpawnTab } from "../infra/zellij.ts";
import {
  renderFetching,
  renderInfo,
  renderSuccess,
  renderCancelled,
  renderReuse,
  renderDuplicating,
  renderDuplicated,
  renderPreparingBranch,
  renderBranchReady,
  renderTabCreated,
  promptQuestion,
} from "../render.ts";

// ─── fetchPrs ───

export const fetchPrs: Capability<{ target: "me" | string }, { prs: PrInfo[] }> = {
  name: "fetchPrs",
  run: async (ctx, { target }) => {
    const slug = getRepoSlug(ctx.cwd);
    if (!slug) throw new Error("Cannot detect GitHub repo from git remote");

    const isMe = target === "me";
    renderFetching(
      isMe ? "Fetching PRs requesting your review..." : `Fetching PRs by ${target}...`,
    );

    const prs = isMe ? listPrsForReview(slug, ctx.cwd) : listPrsByAuthor(slug, target, ctx.cwd);

    if (prs.length === 0) {
      renderInfo(isMe ? "No PRs requesting your review" : `No open PRs by ${target}`);
      return { ctx, value: { prs }, abort: true };
    }

    renderSuccess(`${prs.length} PR(s) found`);
    return { ctx, value: { prs } };
  },
};

// ─── selectPr ───

export const selectPr: Capability<{ prs: PrInfo[] }, { pr: PrInfo }> = {
  name: "selectPr",
  run: async (ctx, { prs }, ask) => {
    console.log();
    for (let i = 0; i < prs.length; i++) {
      const pr = prs[i]!;
      console.log(`  ${i + 1}. #${pr.number} ${pr.title} (${pr.author})`);
    }
    console.log(`  0. Cancel`);
    console.log();

    const pick = (await ask(promptQuestion("Pick a PR: "))).trim();
    const idx = parseInt(pick);

    if (!pick || idx === 0 || isNaN(idx) || idx < 1 || idx > prs.length) {
      renderCancelled();
      return { ctx, value: { pr: null as unknown as PrInfo }, abort: true };
    }

    return { ctx, value: { pr: prs[idx - 1]! } };
  },
};

// ─── confirm ───

export const confirm: Capability<{ plan: string[] }, { confirmed: boolean }> = {
  name: "confirm",
  run: async (ctx, { plan }, ask) => {
    console.log();
    renderInfo("Plan:");
    for (const step of plan) {
      console.log(`    ${step}`);
    }
    console.log();

    const answer = (await ask(promptQuestion("Execute? (Y/n) "))).trim().toLowerCase();
    const confirmed = answer !== "n";
    if (!confirmed) {
      ctx.logAction("cancelled");
      renderCancelled();
    }
    return { ctx, value: { confirmed } };
  },
};

// ─── planMyWorker ───
// Computes allocation decision without executing.
// Produces alloc result + human-readable plan lines.

export const planMyWorker: Capability<
  { task: string; branch: string },
  { alloc: AllocResult; workerPlan: string[] }
> = {
  name: "planMyWorker",
  run: async (ctx, { task, branch }) => {
    const alloc = allocateMyWorker(ctx.cwd, ctx.registry);
    const steps: string[] = [];

    if (alloc.action === "reuse") {
      steps.push(`Reuse worker-${alloc.worker.index} (${alloc.path})`);
    } else {
      steps.push(`Create worker-${alloc.index} (duplicate folder)`);
    }
    steps.push(`Create branch ${branch}`);
    steps.push(`Open tab: ${ctx.agent} "${task}"`);

    return { ctx, value: { alloc, workerPlan: steps } };
  },
};

// ─── executeMyWorker ───
// Acts on a pre-computed allocation decision.
// Returns cleanup that restores registry and removes duplicated folder on rollback.

export const executeMyWorker: Capability<
  { alloc: AllocResult; task: string; branch: string },
  { dir: string }
> = {
  name: "executeMyWorker",
  run: async (ctx, { alloc, task, branch }) => {
    const originalRegistry = ctx.registry;
    let targetDir: string;
    let newRegistry: typeof ctx.registry;
    let created = false;

    if (alloc.action === "reuse") {
      targetDir = alloc.path;
      renderReuse(targetDir);
      const busyWorker = makeWorkerBusy(alloc.worker, task, branch);
      const original = ctx.registry.workers.find(
        (w) => w.type === "my" && w.index === alloc.worker.index,
      );
      newRegistry = original ? replaceWorker(ctx.registry, original, busyWorker) : ctx.registry;
    } else {
      renderDuplicating();
      const envFiles = findEnvFiles(ctx.cwd);
      targetDir = duplicateFolder(ctx.cwd, envFiles);
      created = true;
      renderDuplicated(targetDir);

      const newWorker = {
        type: "my" as const,
        index: alloc.index,
        status: "busy" as const,
        task,
        branch,
      };
      newRegistry = addWorker(ctx.registry, newWorker);
    }

    saveRegistry(newRegistry);

    const cleanup = () => {
      if (created) {
        try {
          rmSync(targetDir, { recursive: true, force: true });
        } catch {}
      }
      saveRegistry(originalRegistry);
    };

    return { ctx: { ...ctx, registry: newRegistry }, value: { dir: targetDir }, cleanup };
  },
};

// ─── planReviewWorker ───
// Computes what needs to happen for a review worker.

export const planReviewWorker: Capability<
  { workerName: string; workerRole: UserType; branch: string },
  { reviewDir: string; needsRegister: boolean; needsDuplicate: boolean; reviewPlan: string[] }
> = {
  name: "planReviewWorker",
  run: async (ctx, { workerName, workerRole, branch }) => {
    const worker = findOtherWorker(ctx.registry, workerName);
    const role = workerRole ?? "designer";
    const needsRegister = !worker;
    const reviewDir = workerDir(
      ctx.cwd,
      ctx.project,
      worker ?? { type: "other", name: workerName, userType: role },
    );
    const needsDuplicate = !existsSync(reviewDir);

    const steps: string[] = [];
    if (needsRegister) steps.push(`Register "${workerName}" as ${role}`);
    if (needsDuplicate) steps.push(`Duplicate ${ctx.cwd} → ${reviewDir}`);
    steps.push(`Create branch ${branch}`);
    steps.push(`Open tab: ${ctx.agent} (no initial prompt)`);

    return {
      ctx,
      value: { reviewDir, needsRegister, needsDuplicate, reviewPlan: steps },
    };
  },
};

// ─── executeReviewWorker ───
// Acts on a pre-computed review plan.
// Returns cleanup that removes duplicated folder and reverts registry on rollback.

export const executeReviewWorker: Capability<
  {
    workerName: string;
    workerRole: UserType;
    reviewDir: string;
    needsRegister: boolean;
    needsDuplicate: boolean;
  },
  { dir: string }
> = {
  name: "executeReviewWorker",
  run: async (ctx, { workerName, workerRole, reviewDir, needsRegister, needsDuplicate }) => {
    const originalRegistry = ctx.registry;
    let currentCtx = ctx;
    const role = workerRole ?? "designer";

    if (needsRegister) {
      const newWorker = { type: "other" as const, name: workerName, userType: role };
      const newRegistry = addWorker(ctx.registry, newWorker);
      saveRegistry(newRegistry);
      ctx.logAction(`worker_auto_added name=${workerName} userType=${role}`);
      renderSuccess(`Registered ${workerName} (${role})`);
      currentCtx = { ...ctx, registry: newRegistry };
    }

    if (needsDuplicate) {
      renderDuplicating();
      const envFiles = findEnvFiles(currentCtx.cwd);
      copyFolder(currentCtx.cwd, reviewDir, envFiles);
      renderDuplicated(reviewDir);
    }

    const cleanup = () => {
      if (needsDuplicate && existsSync(reviewDir)) {
        try {
          rmSync(reviewDir, { recursive: true, force: true });
        } catch {}
      }
      saveRegistry(originalRegistry);
    };

    return { ctx: currentCtx, value: { dir: reviewDir }, cleanup };
  },
};

// ─── prepareBranch ───

export const prepareBranch: Capability<{ dir: string; branch: string }, Record<string, never>> = {
  name: "prepareBranch",
  run: async (ctx, { dir, branch }) => {
    renderPreparingBranch(branch);
    try {
      prepareGitBranch(dir, branch);
    } catch (cause) {
      const err: CapabilityError = {
        capability: "prepareBranch",
        message: `Failed to prepare branch "${branch}" in ${dir}`,
        hint: "Check network connection and git remote access",
        cause,
      };
      throw err;
    }
    renderBranchReady(branch);
    return { ctx, value: {} as Record<string, never> };
  },
};

// ─── spawnTab ───

export const spawnTab: Capability<
  { dir: string; title: string; prompt: string },
  Record<string, never>
> = {
  name: "spawnTab",
  run: async (ctx, { dir, title, prompt }) => {
    try {
      zellijSpawnTab(title, prompt, dir, ctx.agent);
    } catch (cause) {
      const err: CapabilityError = {
        capability: "spawnTab",
        message: "Failed to spawn zellij tab",
        hint: "Is zellij running? Check `zellij list-sessions`",
        cause,
      };
      throw err;
    }
    ctx.logAction(`tab_created dir=${dir}`);
    renderTabCreated();
    return { ctx, value: {} as Record<string, never> };
  },
};
