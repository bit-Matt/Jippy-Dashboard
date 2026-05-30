using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace JippyServices.Algorithm.Data.Models;

/// <summary>
/// Maps to the "stops" table. Represents a no-boarding / no-alighting zone
/// defined by an encoded polyline. Nodes that fall within STOP_PROXIMITY_METERS
/// of the polyline are restricted for the specified direction(s) and routes.
/// </summary>
[Table("stops")]
public class Stop
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("name")]
    public string Name { get; set; } = "";

    /// <summary>"universal" or "specific"</summary>
    [Column("restriction_type")]
    public string RestrictionType { get; set; } = "universal";

    /// <summary>"direction_to", "direction_back", or "both"</summary>
    [Column("disallowed_direction")]
    public string DisallowedDirection { get; set; } = "both";

    /// <summary>Encoded polyline defining the stop zone boundary.</summary>
    [Column("polyline")]
    public string Polyline { get; set; } = "";

    [Column("is_public")]
    public bool IsPublic { get; set; }

    /// <summary>Routes whose nodes are restricted when RestrictionType is "specific".</summary>
    public ICollection<StopRoute> Routes { get; set; } = [];
}
