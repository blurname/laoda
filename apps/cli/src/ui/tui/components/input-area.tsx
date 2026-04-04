import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { InputMode } from "../../core/types.ts";

type InputAreaProps = {
  mode: InputMode;
  questionPrompt?: string;
  onSubmit: (value: string) => void;
};

export function InputArea({ mode, questionPrompt, onSubmit }: InputAreaProps) {
  const [value, setValue] = useState("");

  useInput((input, key) => {
    if (mode === "thinking" || mode === "running") return;

    if (key.return) {
      const submitted = value;
      setValue("");
      onSubmit(submitted);
      return;
    }
    if (key.backspace || key.delete) {
      setValue((v) => v.slice(0, -1));
      return;
    }
    if (!key.ctrl && !key.meta && input) {
      setValue((v) => v + input);
    }
  });

  if (mode === "thinking") {
    return (
      <Box>
        <Text dimColor> Thinking...</Text>
      </Box>
    );
  }

  if (mode === "running") {
    return (
      <Box>
        <Text dimColor> Running...</Text>
      </Box>
    );
  }

  const prompt = mode === "asking" && questionPrompt ? questionPrompt : "  > ";

  return (
    <Box>
      <Text>{prompt}</Text>
      <Text>{value}</Text>
      <Text dimColor>█</Text>
    </Box>
  );
}
