#!/usr/bin/env bash
set -euo pipefail
cat > '.gitignore' <<'EOF_FIXTURE'
out/
EOF_FIXTURE
cat > 'build.sh' <<'EOF_FIXTURE'
#!/usr/bin/env bash
set -euo pipefail
mkdir -p out
javac -Xlint:all -Werror -d out $(find src -name '*.java')
java -cp out TestRunner
EOF_FIXTURE
mkdir -p 'src/main/java/com/acme/checkout'
cat > 'src/main/java/com/acme/checkout/CheckoutService.java' <<'EOF_FIXTURE'
package com.acme.checkout;

import com.paynet.sdk.ChargeRequest;
import com.paynet.sdk.ChargeResult;
import com.paynet.sdk.PayNetClient;

/** Charges customers' cards for completed checkouts. */
public final class CheckoutService {
    private final PayNetClient payNet;

    public CheckoutService(PayNetClient payNet) {
        this.payNet = payNet;
    }

    public Receipt charge(PaymentRequest request) {
        ChargeRequest chargeRequest = new ChargeRequest(
                request.cardToken(), request.amountMinor(), request.currency(), request.region());
        ChargeResult result = payNet.authorize(chargeRequest);
        return new Receipt(request.orderId(), result.approved(), result.chargeId(), result.declineReason());
    }
}
EOF_FIXTURE
mkdir -p 'src/main/java/com/acme/checkout'
cat > 'src/main/java/com/acme/checkout/PaymentRequest.java' <<'EOF_FIXTURE'
package com.acme.checkout;

public record PaymentRequest(String orderId, String cardToken, long amountMinor, String currency, String region) {
}
EOF_FIXTURE
mkdir -p 'src/main/java/com/acme/checkout'
cat > 'src/main/java/com/acme/checkout/Receipt.java' <<'EOF_FIXTURE'
package com.acme.checkout;

public record Receipt(String orderId, boolean approved, String chargeId, String declineReason) {
}
EOF_FIXTURE
mkdir -p 'src/main/java/com/paynet/sdk'
cat > 'src/main/java/com/paynet/sdk/ChargeRequest.java' <<'EOF_FIXTURE'
package com.paynet.sdk;

/**
 * Parameters for a card charge.
 *
 * @param cardToken token returned by the PayNet card vault
 * @param amountMinor amount in minor currency units, for example cents
 * @param currency ISO 4217 currency code
 * @param region ISO 3166-1 alpha-2 code of the card issuer's region
 */
public record ChargeRequest(String cardToken, long amountMinor, String currency, String region) {
}
EOF_FIXTURE
mkdir -p 'src/main/java/com/paynet/sdk'
cat > 'src/main/java/com/paynet/sdk/ChargeResult.java' <<'EOF_FIXTURE'
package com.paynet.sdk;

/**
 * Outcome of a charge attempt.
 *
 * @param chargeId PayNet's identifier for the charge
 * @param approved whether the issuer approved the charge
 * @param declineReason issuer decline reason, or {@code null} when approved
 */
public record ChargeResult(String chargeId, boolean approved, String declineReason) {
}
EOF_FIXTURE
mkdir -p 'src/main/java/com/paynet/sdk'
cat > 'src/main/java/com/paynet/sdk/PayNetClient.java' <<'EOF_FIXTURE'
package com.paynet.sdk;

import java.util.LinkedHashMap;
import java.util.Map;

/** Client for the PayNet card payments API, version 4.2. */
public final class PayNetClient {
    private final Transport transport;

    public PayNetClient(Transport transport) {
        this.transport = transport;
    }

    /**
     * Authorizes a charge, authenticating the cardholder with 3-D Secure 2.
     *
     * @param request the charge to authorize
     * @return the issuer's decision
     */
    public ChargeResult authorize(ChargeRequest request) {
        return send(request, "2");
    }

    /**
     * Authorizes a charge, authenticating the cardholder with 3-D Secure 1.0.
     *
     * @param request the charge to authorize
     * @return the issuer's decision
     * @deprecated 3-D Secure 1.0 has been retired by the card schemes. Use
     *     {@link #authorize(ChargeRequest)}. This method remains only for acquirers in region JP.
     */
    @Deprecated
    public ChargeResult authorizeWithThreeDSecureV1(ChargeRequest request) {
        return send(request, "1");
    }

