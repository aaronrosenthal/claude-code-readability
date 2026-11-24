#!/usr/bin/env bash
set -euo pipefail
cat > '.gitignore' <<'EOF_FIXTURE'
out/
EOF_FIXTURE
mkdir -p 'src/main/java/com/acme/shipping'
cat > 'src/main/java/com/acme/shipping/Address.java' <<'EOF_FIXTURE'
package com.acme.shipping;

/** A destination address as typed into the checkout form. Any component may be {@code null}. */
public record Address(
        String name,
        String line1,
        String line2,
        String city,
        String region,
        String postalCode,
        String country) {
}
EOF_FIXTURE
mkdir -p 'src/main/java/com/acme/shipping'
cat > 'src/main/java/com/acme/shipping/AddressValidator.java' <<'EOF_FIXTURE'
package com.acme.shipping;

import java.util.List;

public final class AddressValidator {

    public List<Violation> validate(Address address, Carrier carrier) {
        throw new UnsupportedOperationException("not implemented");
    }
}
EOF_FIXTURE
mkdir -p 'src/main/java/com/acme/shipping'
cat > 'src/main/java/com/acme/shipping/Carrier.java' <<'EOF_FIXTURE'
package com.acme.shipping;

public enum Carrier {
    POSTAL_SERVICE(true),
    EXPRESS_COURIER(false),
    FREIGHT(false);

    private final boolean deliversToPoBoxes;

    Carrier(boolean deliversToPoBoxes) {
        this.deliversToPoBoxes = deliversToPoBoxes;
    }

    public boolean deliversToPoBoxes() {
        return deliversToPoBoxes;
    }
}
EOF_FIXTURE
mkdir -p 'src/main/java/com/acme/shipping'
cat > 'src/main/java/com/acme/shipping/Violation.java' <<'EOF_FIXTURE'
package com.acme.shipping;

/**
 * A problem with one address field.
 *
 * @param field the {@link Address} component name, such as {@code "postalCode"}
 * @param code one of {@code REQUIRED}, {@code INVALID_FORMAT}, {@code UNSUPPORTED_COUNTRY} or
 *     {@code PO_BOX_NOT_ALLOWED}
 */
