#!/usr/bin/env bash
set -euo pipefail
cat > '.gitignore' <<'EOF_FIXTURE'
out/
EOF_FIXTURE
mkdir -p 'src/main/java/com/acme/billing'
cat > 'src/main/java/com/acme/billing/InvalidTransitionException.java' <<'EOF_FIXTURE'
package com.acme.billing;

public final class InvalidTransitionException extends RuntimeException {
    public InvalidTransitionException(SubscriptionStatus from, String action) {
        super("Cannot " + action + " a subscription that is " + from);
    }
}
EOF_FIXTURE
mkdir -p 'src/main/java/com/acme/billing'
cat > 'src/main/java/com/acme/billing/Subscription.java' <<'EOF_FIXTURE'
package com.acme.billing;

import java.time.Clock;
import java.time.Instant;

public final class Subscription {
    private final Clock clock;

    private Subscription(Clock clock) {
        this.clock = clock;
    }

    public static Subscription startTrial(Clock clock) {
        throw new UnsupportedOperationException("not implemented");
    }

    public SubscriptionStatus status() {
        throw new UnsupportedOperationException("not implemented");
    }

    public boolean hasAccess() {
        throw new UnsupportedOperationException("not implemented");
    }

    public Instant trialEndsAt() {
        throw new UnsupportedOperationException("not implemented");
    }

    public Instant currentPeriodEnd() {
        throw new UnsupportedOperationException("not implemented");
    }

    public Instant graceEndsAt() {
        throw new UnsupportedOperationException("not implemented");
    }

    public void convertTrial() {
        throw new UnsupportedOperationException("not implemented");
    }

    public void recordPayment() {
        throw new UnsupportedOperationException("not implemented");
    }

    public void paymentFailed() {
        throw new UnsupportedOperationException("not implemented");
    }

    public void cancel() {
        throw new UnsupportedOperationException("not implemented");
    }
}
EOF_FIXTURE
mkdir -p 'src/main/java/com/acme/billing'
cat > 'src/main/java/com/acme/billing/SubscriptionStatus.java' <<'EOF_FIXTURE'
package com.acme.billing;

