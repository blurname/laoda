import { flow, guard } from "./flow.ts";
import type { UserType } from "./types.ts";
import { sanitizeBranchName } from "./llm.ts";
import {
  fetchPrs,
  selectPr,
  confirm,
  planMyWorker,
  executeMyWorker,
  planReviewWorker,
  executeReviewWorker,
  prepareBranch,
  spawnTab,
} from "./capabilities.ts";

// ─── Task flow ───
// User describes a task → allocate worker → branch → tab

export const taskFlow = flow<{ task: string; branchName: string; userName: string }>()
  .pipe(planMyWorker, (t) => ({
    task: t.task,
    branch: `${t.userName}/${t.branchName}`,
  }))
  .pipe(confirm, (t) => ({ plan: t.workerPlan }))
  .pipe(guard("confirmed"), (t) => ({ confirmed: t.confirmed }))
  .pipe(executeMyWorker, (t) => ({
    alloc: t.alloc,
    task: t.task,
    branch: `${t.userName}/${t.branchName}`,
  }))
  .pipe(prepareBranch, (t) => ({
    dir: t.dir,
    branch: `${t.userName}/${t.branchName}`,
  }))
  .pipe(spawnTab, (t) => ({
    dir: t.dir,
    title: t.branchName,
    prompt: t.task,
  }))
  .build();

// ─── Review flow ───
// Review someone's work → register worker → branch → tab

export const reviewFlow = flow<{
  workerName: string;
  workerRole: UserType;
  task: string;
  branchName: string;
  userName: string;
}>()
  .pipe(planReviewWorker, (t) => ({
    workerName: t.workerName,
    workerRole: t.workerRole,
    branch: `${t.userName}/review-${t.workerName}-${t.branchName}`,
  }))
  .pipe(confirm, (t) => ({ plan: t.reviewPlan }))
  .pipe(guard("confirmed"), (t) => ({ confirmed: t.confirmed }))
  .pipe(executeReviewWorker, (t) => ({
    workerName: t.workerName,
    workerRole: t.workerRole,
    reviewDir: t.reviewDir,
    needsRegister: t.needsRegister,
    needsDuplicate: t.needsDuplicate,
  }))
  .pipe(prepareBranch, (t) => ({
    dir: t.dir,
    branch: `${t.userName}/review-${t.workerName}-${t.branchName}`,
  }))
  .pipe(spawnTab, (t) => ({
    dir: t.dir,
    title: `review-${t.workerName}`,
    prompt: "",
  }))
  .build();

// ─── Review PR flow ───
// Fetch PRs → pick one → review

export const reviewPrFlow = flow<{ target: "me" | string; userName: string }>()
  .pipe(fetchPrs, (t) => ({ target: t.target }))
  .pipe(selectPr, (t) => ({ prs: t.prs }))
  .pipe(planReviewWorker, (t) => ({
    workerName: t.pr.author,
    workerRole: "designer" as UserType,
    branch: `${t.userName}/review-${t.pr.author}-${sanitizeBranchName(`pr-${t.pr.number}-${t.pr.branch}`)}`,
  }))
  .pipe(confirm, (t) => ({ plan: t.reviewPlan }))
  .pipe(guard("confirmed"), (t) => ({ confirmed: t.confirmed }))
  .pipe(executeReviewWorker, (t) => ({
    workerName: t.pr.author,
    workerRole: "designer" as UserType,
    reviewDir: t.reviewDir,
    needsRegister: t.needsRegister,
    needsDuplicate: t.needsDuplicate,
  }))
  .pipe(prepareBranch, (t) => ({
    dir: t.dir,
    branch: `${t.userName}/review-${t.pr.author}-${sanitizeBranchName(`pr-${t.pr.number}-${t.pr.branch}`)}`,
  }))
  .pipe(spawnTab, (t) => ({
    dir: t.dir,
    title: `review-${t.pr.author}`,
    prompt: "",
  }))
  .build();

// ─── Task PR flow ───
// Fetch PRs → pick one → treat as my task

export const taskPrFlow = flow<{ target: "me" | string; userName: string }>()
  .pipe(fetchPrs, (t) => ({ target: t.target }))
  .pipe(selectPr, (t) => ({ prs: t.prs }))
  .pipe(planMyWorker, (t) => ({
    task: `PR #${t.pr.number}: ${t.pr.title}`,
    branch: `${t.userName}/${sanitizeBranchName(`pr-${t.pr.number}-${t.pr.branch}`)}`,
  }))
  .pipe(confirm, (t) => ({ plan: t.workerPlan }))
  .pipe(guard("confirmed"), (t) => ({ confirmed: t.confirmed }))
  .pipe(executeMyWorker, (t) => ({
    alloc: t.alloc,
    task: `PR #${t.pr.number}: ${t.pr.title}`,
    branch: `${t.userName}/${sanitizeBranchName(`pr-${t.pr.number}-${t.pr.branch}`)}`,
  }))
  .pipe(prepareBranch, (t) => ({
    dir: t.dir,
    branch: `${t.userName}/${sanitizeBranchName(`pr-${t.pr.number}-${t.pr.branch}`)}`,
  }))
  .pipe(spawnTab, (t) => ({
    dir: t.dir,
    title: sanitizeBranchName(`pr-${t.pr.number}`),
    prompt: `PR #${t.pr.number}: ${t.pr.title}`,
  }))
  .build();
