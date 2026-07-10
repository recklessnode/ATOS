import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { WORKSPACES } from "./workspaces";

describe("ATOS web shell", () => {
  it("defines the four required workspaces", () => {
    expect(WORKSPACES.map((workspace) => workspace.name)).toEqual([
      "Layout",
      "Power",
      "Capacity",
      "Dispatch",
    ]);
  });

  it("renders navigation and placeholders for every workspace", () => {
    render(<App />);

    const nav = screen.getByRole("navigation", { name: /atos workspaces/i });
    const placeholderRegion = screen.getByRole("region", {
      name: /workspace placeholders/i,
    });

    for (const workspace of WORKSPACES) {
      expect(within(nav).getByRole("link", { name: workspace.name })).toHaveAttribute(
        "href",
        `#${workspace.id}`,
      );
      expect(
        within(placeholderRegion).getByRole("heading", { name: workspace.name }),
      ).toBeInTheDocument();
    }
  });
});