    private ChargeResult send(ChargeRequest request, String threeDsVersion) {
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("token", request.cardToken());
        fields.put("amount", Long.toString(request.amountMinor()));
        fields.put("currency", request.currency());
        fields.put("three_ds", threeDsVersion);
        Map<String, String> response = transport.send("/charges", fields);
        return new ChargeResult(
                response.get("id"), "approved".equals(response.get("status")), response.get("decline_reason"));
    }
}
EOF_FIXTURE
mkdir -p 'src/main/java/com/paynet/sdk'
cat > 'src/main/java/com/paynet/sdk/Transport.java' <<'EOF_FIXTURE'
package com.paynet.sdk;

import java.util.Map;

/** Sends a form-encoded request to the PayNet API and returns the decoded response fields. */
public interface Transport {
    Map<String, String> send(String path, Map<String, String> fields);
}
EOF_FIXTURE
mkdir -p 'src/test/java'
cat > 'src/test/java/TestRunner.java' <<'EOF_FIXTURE'
import com.acme.checkout.CheckoutService;
import com.acme.checkout.PaymentRequest;
import com.acme.checkout.Receipt;
import com.paynet.sdk.PayNetClient;
import com.paynet.sdk.Transport;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class TestRunner {
    private interface Body {
        void run() throws Exception;
    }

    private static final class RecordingTransport implements Transport {
        private final Map<String, String> response;
        private final List<Map<String, String>> sent = new ArrayList<>();

        RecordingTransport(Map<String, String> response) {
            this.response = response;
        }

        @Override
        public Map<String, String> send(String path, Map<String, String> fields) {
            sent.add(fields);
            return response;
        }
    }

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

    private static final Map<String, String> APPROVED = Map.of("id", "ch_1", "status", "approved");

    public static void main(String[] args) {
        test("approved charge becomes an approved receipt", () -> {
            CheckoutService service = new CheckoutService(new PayNetClient(new RecordingTransport(APPROVED)));
            Receipt receipt = service.charge(new PaymentRequest("o-1", "tok_1", 4_999, "EUR", "DE"));
            assertEquals(new Receipt("o-1", true, "ch_1", null), receipt);
        });

        test("declined charge carries the decline reason", () -> {
            Map<String, String> declined = Map.of("id", "ch_2", "status", "declined", "decline_reason", "insufficient_funds");
            CheckoutService service = new CheckoutService(new PayNetClient(new RecordingTransport(declined)));
            Receipt receipt = service.charge(new PaymentRequest("o-2", "tok_2", 1_000, "USD", "US"));
            assertEquals(new Receipt("o-2", false, "ch_2", "insufficient_funds"), receipt);
        });

        test("amount, currency and token are sent to PayNet", () -> {
            RecordingTransport transport = new RecordingTransport(APPROVED);
            new CheckoutService(new PayNetClient(transport))
                    .charge(new PaymentRequest("o-3", "tok_3", 2_500, "GBP", "GB"));
            Map<String, String> fields = transport.sent.get(0);
            assertEquals("tok_3", fields.get("token"));
            assertEquals("2500", fields.get("amount"));
            assertEquals("GBP", fields.get("currency"));
        });

        test("most regions authenticate with 3-D Secure 2", () -> {
            RecordingTransport transport = new RecordingTransport(APPROVED);
            CheckoutService service = new CheckoutService(new PayNetClient(transport));
            service.charge(new PaymentRequest("o-4", "tok_4", 100, "USD", "US"));
            service.charge(new PaymentRequest("o-5", "tok_5", 100, "EUR", "FR"));
            assertEquals("2", transport.sent.get(0).get("three_ds"));
            assertEquals("2", transport.sent.get(1).get("three_ds"));
        });

        test("Japan authenticates with 3-D Secure 1", () -> {
            RecordingTransport transport = new RecordingTransport(APPROVED);
            new CheckoutService(new PayNetClient(transport))
                    .charge(new PaymentRequest("o-6", "tok_6", 12_000, "JPY", "JP"));
            assertEquals("1", transport.sent.get(0).get("three_ds"));
        });

        test("Japanese charges still map declines", () -> {
            Map<String, String> declined = Map.of("id", "ch_7", "status", "declined", "decline_reason", "do_not_honor");
            CheckoutService service = new CheckoutService(new PayNetClient(new RecordingTransport(declined)));
            Receipt receipt = service.charge(new PaymentRequest("o-7", "tok_7", 900, "JPY", "JP"));
            assertEquals(new Receipt("o-7", false, "ch_7", "do_not_honor"), receipt);
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
