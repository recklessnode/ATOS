export type RawBuildMetadata = {
  version?: string;
  shortSha?: string;
  commitSha?: string;
  commitDate?: string;
  repositoryUrl?: string;
  source?: string;
};

export type BuildMetadata = {
  version: string;
  shortSha: string;
  commitDate: string;
  repositoryUrl: string;
  label: string;
  source: string;
};

export function resolveBuildMetadata(raw: RawBuildMetadata = {}): BuildMetadata {
  const version = raw.version?.trim() || "0.0.0";
  const commitSha = raw.shortSha?.trim() || raw.commitSha?.slice(0, 7) || "unknown";
  const commitDate = readableDate(raw.commitDate);
  const repositoryUrl = raw.repositoryUrl?.trim() || "https://github.com/recklessnode/ATOS";
  const source = raw.source?.trim() || "dev";
  return {
    version,
    shortSha: commitSha,
    commitDate,
    repositoryUrl,
    source,
    label: `ATOS v${version} · commit ${commitSha} · ${commitDate} · GitHub`,
  };
}

export const BUILD_METADATA = resolveBuildMetadata(
  typeof __ATOS_BUILD_METADATA__ === "undefined" ? {} : __ATOS_BUILD_METADATA__,
);

function readableDate(value: string | undefined): string {
  if (!value || value === "unknown") {
    return "unknown date";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unknown date";
  }
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(date);
}
