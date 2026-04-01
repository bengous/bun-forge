import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, test } from "vitest";
import { HomePage } from "./index";

describe("HomePage", () => {
  test("renders the project title", () => {
    const expectedTitle = "__PROJECT_NAME__";

    render(<HomePage />);
    expect(screen.getByRole("heading", { name: expectedTitle })).toBeDefined();
  });
});
