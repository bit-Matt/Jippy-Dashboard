namespace JippyServices.Algorithm.Navigator;

// -------------------------------------------------------------------------
// Grid-based spatial index for efficient nearby-node lookups.
// Uses equirectangular approximation — accurate for small distances (<50 km).
// Ported from lib/routing/spatial-index.ts
// -------------------------------------------------------------------------

public sealed class GridIndex
{
    private const double MetersPerDegreeLat = 111_320;

    private readonly Dictionary<string, List<string>> _cells = new();
    private readonly Dictionary<string, (double Lat, double Lng)> _positions = new();
    private readonly double _cellSizeDeg;

    public GridIndex(double cellSizeMeters)
    {
        _cellSizeDeg = cellSizeMeters / MetersPerDegreeLat;
    }

    /// <summary>Insert a node at the given position.</summary>
    public void Insert(string nodeId, double lat, double lng)
    {
        _positions[nodeId] = (lat, lng);
        var key = CellKey(lat, lng);
        if (!_cells.TryGetValue(key, out var bucket))
        {
            bucket = [];
            _cells[key] = bucket;
        }
        bucket.Add(nodeId);
    }

    /// <summary>Return all node IDs within the given radius (meters).</summary>
    public List<string> QueryNearby(double lat, double lng, double radiusMeters)
    {
        var result = new List<string>();
        QueryNearby(lat, lng, radiusMeters, result);
        return result;
    }

    /// <summary>
    /// Fill <paramref name="result"/> with all node IDs within the given radius.
    /// The caller is responsible for clearing <paramref name="result"/> before each call
    /// so the same list instance can be reused across multiple queries.
    /// </summary>
    public void QueryNearby(double lat, double lng, double radiusMeters, List<string> result)
    {
        var radiusDeg = radiusMeters / MetersPerDegreeLat;
        var cellsToCheck = (int)Math.Ceiling(radiusDeg / _cellSizeDeg);

        var centerRow = (int)Math.Floor(lat / _cellSizeDeg);
        var centerCol = (int)Math.Floor(lng / _cellSizeDeg);

        var radiusSq = radiusMeters * radiusMeters;

        for (var dr = -cellsToCheck; dr <= cellsToCheck; dr++)
        {
            for (var dc = -cellsToCheck; dc <= cellsToCheck; dc++)
            {
                var key = $"{centerRow + dr}:{centerCol + dc}";
                if (!_cells.TryGetValue(key, out var bucket)) continue;

                foreach (var nodeId in bucket)
                {
                    var pos = _positions[nodeId];
                    var distSq = ApproxDistanceSquaredMeters(lat, lng, pos.Lat, pos.Lng);
                    if (distSq <= radiusSq)
                    {
                        result.Add(nodeId);
                    }
                }
            }
        }
    }

    private string CellKey(double lat, double lng)
    {
        var row = (int)Math.Floor(lat / _cellSizeDeg);
        var col = (int)Math.Floor(lng / _cellSizeDeg);
        return $"{row}:{col}";
    }

    /// <summary>
    /// Fast approximate squared distance in meters using equirectangular projection.
    /// </summary>
    private static double ApproxDistanceSquaredMeters(
        double lat1, double lng1, double lat2, double lng2)
    {
        var dLat = (lat2 - lat1) * MetersPerDegreeLat;
        var cosLat = Math.Cos((lat1 + lat2) / 2 * (Math.PI / 180));
        var dLng = (lng2 - lng1) * MetersPerDegreeLat * cosLat;
        return dLat * dLat + dLng * dLng;
    }
}
