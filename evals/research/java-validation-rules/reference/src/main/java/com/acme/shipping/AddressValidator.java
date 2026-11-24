package com.acme.shipping;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

public final class AddressValidator {
    private static final String REQUIRED = "REQUIRED";
    private static final String INVALID_FORMAT = "INVALID_FORMAT";
    private static final String UNSUPPORTED_COUNTRY = "UNSUPPORTED_COUNTRY";
    private static final String PO_BOX_NOT_ALLOWED = "PO_BOX_NOT_ALLOWED";

    private static final Map<String, Pattern> POSTAL_CODE_FORMATS = Map.of(
            "US", Pattern.compile("\\d{5}(-\\d{4})?"),
            "CA", Pattern.compile("[ABCEGHJ-NPRSTVXY]\\d[ABCEGHJ-NPRSTV-Z] ?\\d[ABCEGHJ-NPRSTV-Z]\\d",
                    Pattern.CASE_INSENSITIVE),
            "GB", Pattern.compile("[A-Z]{1,2}\\d[A-Z\\d]? ?\\d[A-Z]{2}", Pattern.CASE_INSENSITIVE));
    private static final Set<String> COUNTRIES_WITH_REGIONS = Set.of("US", "CA");
    private static final Pattern PO_BOX = Pattern.compile(
            "\\b(?:P\\.?\\s?O\\.?\\s?Box|Post\\s+Office\\s+Box)\\b", Pattern.CASE_INSENSITIVE);

    public List<Violation> validate(Address address, Carrier carrier) {
        String country = trimmed(address.country()).toUpperCase(Locale.ROOT);
        List<Violation> violations = new ArrayList<>();

        if (isBlank(address.name())) {
            violations.add(new Violation("name", REQUIRED));
        }
        if (isBlank(address.line1())) {
            violations.add(new Violation("line1", REQUIRED));
        } else if (isRejectedPoBox(address.line1(), carrier)) {
            violations.add(new Violation("line1", PO_BOX_NOT_ALLOWED));
        }
        if (isRejectedPoBox(address.line2(), carrier)) {
            violations.add(new Violation("line2", PO_BOX_NOT_ALLOWED));
        }
        if (isBlank(address.city())) {
            violations.add(new Violation("city", REQUIRED));
        }
        if (COUNTRIES_WITH_REGIONS.contains(country) && isBlank(address.region())) {
            violations.add(new Violation("region", REQUIRED));
        }
        if (isBlank(address.postalCode())) {
            violations.add(new Violation("postalCode", REQUIRED));
        } else if (!matchesPostalFormat(address.postalCode(), country)) {
            violations.add(new Violation("postalCode", INVALID_FORMAT));
        }
        if (country.isEmpty()) {
            violations.add(new Violation("country", REQUIRED));
        } else if (!POSTAL_CODE_FORMATS.containsKey(country)) {
            violations.add(new Violation("country", UNSUPPORTED_COUNTRY));
        }
        return violations;
    }

    private static boolean matchesPostalFormat(String postalCode, String country) {
        Pattern format = POSTAL_CODE_FORMATS.get(country);
        return format == null || format.matcher(postalCode.trim()).matches();
    }

    private static boolean isRejectedPoBox(String addressLine, Carrier carrier) {
        return !carrier.deliversToPoBoxes() && PO_BOX.matcher(trimmed(addressLine)).find();
    }

    private static boolean isBlank(String value) {
        return trimmed(value).isEmpty();
    }

    private static String trimmed(String value) {
        return value == null ? "" : value.trim();
    }
}
