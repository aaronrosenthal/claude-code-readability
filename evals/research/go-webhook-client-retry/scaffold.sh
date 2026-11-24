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
	"strings"
	"sync"
	"testing"
	"time"
)

var testEvent = Event{ID: "evt_123", Type: "invoice.paid", Payload: []byte(`{"amount":4200}`)}

const endpoint = "https://hooks.example.test/deliveries"

var errConnectionRefused = errors.New("connection refused")

type recorder struct {
	mu        sync.Mutex
	bodies    [][]byte
	headers   []http.Header
	statuses  []int
	refuseAll bool
	afterCall func()
}

func (r *recorder) RoundTrip(req *http.Request) (*http.Response, error) {
	body, _ := io.ReadAll(req.Body)
	req.Body.Close()

	r.mu.Lock()
	call := len(r.bodies)
	r.bodies = append(r.bodies, body)
	r.headers = append(r.headers, req.Header.Clone())
	status := r.statuses[len(r.statuses)-1]
	if call < len(r.statuses) {
		status = r.statuses[call]
	}
	refuse := r.refuseAll
	afterCall := r.afterCall
	r.mu.Unlock()

	if afterCall != nil {
		afterCall()
	}
	if refuse {
		return nil, errConnectionRefused
	}
	return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader("")), Header: http.Header{}, Request: req}, nil
}

func (r *recorder) calls() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.bodies)
}

func newRecorder(statuses ...int) *recorder {
	return &recorder{statuses: statuses}
}

func newClient(rec *recorder) *Client {
	return &Client{
		Secret:  []byte("whsec_test"),
		Backoff: func(int) time.Duration { return time.Millisecond },
		HTTP:    &http.Client{Transport: rec},
	}
}

func TestDeliverSignsBody(t *testing.T) {
	rec := newRecorder(http.StatusOK)

	if err := newClient(rec).Deliver(context.Background(), endpoint, testEvent); err != nil {
		t.Fatalf("Deliver() error = %v", err)
	}

	if rec.calls() != 1 {
		t.Fatalf("endpoint saw %d calls, want 1", rec.calls())
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
	rec := newRecorder(http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusOK)

	if err := newClient(rec).Deliver(context.Background(), endpoint, testEvent); err != nil {
		t.Fatalf("Deliver() error = %v", err)
	}

	if rec.calls() != 3 {
		t.Fatalf("endpoint saw %d calls, want 3", rec.calls())
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
	rec := newRecorder(http.StatusGone)

	err := newClient(rec).Deliver(context.Background(), endpoint, testEvent)

	var statusErr *StatusError
	if !errors.As(err, &statusErr) || statusErr.Code != http.StatusGone {
		t.Fatalf("Deliver() error = %v, want StatusError 410", err)
	}
	if rec.calls() != 1 {
		t.Errorf("endpoint saw %d calls, want 1", rec.calls())
	}
}

func TestDeliverGivesUpAfterMaxAttempts(t *testing.T) {
	rec := newRecorder(http.StatusServiceUnavailable)

	err := newClient(rec).Deliver(context.Background(), endpoint, testEvent)

	var statusErr *StatusError
	if !errors.As(err, &statusErr) || statusErr.Code != http.StatusServiceUnavailable {
		t.Fatalf("Deliver() error = %v, want wrapped StatusError 503", err)
	}
	if rec.calls() != 3 {
		t.Errorf("default attempts: endpoint saw %d calls, want 3", rec.calls())
	}

	rec = newRecorder(http.StatusServiceUnavailable)
	client := newClient(rec)
	client.MaxAttempts = 5
	client.Deliver(context.Background(), endpoint, testEvent)
	if rec.calls() != 5 {
		t.Errorf("MaxAttempts=5: endpoint saw %d calls, want 5", rec.calls())
	}
}

func TestDeliverRetriesNetworkErrors(t *testing.T) {
	rec := newRecorder(http.StatusOK)
	rec.refuseAll = true

	var waits int
	client := newClient(rec)
	client.Backoff = func(failedAttempt int) time.Duration {
		waits++
		return time.Millisecond
	}

	err := client.Deliver(context.Background(), endpoint, testEvent)
	if !errors.Is(err, errConnectionRefused) {
		t.Fatalf("Deliver() error = %v, want the wrapped network error", err)
	}
	if rec.calls() != 3 {
		t.Errorf("endpoint saw %d calls, want 3", rec.calls())
	}
	if waits != 2 {
		t.Errorf("backoff consulted %d times, want 2", waits)
	}
}

func TestDeliverStopsWhenContextCancelledDuringBackoff(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	rec := newRecorder(http.StatusInternalServerError)
	rec.afterCall = cancel

	client := newClient(rec)
	client.Backoff = func(int) time.Duration { return time.Hour }

	done := make(chan error, 1)
	go func() { done <- client.Deliver(ctx, endpoint, testEvent) }()

	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Errorf("Deliver() error = %v, want context.Canceled", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Deliver() did not return after the context was cancelled")
	}
	if rec.calls() != 1 {
		t.Errorf("endpoint saw %d calls, want 1", rec.calls())
	}
}
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
