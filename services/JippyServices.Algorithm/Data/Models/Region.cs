using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using NetTopologySuite.Geometries;

namespace JippyServices.Algorithm.Data.Models;

/// <summary>
/// Maps to the "region" table. Each region defines a tricycle service area.
/// The active snapshot contains the boundary polygon and station list.
/// </summary>
[Table("region")]
public class Region
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("region_name")]
    public string Name { get; set; } = "";

    [Column("color")]
    public string Color { get; set; } = "#000000";

    [Column("shape")]
    public string ShapeType { get; set; } = "";

    /// <summary>PostGIS Polygon (SRID 4326) for the active snapshot boundary.</summary>
    [Column("polygon", TypeName = "geometry(Polygon,4326)")]
    public Polygon Polygon { get; set; } = null!;

    [Column("is_public_viewable")]
    public bool IsPublic { get; set; }

    /// <summary>Points to the published region snapshot.</summary>
    [Column("active_snapshot_id")]
    public Guid? ActiveSnapshotId { get; set; }
}
