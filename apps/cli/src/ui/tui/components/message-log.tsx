import React from "react";
import { Box, Text, useStdout } from "ink";
import type { TuiMessage } from "../../core/types.ts";

type MessageLogProps = {
  messages: TuiMessage[];
};

export function MessageLog({ messages }: MessageLogProps) {
  const { stdout } = useStdout();
  const maxHeight = Math.max(3, (stdout?.rows ?? 24) - 14);
  const visible = messages.slice(-maxHeight);

  return (
    <Box flexDirection="column" height={maxHeight}>
      {visible.map((msg) => (
        <Text key={msg.id}>{msg.text}</Text>
      ))}
    </Box>
  );
}
