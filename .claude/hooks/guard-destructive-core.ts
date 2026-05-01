// Canonical source: template-sources/ai/.codex/hooks/guard-destructive-core.ts
// Synced targets: template-sources/ai/.claude/hooks/, .codex/hooks/, .claude/hooks/.

export type HookInput = {
  readonly tool_input?: {
    readonly command?: unknown;
  };
};

// Regex-matchable commands whose danger is expressible as a single literal
// shape. For anything with flag-order sensitivity (rm), we tokenise instead.
export const BLOCKED_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/git\s+push\s+--force-with-lease\b/, "git push --force-with-lease"],
  [/git\s+push\s+--force(?!-)/, "git push --force"],
  [/git\s+push\s+-f\b/, "git push -f"],
  [/git\s+reset\s+--hard\b/, "git reset --hard"],
  [/git\s+clean\s+-f/, "git clean -f"],
  [/git\s+checkout\s+\.$/, "git checkout ."],
  [/git\s+checkout\s+--\s+\.$/, "git checkout -- ."],
  [/git\s+restore\s+\.$/, "git restore ."],
  [/git\s+branch\s+-D\b/, "git branch -D"],
  [/git\s+stash\s+drop\b/, "git stash drop"],
  [/git\s+stash\s+clear\b/, "git stash clear"],
];

export const MERGE_HINT =
  "git merge without --ff-only (use `git rebase` then `git merge --ff-only` for linear history)";

export function stripStringLiterals(cmd: string): string {
  let stripped = cmd.replaceAll(/<<-?\s*'?(\w+)'?.*?\n[\s\S]*?\n\s*\1/g, "");
  stripped = stripped.replaceAll(/"(?:[^"\\]|\\.)*"/g, '""');
  stripped = stripped.replaceAll(/'[^']*'/g, "''");
  return stripped;
}

function tokenise(cmd: string): string[] {
  return cmd.trim().split(/\s+/).filter(Boolean);
}

export function checkRm(tokens: readonly string[]): string | null {
  if (tokens[0] !== "rm") {
    return null;
  }

  let shortLetters = "";
  const longFlags = new Set<string>();
  const positional: string[] = [];
  for (const token of tokens.slice(1)) {
    if (token.startsWith("--")) {
      longFlags.add(token);
    } else if (/^-[a-zA-Z]+$/.test(token)) {
      shortLetters += token.slice(1);
    } else {
      positional.push(token);
    }
  }

  const recursive = /[rR]/.test(shortLetters) || longFlags.has("--recursive");
  const force = shortLetters.includes("f") || longFlags.has("--force");
  const absoluteTarget = positional.some((value) => value.startsWith("/"));

  if (recursive && force) {
    return "rm recursive + force";
  }
  if (recursive && absoluteTarget) {
    return "rm recursive on absolute path";
  }
  return null;
}

export function checkCommand(cmd: string): string | null {
  const sanitized = stripStringLiterals(cmd);
  const rmMatch = checkRm(tokenise(sanitized));
  if (rmMatch !== null) {
    return rmMatch;
  }
  for (const [pattern, label] of BLOCKED_PATTERNS) {
    if (pattern.test(sanitized)) {
      return label;
    }
  }
  return null;
}

export function checkMergeGuard(cmd: string): string | null {
  const sanitized = stripStringLiterals(cmd);
  if (!/git\s+merge\b/.test(sanitized)) {
    return null;
  }
  if (/--ff-only/.test(sanitized)) {
    return null;
  }
  return MERGE_HINT;
}

export function parseHookInput(raw: string): string | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return null;
    }

    const toolInput = parsed["tool_input"];
    if (!isRecord(toolInput)) {
      return null;
    }

    const command = toolInput["command"];
    return typeof command === "string" ? command : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
