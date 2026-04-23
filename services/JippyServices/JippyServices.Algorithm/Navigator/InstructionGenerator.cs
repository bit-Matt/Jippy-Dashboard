using JippyServices.Algorithm.Navigator.Clients;

namespace JippyServices.Algorithm.Navigator;

// -------------------------------------------------------------------------
// Turn-by-turn instruction generation for each leg type.
// Ported from lib/routing/instruction-generator.ts
// -------------------------------------------------------------------------

public sealed class InstructionGenerator(NominatimClient nominatim)
{
    // Valhalla maneuver type codes
    private static readonly HashSet<int> DepartTypes = [1, 2, 3];
    private static readonly HashSet<int> ArriveTypes = [4, 5, 6];

    /// <summary>Map walk maneuvers (from GraphHopper, in Valhalla format) to instructions.</summary>
    public static List<Instruction> GenerateWalkInstructions(List<WalkManeuver> maneuvers)
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

    /// <summary>Generate templated tricycle boarding/alighting instructions.</summary>
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

    /// <summary>Generate jeepney boarding, continuation, and alighting instructions.</summary>
    public async Task<List<Instruction>> GenerateJeepneyInstructionsAsync(
        PathSegment segment, double distanceMeters)
    {
        var instructions = new List<Instruction>();
        var firstNode = segment.Nodes[0];
        var lastNode = segment.Nodes[^1];

        var directionLabel = segment.Direction == RouteDirection.GoingTo ? "its destination" : "its origin";
        var boardLocation = await nominatim.ReverseGeocodeAsync(new LatLng(firstNode.Lat, firstNode.Lng));

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

        var alightLocation = await nominatim.ReverseGeocodeAsync(new LatLng(lastNode.Lat, lastNode.Lng));
        instructions.Add(new Instruction
        {
            Text = $"Alight from jeepney at {alightLocation}.",
            ManeuverType = ManeuverType.Alight,
        });

        return instructions;
    }

    /// <summary>Generate a transfer instruction between two routes.</summary>
    public static Instruction GenerateTransferInstruction(string prevRouteName, string nextRouteName)
    {
        return new Instruction
        {
            Text = $"Transfer from {prevRouteName} to {nextRouteName}.",
            ManeuverType = ManeuverType.Transfer,
        };
    }
}
