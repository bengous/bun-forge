#!/usr/bin/env bun

/**
 * PreToolUse hook for Bash — blocks destructive commands.
 * Receives Claude Code tool JSON on stdin.
 *
 * Strips quoted strings and heredocs before matching so that commit messages
 * or echo statements describing destructive commands don't trigger the guard.
 *
 * Output strategy (PreToolUse, per official hook protocol):
 *   exit 0 + JSON stdout with hookSpecificOutput.permissionDecision:"deny"
 *   hookSpecificOutput.hookEventName must be "PreToolUse"
 *   permissionDecisionReason is shown to Claude on deny.
 */

export interface HookInput {
	tool_input: {
		command: string;
	};
}

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

export function stripStringLiterals(cmd: string): string {
	// Strip heredocs: <<'EOF' ... EOF, <<"EOF" ... EOF, <<EOF ... EOF
	let stripped = cmd.replace(
		/<<-?\s*'?(\w+)'?.*?\n[\s\S]*?\n\s*\1/g,
		"",
	);
	// Strip double-quoted strings (non-greedy, respecting escapes)
	stripped = stripped.replace(/"(?:[^"\\]|\\.)*"/g, '""');
	// Strip single-quoted strings (no escapes in single quotes)
	stripped = stripped.replace(/'[^']*'/g, "''");
	return stripped;
}

// Best-effort tokeniser for the simple `rm …` shape. We ignore heredocs
// (already stripped), quoted strings (already blanked to ""/''), and
// variable expansion (out of scope — documented non-goal).
function tokenise(cmd: string): string[] {
	return cmd.trim().split(/\s+/).filter(Boolean);
}

// Detect dangerous `rm` invocations regardless of flag order or bundling.
// Matches: -rf, -fr, -Rf, -fR, -Rvf, -r -f, --recursive --force, …
// Also matches recursive deletion targeting `/` even without -f.
export function checkRm(tokens: readonly string[]): string | null {
	if (tokens[0] !== "rm") return null;

	let shortLetters = "";
	const longFlags = new Set<string>();
	const positional: string[] = [];
	for (const t of tokens.slice(1)) {
		if (t.startsWith("--")) longFlags.add(t);
		else if (/^-[a-zA-Z]+$/.test(t)) shortLetters += t.slice(1);
		else positional.push(t);
	}

	const recursive = /[rR]/.test(shortLetters) || longFlags.has("--recursive");
	const force = shortLetters.includes("f") || longFlags.has("--force");
	const absoluteTarget = positional.some((p) => p.startsWith("/"));

	if (recursive && force) return "rm recursive + force";
	if (recursive && absoluteTarget) return "rm recursive on absolute path";
	return null;
}

export function checkCommand(cmd: string): string | null {
	const sanitized = stripStringLiterals(cmd);
	const rmMatch = checkRm(tokenise(sanitized));
	if (rmMatch) return rmMatch;
	for (const [pattern, label] of BLOCKED_PATTERNS) {
		if (pattern.test(sanitized)) {
			return label;
		}
	}
	return null;
}

const MERGE_HINT =
	"git merge without --ff-only (use `git rebase` then `git merge --ff-only` for linear history)";

export function checkMergeGuard(cmd: string): string | null {
	const sanitized = stripStringLiterals(cmd);
	if (!/git\s+merge\b/.test(sanitized)) return null;
	if (/--ff-only/.test(sanitized)) return null;
	return MERGE_HINT;
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
	if (!cmd) {
		process.exit(0);
	}

	const match = checkCommand(cmd) ?? checkMergeGuard(cmd);
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