public enum SubscriptionStatus {
    TRIAL,
    ACTIVE,
    PAST_DUE,
    CANCELED,
    EXPIRED
}
EOF_FIXTURE
mkdir -p 'src/test/java'
cat > 'src/test/java/TestRunner.java' <<'EOF_FIXTURE'
import com.acme.billing.InvalidTransitionException;
import com.acme.billing.Subscription;
import com.acme.billing.SubscriptionStatus;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public final class TestRunner {
    private interface Body {
        void run() throws Exception;
    }

    private static final class MutableClock extends Clock {
        private Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    private static final Instant START = Instant.parse("2025-03-01T09:00:00Z");
    private static final List<String> failures = new ArrayList<>();
    private static int count = 0;

    private static void test(String name, Body body) {
        count++;
        try {
            body.run();
        } catch (Throwable t) {
            failures.add(name + ": " + t);
        }
    }

    private static void assertEquals(Object expected, Object actual) {
        if (!Objects.equals(expected, actual)) {
            throw new AssertionError("expected " + expected + " but was " + actual);
        }
    }

    private static void assertInvalid(Runnable action) {
        try {
            action.run();
        } catch (InvalidTransitionException expected) {
            return;
        }
        throw new AssertionError("expected InvalidTransitionException");
    }

    public static void main(String[] args) {
        test("a new subscription is a 14 day trial", () -> {
            MutableClock clock = new MutableClock(START);
            Subscription subscription = Subscription.startTrial(clock);
            assertEquals(SubscriptionStatus.TRIAL, subscription.status());
            assertEquals(START.plus(Duration.ofDays(14)), subscription.trialEndsAt());
            assertEquals(true, subscription.hasAccess());
        });

        test("trial expires when the trial period elapses", () -> {
            MutableClock clock = new MutableClock(START);
            Subscription subscription = Subscription.startTrial(clock);
            clock.advance(Duration.ofDays(14).minusSeconds(1));
            assertEquals(SubscriptionStatus.TRIAL, subscription.status());
            clock.advance(Duration.ofSeconds(1));
            assertEquals(SubscriptionStatus.EXPIRED, subscription.status());
            assertEquals(false, subscription.hasAccess());
        });

        test("converting a trial activates a 30 day billing period", () -> {
            MutableClock clock = new MutableClock(START);
            Subscription subscription = Subscription.startTrial(clock);
            clock.advance(Duration.ofDays(3));
            subscription.convertTrial();
            assertEquals(SubscriptionStatus.ACTIVE, subscription.status());
            assertEquals(START.plus(Duration.ofDays(33)), subscription.currentPeriodEnd());
        });

        test("an activated subscription does not expire with the old trial date", () -> {
            MutableClock clock = new MutableClock(START);
            Subscription subscription = Subscription.startTrial(clock);
            subscription.convertTrial();
            clock.advance(Duration.ofDays(20));
            assertEquals(SubscriptionStatus.ACTIVE, subscription.status());
        });

        test("a payment while active extends the period from its end", () -> {
            MutableClock clock = new MutableClock(START);
            Subscription subscription = Subscription.startTrial(clock);
            subscription.convertTrial();
            clock.advance(Duration.ofDays(30));
            subscription.recordPayment();
            assertEquals(SubscriptionStatus.ACTIVE, subscription.status());
            assertEquals(START.plus(Duration.ofDays(60)), subscription.currentPeriodEnd());
        });

        test("a failed payment starts a 7 day grace period", () -> {
            MutableClock clock = new MutableClock(START);
            Subscription subscription = Subscription.startTrial(clock);
            subscription.convertTrial();
            clock.advance(Duration.ofDays(30));
            subscription.paymentFailed();
            assertEquals(SubscriptionStatus.PAST_DUE, subscription.status());
            assertEquals(clock.instant().plus(Duration.ofDays(7)), subscription.graceEndsAt());
            assertEquals(true, subscription.hasAccess());
        });

        test("a payment within the grace period reactivates the subscription", () -> {
            MutableClock clock = new MutableClock(START);
            Subscription subscription = Subscription.startTrial(clock);
            subscription.convertTrial();
            clock.advance(Duration.ofDays(30));
            subscription.paymentFailed();
            clock.advance(Duration.ofDays(6));
            subscription.recordPayment();
            assertEquals(SubscriptionStatus.ACTIVE, subscription.status());
            assertEquals(clock.instant().plus(Duration.ofDays(30)), subscription.currentPeriodEnd());
        });

        test("past due subscription expires when the grace period ends", () -> {
            MutableClock clock = new MutableClock(START);
            Subscription subscription = Subscription.startTrial(clock);
            subscription.convertTrial();
            subscription.paymentFailed();
            clock.advance(Duration.ofDays(7).minusSeconds(1));
            assertEquals(SubscriptionStatus.PAST_DUE, subscription.status());
            clock.advance(Duration.ofSeconds(1));
            assertEquals(SubscriptionStatus.EXPIRED, subscription.status());
            assertEquals(false, subscription.hasAccess());
        });

        test("payment after the grace period is rejected", () -> {
            MutableClock clock = new MutableClock(START);
            Subscription subscription = Subscription.startTrial(clock);
            subscription.convertTrial();
            subscription.paymentFailed();
            clock.advance(Duration.ofDays(8));
            assertInvalid(subscription::recordPayment);
        });

        test("cancel works from trial, active and past due", () -> {
            MutableClock clock = new MutableClock(START);

            Subscription trial = Subscription.startTrial(clock);
            trial.cancel();
            assertEquals(SubscriptionStatus.CANCELED, trial.status());

            Subscription active = Subscription.startTrial(clock);
            active.convertTrial();
            active.cancel();
            assertEquals(SubscriptionStatus.CANCELED, active.status());

            Subscription pastDue = Subscription.startTrial(clock);
            pastDue.convertTrial();
            pastDue.paymentFailed();
            pastDue.cancel();
            assertEquals(SubscriptionStatus.CANCELED, pastDue.status());
            assertEquals(false, pastDue.hasAccess());
        });

        test("a canceled subscription stays canceled as time passes", () -> {
            MutableClock clock = new MutableClock(START);
            Subscription subscription = Subscription.startTrial(clock);
            subscription.cancel();
            clock.advance(Duration.ofDays(60));
            assertEquals(SubscriptionStatus.CANCELED, subscription.status());
        });

        test("a canceled subscription cannot be canceled, paid or converted", () -> {
            MutableClock clock = new MutableClock(START);
            Subscription subscription = Subscription.startTrial(clock);
            subscription.cancel();
            assertInvalid(subscription::cancel);
            assertInvalid(subscription::recordPayment);
            assertInvalid(subscription::convertTrial);
            assertInvalid(subscription::paymentFailed);
        });

        test("an expired subscription rejects every transition", () -> {
            MutableClock clock = new MutableClock(START);
            Subscription subscription = Subscription.startTrial(clock);
            clock.advance(Duration.ofDays(15));
            assertInvalid(subscription::convertTrial);
            assertInvalid(subscription::cancel);
            assertInvalid(subscription::recordPayment);
            assertInvalid(subscription::paymentFailed);
        });

        test("only a trial can be converted", () -> {
            MutableClock clock = new MutableClock(START);
            Subscription subscription = Subscription.startTrial(clock);
            subscription.convertTrial();
            assertInvalid(subscription::convertTrial);
        });

        test("a trial cannot be charged or marked past due", () -> {
            MutableClock clock = new MutableClock(START);
            Subscription subscription = Subscription.startTrial(clock);
            assertInvalid(subscription::recordPayment);
            assertInvalid(subscription::paymentFailed);
        });

        test("only an active subscription can fail payment", () -> {
            MutableClock clock = new MutableClock(START);
            Subscription subscription = Subscription.startTrial(clock);
            subscription.convertTrial();
            subscription.paymentFailed();
            assertInvalid(subscription::paymentFailed);
        });

        test("invalid transition message names the state and the action", () -> {
            MutableClock clock = new MutableClock(START);
            Subscription subscription = Subscription.startTrial(clock);
            subscription.cancel();
            try {
                subscription.convertTrial();
                throw new AssertionError("expected InvalidTransitionException");
            } catch (InvalidTransitionException expected) {
                assertEquals("Cannot convert a subscription that is CANCELED", expected.getMessage());
            }
        });

        test("instants that do not apply to the current state are rejected", () -> {
            MutableClock clock = new MutableClock(START);
            Subscription subscription = Subscription.startTrial(clock);
            try {
                subscription.graceEndsAt();
                throw new AssertionError("expected IllegalStateException");
            } catch (IllegalStateException expected) {
                return;
            }
        });

        if (!failures.isEmpty()) {
            failures.forEach(failure -> System.out.println("FAIL " + failure));
            System.out.println(failures.size() + " of " + count + " TESTS FAILED");
            System.exit(1);
        }
        System.out.println("ALL " + count + " TESTS PASSED");
    }
}
EOF_FIXTURE
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
