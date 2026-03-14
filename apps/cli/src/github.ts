import { execSync } from "child_process";

export type PrInfo = {
  number: number;
  title: string;
  branch: string;
  author: string;
  url: string;
};

const PR_URL_RE = /https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;

export function parsePrUrl(input: string): { owner: string; repo: string; number: number } | null {
  const m = input.match(PR_URL_RE);
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]!, number: parseInt(m[3]!) };
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
