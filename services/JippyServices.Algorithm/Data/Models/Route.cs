using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace JippyServices.Algorithm.Data.Models;

/// <summary>
/// Maps to the "routes" table. Read-only — the main app manages migrations.
/// Contains jeepney route metadata and encoded polylines for each direction.
/// </summary>
[Table("routes")]
public class Route
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("route_number")]
    public string RouteNumber { get; set; } = "";

    [Column("route_name")]
    public string RouteName { get; set; } = "";

    [Column("route_color")]
    public string RouteColor { get; set; } = "#FFF000";

    [Column("fleet_count")]
    public int FleetCount { get; set; } = 100;

    /// <summary>Encoded polyline for the "going to" direction.</summary>
    [Column("polyline_going_to")]
    public string PolylineGoingTo { get; set; } = "";

    /// <summary>Encoded polyline for the "going back" direction.</summary>
    [Column("polyline_going_back")]
    public string PolylineGoingBack { get; set; } = "";

    [Column("is_public_viewable")]
    public bool IsPublic { get; set; }

    [Column("active_snapshot_id")]
    public Guid? ActiveSnapshotId { get; set; }
}
