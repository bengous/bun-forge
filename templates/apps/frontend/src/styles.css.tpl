:root {
  color-scheme: light;
  font-family: "Inter", "Segoe UI", sans-serif;
  background: #f6f7fb;
  color: #10243b;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at top, rgba(70, 122, 255, 0.12), transparent 36%),
    linear-gradient(180deg, #fbfcff 0%, #eef3ff 100%);
}

a {
  color: inherit;
}

.page-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px;
}

.hero-card {
  width: min(680px, 100%);
  border: 1px solid rgba(16, 36, 59, 0.08);
  border-radius: 24px;
  padding: 40px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 24px 60px rgba(41, 73, 136, 0.12);
}

.hero-card h1 {
  margin: 0 0 12px;
  font-size: clamp(2.2rem, 5vw, 4rem);
  line-height: 0.95;
}

.hero-card p {
  margin: 0;
  max-width: 52ch;
  font-size: 1.05rem;
  line-height: 1.6;
  color: #4a5d78;
}

.eyebrow {
  margin-bottom: 12px;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #355dff;
}
