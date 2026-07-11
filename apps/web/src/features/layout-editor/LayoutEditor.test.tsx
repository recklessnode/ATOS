import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LayoutEditor } from "./LayoutEditor";

describe("LayoutEditor", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the editor workspace, catalogs, map, diagnostics, and file controls", () => {
    render(<LayoutEditor />);

    const workspace = screen.getByRole("region", { name: "Layout editor workspace" });
    expect(within(workspace).getByRole("heading", { name: "Scenario Layout Editor" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Tile library" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Set-piece library" })).toBeInTheDocument();
    expect(within(workspace).getByLabelText("Editable ATOS scenario draft map")).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Editor diagnostics" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Scenario import export and autosave" })).toBeInTheDocument();
  });

  it("places a tile through explicit coordinate controls", () => {
    render(<LayoutEditor />);

    fireEvent.click(screen.getByRole("button", { name: /Blank utility tile/i }));
    fireEvent.change(screen.getByLabelText("Target q coordinate"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Target r coordinate"), { target: { value: "-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Place" }));

    expect(screen.getByTestId("layout-tile-tile-blank-utility-tile-4--2")).toBeInTheDocument();
    expect(screen.getByText(/Added blank-utility-tile/)).toBeInTheDocument();
  });

  it("places a set piece on a selected allowed host tile", () => {
    render(<LayoutEditor />);

    fireEvent.click(screen.getByTestId("layout-tile-tile-power"));
    fireEvent.click(screen.getByRole("button", { name: /Utility cabinet/i }));
    fireEvent.click(screen.getByRole("button", { name: "Place" }));

    expect(screen.getByTestId("layout-set-piece-sp-utility-cabinet-tile-power")).toBeInTheDocument();
    expect(screen.getByText(/Added utility-cabinet/)).toBeInTheDocument();
  });

  it("requires explicit confirmation for warning-level guideway placement", () => {
    render(<LayoutEditor />);

    fireEvent.click(screen.getByRole("button", { name: /Straight guideway/i }));
    fireEvent.change(screen.getByLabelText("Target q coordinate"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Target r coordinate"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Place" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/valid with warnings/i);
    fireEvent.click(screen.getByRole("button", { name: "Commit warning edit" }));

    expect(screen.getByTestId("layout-tile-tile-straight-guideway-20-0")).toBeInTheDocument();
  });

  it("supports keyboard-only placement on map target coordinates", () => {
    render(<LayoutEditor />);

    fireEvent.click(screen.getByRole("button", { name: /Blank utility tile/i }));
    const candidate = screen.getAllByTestId(/candidate-/)[0] as HTMLElement;
    const candidateId = candidate.getAttribute("data-testid") ?? "";

    fireEvent.keyDown(candidate, { key: "Enter" });

    const coordinate = candidateId.replace("candidate-", "");
    expect(screen.getByTestId(`layout-tile-tile-blank-utility-tile-${coordinate.replace(",", "-")}`)).toBeInTheDocument();
  });

  it("moves, rotates, duplicates, deletes, undoes, and redoes selected tiles", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<LayoutEditor />);

    fireEvent.click(screen.getByRole("button", { name: /Blank utility tile/i }));
    fireEvent.change(screen.getByLabelText("Target q coordinate"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Target r coordinate"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Place" }));
    fireEvent.click(screen.getByTestId("layout-tile-tile-blank-utility-tile-5-0"));

    fireEvent.change(screen.getByLabelText("Target q coordinate"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    fireEvent.click(screen.getByRole("button", { name: "Rotate CW" }));
    fireEvent.change(screen.getByLabelText("Target q coordinate"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.getByText(/Redid the edit/)).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("previews and rejects power recommendations with before-after metrics", () => {
    render(<LayoutEditor />);

    fireEvent.change(screen.getByLabelText("Power preset"), {
      target: { value: "brownout_stress" },
    });
    const recommendations = screen.getByRole("region", { name: "Recommendation preview" });
    fireEvent.click(within(recommendations).getAllByRole("button", { name: "Preview" })[0] as HTMLElement);

    expect(within(recommendations).getByRole("button", { name: "Accept Preview" })).toBeEnabled();
    expect(within(recommendations).getByText("Minimum node voltage")).toBeInTheDocument();
    fireEvent.click(within(recommendations).getByRole("button", { name: "Reject Preview" }));
    expect(screen.getByText(/Rejected recommendation preview/)).toBeInTheDocument();
  });

  it("rejects invalid imports and recovers local autosave", () => {
    render(<LayoutEditor />);

    fireEvent.change(screen.getByLabelText("Import scenario JSON"), { target: { value: "{ broken" } });
    fireEvent.click(screen.getByRole("button", { name: "Import Draft" }));
    expect(screen.getByText(/invalid_json/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save Locally" }));
    fireEvent.click(screen.getByRole("button", { name: "Recover Local" }));
    expect(screen.getByText(/Recovered autosave/)).toBeInTheDocument();
  });

  it("keeps controls available at phone width", () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    window.dispatchEvent(new Event("resize"));

    render(<LayoutEditor />);

    expect(screen.getByLabelText("Search tile library")).toBeInTheDocument();
    expect(screen.getByLabelText("Target q coordinate")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Place" })).toBeInTheDocument();
    expect(screen.getByLabelText("Editable ATOS scenario draft map")).toBeInTheDocument();

    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
  });
});
