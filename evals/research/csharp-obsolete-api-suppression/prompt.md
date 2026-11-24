---
description: Route one carrier through an obsolete vendored API in a project that treats warnings as errors.
tags: [research, csharp, required-suppression, obsolete-api]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Labels for NORDPOST shipments are being created through ParcelHub's v3 endpoint, which NORDPOST doesn't accept yet, so those orders are stuck at the warehouse. Please make `LabelService.Create` in the `Shipping` project use ParcelHub's v1 call for carrier code `NORDPOST` and keep using v3 for everything else.

`LabelClient` lives in `Vendor/ParcelHub` and is vendored third-party code, so we can't change it. Its `CreateLegacyLabel` method is marked `[Obsolete]`, but it's the only API that reaches NORDPOST, and we have to keep using it until NORDPOST migrates to v3 (their roadmap says next year). The tests in `Tests/Program.cs` cover the behavior; please don't edit them.

`Shipping` is built with warnings as errors and we want to keep it that way.

When you're done, run `dotnet run --project Tests` and save its complete output to `test-results.txt`.
