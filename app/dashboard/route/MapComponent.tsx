"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polygon, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

import "@maplibre/maplibre-gl-leaflet";
import "@geoman-io/leaflet-geoman-free";
import "leaflet-routing-machine";
import "leaflet.vectorgrid";
import "lrm-mapzen";

import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";

import { useRouteEditor } from "@/contexts/RouteEditorContext";

const FocusRouteView = ({ focusKey, focusedWaypoints }: FocusRouteViewProps) => {
  const map = useMap();
  const lastFocusedKeyRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (focusKey === null || focusKey === undefined) {
      lastFocusedKeyRef.current = null;
      return;
    }

    if (!map || !focusedWaypoints?.length) return;
    if (lastFocusedKeyRef.current === focusKey) return;

    if (focusedWaypoints.length === 1) {
      map.setView(focusedWaypoints[0], 16, { animate: true });
      lastFocusedKeyRef.current = focusKey;
      return;
    }

    const bounds = L.latLngBounds(focusedWaypoints.map(([lat, lng]) => L.latLng(lat, lng)));
    map.fitBounds(bounds, { padding: [40, 40], animate: true, maxZoom: 16 });
    lastFocusedKeyRef.current = focusKey;
  }, [map, focusKey, focusedWaypoints]);

  return null;
};

const fixLeafletIcons = () => {
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  });
};

const MapClickHandler = () => {
  const { isCreating, addWaypoint } = useRouteEditor();

  useMapEvents({
    click: (e) => {
      if (!isCreating) return;
      addWaypoint(e.latlng.lat, e.latlng.lng);
    },
  });

  return null;
};

const MapInteractionLock = ({ locked }: { locked: boolean }) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const interactions: Array<{ disable: () => void; enable: () => void }> = [
      map.dragging,
      map.touchZoom,
      map.doubleClickZoom,
      map.scrollWheelZoom,
      map.boxZoom,
      map.keyboard,
    ];

    if (locked) {
      interactions.forEach((interaction) => interaction?.disable());
      return;
    }

    interactions.forEach((interaction) => interaction?.enable());
  }, [map, locked]);

  return null;
};

const POLYLINE6_PRECISION = 1_000_000;

const decodePolyline6 = (encoded: string): Array<[number, number]> => {
  const coordinates: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    coordinates.push([lat / POLYLINE6_PRECISION, lng / POLYLINE6_PRECISION]);
  }

  return coordinates;
};

const VectorTileLayer = () => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const glLayer = L.maplibreGL({
      style: "/tileserver/style.json",
    });

    glLayer.addTo(map);

    return () => {
      map.removeLayer(glLayer);
    };
  }, [map]);

  return null;
};

const RoutingMachine = ({ waypoints, color, onRouteCoordinatesChange }: RoutingMachineProps) => {
  const map = useMap();

  useEffect(() => {
    if (!map || waypoints.length < 2) return;

    const serviceUrl = new URL("route", process.env.NEXT_PUBLIC_VALHALLA_URL);
    const mapzenRouter = L.Routing.mapzen("valhalla-", {
      costing: "auto",
      serviceUrl: `${serviceUrl.toString()}?`,
    });

    const routingControl = L.Routing.control({
      router: mapzenRouter,
      formatter: new L.Routing.mapzenFormatter(),
      waypoints: waypoints.map(([lat, lng]) => L.latLng(lat, lng)),
      routeWhileDragging: true,
      // @ts-expect-error createMarker is required but not used with custom markers
      createMarker: () => null,
      lineOptions: {
        styles: [{ color, weight: 4 }],
        extendToWaypoints: true,
        missingRouteTolerance: 0,
      },
      show: false,
      addWaypoints: false,
      fitSelectedRoutes: false,
      showAlternatives: false,
    }).addTo(map) as unknown as L.Control & L.Evented;

    const handleRoutesFound: L.LeafletEventHandlerFn = (event) => {
      if (!onRouteCoordinatesChange) return;
      const routeEvent = event as L.LeafletEvent & {
        routes?: Array<{ coordinates?: L.LatLng[] }>;
      };
      const coordinates = routeEvent.routes?.[0]?.coordinates ?? [];
      onRouteCoordinatesChange(coordinates.map((point) => [point.lat, point.lng] as [number, number]));
    };

    routingControl.on("routesfound", handleRoutesFound);

    return () => {
      routingControl.off("routesfound", handleRoutesFound);
      map.removeControl(routingControl);
    };
  }, [map, waypoints, color, onRouteCoordinatesChange]);

  return null;
};


