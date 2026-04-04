import React from "react";
import { Box, Text } from "ink";

type HeaderProps = {
  project: string;
  agent: string;
  model: string;
};

export function Header({ project, agent, model }: HeaderProps) {
  return (
    <Box>
      <Text bold>LAODA</Text>
      <Text dimColor> {project}</Text>
      <Text> </Text>
      <Text dimColor>{agent}</Text>
      <Text dimColor> · </Text>
      <Text dimColor>{model}</Text>
    </Box>
  );
}
