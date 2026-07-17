import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeploymentFooter } from "./DeploymentFooter";
import { resolveBuildMetadata } from "./build-metadata";

describe("deployment freshness metadata", () => {
  it("resolves build-time version, short SHA, commit date, and repository URL", () => {
    const metadata = resolveBuildMetadata({
      version: "0.5.0",
      commitSha: "b0928ac123456789",
      commitDate: "2026-07-11T12:34:56Z",
      repositoryUrl: "https://github.com/recklessnode/ATOS",
      source: "github-pages",
    });

    expect(metadata.version).toBe("0.5.0");
    expect(metadata.shortSha).toBe("b0928ac");
    expect(metadata.commitDate).toBe("07/11/2026");
    expect(metadata.label).toContain("ATOS v0.5.0");
  });

  it("uses truthful local-development fallbacks", () => {
    const metadata = resolveBuildMetadata({});

    expect(metadata.version).toBe("0.0.0");
    expect(metadata.shortSha).toBe("unknown");
    expect(metadata.commitDate).toBe("unknown date");
    expect(metadata.source).toBe("dev");
  });

  it("renders the persistent repository footer accessibly", () => {
    render(<DeploymentFooter metadata={resolveBuildMetadata({
      version: "0.5.0",
      shortSha: "b0928ac",
      commitDate: "2026-07-11T00:00:00Z",
    })} />);

    const footer = screen.getByRole("contentinfo", { name: /deployment freshness/i });
    expect(footer).toHaveTextContent("ATOS v0.5.0");
    expect(footer).toHaveTextContent("commit b0928ac");
    expect(footer).toHaveTextContent("07/11/2026");
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/recklessnode/ATOS",
    );
  });
});
