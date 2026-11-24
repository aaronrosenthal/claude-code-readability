#!/usr/bin/env bash
set -euo pipefail
cat > '.gitignore' <<'EOF_FIXTURE'
bin/
obj/
EOF_FIXTURE
mkdir -p 'Loyalty'
cat > 'Loyalty/Loyalty.csproj' <<'EOF_FIXTURE'
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>

</Project>
EOF_FIXTURE
mkdir -p 'Loyalty'
cat > 'Loyalty/LoyaltyCalculator.cs' <<'EOF_FIXTURE'
namespace Loyalty;

public sealed class LoyaltyCalculator
{
    private readonly HashSet<DateOnly> _promoDays;

    public LoyaltyCalculator(IEnumerable<DateOnly> promoDays)
    {
        _promoDays = promoDays.ToHashSet();
    }

    public PointsAward Calculate(Order order, LoyaltyTier tier)
    {
        throw new NotImplementedException();
    }
}
EOF_FIXTURE
mkdir -p 'Loyalty'
cat > 'Loyalty/LoyaltyTier.cs' <<'EOF_FIXTURE'
namespace Loyalty;

public enum LoyaltyTier
{
    Bronze,
    Silver,
    Gold,
    Platinum,
}
EOF_FIXTURE
mkdir -p 'Loyalty'
cat > 'Loyalty/Order.cs' <<'EOF_FIXTURE'
namespace Loyalty;

public sealed record Order(DateOnly PlacedOn, IReadOnlyList<OrderLine> Lines);
EOF_FIXTURE
mkdir -p 'Loyalty'
cat > 'Loyalty/OrderLine.cs' <<'EOF_FIXTURE'
namespace Loyalty;

public sealed record OrderLine(
    string Sku,
    ProductCategory Category,
    decimal UnitPrice,
    int Quantity,
    decimal Discount = 0m);
EOF_FIXTURE
mkdir -p 'Loyalty'
cat > 'Loyalty/PointsAward.cs' <<'EOF_FIXTURE'
namespace Loyalty;

public sealed record PointsAward(int Points, decimal EligibleSpend, bool CapApplied);
EOF_FIXTURE
mkdir -p 'Loyalty'
cat > 'Loyalty/ProductCategory.cs' <<'EOF_FIXTURE'
namespace Loyalty;

public enum ProductCategory
{
    Grocery,
    Apparel,
    Home,
    Electronics,
    GiftCard,
    Alcohol,
    Tobacco,
}
EOF_FIXTURE
mkdir -p 'Tests'
cat > 'Tests/Program.cs' <<'EOF_FIXTURE'
using Loyalty;

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

var promoDay = new DateOnly(2025, 11, 28);
var regularDay = new DateOnly(2025, 11, 12);
var calculator = new LoyaltyCalculator(new[] { promoDay });

OrderLine Line(ProductCategory category, decimal unitPrice, int quantity = 1, decimal discount = 0m) =>
    new("SKU", category, unitPrice, quantity, discount);

PointsAward Award(LoyaltyTier tier, DateOnly date, params OrderLine[] lines) =>
    calculator.Calculate(new Order(date, lines), tier);

Test("bronze earns one point per currency unit", () =>
    AssertEqual(30, Award(LoyaltyTier.Bronze, regularDay, Line(ProductCategory.Grocery, 10.00m, 3)).Points));

Test("tier multipliers apply", () =>
{
    var line = Line(ProductCategory.Home, 40.00m);
    AssertEqual(40, Award(LoyaltyTier.Bronze, regularDay, line).Points);
    AssertEqual(50, Award(LoyaltyTier.Silver, regularDay, line).Points);
    AssertEqual(60, Award(LoyaltyTier.Gold, regularDay, line).Points);
    AssertEqual(80, Award(LoyaltyTier.Platinum, regularDay, line).Points);
});

Test("half points round away from zero", () =>
{
    AssertEqual(13, Award(LoyaltyTier.Silver, regularDay, Line(ProductCategory.Home, 10.00m)).Points);
    AssertEqual(63, Award(LoyaltyTier.Silver, regularDay, Line(ProductCategory.Home, 50.00m)).Points);
});

Test("rounding happens once per order, not per line", () =>
{
    var lines = new[] { Line(ProductCategory.Home, 10.00m), Line(ProductCategory.Apparel, 10.00m) };
    AssertEqual(25, Award(LoyaltyTier.Silver, regularDay, lines).Points);
});

