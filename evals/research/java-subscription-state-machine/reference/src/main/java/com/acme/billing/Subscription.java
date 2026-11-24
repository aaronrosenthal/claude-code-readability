package com.acme.billing;

import static com.acme.billing.SubscriptionStatus.ACTIVE;
import static com.acme.billing.SubscriptionStatus.CANCELED;
import static com.acme.billing.SubscriptionStatus.EXPIRED;
import static com.acme.billing.SubscriptionStatus.PAST_DUE;
import static com.acme.billing.SubscriptionStatus.TRIAL;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;

public final class Subscription {
    private static final Duration TRIAL_LENGTH = Duration.ofDays(14);
    private static final Duration BILLING_PERIOD = Duration.ofDays(30);
    private static final Duration GRACE_PERIOD = Duration.ofDays(7);

    private final Clock clock;
    private final Instant trialEndsAt;
    private SubscriptionStatus recordedStatus = TRIAL;
    private Instant currentPeriodEnd;
    private Instant graceEndsAt;

    private Subscription(Clock clock) {
        this.clock = clock;
        this.trialEndsAt = clock.instant().plus(TRIAL_LENGTH);
    }

    public static Subscription startTrial(Clock clock) {
        return new Subscription(clock);
    }

    public SubscriptionStatus status() {
        Instant now = clock.instant();
        if (recordedStatus == TRIAL && !now.isBefore(trialEndsAt)) {
            return EXPIRED;
        }
        if (recordedStatus == PAST_DUE && !now.isBefore(graceEndsAt)) {
            return EXPIRED;
        }
        return recordedStatus;
    }

    public boolean hasAccess() {
        return Set.of(TRIAL, ACTIVE, PAST_DUE).contains(status());
    }

    public Instant trialEndsAt() {
        return trialEndsAt;
    }

    public Instant currentPeriodEnd() {
        requireStatusForQuery(ACTIVE);
        return currentPeriodEnd;
    }

    public Instant graceEndsAt() {
        requireStatusForQuery(PAST_DUE);
        return graceEndsAt;
    }

    public void convertTrial() {
        requireStatus("convert", TRIAL);
        recordedStatus = ACTIVE;
        currentPeriodEnd = clock.instant().plus(BILLING_PERIOD);
    }

    public void recordPayment() {
        SubscriptionStatus current = requireStatus("record a payment for", ACTIVE, PAST_DUE);
        if (current == PAST_DUE) {
            recordedStatus = ACTIVE;
            currentPeriodEnd = clock.instant().plus(BILLING_PERIOD);
            graceEndsAt = null;
        } else {
            currentPeriodEnd = currentPeriodEnd.plus(BILLING_PERIOD);
        }
    }

    public void paymentFailed() {
        requireStatus("fail a payment for", ACTIVE);
        recordedStatus = PAST_DUE;
        graceEndsAt = clock.instant().plus(GRACE_PERIOD);
    }

    public void cancel() {
        requireStatus("cancel", TRIAL, ACTIVE, PAST_DUE);
        recordedStatus = CANCELED;
    }

    private SubscriptionStatus requireStatus(String action, SubscriptionStatus... allowed) {
        SubscriptionStatus current = status();
        if (!Set.of(allowed).contains(current)) {
            throw new InvalidTransitionException(current, action);
        }
        return current;
    }

    private void requireStatusForQuery(SubscriptionStatus required) {
        if (status() != required) {
            throw new IllegalStateException("Subscription is " + status() + ", not " + required);
        }
    }
}
