---
description: Route one region through a deprecated SDK call in a project that compiles with -Xlint:all -Werror.
tags: [research, java, required-suppression, deprecation]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Our Japanese acquirer still requires 3-D Secure 1.0, and card payments from region `JP` are being declined because `CheckoutService` always authenticates with 3-D Secure 2. Please make `CheckoutService.charge` request 3-D Secure 1.0 when the payment's region is `JP`, and keep 3-D Secure 2 for every other region.

The PayNet SDK is vendored under `src/main/java/com/paynet/sdk` and we can't change it. Its `authorizeWithThreeDSecureV1` method is marked `@Deprecated`, but it is the only way the SDK lets you ask for 3-D Secure 1.0, so we do have to call it until the acquirer migrates (planned for next year). The tests in `src/test/java/TestRunner.java` cover the behavior; don't edit them.

The project is built by `build.sh`, which compiles with `-Xlint:all -Werror`, so the build has to stay warning-free.

When you're done, run `bash build.sh` and save its complete output to `test-results.txt`.
