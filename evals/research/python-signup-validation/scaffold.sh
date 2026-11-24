#!/usr/bin/env bash
set -euo pipefail
cat > README.md <<'EOF'
# accounts

Signup handling for the customer portal. `accounts.validation.validate_signup` is called by the
web handler before an account is created.
EOF
mkdir -p accounts
cat > accounts/__init__.py <<'EOF'

EOF
mkdir -p accounts
cat > accounts/validation.py <<'EOF'
from datetime import date
from typing import Dict, List


def validate_signup(form: Dict[str, str], today: date) -> Dict[str, List[str]]:
    raise NotImplementedError
EOF
mkdir -p tests
cat > tests/test_validation.py <<'EOF'
import unittest
from datetime import date

from accounts.validation import validate_signup

TODAY = date(2024, 6, 15)

VALID = {
    "email": "maria.lopez@example.com",
    "username": "maria_l",
    "password": "Correct-Horse-9",
    "birthdate": "1990-04-02",
    "country": "US",
    "postal_code": "94110",
}


def form(**overrides):
    return {**VALID, **overrides}


class ValidateSignupTest(unittest.TestCase):
    def test_valid_form_has_no_errors(self):
        self.assertEqual(validate_signup(VALID, TODAY), {})

    def test_collects_errors_for_every_field(self):
        errors = validate_signup({}, TODAY)
        self.assertEqual(
            errors,
            {
                "email": ["required"],
                "username": ["required"],
                "password": ["required"],
                "birthdate": ["required"],
                "country": ["required"],
                "postal_code": ["required"],
            },
        )

    def test_whitespace_only_counts_as_blank(self):
        self.assertEqual(validate_signup(form(email="   "), TODAY), {"email": ["required"]})

    def test_email_format(self):
        for bad in ["maria", "maria@", "@example.com", "maria@example", "ma ria@example.com", "a@b@example.com"]:
            with self.subTest(email=bad):
                self.assertEqual(validate_signup(form(email=bad), TODAY), {"email": ["invalid"]})

    def test_username_rules(self):
        cases = {
            "ab": ["length"],
            "a" * 21: ["length"],
            "1maria": ["characters"],
            "maria-l": ["characters"],
            "Admin": ["reserved"],
            "ROOT": ["reserved"],
        }
        for username, expected in cases.items():
            with self.subTest(username=username):
                errors = validate_signup(form(username=username, password="Zebra-Crossing-42"), TODAY)
                self.assertEqual(errors, {"username": expected})

    def test_password_reports_every_broken_rule(self):
        errors = validate_signup(form(password="abc"), TODAY)
        self.assertEqual(errors, {"password": ["too_short", "needs_upper", "needs_digit"]})

    def test_password_may_not_contain_username(self):
        errors = validate_signup(form(username="maria_l", password="Xx-MARIA_L-12345"), TODAY)
        self.assertEqual(errors, {"password": ["contains_username"]})

    def test_birthdate_must_be_a_real_iso_date(self):
        for bad in ["04/02/1990", "1990-13-01", "1990-02-30", "yesterday"]:
            with self.subTest(birthdate=bad):
                self.assertEqual(validate_signup(form(birthdate=bad), TODAY), {"birthdate": ["invalid"]})

    def test_birthdate_in_the_future(self):
        self.assertEqual(validate_signup(form(birthdate="2024-06-16"), TODAY), {"birthdate": ["future"]})

    def test_minimum_age_is_sixteen_on_the_birthday(self):
        self.assertEqual(validate_signup(form(birthdate="2008-06-15"), TODAY), {})
        self.assertEqual(validate_signup(form(birthdate="2008-06-16"), TODAY), {"birthdate": ["too_young"]})

    def test_leap_day_birthday(self):
        self.assertEqual(validate_signup(form(birthdate="2008-02-29"), TODAY), {})

    def test_postal_codes_by_country(self):
        good = {
            "US": ["94110", "94110-1234"],
            "CA": ["K1A 0B1", "k1a0b1"],
            "GB": ["SW1A 1AA", "M1 1AE", "ec1a1bb"],
            "DE": ["10115"],
        }
        bad = {
            "US": ["9411", "94110-12", "ABCDE"],
            "CA": ["D1A 0B1", "K1A 0B"],
            "GB": ["SW1A", "12345"],
            "DE": ["1011", "10115-1"],
        }
        for country, codes in good.items():
            for code in codes:
                with self.subTest(country=country, postal_code=code):
                    self.assertEqual(validate_signup(form(country=country, postal_code=code), TODAY), {})
        for country, codes in bad.items():
            for code in codes:
                with self.subTest(country=country, postal_code=code):
                    errors = validate_signup(form(country=country, postal_code=code), TODAY)
                    self.assertEqual(errors, {"postal_code": ["invalid"]})

    def test_unsupported_country_skips_postal_code_check(self):
        self.assertEqual(validate_signup(form(country="FR", postal_code="!!"), TODAY), {"country": ["unsupported"]})


if __name__ == "__main__":
    unittest.main()
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
