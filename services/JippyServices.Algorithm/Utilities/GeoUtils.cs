using JippyServices.Algorithm.Navigator.Common.Types;
using JippyServices.Algorithm.Weights;
using NetTopologySuite.Geometries;

namespace JippyServices.Algorithm.Utilities;

/// <summary>
/// Static helpers for geographic calculations used throughout the routing pipeline.
/// All distance results are in metres; all coordinates are WGS-84.
/// </summary>
internal static class GeoUtils
{
    private const double EarthRadiusMeters = 6_371_008.8;
    private const double DegToRad = Math.PI / 180.0;

    /// <summary>
    /// Great-circle distance between two points using the Haversine formula, in metres.
    /// Matches the Turf.js <c>distance</c> function used in the companion Node.js services.
    /// </summary>
    /// <param name="a">First coordinate.</param>
    /// <param name="b">Second coordinate.</param>
    /// <returns>Straight-line surface distance in metres.</returns>
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
    /// Compute a profile-aware walk cost for a given distance.
    /// Walks up to <see cref="WeightProfile.WalkComfortMeters"/> are charged linearly at
    /// <see cref="WeightProfile.WalkPenaltyMultiplier"/>. Distances beyond the comfort
    /// threshold escalate quadratically using <see cref="WeightProfile.WalkEscalationRate"/>,
    /// making A* strongly prefer shorter walks.
    /// </summary>
    /// <param name="distMeters">Walk distance in metres.</param>
    /// <param name="profile">The active weight profile containing comfort and penalty parameters.</param>
    /// <returns>The A* cost in synthetic "metre-equivalent" units.</returns>
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
    /// Estimate the local heading of a route polyline at <paramref name="fromIdx"/> by comparing
    /// the coordinate at <paramref name="fromIdx"/> with the coordinate up to 5 positions ahead.
    /// Used to detect backtracking relative to the destination direction.
    /// </summary>
    /// <param name="coords">The full decoded polyline coordinate list.</param>
    /// <param name="fromIdx">The index within <paramref name="coords"/> to measure the direction from.</param>
    /// <returns>
    /// A (dLat, dLng) vector indicating the direction of travel.
    /// Returns (0, 0) when there is no lookahead position available.
    /// </returns>
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

    /// <summary>
    /// Convert a NetTopologySuite <see cref="Point"/> (X = longitude, Y = latitude) to a <see cref="LatLng"/>.
    /// </summary>
    public static LatLng ToLatLng(Point point) => new(point.Y, point.X);

    /// <summary>
    /// Convert a <see cref="LatLng"/> to a NetTopologySuite <see cref="Point"/> (X = longitude, Y = latitude, SRID 4326).
    /// </summary>
    public static Point ToNtsPoint(LatLng latLng)
        => new(latLng.Lng, latLng.Lat) { SRID = 4326 };

    /// <summary>
    /// Compute the axis-aligned bounding box enclosing all given coordinates.
    /// </summary>
    /// <param name="coords">The coordinate list to envelope.</param>
    /// <returns>
    /// A four-element array <c>[minLng, minLat, maxLng, maxLat]</c>,
    /// or <c>[0, 0, 0, 0]</c> when <paramref name="coords"/> is empty.
    /// </returns>
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
    /// Compute the total length of a polyline in metres by summing the Haversine
    /// distances between each consecutive pair of coordinates.
    /// </summary>
    /// <param name="coords">Ordered list of polyline vertices.</param>
    /// <returns>Total path length in metres.</returns>
    public static double PolylineDistance(List<LatLng> coords)
    {
        double dist = 0;
        for (var i = 0; i < coords.Count - 1; i++)
            dist += HaversineMeters(coords[i], coords[i + 1]);
        return dist;
    }

    /// <summary>
    /// Format a distance as a human-readable string: metres below 1 km, kilometres above.
    /// </summary>
    /// <param name="meters">Distance in metres.</param>
    /// <returns>A string such as <c>"250 m"</c> or <c>"1.4 km"</c>.</returns>
    public static string FormatDistance(double meters)
    {
        return meters >= 1000
            ? $"{meters / 1000:F1} km"
            : $"{Math.Round(meters)} m";
    }

    /// <summary>
    /// Convert a speed from km/h to metres per second, used for duration calculations.
    /// </summary>
    /// <param name="kmh">Speed in kilometres per hour.</param>
    /// <returns>Equivalent speed in metres per second.</returns>
    public static double SpeedMps(double kmh) => kmh * 1000.0 / 3600.0;

    /// <summary>
    /// Merge two bounding boxes into the smallest enclosing box.
    /// </summary>
    /// <param name="a">First bounding box <c>[minLng, minLat, maxLng, maxLat]</c>.</param>
    /// <param name="b">Second bounding box <c>[minLng, minLat, maxLng, maxLat]</c>.</param>
    /// <returns>The union bounding box <c>[minLng, minLat, maxLng, maxLat]</c>.</returns>
    public static double[] MergeBbox(double[] a, double[] b)
        => [Math.Min(a[0], b[0]), Math.Min(a[1], b[1]),
            Math.Max(a[2], b[2]), Math.Max(a[3], b[3])];
}
