using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace JippyServices.Algorithm.Data.Models;

/// <summary>
/// Maps to the "region_markers" table. Each region defines a tricycle service area.
/// The active snapshot contains the boundary points and station list.
/// </summary>
[Table("region_markers")]
public class RegionMarker
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

    [Column("is_public_viewable")]
    public bool IsPublic { get; set; }

    /// <summary>Points to the published region snapshot.</summary>
    [Column("active_snapshot_id")]
    public Guid? ActiveSnapshotId { get; set; }
}