const createSequenceIcon = (sequence: number, isActive: boolean) => {
  const background = isActive ? "#2563eb" : "#0f172a";
  const border = isActive ? "#93c5fd" : "#e2e8f0";

  return L.divIcon({
    className: "",
    html: `<div style="
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: ${isActive ? "grab" : "pointer"};
      user-select: none;
    ">
      <div style="
        width: 30px;
        height: 30px;
        border-radius: 9999px;
        background: ${background};
        border: 2px solid ${border};
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 700;
        box-shadow: 0 2px 6px rgba(0,0,0,0.25);
      ">${sequence}</div>
    </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
};

const createDirectionArrowIcon = (angle: number, color: string) => {
  const rotation = angle - 90;

  return L.divIcon({
    className: "",
    html: `<div style="
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      transform: rotate(${rotation}deg);
      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.35));
    ">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2 8h8M8 4l4 4-4 4" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

const getBearingDegrees = (from: [number, number], to: [number, number]) => {
  const [lat1, lng1] = from;
  const [lat2, lng2] = to;

  const start = L.latLng(lat1, lng1);
  const end = L.latLng(lat2, lng2);

  const y = Math.sin((end.lng - start.lng) * (Math.PI / 180)) * Math.cos(end.lat * (Math.PI / 180));
  const x = Math.cos(start.lat * (Math.PI / 180)) * Math.sin(end.lat * (Math.PI / 180))
    - Math.sin(start.lat * (Math.PI / 180)) * Math.cos(end.lat * (Math.PI / 180)) * Math.cos((end.lng - start.lng) * (Math.PI / 180));

  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
};

const interpolatePoint = (from: [number, number], to: [number, number], t: number): [number, number] => {
  const [lat1, lng1] = from;
  const [lat2, lng2] = to;

  return [
    lat1 + ((lat2 - lat1) * t),
    lng1 + ((lng2 - lng1) * t),
  ];
};

const projectPointByBearing = (
  point: [number, number],
  bearingDegrees: number,
  distanceMeters: number,
): [number, number] => {
  const [lat, lng] = point;
  const radius = 6371000;
  const angularDistance = distanceMeters / radius;
  const bearing = bearingDegrees * (Math.PI / 180);

  const lat1 = lat * (Math.PI / 180);
  const lng1 = lng * (Math.PI / 180);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance)
      + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );

  const lng2 = lng1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
  );

  return [lat2 * (180 / Math.PI), lng2 * (180 / Math.PI)];
};

const WaypointMarkers = () => {
  const {
    waypoints,
    activePointIndex,
    updateWaypoint,
  } = useRouteEditor();

  return (
    <>
      {waypoints.map((waypoint, index) => {
        const isDraggable = waypoint.id === activePointIndex;

        return (
          <Marker
            key={waypoint.id}
            position={[waypoint.lat, waypoint.lng]}
            icon={createSequenceIcon(index + 1, isDraggable)}
            draggable={isDraggable}
            autoPan={true}
            eventHandlers={{
              dragend: (event) => {
                const marker = event.target as L.Marker;
                const { lat, lng } = marker.getLatLng();
                updateWaypoint(waypoint.id, lat, lng);
              },
            }}
          />
        );
      })}
    </>
  );
};

