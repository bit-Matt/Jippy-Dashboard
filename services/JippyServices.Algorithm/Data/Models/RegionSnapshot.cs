using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace JippyServices.Algorithm.Data.Models;

/// <summary>
/// Maps to the "region_snapshots" table. Each snapshot is an immutable version
/// of a region's boundary and station configuration.
/// </summary>
[Table("region_snapshots")]
public class RegionSnapshot
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

    [Column("snapshotState")]
    public string SnapshotState { get; set; } = "wip";

    [Column("region_id")]
    public Guid RegionId { get; set; }

    /// <summary>Boundary polygon points for this snapshot.</summary>
    public ICollection<RegionSequence> Sequences { get; set; } = [];

    /// <summary>Tricycle stations for this snapshot.</summary>
    public ICollection<RegionStation> Stations { get; set; } = [];
}
