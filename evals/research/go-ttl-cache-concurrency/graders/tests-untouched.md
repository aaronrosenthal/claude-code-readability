---
type: regex
target: { source: file, path: cache/cache_test.go }
pattern: 'func TestConcurrentGetsLoadOnce[\s\S]*sync\.WaitGroup[\s\S]*loader called %d times, want 1'
---
