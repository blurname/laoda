export const StatusPrefix = {
  MOVING: "Moving",
  GROUPING: "Grouping",
  UNGROUPING: "Ungrouping",
  COPYING: "Copying",
  IMPORTING: "Importing",
} as const;

export type StatusPrefixType = typeof StatusPrefix[keyof typeof StatusPrefix];

export const formatStatusName = (prefix: string, name: string) => `${prefix}: ${name}`;

export const stripStatusPrefix = (name: string) => {
  const prefixes = Object.values(StatusPrefix);
  for (const prefix of prefixes) {
    if (name.startsWith(`${prefix}: `)) {
      return name.slice(prefix.length + 2);
    }
  }
  return name;
};
