---
type: regex
target: { source: file, path: src/webhook-handler.ts }
pattern: "// @ts-expect-error -- the SDK's types omit the 'priority' field \\(fixed in v5\\)\\n\\s*priority: 'high',"
---
