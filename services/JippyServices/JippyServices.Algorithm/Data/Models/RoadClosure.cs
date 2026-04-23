using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace JippyServices.Algorithm.Data.Models;

/// <summary>
/// Maps to the "road_closure" table. Represents an active road closure
/// area defined by a polygon of RoadClosurePoints.
/// </summary>
[Table("road_closure")]
public class RoadClosure
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("name")]
    public string Name { get; set; } = "";

    [Column("description")]
    public string Description { get; set; } = "";

    [Column("shape")]
    public string Shape { get; set; } = "";

    [Column("closure_type")]
    public string ClosureType { get; set; } = "indefinite";

    [Column("end_date")]
    public DateTime? EndDate { get; set; }

    [Column("is_public_viewable")]
    public bool IsPublic { get; set; }

    /// <summary>Polygon vertices defining the closure boundary.</summary>
    public ICollection<RoadClosurePoint> Points { get; set; } = [];
}
