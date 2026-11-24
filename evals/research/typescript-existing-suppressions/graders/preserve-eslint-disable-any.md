---
type: regex
target: { source: file, path: src/webhook-handler.ts }
pattern: "// eslint-disable-next-line @typescript-eslint/no-explicit-any -- webhook payloads are untyped JSON from the provider\\n\\s*const event: any = JSON\\.parse\\(rawBody\\);"
---
