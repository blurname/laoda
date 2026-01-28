import {
  existsSync,
  mkdirSync,
  copyFileSync,
  cpSync,
  lstatSync,
  readlinkSync,
  symlinkSync,
} from "fs";
import { join } from "path";
import { execSync } from "child_process";

export function copyFolderRobustly(src: string, dest: string, includeFiles: string[] = []) {
  if (!existsSync(src)) {
    console.error(`[copyFolderRobustly] Source does not exist: ${src}`);
    return;
  }

  // 1. Create target dir
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  // 2. Capture local git config
  const getLocalGitConfig = (key: string, cwd: string) => {
    try {
      return execSync(`git config --local ${key}`, { cwd }).toString().trim();
    } catch {
      return null;
    }
  };

  const localName = getLocalGitConfig("user.name", src);
  const localEmail = getLocalGitConfig("user.email", src);

  // 3. Copy .git folder (explicitly requested)
  if (existsSync(join(src, ".git"))) {
    console.log(`[copyFolderRobustly] Copying .git folder to ${dest}`);
    cpSync(join(src, ".git"), join(dest, ".git"), { recursive: true });
  }

  // 4. Copy non-ignored files using git ls-files
  const filesToCopySet = new Set<string>();
  try {
    const gitFiles = execSync(`git ls-files -z -co --exclude-standard`, {
      cwd: src,
    })
      .toString()
      .split("\0")
      .filter((f) => f.trim().length > 0);
    gitFiles.forEach(f => filesToCopySet.add(f));
    console.log(`[copyFolderRobustly] Found ${gitFiles.length} files via git ls-files`);
  } catch (e) {
    console.warn(`[copyFolderRobustly] Git ls-files failed in ${src}, falling back to includeFiles only:`, e);
  }

  // Add explicitly included files even if ignored by git
  let explicitCount = 0;
  for (const file of includeFiles) {
    if (existsSync(join(src, file))) {
      filesToCopySet.add(file);
      explicitCount++;
    }
  }
  if (explicitCount > 0) {
    console.log(`[copyFolderRobustly] Added ${explicitCount} explicitly included files`);
  }

  const filesToCopy = Array.from(filesToCopySet);
  console.log(`[copyFolderRobustly] Copying total ${filesToCopy.length} files...`);

  for (const file of filesToCopy) {
    const srcFile = join(src, file);
    const destFile = join(dest, file);
    const destDir = join(destFile, "..");

    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }

    if (existsSync(srcFile) || lstatSync(srcFile).isSymbolicLink()) {
      try {
        const stats = lstatSync(srcFile);
        if (stats.isSymbolicLink()) {
          const target = readlinkSync(srcFile);
          symlinkSync(target, destFile);
        } else {
          copyFileSync(srcFile, destFile);
        }
      } catch (err) {
        console.error(`[copyFolderRobustly] Failed to copy file/link ${srcFile}:`, err);
      }
    }
  }

  // 5. Apply captured git config
  if (localName) {
    execSync(`git config --local user.name "${localName}"`, { cwd: dest });
  }
  if (localEmail) {
    execSync(`git config --local user.email "${localEmail}"`, { cwd: dest });
  }
  console.log(`[copyFolderRobustly] Successfully copied to ${dest}`);
}
