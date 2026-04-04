type QuestionFn = (prompt: string) => Promise<string>;
type Handler = (prompt: string, resolve: (answer: string) => void) => void;

let handler: Handler | null = null;

export function setQuestionHandler(h: Handler): void {
  handler = h;
}

export function createQuestionFn(): QuestionFn {
  return (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      if (handler) {
        handler(prompt, resolve);
      } else {
        resolve("");
      }
    });
  };
}
