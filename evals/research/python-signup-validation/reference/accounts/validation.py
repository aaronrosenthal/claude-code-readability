import re
from datetime import date
from typing import Dict, List

MIN_AGE_YEARS = 16
RESERVED_USERNAMES = {"admin", "root", "support"}

FIELDS = ("email", "username", "password", "birthdate", "country", "postal_code")

POSTAL_CODE_PATTERNS = {
    "US": re.compile(r"\d{5}(-\d{4})?"),
    "CA": re.compile(r"[ABCEGHJ-NPRSTVXY]\d[A-Z] ?\d[A-Z]\d", re.IGNORECASE),
    "GB": re.compile(r"[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}", re.IGNORECASE),
    "DE": re.compile(r"\d{5}"),
}


def validate_signup(form: Dict[str, str], today: date) -> Dict[str, List[str]]:
    values = {field: form.get(field, "").strip() for field in FIELDS}

    errors = {
        "email": _email_errors(values["email"]),
        "username": _username_errors(values["username"]),
        "password": _password_errors(values["password"], values["username"]),
        "birthdate": _birthdate_errors(values["birthdate"], today),
        "country": _country_errors(values["country"]),
        "postal_code": _postal_code_errors(values["postal_code"], values["country"]),
    }
    return {field: codes for field, codes in errors.items() if codes}


def _email_errors(email: str) -> List[str]:
    if not email:
        return ["required"]
    local, _, domain = email.partition("@")
    well_formed = (
        local
        and "@" not in domain
        and "." in domain.strip(".")
        and not any(ch.isspace() for ch in email)
    )
    return [] if well_formed else ["invalid"]


def _username_errors(username: str) -> List[str]:
    if not username:
        return ["required"]
    errors = []
    if not 3 <= len(username) <= 20:
        errors.append("length")
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", username):
        errors.append("characters")
    if username.lower() in RESERVED_USERNAMES:
        errors.append("reserved")
    return errors


def _password_errors(password: str, username: str) -> List[str]:
    if not password:
        return ["required"]
    checks = [
        ("too_short", len(password) < 12),
        ("needs_upper", not any(ch.isupper() for ch in password)),
        ("needs_lower", not any(ch.islower() for ch in password)),
        ("needs_digit", not any(ch.isdigit() for ch in password)),
        ("contains_username", bool(username) and username.lower() in password.lower()),
    ]
    return [code for code, failed in checks if failed]


def _birthdate_errors(raw: str, today: date) -> List[str]:
    if not raw:
        return ["required"]
    try:
        birthdate = date.fromisoformat(raw)
    except ValueError:
        return ["invalid"]
    if birthdate > today:
        return ["future"]
    had_birthday = (today.month, today.day) >= (birthdate.month, birthdate.day)
    age = today.year - birthdate.year - (0 if had_birthday else 1)
    return ["too_young"] if age < MIN_AGE_YEARS else []


def _country_errors(country: str) -> List[str]:
    if not country:
        return ["required"]
    return [] if country in POSTAL_CODE_PATTERNS else ["unsupported"]


def _postal_code_errors(postal_code: str, country: str) -> List[str]:
    if not postal_code:
        return ["required"]
    pattern = POSTAL_CODE_PATTERNS.get(country)
    if pattern is None:
        return []
    return [] if pattern.fullmatch(postal_code) else ["invalid"]
