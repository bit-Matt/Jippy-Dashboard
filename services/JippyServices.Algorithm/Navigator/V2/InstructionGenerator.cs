using JippyServices.Algorithm.Clients;
using JippyServices.Algorithm.Contracts.V2.Responses;
using JippyServices.Algorithm.Navigator.Common.Types;
using JippyServices.Algorithm.Utilities;
using RouteDirection = JippyServices.Algorithm.Navigator.Common.Types.RouteDirection;

namespace JippyServices.Algorithm.Navigator.V2;

/// <summary>
/// Converts typed path sections into human-readable <see cref="Instruction"/> lists for each leg.
/// Walk instructions are derived from OSRM turn-by-turn steps; jeepney instructions include
/// reverse-geocoded boarding/alighting locations fetched via Nominatim; tricycle instructions
/// use fixed templates based on station name and hailing mode.
/// </summary>
internal sealed class InstructionGenerator
{
    private readonly INominatimServiceClient _nominatim;

    /// <summary>
    /// Create a new <see cref="InstructionGenerator"/> backed by the given Nominatim client.
    /// </summary>
    /// <param name="nominatim">Used to reverse-geocode jeepney boarding and alighting coordinates.</param>
    public InstructionGenerator(INominatimServiceClient nominatim)
    {
        _nominatim = nominatim;
    }

    /// <summary>OSRM manoeuvre type codes that map to a <c>Depart</c> instruction.</summary>
    private static readonly HashSet<int> DepartTypes = [1, 2, 3];

    /// <summary>OSRM manoeuvre type codes that map to an <c>Arrive</c> instruction.</summary>
    private static readonly HashSet<int> ArriveTypes = [4, 5, 6];

    /// <summary>
    /// Convert a list of OSRM walk manoeuvres into <see cref="Instruction"/> objects,
    /// mapping OSRM integer type codes to <see cref="ManeuverType"/> values.
    /// Type codes in <see cref="DepartTypes"/> become <see cref="ManeuverType.Depart"/>;
    /// codes in <see cref="ArriveTypes"/> become <see cref="ManeuverType.Arrive"/>;
    /// all others become <see cref="ManeuverType.Turn"/>.
    /// </summary>
    /// <param name="maneuvers">OSRM turn steps as produced by <see cref="OSRMWalkClient"/>.</param>
    /// <returns>Ordered list of walk instructions suitable for the response leg.</returns>
    public static List<Instruction> GenerateWalkInstructions(List<Manuever> maneuvers)
    {
        return maneuvers.Select(m =>
        {
            ManeuverType maneuverType;
            if (DepartTypes.Contains(m.Type)) maneuverType = ManeuverType.Depart;
            else if (ArriveTypes.Contains(m.Type)) maneuverType = ManeuverType.Arrive;
            else maneuverType = ManeuverType.Turn;

            return new Instruction
            {
                Text = m.InstructionText,
                ManeuverType = maneuverType,
            };
        }).ToList();
    }

    /// <summary>
    /// Generate a fixed two-instruction sequence for a tricycle leg: one board instruction
    /// and one alight instruction. The board instruction text differs based on whether the
    /// tricycle is hailed from the roadside or boarded from a fixed station.
    /// </summary>
    /// <param name="stationName">Address of the station or hailing point.</param>
    /// <param name="isHail">
    /// <see langword="true"/> for roadside hailing; <see langword="false"/> for a fixed station departure.
    /// </param>
    /// <returns>A two-element list: [board instruction, alight instruction].</returns>
    public static List<Instruction> GenerateTricycleInstructions(string stationName, bool isHail)
    {
        return
        [
            new Instruction
            {
                Text = isHail
                    ? $"Hail a tricycle near {stationName}."
                    : $"Board tricycle at {stationName}.",
                ManeuverType = ManeuverType.Board,
            },
            new Instruction
            {
                Text = "Alight tricycle at destination point.",
                ManeuverType = ManeuverType.Alight,
            }
        ];
    }

    /// <summary>
    /// Generate a three-instruction sequence for a jeepney leg: board, continue, alight.
    /// The boarding and alighting locations are resolved via Nominatim reverse geocoding of
    /// the first and last nodes of the segment respectively.
    /// </summary>
    /// <param name="segment">The jeepney path segment containing ordered nodes and route metadata.</param>
    /// <param name="distanceMeters">Total segment distance in metres, used for the continuation text.</param>
    /// <returns>
    /// A three-element list: [board instruction, continue instruction, alight instruction].
    /// </returns>
    public async Task<List<Instruction>> GenerateJeepneyInstructionsAsync(
        PathSegment segment, double distanceMeters)
    {
        var instructions = new List<Instruction>();
        var firstNode = segment.Nodes[0];
        var lastNode = segment.Nodes[^1];

        var directionLabel = segment.Direction == RouteDirection.GoingTo ? "its destination" : "its origin";
        var boardLocation = await _nominatim.ReverseGeocodeAsync(new LatLng(firstNode.Lat, firstNode.Lng));

        instructions.Add(new Instruction
        {
            Text = $"Board the {segment.RouteName} jeepney at {boardLocation} heading towards {directionLabel}.",
            ManeuverType = ManeuverType.Board,
        });

        var formattedDistance = GeoUtils.FormatDistance(distanceMeters);
        instructions.Add(new Instruction
        {
            Text = $"Continue on {segment.RouteName} for {formattedDistance}.",
            ManeuverType = ManeuverType.Depart,
        });

        var alightLocation = await _nominatim.ReverseGeocodeAsync(new LatLng(lastNode.Lat, lastNode.Lng));
        instructions.Add(new Instruction
        {
            Text = $"Alight from jeepney at {alightLocation}.",
            ManeuverType = ManeuverType.Alight,
        });

        return instructions;
    }

    /// <summary>
    /// Generate a single transfer instruction announcing the transition between two jeepney routes.
    /// </summary>
    /// <param name="prevRouteName">Display name of the route being alighted from.</param>
    /// <param name="nextRouteName">Display name of the route being boarded next.</param>
    /// <returns>An <see cref="Instruction"/> with <see cref="ManeuverType.Transfer"/>.</returns>
    public static Instruction GenerateTransferInstruction(string prevRouteName, string nextRouteName)
    {
        return new Instruction
        {
            Text = $"Transfer from {prevRouteName} to {nextRouteName}.",
            ManeuverType = ManeuverType.Transfer,
        };
    }
}