const DirectionArrows = ({ routeCoordinates }: DirectionArrowsProps) => {
  const { waypoints, selectedColor } = useRouteEditor();

  const arrows = useMemo(() => {
    const fallbackCoordinates: Array<[number, number]> = waypoints.map((waypoint) => [waypoint.lat, waypoint.lng]);
    const coordinates = routeCoordinates.length >= 2 ? routeCoordinates : fallbackCoordinates;
    if (coordinates.length < 2) return [] as Array<{ key: string; lat: number; lng: number; bearing: number }>;

    const spacingMeters = 55;
    const startPaddingMeters = 35;
    const sideOffsetMeters = 5.5;
    const lookAheadMeters = 20;
    const minArrowGapMeters = 18;
    const results: Array<{ key: string; lat: number; lng: number; bearing: number }> = [];
    const segmentLengths: number[] = [];

    let totalLength = 0;
    for (let i = 0; i < coordinates.length - 1; i += 1) {
      const segmentLength = L.latLng(coordinates[i][0], coordinates[i][1]).distanceTo(
        L.latLng(coordinates[i + 1][0], coordinates[i + 1][1]),
      );
      segmentLengths.push(segmentLength);
      totalLength += segmentLength;
    }

    if (totalLength < startPaddingMeters * 2) {
      return [];
    }

    const getPointAtDistance = (distanceMeters: number): [number, number] => {
      let remaining = Math.max(0, Math.min(totalLength, distanceMeters));

      for (let i = 0; i < segmentLengths.length; i += 1) {
        const segmentLength = segmentLengths[i];
        if (remaining <= segmentLength || i === segmentLengths.length - 1) {
          const ratio = segmentLength <= Number.EPSILON ? 0 : remaining / segmentLength;
          return interpolatePoint(coordinates[i], coordinates[i + 1], Math.max(0, Math.min(1, ratio)));
        }
        remaining -= segmentLength;
      }

      return coordinates[coordinates.length - 1];
    };

    const pushArrow = (key: string, point: [number, number], bearing: number) => {
      const [lat, lng] = point;
      const tooClose = results.some((existing) => {
        const distance = L.latLng(existing.lat, existing.lng).distanceTo(L.latLng(lat, lng));
        return distance < minArrowGapMeters;
      });
      if (tooClose) return;

      results.push({ key, lat, lng, bearing });
    };

    let arrowDistance = startPaddingMeters;
    let index = 0;
    while (arrowDistance <= totalLength - startPaddingMeters) {
      const centerPoint = getPointAtDistance(arrowDistance);
      const lookBehindPoint = getPointAtDistance(Math.max(0, arrowDistance - lookAheadMeters));
      const lookAheadPoint = getPointAtDistance(Math.min(totalLength, arrowDistance + lookAheadMeters));
      const bearing = getBearingDegrees(lookBehindPoint, lookAheadPoint);
      const sidePoint = projectPointByBearing(centerPoint, bearing + 90, sideOffsetMeters);
      pushArrow(`route-${index}`, sidePoint, bearing);

      arrowDistance += spacingMeters;
      index += 1;
    }

    if (results.length === 0) {
      const midDistance = totalLength / 2;
      const centerPoint = getPointAtDistance(midDistance);
      const lookBehindPoint = getPointAtDistance(Math.max(0, midDistance - lookAheadMeters));
      const lookAheadPoint = getPointAtDistance(Math.min(totalLength, midDistance + lookAheadMeters));
      const bearing = getBearingDegrees(lookBehindPoint, lookAheadPoint);
      const sidePoint = projectPointByBearing(centerPoint, bearing + 90, sideOffsetMeters);
      pushArrow("route-mid", sidePoint, bearing);
    }

    return results;
  }, [waypoints, routeCoordinates]);

  return (
    <>
      {arrows.map((arrow) => (
        <Marker
          key={arrow.key}
          position={[arrow.lat, arrow.lng]}
          icon={createDirectionArrowIcon(arrow.bearing, selectedColor)}
          interactive={false}
          keyboard={false}
        />
      ))}
    </>
  );
};

const ClosureRegionsLayer = ({ closures }: ClosureRegionsLayerProps) => {
  return (
    <>
      {closures.map((closure) => {
        const sortedPoints = [...closure.points]
          .sort((a, b) => a.sequence - b.sequence)
          .map((point) => [Number(point.point[0]), Number(point.point[1])] as [number, number])
          .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

        if (sortedPoints.length < 3) {
          return null;
        }

        return (
          <Polygon
            key={closure.id}
            positions={sortedPoints}
            pathOptions={{
              color: "#e81123",
              fillColor: "#e81123",
              fillOpacity: 0.25,
              weight: 2,
            }}
          >
            {closure.closureName ? (
              <Tooltip permanent direction="center" opacity={1} className="region-name-label">
                {closure.closureName}
              </Tooltip>
            ) : null}
          </Polygon>
        );
      })}
    </>
  );
};

