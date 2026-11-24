#!/usr/bin/env bash
set -euo pipefail
cat > .gitignore <<'EOF'
/target
Cargo.lock
EOF
cat > Cargo.toml <<'EOF'
[package]
name = "ledgerkit"
version = "0.3.0"
edition = "2021"

[dependencies]
EOF
mkdir -p src
cat > src/lib.rs <<'EOF'
mod money;

pub use money::{Currency, Money, MoneyError};
EOF
mkdir -p src
cat > src/money.rs <<'EOF'
use std::error::Error;
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Currency {
    Usd,
    Eur,
    Gbp,
}

impl Currency {
    pub fn code(self) -> &'static str {
        match self {
            Currency::Usd => "USD",
            Currency::Eur => "EUR",
            Currency::Gbp => "GBP",
        }
    }
}

impl fmt::Display for Currency {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.code())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Money {
    minor_units: i64,
    currency: Currency,
}

#[derive(Debug, PartialEq, Eq)]
pub enum MoneyError {
    CurrencyMismatch { left: Currency, right: Currency },
    Overflow,
    NoRatios,
    ZeroRatioTotal,
}

impl fmt::Display for MoneyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MoneyError::CurrencyMismatch { left, right } => {
                write!(f, "cannot combine {} with {}", left, right)
            }
            MoneyError::Overflow => write!(f, "amount overflowed"),
            MoneyError::NoRatios => write!(f, "at least one ratio is required"),
            MoneyError::ZeroRatioTotal => write!(f, "ratios must not all be zero"),
        }
    }
}

impl Error for MoneyError {}

impl Money {
    pub fn new(minor_units: i64, currency: Currency) -> Self {
        Money { minor_units, currency }
    }

    pub fn minor_units(self) -> i64 {
        self.minor_units
    }

    pub fn currency(self) -> Currency {
        self.currency
    }

    pub fn checked_add(self, other: Money) -> Result<Money, MoneyError> {
        todo!()
    }

    pub fn checked_sub(self, other: Money) -> Result<Money, MoneyError> {
        todo!()
    }

    pub fn allocate(self, ratios: &[u32]) -> Result<Vec<Money>, MoneyError> {
        todo!()
    }
}
EOF
mkdir -p tests
cat > tests/money.rs <<'EOF'
use ledgerkit::{Currency, Money, MoneyError};

fn usd(cents: i64) -> Money {
    Money::new(cents, Currency::Usd)
}

fn cents(shares: &[Money]) -> Vec<i64> {
    shares.iter().map(|share| share.minor_units()).collect()
}

#[test]
fn add_combines_amounts_in_the_same_currency() {
    assert_eq!(usd(1050).checked_add(usd(275)), Ok(usd(1325)));
}

#[test]
fn add_rejects_currency_mismatch() {
    let result = usd(100).checked_add(Money::new(100, Currency::Eur));
    assert_eq!(
        result,
        Err(MoneyError::CurrencyMismatch { left: Currency::Usd, right: Currency::Eur })
    );
}

#[test]
fn add_reports_overflow() {
    assert_eq!(usd(i64::MAX).checked_add(usd(1)), Err(MoneyError::Overflow));
}

#[test]
fn sub_can_go_negative() {
    assert_eq!(usd(250).checked_sub(usd(1000)), Ok(usd(-750)));
}

#[test]
fn sub_rejects_currency_mismatch() {
    let result = Money::new(500, Currency::Gbp).checked_sub(usd(100));
    assert_eq!(
        result,
        Err(MoneyError::CurrencyMismatch { left: Currency::Gbp, right: Currency::Usd })
    );
}

#[test]
fn allocate_gives_leftover_cents_to_the_first_shares() {
    let shares = usd(100).allocate(&[1, 1, 1]).unwrap();
    assert_eq!(cents(&shares), vec![34, 33, 33]);
}

#[test]
fn allocate_follows_the_ratios() {
    let shares = usd(5).allocate(&[70, 30]).unwrap();
    assert_eq!(cents(&shares), vec![4, 1]);
}

#[test]
fn allocate_keeps_the_currency() {
    let shares = Money::new(10, Currency::Eur).allocate(&[1, 1]).unwrap();
    assert!(shares.iter().all(|share| share.currency() == Currency::Eur));
}

#[test]
fn allocate_never_loses_or_creates_cents() {
    for amount in [-1001, -7, 0, 1, 99, 100, 12_345, 1_000_003] {
        for ratios in [vec![1, 1, 1], vec![3, 7], vec![1, 2, 3, 4, 5], vec![5]] {
            let shares = usd(amount).allocate(&ratios).unwrap();
            assert_eq!(shares.len(), ratios.len());
            assert_eq!(cents(&shares).iter().sum::<i64>(), amount);
        }
    }
}

#[test]
fn allocate_skips_zero_ratios() {
    let shares = usd(100).allocate(&[1, 0, 2]).unwrap();
    assert_eq!(cents(&shares), vec![34, 0, 66]);
}

#[test]
fn allocate_splits_negative_amounts() {
    let shares = usd(-100).allocate(&[1, 1, 1]).unwrap();
    assert_eq!(cents(&shares), vec![-33, -33, -34]);
}

#[test]
fn allocate_rejects_empty_and_all_zero_ratios() {
    assert_eq!(usd(100).allocate(&[]), Err(MoneyError::NoRatios));
    assert_eq!(usd(100).allocate(&[0, 0]), Err(MoneyError::ZeroRatioTotal));
}
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
