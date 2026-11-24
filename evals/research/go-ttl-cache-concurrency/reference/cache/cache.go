package cache

import (
	"sync"
	"time"
)

// Loader fetches the value for a key that is missing or expired.
type Loader[V any] func(key string) (V, error)

type entry[V any] struct {
	value     V
	expiresAt time.Time
}

type inflightLoad[V any] struct {
	done  chan struct{}
	value V
	err   error
}

// Cache is a TTL cache that runs at most one load per key at a time.
type Cache[V any] struct {
	ttl   time.Duration
	clock Clock
	load  Loader[V]

	mu       sync.Mutex
	entries  map[string]entry[V]
	inflight map[string]*inflightLoad[V]
}

// New returns an empty cache whose entries live for ttl.
func New[V any](ttl time.Duration, clock Clock, load Loader[V]) *Cache[V] {
	return &Cache[V]{
		ttl:      ttl,
		clock:    clock,
		load:     load,
		entries:  make(map[string]entry[V]),
		inflight: make(map[string]*inflightLoad[V]),
	}
}

// Get returns the cached value for key, loading it if it is missing or expired.
func (c *Cache[V]) Get(key string) (V, error) {
	c.mu.Lock()
	if e, ok := c.entries[key]; ok && c.clock.Now().Before(e.expiresAt) {
		c.mu.Unlock()
		return e.value, nil
	}
	if pending, ok := c.inflight[key]; ok {
		c.mu.Unlock()
		<-pending.done
		return pending.value, pending.err
	}
	pending := &inflightLoad[V]{done: make(chan struct{})}
	c.inflight[key] = pending
	c.mu.Unlock()

	pending.value, pending.err = c.load(key)

	c.mu.Lock()
	delete(c.inflight, key)
	if pending.err == nil {
		c.entries[key] = entry[V]{value: pending.value, expiresAt: c.clock.Now().Add(c.ttl)}
	}
	c.mu.Unlock()
	close(pending.done)

	return pending.value, pending.err
}
