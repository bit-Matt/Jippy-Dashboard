using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using NetTopologySuite.Geometries;

namespace JippyServices.Algorithm.Data.Models;

/// <summary>
/// Maps to the "stops" table. Fixed boarding / transfer / drop-off points used by NavigatorV3.
/// </summary>
[Table("stops")]
public class Stop
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("stop_number")]
    public int Number { get; set; }

    [Column("address")]
    public string Address { get; set; } = "";

    /// <summary>PostGIS Point (SRID 4326). X = longitude, Y = latitude.</summary>
    [Column("point", TypeName = "geometry(Point,4326)")]
    public Point? Point { get; set; }

    [Column("is_public")]
    public bool IsPublic { get; set; }
}