public record Violation(String field, String code) {
}
EOF_FIXTURE
mkdir -p 'src/test/java'
cat > 'src/test/java/TestRunner.java' <<'EOF_FIXTURE'
import com.acme.shipping.Address;
import com.acme.shipping.AddressValidator;
import com.acme.shipping.Carrier;
import com.acme.shipping.Violation;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public final class TestRunner {
    private interface Body {
        void run() throws Exception;
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

    private static final AddressValidator VALIDATOR = new AddressValidator();

    private static Address us(String postalCode) {
        return new Address("Ada Lovelace", "1 Main St", null, "Springfield", "IL", postalCode, "US");
    }

    private static Address uk(String postalCode) {
        return new Address("Ada Lovelace", "10 Downing St", null, "London", null, postalCode, "GB");
    }

    private static Address canada(String postalCode) {
        return new Address("Ada Lovelace", "24 Sussex Dr", null, "Ottawa", "ON", postalCode, "CA");
    }

    private static List<Violation> validate(Address address) {
        return VALIDATOR.validate(address, Carrier.POSTAL_SERVICE);
    }

    private static Violation violation(String field, String code) {
        return new Violation(field, code);
    }

    public static void main(String[] args) {
        test("valid US address has no violations", () ->
                assertEquals(List.of(), validate(us("62704"))));

        test("US ZIP+4 is accepted", () ->
                assertEquals(List.of(), validate(us("62704-1234"))));

        test("US postal code must be 5 digits or ZIP+4", () -> {
            for (String bad : List.of("6270", "627044", "62704-12", "62704 1234", "ABCDE")) {
                assertEquals(List.of(violation("postalCode", "INVALID_FORMAT")), validate(us(bad)));
            }
        });

        test("surrounding whitespace is ignored", () ->
                assertEquals(List.of(), validate(us("  62704 "))));

        test("Canadian postal codes accept an optional space and any case", () -> {
            assertEquals(List.of(), validate(canada("K1A 0B1")));
            assertEquals(List.of(), validate(canada("k1a0b1")));
        });

        test("Canadian postal codes reject letters Canada Post never uses", () -> {
            assertEquals(List.of(violation("postalCode", "INVALID_FORMAT")), validate(canada("D1A 0B1")));
            assertEquals(List.of(violation("postalCode", "INVALID_FORMAT")), validate(canada("K1A 0B0Q")));
            assertEquals(List.of(violation("postalCode", "INVALID_FORMAT")), validate(canada("K1A 0U1")));
        });

        test("UK postcodes of different shapes are accepted", () -> {
            for (String good : List.of("SW1A 1AA", "M1 1AE", "B33 8TH", "CR2 6XH", "DN55 1PT", "sw1a1aa")) {
                assertEquals(List.of(), validate(uk(good)));
            }
        });

        test("UK postcodes must look like a postcode", () -> {
            for (String bad : List.of("12345", "SW1A", "SW1A 1A", "1SW1A AAA")) {
                assertEquals(List.of(violation("postalCode", "INVALID_FORMAT")), validate(uk(bad)));
            }
        });

        test("every blank required field is reported in field order", () -> {
            Address blank = new Address("  ", "", null, null, null, "", "");
            assertEquals(List.of(
                    violation("name", "REQUIRED"),
                    violation("line1", "REQUIRED"),
                    violation("city", "REQUIRED"),
                    violation("postalCode", "REQUIRED"),
                    violation("country", "REQUIRED")),
                    validate(blank));
        });

        test("a missing postal code is required, not malformed", () -> {
            Address address = new Address("Ada", "1 Main St", null, "Springfield", "IL", " ", "US");
            assertEquals(List.of(violation("postalCode", "REQUIRED")), validate(address));
        });

        test("region is required for US and Canada only", () -> {
            Address usNoRegion = new Address("Ada", "1 Main St", null, "Springfield", "", "62704", "US");
            Address caNoRegion = new Address("Ada", "1 Main St", null, "Ottawa", null, "K1A 0B1", "CA");
            assertEquals(List.of(violation("region", "REQUIRED")), validate(usNoRegion));
            assertEquals(List.of(violation("region", "REQUIRED")), validate(caNoRegion));
            assertEquals(List.of(), validate(uk("SW1A 1AA")));
        });

        test("country code is case-insensitive", () -> {
            Address address = new Address("Ada", "1 Main St", null, "Springfield", "IL", "62704", " us ");
            assertEquals(List.of(), validate(address));
        });

        test("unsupported countries are reported without checking the postal code", () -> {
            Address address = new Address("Ada", "8 Rue Lafayette", null, "Paris", null, "75008", "FR");
            assertEquals(List.of(violation("country", "UNSUPPORTED_COUNTRY")), validate(address));
        });

        test("PO boxes are fine for the postal service", () -> {
            Address address = new Address("Ada", "PO Box 123", null, "Springfield", "IL", "62704", "US");
            assertEquals(List.of(), VALIDATOR.validate(address, Carrier.POSTAL_SERVICE));
        });

        test("couriers and freight reject PO boxes on line 1", () -> {
            Address address = new Address("Ada", "PO Box 123", null, "Springfield", "IL", "62704", "US");
            assertEquals(List.of(violation("line1", "PO_BOX_NOT_ALLOWED")),
                    VALIDATOR.validate(address, Carrier.EXPRESS_COURIER));
            assertEquals(List.of(violation("line1", "PO_BOX_NOT_ALLOWED")),
                    VALIDATOR.validate(address, Carrier.FREIGHT));
        });

        test("PO boxes are detected on line 2 and in common spellings", () -> {
            for (String spelling : List.of("P.O. Box 9", "p.o.box 9", "POBOX 9", "Post Office Box 9", "po box 9")) {
                Address address = new Address("Ada", "1 Main St", spelling, "Springfield", "IL", "62704", "US");
                assertEquals(List.of(violation("line2", "PO_BOX_NOT_ALLOWED")),
                        VALIDATOR.validate(address, Carrier.EXPRESS_COURIER));
            }
        });

        test("street names that merely resemble a PO box are accepted", () -> {
            for (String street : List.of("5 Popular Boxwood Ln", "12 Pollock Boxer Rd", "7 Compo Box Hill")) {
                Address address = new Address("Ada", street, null, "Springfield", "IL", "62704", "US");
                assertEquals(List.of(), VALIDATOR.validate(address, Carrier.EXPRESS_COURIER));
            }
        });

        test("all violations are returned together in field order", () -> {
            Address address = new Address("Ada", "PO Box 5", "Post Office Box 6", "", "IL", "ABC", "US");
            assertEquals(List.of(
                    violation("line1", "PO_BOX_NOT_ALLOWED"),
                    violation("line2", "PO_BOX_NOT_ALLOWED"),
                    violation("city", "REQUIRED"),
                    violation("postalCode", "INVALID_FORMAT")),
                    VALIDATOR.validate(address, Carrier.EXPRESS_COURIER));
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
