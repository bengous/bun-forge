#!/usr/bin/env bun

export interface HookInput {
  tool_input: {
    command: string;
  };
}

export const BLOCKED_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/rm\\s+-rf\\b/, "rm -rf"],
  [/rm\\s+-r\\s+\\//, "rm -r /"],
  [/rm\\s+(-[a-z]*r[a-z]*\\s+-[a-z]*f|-[a-z]*f[a-z]*\\s+-[a-z]*r)\\b/, "rm -r -f"],
  [/rm\\s+--recursive\\b/, "rm --recursive"],
  [/git\\s+push\\s+--force-with-lease\\b/, "git push --force-with-lease"],
  [/git\\s+push\\s+--force(?!-)/, "git push --force"],
  [/git\\s+push\\s+-f\\b/, "git push -f"],
  [/git\\s+reset\\s+--hard\\b/, "git reset --hard"],
  [/git\\s+clean\\s+-f/, "git clean -f"],
  [/git\\s+checkout\\s+\\.$/, "git checkout ."],
  [/git\\s+restore\\s+\\.$/, "git restore ."],
  [/git\\s+branch\\s+-D\\b/, "git branch -D"],
  [/git\\s+stash\\s+drop\\b/, "git stash drop"],
  [/git\\s+stash\\s+clear\\b/, "git stash clear"]
];

export function stripStringLiterals(cmd: string): string {
  let stripped = cmd.replace(/<<-?\\s*'?(\\w+)'?.*?\\n[\\s\\S]*?\\n\\s*\\1/g, "");
  stripped = stripped.replace(/"(?:[^"\\\\]|\\\\.)*"/g, '""');
  stripped = stripped.replace(/'[^']*'/g, "''");
  return stripped;
}

export function checkCommand(cmd: string): string | null {
  const sanitized = stripStringLiterals(cmd);
  for (const [pattern, label] of BLOCKED_PATTERNS) {
    if (pattern.test(sanitized)) {
      return label;
    }
  }
  return null;
}

export function parseHookInput(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as HookInput;
    return parsed.tool_input?.command ?? null;
  } catch {
    return null;
  }
}

if (import.meta.main) {
  const input = await Bun.stdin.text();
  const cmd = parseHookInput(input);
  if (!cmd) process.exit(0);

  const match = checkCommand(cmd);
  if (match) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `Destructive command blocked: ${match}\nCommand: ${cmd}`,
        },
      }),
    );
  }
}
