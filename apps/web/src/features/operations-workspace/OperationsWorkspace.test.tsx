import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OperationsWorkspace } from "./OperationsWorkspace";

describe("OperationsWorkspace", () => {
  it("renders closed-loop operations panels and map", () => {
    render(<OperationsWorkspace />);

    const workspace = screen.getByRole("region", { name: "Operations workspace" });
    expect(within(workspace).getByRole("heading", { name: "Closed-Loop Operations" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Operations controls" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Operations summary" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Planning generations" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Pending requests and policy decisions" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Plan diff" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Reservation reconciliation" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Incident correlation" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Deficiency carry-forward" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Operations metrics" })).toBeInTheDocument();
    expect(within(workspace).getByLabelText("Operations scenario map")).toBeInTheDocument();
  });

  it("applies pending replans and manual deterministic replans", () => {
    render(<OperationsWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "Apply pending replan" }));
    expect(screen.getByRole("region", { name: "Plan diff" })).not.toHaveTextContent("No revised planning generation");
    expect(screen.getByRole("region", { name: "Reservation reconciliation" })).not.toHaveTextContent("No reservation reconciliation");

    fireEvent.click(screen.getByRole("button", { name: "Manual deterministic replan" }));
    expect(screen.getAllByText(/planning-generation:operations:scenario-six-tile-city-v1:2/).length).toBeGreaterThan(0);
  });

  it("focuses incident targets on the shared map by stable ID", () => {
    render(<OperationsWorkspace />);

    const incidentPanel = screen.getByRole("region", { name: "Incident correlation" });
    fireEvent.click(within(incidentPanel).getAllByRole("button", { name: /Focus incident/ })[0]);

    const details = screen.getByLabelText("Selection details");
    expect(details).not.toHaveTextContent("No object selected");
  });

  it("keeps Operations usable at phone width", () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    window.dispatchEvent(new Event("resize"));

    render(<OperationsWorkspace />);

    const workspace = screen.getByRole("region", { name: "Operations workspace" });
    expect(within(workspace).getByRole("region", { name: "Operations controls" })).toBeInTheDocument();
    expect(within(workspace).getByLabelText("Operations scenario map")).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Operations metrics" })).toBeInTheDocument();

    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
  });
});
