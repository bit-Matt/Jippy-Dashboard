namespace JippyServices.Algorithm.Navigator.Common;

/// <summary>
/// A grid-based spatial index for efficient radius queries over large sets of geographic nodes.
/// The coordinate plane is divided into fixed-size cells; a query inspects all cells that
/// overlap the search circle and performs an exact distance check within each cell.
/// Uses an equirectangular approximation which is accurate to within 0.3 % for distances
/// up to ~50 km — sufficient for the city-scale routing this service targets.
/// Ported from <c>lib/routing/spatial-index.ts</c>.
/// </summary>
public sealed class GridIndex
{
    /// <summary>Approximate metres per degree of latitude (constant across all latitudes).</summary>
    private const double MetersPerDegreeLat = 111_320;

    private readonly Dictionary<string, List<string>> _cells = new();
    private readonly Dictionary<string, (double Lat, double Lng)> _positions = new();

    /// <summary>Cell edge length in degrees, derived from the requested cell size in metres.</summary>
    private readonly double _cellSizeDeg;

    /// <summary>
    /// Create a new <see cref="GridIndex"/> with the specified spatial cell granularity.
    /// </summary>
    /// <param name="cellSizeMeters">
    /// Side length of each grid cell in metres. Smaller values improve query precision at
    /// the cost of more cells; a value equal to the typical query radius is a good starting point.
    /// </param>
    public GridIndex(double cellSizeMeters)
    {
        _cellSizeDeg = cellSizeMeters / MetersPerDegreeLat;
    }

    /// <summary>
    /// Add a node to the spatial index at the given coordinate.
    /// </summary>
    /// <param name="nodeId">Unique identifier of the graph node.</param>
    /// <param name="lat">Latitude of the node in decimal degrees (WGS-84).</param>
    /// <param name="lng">Longitude of the node in decimal degrees (WGS-84).</param>
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

    /// <summary>
    /// Return all node IDs whose positions fall within <paramref name="radiusMeters"/> of the query point.
    /// </summary>
    /// <param name="lat">Query latitude in decimal degrees (WGS-84).</param>
    /// <param name="lng">Query longitude in decimal degrees (WGS-84).</param>
    /// <param name="radiusMeters">Search radius in metres.</param>
    /// <returns>List of matching node IDs (unsorted).</returns>
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

    /// <summary>
    /// Compute the grid cell key for the given coordinate.
    /// The key is <c>"{row}:{col}"</c> where row and col are the integer cell indices.
    /// </summary>
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
