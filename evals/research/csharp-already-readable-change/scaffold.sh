#!/usr/bin/env bash
set -euo pipefail
cat > '.gitignore' <<'EOF_FIXTURE'
bin/
obj/
EOF_FIXTURE
mkdir -p 'Promotions'
cat > 'Promotions/Coupon.cs' <<'EOF_FIXTURE'
namespace Promotions;

public sealed record Coupon(
    string Code,
    decimal PercentOff,
    DateOnly ValidFrom,
    DateOnly ValidUntil,
    decimal MinimumSubtotal);
EOF_FIXTURE
mkdir -p 'Promotions'
cat > 'Promotions/CouponResult.cs' <<'EOF_FIXTURE'
namespace Promotions;

public sealed record CouponResult(bool IsValid, RejectionReason? Reason)
{
    public static CouponResult Valid { get; } = new(true, null);

    public static CouponResult Rejected(RejectionReason reason) => new(false, reason);
}
EOF_FIXTURE
mkdir -p 'Promotions'
cat > 'Promotions/CouponValidator.cs' <<'EOF_FIXTURE'
namespace Promotions;

public sealed class CouponValidator
{
    /// <summary>Checks a coupon against an order. Only the first rule that fails is reported.</summary>
    public CouponResult Validate(Coupon coupon, Order order, DateOnly today)
    {
        if (IsNotYetValid(coupon, today))
        {
            return CouponResult.Rejected(RejectionReason.NotYetValid);
        }

        if (IsExpired(coupon, today))
        {
            return CouponResult.Rejected(RejectionReason.Expired);
        }

        if (IsBelowMinimum(coupon, order))
        {
            return CouponResult.Rejected(RejectionReason.BelowMinimumSubtotal);
        }

        return CouponResult.Valid;
    }

    private static bool IsNotYetValid(Coupon coupon, DateOnly today) => today < coupon.ValidFrom;

    private static bool IsExpired(Coupon coupon, DateOnly today) => today > coupon.ValidUntil;

    private static bool IsBelowMinimum(Coupon coupon, Order order) => order.Subtotal < coupon.MinimumSubtotal;
}
EOF_FIXTURE
mkdir -p 'Promotions'
cat > 'Promotions/Order.cs' <<'EOF_FIXTURE'
namespace Promotions;

public sealed record Order(decimal Subtotal, int PriorOrderCount);
EOF_FIXTURE
mkdir -p 'Promotions'
cat > 'Promotions/Promotions.csproj' <<'EOF_FIXTURE'
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>

</Project>
EOF_FIXTURE
mkdir -p 'Promotions'
cat > 'Promotions/RejectionReason.cs' <<'EOF_FIXTURE'
namespace Promotions;

public enum RejectionReason
{
    NotYetValid,
    Expired,
    BelowMinimumSubtotal,
}
EOF_FIXTURE
mkdir -p 'Tests'
cat > 'Tests/Program.cs' <<'EOF_FIXTURE'
using Promotions;

var failures = new List<string>();
var count = 0;

void Test(string name, Action body)
{
    count++;
    try
    {
        body();
    }
    catch (Exception ex)
    {
        failures.Add($"{name}: {ex.GetType().Name}: {ex.Message}");
    }
}

void AssertEqual<T>(T expected, T actual)
{
    if (!EqualityComparer<T>.Default.Equals(expected, actual))
    {
        throw new Exception($"expected {expected} but was {actual}");
    }
}

var validator = new CouponValidator();
var from = new DateOnly(2025, 6, 1);
var until = new DateOnly(2025, 6, 30);
var coupon = new Coupon("SUMMER10", 10m, from, until, MinimumSubtotal: 50m);
var order = new Order(Subtotal: 80m, PriorOrderCount: 0);

Test("a coupon inside its dates and above the minimum is valid", () =>
    AssertEqual(CouponResult.Valid, validator.Validate(coupon, order, new DateOnly(2025, 6, 15))));

Test("the first and last day are valid", () =>
{
    AssertEqual(true, validator.Validate(coupon, order, from).IsValid);
    AssertEqual(true, validator.Validate(coupon, order, until).IsValid);
});

Test("before the start date the coupon is not yet valid", () =>
    AssertEqual(CouponResult.Rejected(RejectionReason.NotYetValid),
        validator.Validate(coupon, order, from.AddDays(-1))));

Test("after the end date the coupon is expired", () =>
    AssertEqual(CouponResult.Rejected(RejectionReason.Expired),
        validator.Validate(coupon, order, until.AddDays(1))));

Test("a subtotal below the minimum is rejected", () =>
    AssertEqual(CouponResult.Rejected(RejectionReason.BelowMinimumSubtotal),
        validator.Validate(coupon, order with { Subtotal = 49.99m }, from)));

Test("a subtotal exactly at the minimum is accepted", () =>
    AssertEqual(true, validator.Validate(coupon, order with { Subtotal = 50m }, from).IsValid));

Test("date problems are reported before the minimum", () =>
    AssertEqual(CouponResult.Rejected(RejectionReason.Expired),
        validator.Validate(coupon, order with { Subtotal = 1m }, until.AddDays(1))));

Test("new-customer coupons accept first orders", () =>
{
    var welcome = coupon with { NewCustomersOnly = true };
    AssertEqual(true, validator.Validate(welcome, order, from).IsValid);
});

Test("new-customer coupons reject returning customers", () =>
{
    var welcome = coupon with { NewCustomersOnly = true };
    AssertEqual(CouponResult.Rejected(RejectionReason.NewCustomersOnly),
        validator.Validate(welcome, order with { PriorOrderCount = 1 }, from));
});

Test("ordinary coupons ignore order history", () =>
    AssertEqual(true, validator.Validate(coupon, order with { PriorOrderCount = 12 }, from).IsValid));

Test("coupons are not restricted to new customers unless flagged", () =>
    AssertEqual(false, new Coupon("X", 5m, from, until, 0m).NewCustomersOnly));

Test("the new-customer rule is checked after the existing rules", () =>
{
    var welcome = coupon with { NewCustomersOnly = true };
    var returning = order with { PriorOrderCount = 3 };
    AssertEqual(CouponResult.Rejected(RejectionReason.Expired),
        validator.Validate(welcome, returning, until.AddDays(1)));
    AssertEqual(CouponResult.Rejected(RejectionReason.BelowMinimumSubtotal),
        validator.Validate(welcome, returning with { Subtotal = 10m }, from));
});

if (failures.Count > 0)
{
    foreach (var failure in failures)
    {
        Console.WriteLine($"FAIL {failure}");
    }
    Console.WriteLine($"{failures.Count} of {count} TESTS FAILED");
    return 1;
}

Console.WriteLine($"ALL {count} TESTS PASSED");
return 0;
EOF_FIXTURE
mkdir -p 'Tests'
cat > 'Tests/Tests.csproj' <<'EOF_FIXTURE'
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="../Promotions/Promotions.csproj" />
  </ItemGroup>

</Project>
EOF_FIXTURE
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
