using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace JippyServices.Algorithm.Data.Models;

/// <summary>
/// Maps to the "stop_routes" join table. Associates a specific-restriction
/// stop with one or more route IDs whose nodes should be restricted.
/// </summary>
[Table("stop_routes")]
public class StopRoute
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("stop_id")]
    public Guid StopId { get; set; }

    [Column("route_id")]
    public Guid RouteId { get; set; }

    public Stop Stop { get; set; } = null!;
}
