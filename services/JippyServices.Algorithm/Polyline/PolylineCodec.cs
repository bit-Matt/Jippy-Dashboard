using System.Text;
using JippyServices.Algorithm.Navigator.Common.Types;

namespace JippyServices.Algorithm.Polyline;

/// <summary>
/// Google Encoded Polyline codec operating at precision 1e6 (six decimal places).
/// Used by OSRM (<c>geometries=polyline6</c>) and throughout the routing pipeline
/// for compact polyline storage in the database.
/// </summary>
internal static class PolylineCodec
{
    /// <summary>Fixed-point precision factor: coordinates are stored as integers scaled by 1,000,000.</summary>
    private const int Precision = 1_000_000;

    /// <summary>
    /// Decode a Google-encoded polyline string into an ordered list of WGS-84 coordinates.
    /// </summary>
    /// <param name="encoded">The encoded polyline string (precision 1e6).</param>
    /// <returns>
    /// A list of <see cref="LatLng"/> values representing the decoded geometry.
    /// Returns an empty list when <paramref name="encoded"/> is empty.
    /// </returns>
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
    /// Encode an ordered list of WGS-84 coordinates into a Google-encoded polyline string
    /// at precision 1e6.
    /// </summary>
    /// <param name="coordinates">The coordinate list to encode.</param>
    /// <returns>The encoded polyline string; an empty string when <paramref name="coordinates"/> is empty.</returns>
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

    /// <summary>
    /// Decode one variable-length integer value from the encoded string starting at
    /// <paramref name="startIndex"/>, advancing the index past all consumed characters.
    /// </summary>
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

    /// <summary>
    /// Left-shift and invert a signed integer for polyline encoding,
    /// then delegate to <see cref="EncodeUnsignedValue"/>.
    /// </summary>
    private static string EncodeSignedValue(int value)
    {
        var shifted = value < 0 ? ~(value << 1) : (value << 1);
        return EncodeUnsignedValue(shifted);
    }

    /// <summary>
    /// Encode an unsigned integer using 5-bit chunks with the continuation bit set on all
    /// but the last chunk, adding ASCII offset 63 to each character.
    /// </summary>
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
