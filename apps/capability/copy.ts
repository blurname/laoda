import {
  existsSync,
  mkdirSync,
  copyFileSync,
  cpSync,
  lstatSync,
  readlinkSync,
  symlinkSync,
} from "fs";
import { join, basename } from "path";
import { execSync } from "child_process";

/**
 * Robustly copy a folder, preserving .git, symlinks, and git config.
 * Only copies git-tracked + untracked-but-not-ignored files, plus any explicitly included files.
 */
export function copyFolder(src: string, dest: string, includeFiles: string[] = []): void {
  if (!existsSync(src)) {
    throw new Error(`Source does not exist: ${src}`);
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

  // 3. Copy .git folder
  if (existsSync(join(src, ".git"))) {
    console.log(`[copy] .git -> ${dest}`);
    cpSync(join(src, ".git"), join(dest, ".git"), { recursive: true });
  }

  // 4. Collect files to copy via git ls-files
  const filesToCopySet = new Set<string>();
  try {
    const gitFiles = execSync("git ls-files -z -co --exclude-standard", { cwd: src })
      .toString()
      .split("\0")
      .filter((f) => f.trim().length > 0);
    gitFiles.forEach((f) => filesToCopySet.add(f));
    console.log(`[copy] ${gitFiles.length} files from git ls-files`);
  } catch (e) {
    console.warn(`[copy] git ls-files failed in ${src}, using includeFiles only:`, e);
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
    console.log(`[copy] +${explicitCount} explicitly included files`);
  }

  // 5. Copy each file
  const filesToCopy = Array.from(filesToCopySet);
  console.log(`[copy] copying ${filesToCopy.length} files...`);

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
        console.error(`[copy] failed: ${srcFile}:`, err);
      }
    }
  }

  // 6. Apply captured git config
  if (localName) {
    execSync(`git config --local user.name "${localName}"`, { cwd: dest });
  }
  if (localEmail) {
    execSync(`git config --local user.email "${localEmail}"`, { cwd: dest });
  }
  console.log(`[copy] done -> ${dest}`);
}

/**
 * Duplicate a folder with auto-incrementing suffix (e.g. myapp -> myapp-1 -> myapp-2).
 * Returns the new path.
 */
export function duplicateFolder(path: string, includeFiles: string[] = []): string {
  if (!existsSync(path)) {
    throw new Error(`Path does not exist: ${path}`);
  }

  const parentDir = join(path, "..");
  const fullName = basename(path);

  // Check if name already ends with "-number"
  const match = fullName.match(/^(.*?)-(\d+)$/);
  const baseName = match ? match[1] || fullName : fullName;
  let counter = match ? parseInt(match[2] || "0") + 1 : 1;

  let newPath = "";
  while (true) {
    const newName = `${baseName}-${counter}`;
    newPath = join(parentDir, newName);
    if (!existsSync(newPath)) break;
    counter++;
  }

  console.log(`[duplicate] ${path} -> ${newPath}`);
  copyFolder(path, newPath, includeFiles);
  return newPath;
}
