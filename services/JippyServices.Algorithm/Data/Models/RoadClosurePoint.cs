using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using NetTopologySuite.Geometries;

namespace JippyServices.Algorithm.Data.Models;

/// <summary>
/// Maps to the "road_closure_points" table. Each row is one vertex of
/// a road closure polygon, ordered by SequenceNumber.
/// </summary>
[Table("road_closure_points")]
public class RoadClosurePoint
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("road_closure_id")]
    public Guid RoadClosureId { get; set; }

    [Column("sequence_number")]
    public int SequenceNumber { get; set; }

    /// <summary>PostGIS Point (SRID 4326). X = longitude, Y = latitude.</summary>
    [Column("point", TypeName = "geometry(Point,4326)")]
    public Point Point { get; set; } = null!;

    [ForeignKey(nameof(RoadClosureId))]
    public RoadClosure RoadClosure { get; set; } = null!;
}
