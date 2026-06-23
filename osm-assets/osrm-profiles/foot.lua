-- Foot profile

api_version = 2

Set = require('lib/set')
Sequence = require('lib/sequence')
Handlers = require("lib/way_handlers")
find_access_tag = require("lib/access").find_access_tag

function setup()
  local walking_speed = 5
  return {
    properties = {
      weight_name                   = 'duration',
      max_speed_for_map_matching    = 40/3.6, -- kmph -> m/s
      call_tagless_node_function    = false,
      traffic_signal_penalty        = 2,
      u_turn_penalty                = 2,
      continue_straight_at_waypoint = false,
      use_turn_restrictions         = false,
      -- preserve short road crossings for pedestrian safety analysis
      max_collapse_distance         = 10,
    },

    default_mode            = mode.walking,
    default_speed           = walking_speed,
    -- Change from 'specific' to false to completely ignore ALL one-way tags
    oneway_handling         = false,

    barrier_blacklist = Set {
      'wall',
      'fence'
    },

    access_tag_whitelist = Set {
      'yes',
      'foot',
      'permissive',
      'designated',
      'private',
      'customers'
    },

    access_tag_blacklist = Set {
      'no',
      'agricultural',
      'forestry',
      -- 'private',
      'delivery',
      -- When a way is tagged with `foot=use_sidepath` a parallel way suitable
      -- for pedestrians is mapped and must be used instead (by law in some
      -- countries). For purposes of routing pedestrians, this value should be
      -- treated as 'no access for pedestrians'.
      'use_sidepath',
    },

    restricted_access_tag_list = Set { },

    restricted_highway_whitelist = Set { },

    construction_whitelist = Set {},

    access_tags_hierarchy = Sequence {
      'foot',
      'access'
    },

    -- tags disallow access to in combination with highway=service
    service_access_tag_blacklist = Set { },

    restrictions = Sequence {
      'foot'
    },

    -- list of suffixes to suppress in name change instructions
    suffix_list = Set {
      'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'North', 'South', 'West', 'East'
    },

    avoid = Set {
      'impassable',
      'proposed',
      'motorroad'
    },

    speeds = Sequence {
      highway = {
        primary         = walking_speed,
        primary_link    = walking_speed,
        secondary       = walking_speed,
        secondary_link  = walking_speed,
        tertiary        = walking_speed,
        tertiary_link   = walking_speed,
        unclassified    = walking_speed,
        residential     = walking_speed,
        living_street   = walking_speed,
        service         = walking_speed,
        track           = walking_speed,
        path            = walking_speed,
        steps           = walking_speed,
        pedestrian      = walking_speed,
        platform        = walking_speed,
        footway         = walking_speed,
        pier            = walking_speed,
      },

      railway = {
        platform        = walking_speed
      },

      amenity = {
        parking         = walking_speed,
        parking_entrance= walking_speed
      },

      man_made = {
        pier            = walking_speed
      }
    },

    route_speeds = {
      ferry = 5
    },

    bridge_speeds = {
    },

    surface_speeds = {
      fine_gravel =   walking_speed*0.75,
      gravel =        walking_speed*0.75,
      pebblestone =   walking_speed*0.75,
      mud =           walking_speed*0.5,
      sand =          walking_speed*0.5
    },

    tracktype_speeds = {
    },

    smoothness_speeds = {
    }
  }
end

function process_node(profile, node, result)
  -- check if node is a traffic light
  local tag = node:get_value_by_key("highway")
  if "traffic_signals" == tag then
    -- Direction should only apply to vehicles
    result.traffic_lights = true
  end

  result.barrier = false
end

-- Block ways where the sidewalk is mapped as a separate parallel way.
local function handle_sidewalk_separate(profile, way, result, data)
  local sidewalk = way:get_value_by_key('sidewalk')
  local sidewalk_both = way:get_value_by_key('sidewalk:both')
  local sidewalk_left = way:get_value_by_key('sidewalk:left')
  local sidewalk_right = way:get_value_by_key('sidewalk:right')

  if sidewalk ~= 'separate' and sidewalk_both ~= 'separate'
      and sidewalk_left ~= 'separate' and sidewalk_right ~= 'separate' then
    return
  end

  -- An explicit non-blacklisted foot access tag overrides the sidewalk inference
  if not (data.forward_access and not profile.access_tag_blacklist[data.forward_access]) then
    result.forward_mode = mode.inaccessible
  end
  if not (data.backward_access and not profile.access_tag_blacklist[data.backward_access]) then
    result.backward_mode = mode.inaccessible
  end

  if result.forward_mode == mode.inaccessible and result.backward_mode == mode.inaccessible then
    return false
  end
end

-- main entry point for processsing a way
function process_way(profile, way, result)
  local data = {
    highway = way:get_value_by_key('highway'),
    bridge = way:get_value_by_key('bridge'),
    route = way:get_value_by_key('route'),
    man_made = way:get_value_by_key('man_made'),
    railway = way:get_value_by_key('railway'),
    platform = way:get_value_by_key('platform'),
    amenity = way:get_value_by_key('amenity'),
    public_transport = way:get_value_by_key('public_transport')
  }

  if next(data) == nil then
    return
  end

  local handlers = Sequence {
    WayHandlers.default_mode,
    WayHandlers.blocked_ways,
    WayHandlers.access,
    handle_sidewalk_separate,
    WayHandlers.oneway,
    WayHandlers.destinations,
    WayHandlers.ferries,
    WayHandlers.movables,
    WayHandlers.speed,
    WayHandlers.surface,
    WayHandlers.conveying,
    WayHandlers.classification,
    WayHandlers.roundabouts,
    WayHandlers.startpoint,
    WayHandlers.names,
    WayHandlers.weights
  }

  WayHandlers.run(profile, way, result, data, handlers)

  -- Brute-force bidirectional override.
  -- If OpenStreetMap tagged one side of the road as inaccessible to pedestrians
  -- but the other side is accessible, this forces both directions to be open and match speeds.
  if result.forward_mode ~= mode.inaccessible or result.backward_mode ~= mode.inaccessible then
    local active_mode = (result.forward_mode ~= mode.inaccessible) and result.forward_mode or result.backward_mode
    local active_speed = (result.forward_speed and result.forward_speed > 0) and result.forward_speed or result.backward_speed

    result.forward_mode = active_mode
    result.backward_mode = active_mode
    result.forward_speed = active_speed
    result.backward_speed = active_speed
  end
end

function process_turn (profile, turn)
  turn.duration = 0.

  if turn.direction_modifier == direction_modifier.u_turn then
     turn.duration = turn.duration + profile.properties.u_turn_penalty
  end

  if turn.has_traffic_light then
     turn.duration = profile.properties.traffic_signal_penalty
  end
  if profile.properties.weight_name == 'routability' then
      if not turn.source_restricted and turn.target_restricted then
          turn.weight = turn.weight + 3000
      end
  end
end

return {
  setup = setup,
  process_way =  process_way,
  process_node = process_node,
  process_turn = process_turn
}
