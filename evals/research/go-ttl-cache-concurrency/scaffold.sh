#!/usr/bin/env bash
set -euo pipefail
mkdir -p cache
cat > go.mod <<'EOF'
module example.com/profiles

go 1.21
EOF
cat > cache/clock.go <<'EOF'
package cache

import "time"

// Clock supplies the current time to the cache.
type Clock interface {
	Now() time.Time
}

// SystemClock is the Clock used in production.
type SystemClock struct{}

// Now returns the wall-clock time.
func (SystemClock) Now() time.Time {
	return time.Now()
}
EOF
cat > cache/cache.go <<'EOF'
package cache

import "time"

// Loader fetches the value for a key that is missing or expired.
type Loader[V any] func(key string) (V, error)

// Cache is a TTL cache that runs at most one load per key at a time.
type Cache[V any] struct {
}

// New returns an empty cache whose entries live for ttl.
func New[V any](ttl time.Duration, clock Clock, load Loader[V]) *Cache[V] {
	return &Cache[V]{}
}

// Get returns the cached value for key, loading it if it is missing or expired.
func (c *Cache[V]) Get(key string) (V, error) {
	var zero V
	return zero, nil
}
EOF
cat > cache/cache_test.go <<'EOF'
package cache

import (
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type fakeClock struct {
	mu  sync.Mutex
	now time.Time
}

func newFakeClock() *fakeClock {
	return &fakeClock{now: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)}
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(d)
}

func waitFor(t *testing.T, ch <-chan struct{}) {
	t.Helper()
	select {
	case <-ch:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for the loader to start")
	}
}

func countingLoader(calls *int32) Loader[string] {
	return func(key string) (string, error) {
		n := atomic.AddInt32(calls, 1)
		return key + "-" + string(rune('0'+n)), nil
	}
}

func TestGetServesFromCacheUntilTTL(t *testing.T) {
	var calls int32
	clock := newFakeClock()
	c := New(time.Minute, clock, countingLoader(&calls))

	first, _ := c.Get("alice")
	clock.Advance(59 * time.Second)
	second, _ := c.Get("alice")

	if first != "alice-1" || second != "alice-1" {
		t.Errorf("got %q then %q, want alice-1 both times", first, second)
	}
	if calls != 1 {
		t.Errorf("loader called %d times, want 1", calls)
	}
}

func TestGetReloadsAfterTTL(t *testing.T) {
	var calls int32
	clock := newFakeClock()
	c := New(time.Minute, clock, countingLoader(&calls))

	c.Get("alice")
	clock.Advance(time.Minute)
	got, _ := c.Get("alice")

	if got != "alice-2" {
		t.Errorf("got %q after expiry, want alice-2", got)
	}
}

func TestGetDoesNotCacheErrors(t *testing.T) {
	var calls int32
	boom := errors.New("db down")
	c := New(time.Minute, newFakeClock(), func(key string) (string, error) {
		if atomic.AddInt32(&calls, 1) == 1 {
			return "", boom
		}
		return "ok", nil
	})

	if _, err := c.Get("alice"); !errors.Is(err, boom) {
		t.Fatalf("first Get error = %v, want %v", err, boom)
	}
	got, err := c.Get("alice")
	if err != nil || got != "ok" {
		t.Errorf("second Get = %q, %v; want ok, nil", got, err)
	}
}

func TestConcurrentGetsLoadOnce(t *testing.T) {
	var calls int32
	started := make(chan struct{})
	release := make(chan struct{})
	c := New(time.Minute, newFakeClock(), func(key string) (string, error) {
		if atomic.AddInt32(&calls, 1) == 1 {
			close(started)
		}
		<-release
		return "profile", nil
	})

	const callers = 50
	results := make([]string, callers)
	var wg sync.WaitGroup
	for i := 0; i < callers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			results[i], _ = c.Get("alice")
		}(i)
	}

	waitFor(t, started)
	time.Sleep(20 * time.Millisecond)
	close(release)
	wg.Wait()

	if calls != 1 {
		t.Errorf("loader called %d times, want 1", calls)
	}
	for i, got := range results {
		if got != "profile" {
			t.Errorf("caller %d got %q, want profile", i, got)
		}
	}
}

func TestConcurrentGetsShareLoadError(t *testing.T) {
	var calls int32
	boom := errors.New("db down")
	started := make(chan struct{})
	release := make(chan struct{})
	c := New(time.Minute, newFakeClock(), func(key string) (string, error) {
		if atomic.AddInt32(&calls, 1) == 1 {
			close(started)
		}
		<-release
		return "", boom
	})

	const callers = 10
	errs := make([]error, callers)
	var wg sync.WaitGroup
	for i := 0; i < callers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, errs[i] = c.Get("alice")
		}(i)
	}

	waitFor(t, started)
	time.Sleep(20 * time.Millisecond)
	close(release)
	wg.Wait()

	for i, err := range errs {
		if !errors.Is(err, boom) {
			t.Errorf("caller %d error = %v, want %v", i, err, boom)
		}
	}
}

func TestSlowLoadDoesNotBlockOtherKeys(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	c := New(time.Minute, newFakeClock(), func(key string) (string, error) {
		if key == "slow" {
			close(started)
			<-release
		}
		return key, nil
	})

	slowDone := make(chan struct{})
	go func() {
		defer close(slowDone)
		c.Get("slow")
	}()
	waitFor(t, started)

	fastDone := make(chan string)
	go func() {
		got, _ := c.Get("fast")
		fastDone <- got
	}()

	select {
	case got := <-fastDone:
		if got != "fast" {
			t.Errorf("got %q, want fast", got)
		}
	case <-time.After(2 * time.Second):
		t.Error("Get(fast) blocked behind the load for slow")
	}

	close(release)
	<-slowDone
}
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
