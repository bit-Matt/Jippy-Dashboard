using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using NetTopologySuite.Geometries;

namespace JippyServices.Algorithm.Data.Models;

/// <summary>
/// Maps to the "region_stations" table. Each row is a tricycle station
/// within a region, with availability time windows.
/// </summary>
[Table("region_stations")]
public class RegionStation
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("region_snapshot_id")]
    public Guid RegionSnapshotId { get; set; }

    [Column("address")]
    public string Address { get; set; } = "Unknown";

    /// <summary>Start of availability window, e.g. "06:00".</summary>
    [Column("available_from")]
    public string AvailableFrom { get; set; } = "00:00";

    /// <summary>End of availability window, e.g. "22:00".</summary>
    [Column("available_to")]
    public string AvailableTo { get; set; } = "23:59";

    /// <summary>PostGIS Point (SRID 4326). X = longitude, Y = latitude.</summary>
    [Column("point", TypeName = "geometry(Point,4326)")]
    public Point Point { get; set; } = null!;

    [ForeignKey(nameof(RegionSnapshotId))]
    public RegionSnapshot RegionSnapshot { get; set; } = null!;
}
