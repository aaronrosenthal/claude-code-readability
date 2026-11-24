#!/usr/bin/env bash
set -euo pipefail
cat > '.gitignore' <<'EOF_FIXTURE'
bin/
obj/
EOF_FIXTURE
mkdir -p 'Lending'
cat > 'Lending/Book.cs' <<'EOF_FIXTURE'
namespace Lending;

/// <summary>A title in the library catalogue.</summary>
/// <param name="Id">The catalogue identifier, unique per physical copy.</param>
/// <param name="Title">The title as printed on the cover.</param>
public sealed record Book(string Id, string Title);
EOF_FIXTURE
mkdir -p 'Lending'
cat > 'Lending/Lending.csproj' <<'EOF_FIXTURE'
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <GenerateDocumentationFile>true</GenerateDocumentationFile>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
  </PropertyGroup>

</Project>
EOF_FIXTURE
mkdir -p 'Lending'
cat > 'Lending/Loan.cs' <<'EOF_FIXTURE'
namespace Lending;

/// <summary>A copy of a book checked out by a member.</summary>
/// <param name="BookId">The identifier of the borrowed copy.</param>
/// <param name="MemberId">The identifier of the borrowing member.</param>
/// <param name="BorrowedOn">The date the copy was checked out.</param>
/// <param name="DueOn">The date the copy should be back on the shelf.</param>
public sealed record Loan(string BookId, string MemberId, DateOnly BorrowedOn, DateOnly DueOn);
EOF_FIXTURE
mkdir -p 'Lending'
cat > 'Lending/LoanLedger.cs' <<'EOF_FIXTURE'
namespace Lending;

/// <summary>Keeps track of which copies are currently checked out.</summary>
public sealed class LoanLedger
{
    private readonly Dictionary<string, Loan> _loansByBook = new();

    /// <summary>Records a new loan.</summary>
    /// <param name="loan">The loan to record.</param>
    /// <exception cref="InvalidOperationException">The copy is already checked out.</exception>
    public void Add(Loan loan)
    {
        if (!_loansByBook.TryAdd(loan.BookId, loan))
        {
            throw new InvalidOperationException($"Book {loan.BookId} is already on loan.");
        }
    }

    /// <summary>Removes the loan for a returned copy.</summary>
    /// <param name="bookId">The identifier of the returned copy.</param>
    /// <returns>The loan that was closed, or <c>null</c> if the copy was not on loan.</returns>
    public Loan? Close(string bookId)
    {
        return _loansByBook.Remove(bookId, out var loan) ? loan : null;
    }

    /// <summary>Lists the open loans of one member, earliest due date first.</summary>
    /// <param name="memberId">The member to look up.</param>
    /// <returns>The member's open loans.</returns>
    public IReadOnlyList<Loan> OpenLoansFor(string memberId)
    {
        return _loansByBook.Values
            .Where(loan => loan.MemberId == memberId)
            .OrderBy(loan => loan.DueOn)
            .ToList();
    }
}
EOF_FIXTURE
mkdir -p 'Tests'
cat > 'Tests/Program.cs' <<'EOF_FIXTURE'
using Lending;

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

var dueOn = new DateOnly(2025, 3, 10);
var loan = new Loan("B-1", "M-1", new DateOnly(2025, 2, 24), dueOn);

Test("ledger rejects a second loan of the same copy", () =>
{
    var ledger = new LoanLedger();
    ledger.Add(loan);
    try
    {
        ledger.Add(loan with { MemberId = "M-2" });
        throw new Exception("expected InvalidOperationException");
    }
    catch (InvalidOperationException)
    {
    }
});

Test("ledger lists open loans by due date", () =>
{
    var ledger = new LoanLedger();
    ledger.Add(new Loan("B-2", "M-1", new DateOnly(2025, 3, 1), new DateOnly(2025, 3, 15)));
    ledger.Add(loan);
    ledger.Add(new Loan("B-3", "M-9", new DateOnly(2025, 3, 1), new DateOnly(2025, 3, 8)));
    AssertEqual("B-1,B-2", string.Join(",", ledger.OpenLoansFor("M-1").Select(l => l.BookId)));
});

Test("closing a loan returns it and frees the copy", () =>
{
    var ledger = new LoanLedger();
    ledger.Add(loan);
    AssertEqual(loan, ledger.Close("B-1"));
    AssertEqual(null, ledger.Close("B-1"));
    ledger.Add(loan);
});

var calculator = new LateFeeCalculator(dailyRate: 0.25m, maxFee: 5.00m, graceDays: 3);

Test("no fee when returned on or before the due date", () =>
{
    AssertEqual(0m, calculator.CalculateFee(loan, dueOn.AddDays(-4)));
    AssertEqual(0m, calculator.CalculateFee(loan, dueOn));
});

Test("no fee while within the grace period", () =>
{
    AssertEqual(0m, calculator.CalculateFee(loan, dueOn.AddDays(3)));
    AssertEqual(false, calculator.IsOverdue(loan, dueOn.AddDays(3)));
});

Test("fee covers every day since the due date once grace has passed", () =>
{
    AssertEqual(1.00m, calculator.CalculateFee(loan, dueOn.AddDays(4)));
    AssertEqual(true, calculator.IsOverdue(loan, dueOn.AddDays(4)));
    AssertEqual(2.50m, calculator.CalculateFee(loan, dueOn.AddDays(10)));
});

Test("fee is capped at the maximum", () =>
    AssertEqual(5.00m, calculator.CalculateFee(loan, dueOn.AddDays(90))));

Test("daily rates round to cents", () =>
{
    var thirds = new LateFeeCalculator(dailyRate: 0.333m, maxFee: 50m, graceDays: 0);
    AssertEqual(1.67m, thirds.CalculateFee(loan, dueOn.AddDays(5)));
});

Test("the standard policy is 25 cents a day, 10.00 maximum, 3 days grace", () =>
{
    var standard = LateFeeCalculator.Standard;
    AssertEqual(10.00m, standard.MaxFee);
    AssertEqual(0m, standard.CalculateFee(loan, dueOn.AddDays(3)));
    AssertEqual(1.00m, standard.CalculateFee(loan, dueOn.AddDays(4)));
    AssertEqual(10.00m, standard.CalculateFee(loan, dueOn.AddDays(200)));
});

Test("negative amounts are rejected", () =>
{
    foreach (var make in new Func<LateFeeCalculator>[]
    {
        () => new LateFeeCalculator(-0.01m, 5m, 0),
        () => new LateFeeCalculator(0.25m, -5m, 0),
        () => new LateFeeCalculator(0.25m, 5m, -1),
    })
    {
        try
        {
            make();
            throw new Exception("expected ArgumentOutOfRangeException");
        }
        catch (ArgumentOutOfRangeException)
        {
        }
    }
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
    <ProjectReference Include="../Lending/Lending.csproj" />
  </ItemGroup>

</Project>
EOF_FIXTURE
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
