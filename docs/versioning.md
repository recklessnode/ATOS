# ATOS Prototype Versioning

ATOS uses the root `package.json` version as the visible prototype build version. Vite injects that value, the current commit SHA, and the commit date at build time so a deployed static page can identify exactly what code it represents.

The prototype version is deterministic for a given build, but it is not a public API stability guarantee. Until the API is mature, version changes are lightweight:

- patch versions cover focused fixes, validation improvements, and small UI or documentation updates;
- minor versions cover new prototype workspaces, packages, scenario capabilities, or visible workflow slices;
- major versions are reserved for future schema or public API breaks once ATOS declares stable external contracts.

Local development builds use truthful fallbacks such as `unknown` for unavailable commit metadata. Pull requests should record the visible version and relevant build metadata in provenance and PR summaries when deployment behavior changes.
