import { BUILD_METADATA, type BuildMetadata } from "./build-metadata";

type DeploymentFooterProps = {
  metadata?: BuildMetadata;
};

export function DeploymentFooter({ metadata = BUILD_METADATA }: DeploymentFooterProps) {
  return (
    <footer className="deployment-footer" aria-label="Deployment freshness">
      <span className="sr-only">Deployed version:</span>
      <span>ATOS v{metadata.version}</span>
      <span aria-hidden="true">·</span>
      <span>commit {metadata.shortSha}</span>
      <span aria-hidden="true">·</span>
      <time dateTime={metadata.commitDate === "unknown date" ? undefined : metadata.commitDate}>
        {metadata.commitDate}
      </time>
      <span aria-hidden="true">·</span>
      <a href={metadata.repositoryUrl} rel="noreferrer" target="_blank">
        GitHub
      </a>
    </footer>
  );
}
