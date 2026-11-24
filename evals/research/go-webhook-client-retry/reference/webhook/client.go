package webhook

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

const defaultMaxAttempts = 3

// Client delivers signed webhook events.
type Client struct {
	HTTP        *http.Client
	Secret      []byte
	MaxAttempts int
	Backoff     func(failedAttempt int) time.Duration
}

// Deliver posts event to url, retrying server errors and network failures.
func (c *Client) Deliver(ctx context.Context, url string, event Event) error {
	body, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("webhook: encode event %s: %w", event.ID, err)
	}
	signature := sign(c.Secret, body)

	maxAttempts := c.MaxAttempts
	if maxAttempts <= 0 {
		maxAttempts = defaultMaxAttempts
	}

	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		if attempt > 1 {
			if err := c.wait(ctx, attempt-1); err != nil {
				return err
			}
		}

		lastErr = c.post(ctx, url, event.ID, body, signature)
		if lastErr == nil {
			return nil
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if !isRetryable(lastErr) {
			return lastErr
		}
	}
	return fmt.Errorf("webhook: giving up on event %s after %d attempts: %w", event.ID, maxAttempts, lastErr)
}

func (c *Client) post(ctx context.Context, url, eventID string, body []byte, signature string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Webhook-Signature", signature)
	req.Header.Set("X-Webhook-Event-ID", eventID)

	httpClient := c.HTTP
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return &StatusError{Code: resp.StatusCode}
	}
	return nil
}

func (c *Client) wait(ctx context.Context, failedAttempt int) error {
	if c.Backoff == nil {
		return ctx.Err()
	}
	timer := time.NewTimer(c.Backoff(failedAttempt))
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func isRetryable(err error) bool {
	var statusErr *StatusError
	if errors.As(err, &statusErr) {
		return statusErr.Code >= 500
	}
	return true
}

func sign(secret, body []byte) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}
