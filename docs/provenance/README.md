# AI Contribution Provenance

This project records AI contribution provenance so future maintainers can audit what was requested, what was actually observable at runtime, and which parts of the codebase were affected by each AI-assisted change.

Provenance is not an authorship claim. It is an audit trail for review, maintenance, and accountability. It helps answer practical questions such as which issue a change belonged to, which role the user requested, which model capability was actually available, which files or packages were touched, and which tests were run.

Requested roles such as Sol, Terra, and Luna may describe desired review or implementation boundaries, but they do not necessarily correspond to selectable runtime models in a given Codex environment. When the exact runtime model is not exposed, provenance must record that truthfully. Do not substitute or invent a model identifier. Use a value such as `inherited-model-unreported` and record `model_override_available: false` when that is the observable state.

Source-file authorship headers are intentionally avoided. Files accumulate edits from multiple people, tools, and follow-up changes over time. Per-file headers become stale quickly and can imply ownership that is not true. Provenance belongs in append-only documentation and commit history, not in source banners.

Future maintainers can audit AI-assisted work by combining:

- commit SHA and commit trailers;
- pull request and issue numbers;
- package or file path listed in `ai-contributions.ndjson`;
- local `git blame`, `git log -L`, or PR diff file ranges;
- the requested role and actual model/runtime fields;
- test results and known limitations recorded for the contribution.

For file-range review, prefer Git history over static line numbers in this directory because source files move and change. Start with the NDJSON record for a commit, inspect the commit diff, then narrow by package, file, function, or line range using Git.
