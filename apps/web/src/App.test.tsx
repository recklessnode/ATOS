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

  it("renders the loaded six-tile fixture counts", () => {
    render(<App />);

    const status = screen.getByRole("region", { name: /scenario status/i });

    expect(within(status).getByRole("heading", { name: "Six Tile City Fixture" })).toBeInTheDocument();
    expect(within(status).getByText(/Schema version:\s*1/)).toBeInTheDocument();
    expect(within(status).getByText(/Tiles:\s*6/)).toBeInTheDocument();
    expect(within(status).getByText(/Guideway:\s*12 nodes \/ 12 links/)).toBeInTheDocument();
    expect(
      within(status).getByText(/Electrical:\s*12 nodes \/ 12 branches \/ 5 loads/),
    ).toBeInTheDocument();
    expect(within(status).getByText(/Stations:\s*1 \/ Service zones:\s*3/)).toBeInTheDocument();
    expect(within(status).getByText(/Vehicles:\s*4/)).toBeInTheDocument();
    expect(within(status).getByText(/Open chits:\s*4/)).toBeInTheDocument();
    expect(within(status).getByText(/Validation:\s*valid/)).toBeInTheDocument();
  });
});
