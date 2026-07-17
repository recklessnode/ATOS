import { fireEvent, render, screen, within } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSimulationFixture } from "@atos/simulation";
import { SimulationWorkspace } from "./SimulationWorkspace";

describe("SimulationWorkspace", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the deterministic simulation workspace controls and panels", () => {
    render(<SimulationWorkspace inputOverride={createSimulationFixture("consist-formation-split")} />);

    const workspace = screen.getByRole("region", { name: "Simulation workspace" });
    expect(within(workspace).getByRole("heading", { name: "Simulation Event Log" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Simulation controls" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Simulation summary" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Active missions" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Guideway and service occupancy" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Event timeline" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Asset locations and battery state" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Reservation status" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Consist composition" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Fault schedule and active faults" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Replanning requests" })).toBeInTheDocument();
    expect(within(workspace).getByLabelText("Simulation scenario map")).toBeInTheDocument();
  });

  it("steps, advances, pauses, resets, and filters the event log", () => {
    render(<SimulationWorkspace inputOverride={createSimulationFixture("consist-formation-split")} />);

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    fireEvent.change(screen.getByLabelText("Playback speed"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Step to next event" }));
    fireEvent.click(screen.getByRole("button", { name: "Advance 60 seconds" }));

    const timeline = screen.getByRole("region", { name: "Event timeline" });
    expect(within(timeline).getAllByText("mission_accepted").length).toBeGreaterThan(0);

    const causalFilter = screen.getByLabelText("Filter events by causal chain") as HTMLSelectElement;
    const causalValue = Array.from(causalFilter.options).find((option) => option.value)?.value ?? "";
    expect(causalValue).not.toBe("");
    fireEvent.change(causalFilter, { target: { value: causalValue } });
    expect(within(timeline).getAllByRole("listitem").length).toBeGreaterThan(0);
    fireEvent.change(causalFilter, { target: { value: "" } });

    fireEvent.change(screen.getByLabelText("Filter events by type"), { target: { value: "mission_accepted" } });
    expect(within(timeline).getAllByText("mission_accepted").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Filter events by asset"), { target: { value: "vehicle-cargo-1" } });
    expect(within(timeline).getAllByText("mission_accepted").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Filter events from time"), { target: { value: "2026-07-10T00:00:00.000Z" } });
    fireEvent.change(screen.getByLabelText("Filter events to time"), { target: { value: "2026-07-10T00:30:00.000Z" } });
    expect(within(timeline).getAllByText("mission_accepted").length).toBeGreaterThan(0);

    fireEvent.click(within(screen.getByRole("region", { name: "Simulation controls" })).getByRole("button", { name: "Reset" }));
    expect(within(timeline).queryByText("mission_accepted")).not.toBeInTheDocument();
  });

  it("advances while Play is running, pauses the loop, and honors playback speed", () => {
    vi.useFakeTimers();
    render(<SimulationWorkspace inputOverride={createSimulationFixture("simple-passenger")} />);

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const timeline = screen.getByRole("region", { name: "Event timeline" });
    expect(within(timeline).getAllByText("mission_accepted").length).toBeGreaterThan(0);
    const countAfterPlay = within(timeline).getAllByRole("listitem").length;

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(within(timeline).getAllByRole("listitem")).toHaveLength(countAfterPlay);

    fireEvent.change(screen.getByLabelText("Playback speed"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(within(timeline).getAllByRole("listitem").length).toBeGreaterThanOrEqual(countAfterPlay);
  });

  it("focuses event and occupancy targets on the scenario map by stable ID", () => {
    render(<SimulationWorkspace inputOverride={createSimulationFixture("consist-formation-split")} />);

    const step = screen.getByRole("button", { name: "Step to next event" });
    for (let index = 0; index < 12; index += 1) {
      fireEvent.click(step);
    }

    expect(screen.getByRole("group", { name: "Live simulation occupancy overlay" })).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /Live (guideway|service) occupancy/ }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: /Focus event guideway_segment_entered/ })[0]);

    const details = screen.getByLabelText("Selection details");
    expect(details).not.toHaveTextContent("No object selected");
    expect(details).toHaveTextContent("guideway");
  });

  it("surfaces faults and replanning requests", () => {
    render(<SimulationWorkspace inputOverride={createSimulationFixture("asset-fault-replanning")} />);

    const step = screen.getByRole("button", { name: "Step to next event" });
    for (let index = 0; index < 12; index += 1) {
      fireEvent.click(step);
    }

    expect(screen.getByText("vehicle_unavailable")).toBeInTheDocument();
    expect(screen.getAllByText("replanning_requested").length).toBeGreaterThan(0);
  });

  it("keeps the Simulation workspace operable at phone width", () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    window.dispatchEvent(new Event("resize"));

    render(<SimulationWorkspace inputOverride={createSimulationFixture("consist-formation-split")} />);

    const workspace = screen.getByRole("region", { name: "Simulation workspace" });
    expect(within(workspace).getByRole("region", { name: "Simulation controls" })).toBeInTheDocument();
    expect(within(workspace).getByLabelText("Simulation scenario map")).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "Event timeline" })).toBeInTheDocument();

    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
  });
});
