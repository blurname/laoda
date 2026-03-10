const args = process.argv.slice(2);

if (args.includes("--web")) {
  // Remove --web from args before passing to server
  const idx = args.indexOf("--web");
  args.splice(idx, 1);
  // Re-inject cleaned args
  process.argv = [process.argv[0]!, process.argv[1]!, ...args];
  await import("./apps/server/index.ts");
} else if (args.includes("--help") || args.includes("-h")) {
  const { renderHelp } = await import("./apps/cli/src/render.ts");
  renderHelp();
} else {
  const { runCli } = await import("./apps/cli/index.ts");
  await runCli(args);
}
