import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

export function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <p className="eyebrow">TanStack Router workspace</p>
        <h1>__PROJECT_NAME__</h1>
        <p>
          Frontend scaffolded from the official TanStack Router CLI and normalized by bun-forge.
        </p>
      </section>
    </main>
  );
}
