using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace JippyServices.Algorithm.Data.Models;

/// <summary>
/// Maps to the "routes_restricted_in_boarding_zone" join table. Associates a specific-restriction
/// zone with one or more route IDs whose nodes should be restricted.
/// </summary>
[Table("routes_restricted_in_boarding_zone")]
public class RoutesRestrictedInBoardingZone
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("restriction_zone_id")]
    public Guid RestrictionZoneId { get; set; }

    [Column("route_id")]
    public Guid RouteId { get; set; }

    public RestrictedBordingZone RestrictionZone { get; set; } = null!;
}