export default function RouteMapComponent({
  routing,
  closures,
  showClosuresOnMap = true,
  focusedWaypoints,
  focusKey,
  isRoutesLoading = false,
  onRoutesReadyChange,
}: RouteMapProps) {
  const { isCreating, waypoints, selectedColor } = useRouteEditor();
  const [activeRouteCoordinates, setActiveRouteCoordinates] = useState<Array<[number, number]>>([]);
  const [preparedRouting, setPreparedRouting] = useState<Array<{ coordinates: Array<[number, number]>; color: string }>>([]);
  const [isPreparingRoutes, setIsPreparingRoutes] = useState(false);
  const activeRoutingWaypoints = useMemo(
    () => waypoints.map((waypoint) => [waypoint.lat, waypoint.lng] as [number, number]),
    [waypoints],
  );
  useEffect(() => {
    fixLeafletIcons();
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const prepareRoutes = async () => {
      if (!routing?.length || isCreating) {
        setPreparedRouting([]);
        setIsPreparingRoutes(false);
        onRoutesReadyChange?.(true);
        return;
      }

      setIsPreparingRoutes(true);
      onRoutesReadyChange?.(false);

      const nextPrepared = await Promise.all(routing.map(async (route) => ({
        color: route.color,
        coordinates: decodePolyline6(route.polyline),
      })));

      if (isCancelled) return;

      setPreparedRouting(nextPrepared.filter((route) => route.coordinates.length >= 2));
      setIsPreparingRoutes(false);
      onRoutesReadyChange?.(true);
    };

    void prepareRoutes();

    return () => {
      isCancelled = true;
    };
  }, [routing, isCreating, onRoutesReadyChange]);

  const shouldRenderDirectionArrows = isCreating && activeRoutingWaypoints.length >= 2;
  const shouldRenderClosureOverlay = showClosuresOnMap;
  const showRouteLoadingOverlay = isRoutesLoading || isPreparingRoutes;

  return (
    <div className="relative h-full w-full">
      <MapContainer center={[10.7302, 122.5591]} zoom={13} className="h-full w-full">
        <MapInteractionLock locked={showRouteLoadingOverlay} />
        <VectorTileLayer />
        <MapClickHandler />
        <FocusRouteView focusKey={focusKey} focusedWaypoints={focusedWaypoints} />

        {isCreating ? <WaypointMarkers /> : null}
        {shouldRenderDirectionArrows ? <DirectionArrows routeCoordinates={activeRouteCoordinates} /> : null}

        {isCreating && activeRoutingWaypoints.length >= 2 ? (
          <RoutingMachine
            waypoints={activeRoutingWaypoints}
            color={selectedColor}
            onRouteCoordinatesChange={setActiveRouteCoordinates}
          />
        ) : null}

        {!isCreating && !showRouteLoadingOverlay
          ? preparedRouting.map((route, index) => (
            <Polyline
              key={`${route.color}-${index}`}
              positions={route.coordinates}
              pathOptions={{ color: route.color, weight: 4, opacity: 0.85 }}
            />
          ))
          : null}

        {shouldRenderClosureOverlay && closures?.length
          ? <ClosureRegionsLayer closures={closures} />
          : null}
      </MapContainer>

      {showRouteLoadingOverlay ? (
        <div className="absolute inset-0 z-1000 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px]">
          <div className="flex items-center gap-3 rounded-md bg-background/95 px-4 py-2 shadow-lg">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
            <span className="text-sm font-medium">Loading routes...</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export interface RoutingMachineProps {
  waypoints: Array<[number, number]>;
  color: string;
  onRouteCoordinatesChange?: (coordinates: Array<[number, number]>) => void;
}

interface DirectionArrowsProps {
  routeCoordinates: Array<[number, number]>;
}

export interface RouteMapProps {
  routing?: Array<{ polyline: string; color: string }>;
  closures?: Array<{
    id: string;
    closureName: string;
    points: Array<{
      id: string;
      sequence: number;
      point: [number, number];
    }>;
  }>;
  showClosuresOnMap?: boolean;
  focusedWaypoints?: Array<[number, number]>;
  focusKey?: string | number | null;
  isRoutesLoading?: boolean;
  onRoutesReadyChange?: (isReady: boolean) => void;
}

interface ClosureRegionsLayerProps {
  closures: NonNullable<RouteMapProps["closures"]>;
}

interface FocusRouteViewProps {
  focusedWaypoints?: Array<[number, number]>;
  focusKey?: string | number | null;
}
