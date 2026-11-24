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
        self.ensure_same_currency(other)?;
        let sum = self
            .minor_units
            .checked_add(other.minor_units)
            .ok_or(MoneyError::Overflow)?;
        Ok(Money::new(sum, self.currency))
    }

    pub fn checked_sub(self, other: Money) -> Result<Money, MoneyError> {
        self.ensure_same_currency(other)?;
        let difference = self
            .minor_units
            .checked_sub(other.minor_units)
            .ok_or(MoneyError::Overflow)?;
        Ok(Money::new(difference, self.currency))
    }

    /// Splits the amount in proportion to `ratios`. Every share is rounded down
    /// and the cents left over go to the first non-zero ratios, one each, so the
    /// shares always add up to the original amount.
    pub fn allocate(self, ratios: &[u32]) -> Result<Vec<Money>, MoneyError> {
        if ratios.is_empty() {
            return Err(MoneyError::NoRatios);
        }
        let ratio_total: i128 = ratios.iter().map(|&ratio| i128::from(ratio)).sum();
        if ratio_total == 0 {
            return Err(MoneyError::ZeroRatioTotal);
        }

        let amount = i128::from(self.minor_units);
        let mut shares: Vec<i64> = ratios
            .iter()
            .map(|&ratio| (amount * i128::from(ratio)).div_euclid(ratio_total) as i64)
            .collect();

        let leftover_cents = self.minor_units - shares.iter().sum::<i64>();
        let non_zero_shares = shares
            .iter_mut()
            .zip(ratios)
            .filter(|(_, &ratio)| ratio > 0)
            .map(|(share, _)| share);
        for share in non_zero_shares.take(leftover_cents as usize) {
            *share += 1;
        }

        Ok(shares
            .into_iter()
            .map(|cents| Money::new(cents, self.currency))
            .collect())
    }

    fn ensure_same_currency(self, other: Money) -> Result<(), MoneyError> {
        if self.currency == other.currency {
            Ok(())
        } else {
            Err(MoneyError::CurrencyMismatch { left: self.currency, right: other.currency })
        }
    }
}
