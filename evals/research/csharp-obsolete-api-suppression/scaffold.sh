#!/usr/bin/env bash
set -euo pipefail
cat > '.gitignore' <<'EOF_FIXTURE'
bin/
obj/
EOF_FIXTURE
mkdir -p 'Shipping'
cat > 'Shipping/LabelService.cs' <<'EOF_FIXTURE'
using ParcelHub;

namespace Shipping;

public sealed class LabelService
{
    private readonly LabelClient _client;

    public LabelService(LabelClient client)
    {
        _client = client;
    }

    public ShippingLabel Create(Shipment shipment)
    {
        var request = new LabelRequest(
            shipment.CarrierCode,
            shipment.RecipientName,
            shipment.PostalCode,
            shipment.WeightGrams);

        var response = _client.CreateLabel(request);
        return new ShippingLabel(response.TrackingNumber, response.LabelUrl);
    }
}
EOF_FIXTURE
mkdir -p 'Shipping'
cat > 'Shipping/Shipment.cs' <<'EOF_FIXTURE'
namespace Shipping;

public sealed record Shipment(
    string OrderId,
    string CarrierCode,
    string RecipientName,
    string PostalCode,
    int WeightGrams);
EOF_FIXTURE
mkdir -p 'Shipping'
cat > 'Shipping/Shipping.csproj' <<'EOF_FIXTURE'
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="../Vendor/ParcelHub/ParcelHub.csproj" />
  </ItemGroup>

</Project>
EOF_FIXTURE
mkdir -p 'Shipping'
cat > 'Shipping/ShippingLabel.cs' <<'EOF_FIXTURE'
namespace Shipping;

public sealed record ShippingLabel(string TrackingNumber, string LabelUrl);
EOF_FIXTURE
mkdir -p 'Tests'
cat > 'Tests/Program.cs' <<'EOF_FIXTURE'
using ParcelHub;
using Shipping;

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

var shipment = new Shipment("O-1001", "DHLX", "Ada Lovelace", "SW1A 1AA", 1250);

(LabelService Service, FakeTransport Transport) Create()
{
    var transport = new FakeTransport();
    return (new LabelService(new LabelClient(transport)), transport);
}

Test("carriers on v3 use the v3 endpoint", () =>
{
    var (service, transport) = Create();
    service.Create(shipment);
    AssertEqual("/v3/labels", transport.Endpoints.Single());
});

Test("NORDPOST labels are created through the v1 endpoint", () =>
{
    var (service, transport) = Create();
    service.Create(shipment with { CarrierCode = "NORDPOST" });
    AssertEqual("/v1/labels", transport.Endpoints.Single());
});

Test("shipment details are passed to the carrier", () =>
{
    var (service, transport) = Create();
    service.Create(shipment with { CarrierCode = "NORDPOST", PostalCode = "0150", WeightGrams = 800 });
    var fields = transport.Fields.Single();
    AssertEqual("NORDPOST", fields["carrier"]);
    AssertEqual("Ada Lovelace", fields["recipient"]);
    AssertEqual("0150", fields["postal_code"]);
    AssertEqual("800", fields["weight_g"]);
});

Test("the label comes back with its tracking number", () =>
{
    var (service, _) = Create();
    var label = service.Create(shipment with { CarrierCode = "NORDPOST" });
    AssertEqual(new ShippingLabel("TRK-/v1/labels", "https://labels.example.test//v1/labels"), label);
});

Test("v3 labels come back with their tracking number", () =>
{
    var (service, _) = Create();
    AssertEqual(new ShippingLabel("TRK-/v3/labels", "https://labels.example.test//v3/labels"), service.Create(shipment));
});

Test("carrier codes are matched exactly", () =>
{
    var (service, transport) = Create();
    service.Create(shipment with { CarrierCode = "NORDPOST-EXPRESS" });
    service.Create(shipment with { CarrierCode = "nordpost" });
    AssertEqual(2, transport.Endpoints.Count(endpoint => endpoint == "/v3/labels"));
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

sealed class FakeTransport : ILabelTransport
{
    public List<string> Endpoints { get; } = new();
    public List<IReadOnlyDictionary<string, string>> Fields { get; } = new();

    public IReadOnlyDictionary<string, string> Send(string endpoint, IReadOnlyDictionary<string, string> fields)
    {
        Endpoints.Add(endpoint);
        Fields.Add(fields);
        return new Dictionary<string, string>
        {
            ["tracking_number"] = "TRK-" + endpoint,
            ["label_url"] = "https://labels.example.test/" + endpoint,
        };
    }
}
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
    <ProjectReference Include="../Shipping/Shipping.csproj" />
  </ItemGroup>

</Project>
EOF_FIXTURE
mkdir -p 'Vendor/ParcelHub'
cat > 'Vendor/ParcelHub/LabelClient.cs' <<'EOF_FIXTURE'
namespace ParcelHub;

/// <summary>Sends a request to the ParcelHub API and returns the decoded response fields.</summary>
public interface ILabelTransport
{
    IReadOnlyDictionary<string, string> Send(string endpoint, IReadOnlyDictionary<string, string> fields);
}

/// <summary>Everything ParcelHub needs to print a shipping label.</summary>
public sealed record LabelRequest(string CarrierCode, string RecipientName, string PostalCode, int WeightGrams);

/// <summary>A label that ParcelHub has created.</summary>
public sealed record LabelResponse(string TrackingNumber, string LabelUrl);

/// <summary>Client for the ParcelHub label API, release 3.4.</summary>
public sealed class LabelClient
{
    private readonly ILabelTransport _transport;

    /// <summary>Creates a client that talks to ParcelHub through the given transport.</summary>
    public LabelClient(ILabelTransport transport)
    {
        _transport = transport;
    }

    /// <summary>Creates a label through the v3 endpoint.</summary>
    public LabelResponse CreateLabel(LabelRequest request)
    {
        return Send("/v3/labels", request);
    }

    /// <summary>Creates a label through the v1 endpoint.</summary>
    [Obsolete("The v1 endpoint is deprecated; use CreateLabel. It remains for carriers that have not moved to v3 yet.")]
    public LabelResponse CreateLegacyLabel(LabelRequest request)
    {
        return Send("/v1/labels", request);
    }

    private LabelResponse Send(string endpoint, LabelRequest request)
    {
        var fields = new Dictionary<string, string>
        {
            ["carrier"] = request.CarrierCode,
            ["recipient"] = request.RecipientName,
            ["postal_code"] = request.PostalCode,
            ["weight_g"] = request.WeightGrams.ToString(),
        };
        var response = _transport.Send(endpoint, fields);
        return new LabelResponse(response["tracking_number"], response["label_url"]);
    }
}
EOF_FIXTURE
mkdir -p 'Vendor/ParcelHub'
cat > 'Vendor/ParcelHub/ParcelHub.csproj' <<'EOF_FIXTURE'
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>

</Project>
EOF_FIXTURE
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
