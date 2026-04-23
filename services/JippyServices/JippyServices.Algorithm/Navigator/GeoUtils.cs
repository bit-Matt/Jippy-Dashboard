namespace JippyServices.Algorithm.Navigator;

// -------------------------------------------------------------------------
// Geometry and coordinate utility functions
// -------------------------------------------------------------------------

public static class GeoUtils
{
    private const double EarthRadiusMeters = 6_371_008.8;
    private const double DegToRad = Math.PI / 180.0;

    /// <summary>
    /// Haversine distance between two lat/lng points, in meters.
    /// Matches the Turf.js distance function used in the Node.js code.
    /// </summary>
    public static double HaversineMeters(LatLng a, LatLng b)
    {
        var dLat = (b.Lat - a.Lat) * DegToRad;
        var dLng = (b.Lng - a.Lng) * DegToRad;
        var lat1 = a.Lat * DegToRad;
        var lat2 = b.Lat * DegToRad;

        var sinDLat = Math.Sin(dLat / 2);
        var sinDLng = Math.Sin(dLng / 2);
        var h = sinDLat * sinDLat + Math.Cos(lat1) * Math.Cos(lat2) * sinDLng * sinDLng;
        return 2 * EarthRadiusMeters * Math.Asin(Math.Sqrt(h));
    }

    /// <summary>
    /// Profile-aware progressive walk cost. Below the comfort threshold the
    /// cost is linear; above it the cost escalates quadratically.
    /// </summary>
    public static double ProfileWalkCost(double distMeters, WeightProfile profile)
    {
        if (distMeters <= profile.WalkComfortMeters)
        {
            return distMeters * profile.WalkPenaltyMultiplier;
        }

        var baseCost = profile.WalkComfortMeters * profile.WalkPenaltyMultiplier;
        var excess = distMeters - profile.WalkComfortMeters;
        return baseCost + excess * profile.WalkPenaltyMultiplier
                        * (1 + excess * profile.WalkEscalationRate);
    }

    /// <summary>
    /// Get the local direction of a polyline at a given index by looking
    /// ahead up to 5 positions.
    /// </summary>
    public static (double dLat, double dLng) GetRouteDirection(
        List<LatLng> coords, int fromIdx)
    {
        var lookahead = Math.Min(fromIdx + 5, coords.Count - 1);
        if (lookahead == fromIdx) return (0, 0);
        return (
            coords[lookahead].Lat - coords[fromIdx].Lat,
            coords[lookahead].Lng - coords[fromIdx].Lng
        );
    }

    /// <summary>Convert NTS Point (X=lng, Y=lat) to our LatLng struct.</summary>
    public static LatLng ToLatLng(NetTopologySuite.Geometries.Point point)
        => new(point.Y, point.X);

    /// <summary>Convert LatLng to an NTS Point (X=lng, Y=lat, SRID 4326).</summary>
    public static NetTopologySuite.Geometries.Point ToNtsPoint(LatLng latLng)
        => new(latLng.Lng, latLng.Lat) { SRID = 4326 };

    /// <summary>
    /// Compute a simple bounding box from lat/lng coordinate pairs.
    /// Returns [minLng, minLat, maxLng, maxLat].
    /// </summary>
    public static double[] ComputeBbox(IReadOnlyList<LatLng> coords)
    {
        if (coords.Count == 0)
            return [0, 0, 0, 0];

        var minLng = double.MaxValue;
        var minLat = double.MaxValue;
        var maxLng = double.MinValue;
        var maxLat = double.MinValue;

        foreach (var c in coords)
        {
            if (c.Lng < minLng) minLng = c.Lng;
            if (c.Lat < minLat) minLat = c.Lat;
            if (c.Lng > maxLng) maxLng = c.Lng;
            if (c.Lat > maxLat) maxLat = c.Lat;
        }

        return [minLng, minLat, maxLng, maxLat];
    }

    /// <summary>
    /// Compute total polyline distance by summing haversine between
    /// consecutive points.
    /// </summary>
    public static double PolylineDistance(List<LatLng> coords)
    {
        double dist = 0;
        for (var i = 0; i < coords.Count - 1; i++)
            dist += HaversineMeters(coords[i], coords[i + 1]);
        return dist;
    }

    /// <summary>Format a distance in meters as a human-readable string.</summary>
    public static string FormatDistance(double meters)
    {
        return meters >= 1000
            ? $"{meters / 1000:F1} km"
            : $"{Math.Round(meters)} m";
    }

    /// <summary>Convert meters per second to km/h speed factor for duration calculation.</summary>
    public static double SpeedMps(double kmh) => kmh * 1000.0 / 3600.0;

    /// <summary>
    /// Merge two bounding boxes ([minLng, minLat, maxLng, maxLat]) into
    /// the smallest box that contains both.
    /// </summary>
    public static double[] MergeBbox(double[] a, double[] b)
        => [Math.Min(a[0], b[0]), Math.Min(a[1], b[1]),
            Math.Max(a[2], b[2]), Math.Max(a[3], b[3])];
}
