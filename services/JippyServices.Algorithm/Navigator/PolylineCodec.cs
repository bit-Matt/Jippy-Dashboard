using System.Text;

namespace JippyServices.Algorithm.Navigator;

// -------------------------------------------------------------------------
// Google polyline encoding/decoding (precision 1,000,000)
// Ported from lib/routing/polyline.ts
// -------------------------------------------------------------------------

public static class PolylineCodec
{
    private const int Precision = 1_000_000;

    /// <summary>
    /// Decode an encoded polyline string into a list of [lat, lng] pairs.
    /// </summary>
    public static List<LatLng> Decode(string encoded)
    {
        var coordinates = new List<LatLng>();
        var index = 0;
        var lat = 0;
        var lng = 0;

        while (index < encoded.Length)
        {
            var latResult = DecodeSingleValue(encoded, index);
            lat += latResult.value;
            index = latResult.nextIndex;

            var lngResult = DecodeSingleValue(encoded, index);
            lng += lngResult.value;
            index = lngResult.nextIndex;

            coordinates.Add(new LatLng((double)lat / Precision, (double)lng / Precision));
        }

        return coordinates;
    }

    /// <summary>
    /// Encode a list of [lat, lng] pairs into a compressed polyline string.
    /// </summary>
    public static string Encode(IReadOnlyList<LatLng> coordinates)
    {
        var sb = new StringBuilder();
        var previousLat = 0;
        var previousLng = 0;

        foreach (var coord in coordinates)
        {
            var currentLat = (int)Math.Round(coord.Lat * Precision);
            var currentLng = (int)Math.Round(coord.Lng * Precision);

            sb.Append(EncodeSignedValue(currentLat - previousLat));
            sb.Append(EncodeSignedValue(currentLng - previousLng));

            previousLat = currentLat;
            previousLng = currentLng;
        }

        return sb.ToString();
    }

    private static (int value, int nextIndex) DecodeSingleValue(string encoded, int startIndex)
    {
        var result = 0;
        var shift = 0;
        var index = startIndex;

        while (true)
        {
            var b = encoded[index++] - 63;
            result |= (b & 0x1F) << shift;
            shift += 5;

            if (b < 0x20) break;
        }

        var value = (result & 1) != 0 ? ~(result >> 1) : (result >> 1);
        return (value, index);
    }

    private static string EncodeSignedValue(int value)
    {
        var shifted = value < 0 ? ~(value << 1) : (value << 1);
        return EncodeUnsignedValue(shifted);
    }

    private static string EncodeUnsignedValue(int value)
    {
        var sb = new StringBuilder();
        var remaining = value;

        while (remaining >= 0x20)
        {
            sb.Append((char)((0x20 | (remaining & 0x1F)) + 63));
            remaining >>= 5;
        }

        sb.Append((char)(remaining + 63));
        return sb.ToString();
    }
}
