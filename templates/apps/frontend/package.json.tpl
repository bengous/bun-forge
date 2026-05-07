{
  "name": "@__PACKAGE_NAME__/frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite dev --port 3000",
    "build": "vite build && tsc -b --pretty false",
    "test": "vitest run --environment jsdom",
    "typecheck": "tsc -b --pretty false",
    "lint": "oxlint --type-aware -c .oxlintrc.jsonc --format=unix src/ e2e/ vite.config.ts playwright.config.ts",
    "lint:errors": "oxlint --type-aware -c .oxlintrc.jsonc --quiet --format=unix src/ e2e/ vite.config.ts playwright.config.ts",
    "format": "oxfmt --write -c .oxfmtrc.jsonc src/ e2e/ vite.config.ts playwright.config.ts",
    "format:check": "oxfmt --check -c .oxfmtrc.jsonc src/ e2e/ vite.config.ts playwright.config.ts",
    "lint:css": "stylelint \"src/**/*.css\"",
    "autofix": "oxlint --type-aware -c .oxlintrc.jsonc --fix src/ e2e/ vite.config.ts playwright.config.ts && oxfmt --write -c .oxfmtrc.jsonc src/ e2e/ vite.config.ts playwright.config.ts",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tanstack/react-router": "1.169.2",
    "react": "19.2.6",
    "react-dom": "19.2.6"
  },
  "devDependencies": {
    "@playwright/test": "1.59.1",
    "@tanstack/router-plugin": "1.167.35",
    "@testing-library/dom": "10.4.1",
    "@testing-library/jest-dom": "6.9.1",
    "@testing-library/react": "16.3.2",
    "@types/node": "25.6.0",
    "@types/react": "19.2.14",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.0.1",
    "jsdom": "29.1.1",
    "oxfmt": "0.48.0",
    "oxlint": "1.63.0",
    "oxlint-tsgolint": "0.22.1",
    "stylelint": "17.11.0",
    "typescript": "6.0.3",
    "vite": "8.0.11",
    "vitest": "4.1.5"
  }
}
