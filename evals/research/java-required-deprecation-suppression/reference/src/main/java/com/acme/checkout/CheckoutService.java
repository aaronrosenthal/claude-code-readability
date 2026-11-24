package com.acme.checkout;

import com.paynet.sdk.ChargeRequest;
import com.paynet.sdk.ChargeResult;
import com.paynet.sdk.PayNetClient;

/** Charges customers' cards for completed checkouts. */
public final class CheckoutService {
    private static final String LEGACY_THREE_DS_REGION = "JP";

    private final PayNetClient payNet;

    public CheckoutService(PayNetClient payNet) {
        this.payNet = payNet;
    }

    public Receipt charge(PaymentRequest request) {
        ChargeRequest chargeRequest = new ChargeRequest(
                request.cardToken(), request.amountMinor(), request.currency(), request.region());
        ChargeResult result = authorize(chargeRequest);
        return new Receipt(request.orderId(), result.approved(), result.chargeId(), result.declineReason());
    }

    private ChargeResult authorize(ChargeRequest request) {
        if (LEGACY_THREE_DS_REGION.equals(request.region())) {
            return authorizeWithThreeDSecureV1(request);
        }
        return payNet.authorize(request);
    }

    // Japanese acquirers still require 3-D Secure 1.0 and PayNet only exposes that through this
    // deprecated call. Remove once they migrate and PayNet drops the method.
    @SuppressWarnings("deprecation")
    private ChargeResult authorizeWithThreeDSecureV1(ChargeRequest request) {
        return payNet.authorizeWithThreeDSecureV1(request);
    }
}
