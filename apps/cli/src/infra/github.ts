import { execSync } from "child_process";

export type PrInfo = {
  number: number;
  title: string;
  branch: string;
  author: string;
  url: string;
};

export type RepoSlug = { owner: string; repo: string };

const PR_URL_RE = /https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;

export function parsePrUrl(input: string): { owner: string; repo: string; number: number } | null {
  const m = input.match(PR_URL_RE);
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]!, number: parseInt(m[3]!) };
}

export function getRepoSlug(cwd: string): RepoSlug | null {
  try {
    const url = execSync("git remote get-url origin", {
      cwd,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
    // SSH: git@github.com:owner/repo.git
    const ssh = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    if (ssh) return { owner: ssh[1]!, repo: ssh[2]! };
    // HTTPS: https://github.com/owner/repo.git
    const https = url.match(/github\.com\/([^/]+)\/([^/.]+)/);
    if (https) return { owner: https[1]!, repo: https[2]! };
    return null;
  } catch {
    return null;
  }
}

type GhPrListItem = {
  number: number;
  title: string;
  headRefName: string;
  author: { login: string };
  url: string;
};

function ghPrListToPrInfos(items: GhPrListItem[]): PrInfo[] {
  return items.map((item) => ({
    number: item.number,
    title: item.title,
    branch: item.headRefName,
    author: item.author.login,
    url: item.url,
  }));
}

export function listPrsForReview(slug: RepoSlug, cwd: string): PrInfo[] {
  const ghUser = execSync("gh api user --jq .login", {
    cwd,
    encoding: "utf-8",
    stdio: "pipe",
  }).trim();
  const json = execSync(
    `gh pr list --repo ${slug.owner}/${slug.repo} --search "review-requested:${ghUser}" --json number,title,headRefName,author,url --limit 20`,
    { cwd, encoding: "utf-8", stdio: "pipe" },
  );
  return ghPrListToPrInfos(JSON.parse(json) as GhPrListItem[]);
}

export function listPrsByAuthor(slug: RepoSlug, author: string, cwd: string): PrInfo[] {
  const json = execSync(
    `gh pr list --repo ${slug.owner}/${slug.repo} --author ${author} --state open --json number,title,headRefName,author,url --limit 20`,
    { cwd, encoding: "utf-8", stdio: "pipe" },
  );
  return ghPrListToPrInfos(JSON.parse(json) as GhPrListItem[]);
}

export function fetchPrInfo(owner: string, repo: string, number: number): PrInfo {
  const json = execSync(
    `gh pr view ${number} --repo ${owner}/${repo} --json number,title,headRefName,author,url`,
    { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
  );
  const data = JSON.parse(json) as {
    number: number;
    title: string;
    headRefName: string;
    author: { login: string };
    url: string;
  };
  return {
    number: data.number,
    title: data.title,
    branch: data.headRefName,
    author: data.author.login,
    url: data.url,
  };
}
