#!/usr/bin/env bash
set -euo pipefail
mkdir -p webhook
cat > go.mod <<'EOF'
module example.com/notifier

go 1.21
EOF
cat > webhook/event.go <<'EOF'
package webhook

import (
	"encoding/json"
	"fmt"
)

// Event is the payload delivered to a customer endpoint.
type Event struct {
	ID      string          `json:"id"`
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// StatusError reports a non-2xx response from the receiving endpoint.
type StatusError struct {
	Code int
}

func (e *StatusError) Error() string {
	return fmt.Sprintf("webhook: endpoint responded with status %d", e.Code)
}
EOF
cat > webhook/client.go <<'EOF'
package webhook

import (
	"context"
	"net/http"
	"time"
)

// Client delivers signed webhook events.
type Client struct {
	HTTP        *http.Client
	Secret      []byte
	MaxAttempts int
	Backoff     func(failedAttempt int) time.Duration
}

// Deliver posts event to url, retrying server errors and network failures.
func (c *Client) Deliver(ctx context.Context, url string, event Event) error {
	return nil
}
EOF
cat > webhook/client_test.go <<'EOF'
package webhook

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

var testEvent = Event{ID: "evt_123", Type: "invoice.paid", Payload: []byte(`{"amount":4200}`)}

type recorder struct {
	mu       sync.Mutex
	bodies   [][]byte
	headers  []http.Header
	statuses []int
}

func (r *recorder) handler(w http.ResponseWriter, req *http.Request) {
	body, _ := io.ReadAll(req.Body)

	r.mu.Lock()
	call := len(r.bodies)
	r.bodies = append(r.bodies, body)
	r.headers = append(r.headers, req.Header.Clone())
	status := r.statuses[len(r.statuses)-1]
	if call < len(r.statuses) {
		status = r.statuses[call]
	}
	r.mu.Unlock()

	w.WriteHeader(status)
}

func (r *recorder) calls() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.bodies)
}

func newServer(t *testing.T, statuses ...int) (*httptest.Server, *recorder) {
	t.Helper()
	rec := &recorder{statuses: statuses}
	server := httptest.NewServer(http.HandlerFunc(rec.handler))
	t.Cleanup(server.Close)
	return server, rec
}

func newClient() *Client {
	return &Client{Secret: []byte("whsec_test"), Backoff: func(int) time.Duration { return time.Millisecond }}
}

func TestDeliverSignsBody(t *testing.T) {
	server, rec := newServer(t, http.StatusOK)

	if err := newClient().Deliver(context.Background(), server.URL, testEvent); err != nil {
		t.Fatalf("Deliver() error = %v", err)
	}

	if rec.calls() != 1 {
		t.Fatalf("server saw %d calls, want 1", rec.calls())
	}
	mac := hmac.New(sha256.New, []byte("whsec_test"))
	mac.Write(rec.bodies[0])
	wantSignature := "sha256=" + hex.EncodeToString(mac.Sum(nil))

	h := rec.headers[0]
	if got := h.Get("X-Webhook-Signature"); got != wantSignature {
		t.Errorf("signature = %q, want %q", got, wantSignature)
	}
	if got := h.Get("X-Webhook-Event-ID"); got != "evt_123" {
		t.Errorf("event ID header = %q, want evt_123", got)
	}
	if got := h.Get("Content-Type"); got != "application/json" {
		t.Errorf("content type = %q, want application/json", got)
	}
	if want := `{"id":"evt_123","type":"invoice.paid","payload":{"amount":4200}}`; string(rec.bodies[0]) != want {
		t.Errorf("body = %s, want %s", rec.bodies[0], want)
	}
}

func TestDeliverRetriesServerErrorsWithSameBody(t *testing.T) {
	server, rec := newServer(t, http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusOK)

	if err := newClient().Deliver(context.Background(), server.URL, testEvent); err != nil {
		t.Fatalf("Deliver() error = %v", err)
	}

	if rec.calls() != 3 {
		t.Fatalf("server saw %d calls, want 3", rec.calls())
	}
	for i := 1; i < 3; i++ {
		if string(rec.bodies[i]) != string(rec.bodies[0]) {
			t.Errorf("attempt %d body differs from the first attempt", i+1)
		}
		if rec.headers[i].Get("X-Webhook-Signature") != rec.headers[0].Get("X-Webhook-Signature") {
			t.Errorf("attempt %d signature differs from the first attempt", i+1)
		}
	}
}

func TestDeliverDoesNotRetryClientErrors(t *testing.T) {
	server, rec := newServer(t, http.StatusGone)

	err := newClient().Deliver(context.Background(), server.URL, testEvent)

	var statusErr *StatusError
	if !errors.As(err, &statusErr) || statusErr.Code != http.StatusGone {
		t.Fatalf("Deliver() error = %v, want StatusError 410", err)
	}
	if rec.calls() != 1 {
		t.Errorf("server saw %d calls, want 1", rec.calls())
	}
}

func TestDeliverGivesUpAfterMaxAttempts(t *testing.T) {
	server, rec := newServer(t, http.StatusServiceUnavailable)

	err := newClient().Deliver(context.Background(), server.URL, testEvent)

	var statusErr *StatusError
	if !errors.As(err, &statusErr) || statusErr.Code != http.StatusServiceUnavailable {
		t.Fatalf("Deliver() error = %v, want wrapped StatusError 503", err)
	}
	if rec.calls() != 3 {
		t.Errorf("default attempts: server saw %d calls, want 3", rec.calls())
	}

	client := newClient()
	client.MaxAttempts = 5
	rec.mu.Lock()
	rec.bodies = nil
	rec.mu.Unlock()
	client.Deliver(context.Background(), server.URL, testEvent)
	if rec.calls() != 5 {
		t.Errorf("MaxAttempts=5: server saw %d calls, want 5", rec.calls())
	}
}

func TestDeliverRetriesNetworkErrors(t *testing.T) {
	server, _ := newServer(t, http.StatusOK)
	url := server.URL
	server.Close()

	var waits int
	client := newClient()
	client.Backoff = func(failedAttempt int) time.Duration {
		waits++
		return time.Millisecond
	}

	if err := client.Deliver(context.Background(), url, testEvent); err == nil {
		t.Fatal("Deliver() error = nil, want a network error")
	}
	if waits != 2 {
		t.Errorf("backoff consulted %d times, want 2", waits)
	}
}

func TestDeliverStopsWhenContextCancelledDuringBackoff(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	rec := &recorder{statuses: []int{http.StatusInternalServerError}}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec.handler(w, r)
		cancel()
	}))
	defer server.Close()

	client := newClient()
	client.Backoff = func(int) time.Duration { return time.Hour }

	done := make(chan error, 1)
	go func() { done <- client.Deliver(ctx, server.URL, testEvent) }()

	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Errorf("Deliver() error = %v, want context.Canceled", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Deliver() did not return after the context was cancelled")
	}
	if rec.calls() != 1 {
		t.Errorf("server saw %d calls, want 1", rec.calls())
	}
}
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
