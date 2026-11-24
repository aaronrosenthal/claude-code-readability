---
type: regex
target: { source: file, path: test/billing/renewal_calculator_test.rb }
pattern: 'assert_equal Date\.new\(2028, 2, 29\), plan\.next_renewal_on\(Date\.new\(2027, 3, 1\)\)'
---
