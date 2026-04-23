using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using NetTopologySuite.Geometries;

namespace JippyServices.Algorithm.Data.Models;

/// <summary>
/// Maps to the "region_marker_sequences" table. Each row is one vertex
/// of a region's boundary polygon, ordered by SequenceNumber.
/// </summary>
[Table("region_marker_sequences")]
public class RegionSequence
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("region_snapshot_id")]
    public Guid RegionSnapshotId { get; set; }

    [Column("sequence_number")]
    public int SequenceNumber { get; set; }

    /// <summary>PostGIS Point (SRID 4326). X = longitude, Y = latitude.</summary>
    [Column("point", TypeName = "geometry(Point,4326)")]
    public Point Point { get; set; } = null!;

    [ForeignKey(nameof(RegionSnapshotId))]
    public RegionSnapshot RegionSnapshot { get; set; } = null!;
}
