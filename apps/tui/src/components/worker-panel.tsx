import React from "react";
import { Box, Text } from "ink";
import type { WorkerDisplay } from "@laoda/ui-core";

type WorkerPanelProps = {
  workers: WorkerDisplay[];
};

function statusIcon(w: WorkerDisplay): { icon: string; color: string } {
  if (w.status === "missing") return { icon: "?", color: "red" };
  if (w.status === "busy") return { icon: "⟳", color: "cyan" };
  if (w.gitClean === false) return { icon: "~", color: "yellow" };
  return { icon: "✓", color: "green" };
}

export function WorkerPanel({ workers }: WorkerPanelProps) {
  if (workers.length === 0) {
    return (
      <Box>
        <Text dimColor>No workers</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold dimColor>
        Workers
      </Text>
      {workers.map((w) => {
        const { icon, color } = statusIcon(w);
        return (
          <Box key={w.label} gap={1}>
            <Text dimColor>{w.label.padEnd(5)}</Text>
            <Text color={color}>{icon}</Text>
            <Text>{w.status.padEnd(8)}</Text>
            <Text>{(w.task ?? "").slice(0, 25).padEnd(25)}</Text>
            <Text dimColor>{w.folder}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
