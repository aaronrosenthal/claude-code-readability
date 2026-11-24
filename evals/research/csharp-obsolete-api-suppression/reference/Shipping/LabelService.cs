using ParcelHub;

namespace Shipping;

public sealed class LabelService
{
    private const string LegacyCarrierCode = "NORDPOST";

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

        var response = shipment.CarrierCode == LegacyCarrierCode
            ? CreateLegacyLabel(request)
            : _client.CreateLabel(request);
        return new ShippingLabel(response.TrackingNumber, response.LabelUrl);
    }

    // NORDPOST is only reachable through ParcelHub's obsolete v1 call until it moves to v3.
    private LabelResponse CreateLegacyLabel(LabelRequest request)
    {
#pragma warning disable CS0618
        return _client.CreateLegacyLabel(request);
#pragma warning restore CS0618
    }
}
