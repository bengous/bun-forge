<h1 align="center">bun-forge</h1>

<p align="center">
  <img src="./assets/brand/bun-forge-logo-full-640.png" alt="bun-forge logo: a smiling bun holding a forge hammer behind a code anvil" width="360" />
</p>

An opinionated Bun project starter for people who code with AI agents and want stronger guardrails from the first commit.

It will not eliminate AI slop. No scaffold can. What it can do is catch obvious bugs earlier, enforce a shared set of conventions, and give agents a project shape that is harder to damage by accident.

## Why this exists

This project started from a recurring frustration: too much time was going into correcting the same classes of agent mistakes across different repositories.

At first, the fix was manual. Add the tools. Add the hooks. Tighten the lint rules. Bump OXLint, Biome, or another checker when a new family of mistakes kept showing up. Repeat the same setup in the next repo. Fix the same category of issues again.

Eventually the pattern became clear: the problem should be handled closer to the source.

The result is a reusable project foundation: centralized, shareable, and intentionally opinionated, while still being something you can tweak per project later.

## What it gives you

- A Bun/TypeScript project baseline with conventions already in place
- Guardrails for common mistakes before they become review work
- A repeatable setup for repos that will be touched by humans and AI agents
- Tooling and hooks that keep the project honest during day-to-day changes
- A way to apply the same baseline to an existing project instead of rebuilding it manually

## Who it is for

It is useful if you:

- build Bun projects with AI coding agents
- want to start vibe coding with more guardrails
- keep seeing agents produce the same avoidable mistakes
- want conventions enforced by tools instead of remembered by humans
- need a shared baseline across several repositories

## What it is not

This is not a guarantee of good code. It will not replace judgment, review, tests, or product thinking.

It is a starting point that makes the easy mistakes harder, keeps conventions visible, and reduces the amount of cleanup needed before real work can begin.

## Start a new project

```bash
bunx bun-forge@0.1.0 my-app --yes
```

## Adopt an existing project

Apply the `bun-forge` baseline to an existing Bun/TypeScript project.

```bash
bunx bun-forge@0.1.0 adopt . --apply --yes
```

## In short

A starting point for people who want to code faster with AI without accepting the default mess that often comes with it.

## License

MIT