Test("fractional currency amounts round down below the midpoint", () =>
    AssertEqual(12, Award(LoyaltyTier.Silver, regularDay, Line(ProductCategory.Home, 9.99m)).Points));

Test("gift cards, alcohol and tobacco earn nothing", () =>
{
    var award = Award(LoyaltyTier.Bronze, regularDay,
        Line(ProductCategory.GiftCard, 100.00m),
        Line(ProductCategory.Alcohol, 30.00m),
        Line(ProductCategory.Tobacco, 15.00m),
        Line(ProductCategory.Grocery, 20.00m));
    AssertEqual(20, award.Points);
    AssertEqual(20.00m, award.EligibleSpend);
});

Test("an order of only excluded items earns zero", () =>
{
    var award = Award(LoyaltyTier.Platinum, promoDay, Line(ProductCategory.GiftCard, 250.00m));
    AssertEqual(new PointsAward(0, 0m, false), award);
});

Test("electronics earn half rate", () =>
    AssertEqual(50, Award(LoyaltyTier.Bronze, regularDay, Line(ProductCategory.Electronics, 100.00m)).Points));

Test("electronics and other lines are combined before multipliers", () =>
{
    var award = Award(LoyaltyTier.Gold, regularDay,
        Line(ProductCategory.Electronics, 100.00m),
        Line(ProductCategory.Grocery, 20.00m));
    AssertEqual(105, award.Points);
    AssertEqual(120.00m, award.EligibleSpend);
});

Test("line discounts reduce eligible spend", () =>
{
    var award = Award(LoyaltyTier.Bronze, regularDay, Line(ProductCategory.Apparel, 20.00m, 2, 10.00m));
    AssertEqual(30, award.Points);
    AssertEqual(30.00m, award.EligibleSpend);
});

Test("a discount larger than its line cannot make spend negative", () =>
{
    var award = Award(LoyaltyTier.Bronze, regularDay,
        Line(ProductCategory.Apparel, 10.00m, 1, 15.00m),
        Line(ProductCategory.Home, 20.00m));
    AssertEqual(20, award.Points);
    AssertEqual(20.00m, award.EligibleSpend);
});

Test("orders under five in eligible spend earn nothing", () =>
{
    AssertEqual(0, Award(LoyaltyTier.Platinum, regularDay, Line(ProductCategory.Grocery, 4.99m)).Points);
    AssertEqual(5, Award(LoyaltyTier.Bronze, regularDay, Line(ProductCategory.Grocery, 5.00m)).Points);
});

Test("promo days double points on top of the tier multiplier", () =>
{
    AssertEqual(120, Award(LoyaltyTier.Gold, promoDay, Line(ProductCategory.Home, 40.00m)).Points);
    AssertEqual(80, Award(LoyaltyTier.Bronze, promoDay, Line(ProductCategory.Home, 40.00m)).Points);
});

Test("promo days do not change which spend is eligible", () =>
{
    var award = Award(LoyaltyTier.Bronze, promoDay,
        Line(ProductCategory.Alcohol, 50.00m),
        Line(ProductCategory.Home, 10.00m));
    AssertEqual(new PointsAward(20, 10.00m, false), award);
});

Test("bronze orders are capped at 500 points", () =>
{
    var award = Award(LoyaltyTier.Bronze, regularDay, Line(ProductCategory.Home, 1000.00m));
    AssertEqual(new PointsAward(500, 1000.00m, true), award);
});

Test("an order that lands exactly on the cap is not reported as capped", () =>
    AssertEqual(new PointsAward(500, 500.00m, false),
        Award(LoyaltyTier.Bronze, regularDay, Line(ProductCategory.Home, 500.00m))));

Test("caps grow with the tier", () =>
{
    var line = Line(ProductCategory.Home, 10_000.00m);
    AssertEqual(1000, Award(LoyaltyTier.Silver, regularDay, line).Points);
    AssertEqual(2000, Award(LoyaltyTier.Gold, regularDay, line).Points);
    AssertEqual(5000, Award(LoyaltyTier.Platinum, regularDay, line).Points);
});

Test("promo days do not raise the cap", () =>
{
    var award = Award(LoyaltyTier.Platinum, promoDay, Line(ProductCategory.Home, 3000.00m));
    AssertEqual(new PointsAward(5000, 3000.00m, true), award);
});

Test("an empty order earns nothing", () =>
    AssertEqual(new PointsAward(0, 0m, false), Award(LoyaltyTier.Gold, regularDay)));

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
    <ProjectReference Include="../Loyalty/Loyalty.csproj" />
  </ItemGroup>

</Project>
EOF_FIXTURE
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
