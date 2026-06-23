"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

import "@maplibre/maplibre-gl-leaflet";
import "@geoman-io/leaflet-geoman-free";
import "leaflet.vectorgrid";

import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

import type {
  RestrictedBoardingZoneResponse,
  RestrictedBoardingZoneResponseList,
  RouteListItemResponse,
  StopResponse,
  StopResponseList,
} from "@/contracts/responses";
import { getRbzLineCoordinates } from "@/lib/stops/display";
import { getPositronStyleUrl } from "@/lib/map/style-url";
import { createTransitPointIcon } from "@/lib/map/transit-marker-icon";
import { decodePolyline } from "@/lib/map/polyline";
import { useStopDashboard } from "@/contexts/StopDashboardContext";

interface StopMapProps {
  activeTab: "stops" | "restricted-zones";
  transitStops?: StopResponseList;
  rbzList?: RestrictedBoardingZoneResponseList;
  overlayRoutes?: RouteListItemResponse[];
  routeOverlayEnabled?: boolean;
  selectedOverlayRouteIds?: string[];
  onTransitStopClick?: (stop: StopResponse) => void;
  onRbzClick?: (zone: RestrictedBoardingZoneResponse) => void;
  onMapClick?: (point: [number, number]) => void;
  onPendingPointDragEnd?: (point: [number, number]) => void;
  onEditingPointDragEnd?: (point: [number, number]) => void;
  focusedWaypoints?: Array<[number, number]>;
  focusKey?: string | number | null;
}

interface FocusStopViewProps {
  focusedWaypoints?: Array<[number, number]>;
  focusKey?: string | number | null;
}

interface StopLineDrawingLayerProps {
  activeTool: "none" | "draw-line" | "edit-line";
  linePoints: Array<[number, number]>;
  onLinePointsChange: (points: Array<[number, number]>) => void;
  onToolComplete: () => void;
  autoDrawRequested: boolean;
  consumeAutoDrawRequest: () => void;
}

type PmMapApi = {
  setGlobalOptions?: (options: object) => void;
  enableDraw?: (shape: "Line", options?: object) => void;
  disableDraw?: (shape: "Line") => void;
  disableGlobalDrawMode?: () => void;
  enableGlobalEditMode?: (options?: object) => void;
  disableGlobalEditMode?: () => void;
  disableGlobalRemovalMode?: () => void;
};

const areCoordinatesEqual = (a: Array<[number, number]>, b: Array<[number, number]>) => {
  if (a.length !== b.length) return false;

  for (let index = 0; index < a.length; index += 1) {
    if (a[index][0] !== b[index][0] || a[index][1] !== b[index][1]) {
      return false;
    }
  }

  return true;
};

const fixLeafletIcons = () => {
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  });
};

const VectorTileLayer = () => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const glLayer = L.maplibreGL({
      style: getPositronStyleUrl(),
    });

    glLayer.addTo(map);

    return () => {
      map.removeLayer(glLayer);
    };
  }, [map]);

  return null;
};

const FocusStopView = ({ focusKey, focusedWaypoints }: FocusStopViewProps) => {
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

const MapClickHandler = ({
  enabled,
  onMapClick,
}: {
  enabled: boolean;
  onMapClick?: (point: [number, number]) => void;
}) => {
  useMapEvents({
    click(event) {
      if (!enabled || !onMapClick) {
        return;
      }

      onMapClick([event.latlng.lat, event.latlng.lng]);
    },
  });

  return null;
};

const StopLineDrawingLayer = ({
  activeTool,
  linePoints,
  onLinePointsChange,
  onToolComplete,
  autoDrawRequested,
  consumeAutoDrawRequest,
}: StopLineDrawingLayerProps) => {
  const map = useMap();
  const lineLayerRef = useRef<L.Polyline | null>(null);

  const normalizeCoordinates = useCallback((layer: L.Polyline): Array<[number, number]> => {
    const latLngs = layer.getLatLngs() as L.LatLng[];
    return latLngs.map((latLng) => [latLng.lat, latLng.lng]);
  }, []);

  const applyLineStyles = useCallback((layer: L.Polyline) => {
    layer.setStyle({
      color: "#e81123",
      weight: 6,
      opacity: 0.9,
    });
  }, []);

  const syncPointsFromLayer = useCallback((layer?: L.Polyline | null) => {
    const targetLayer = layer ?? lineLayerRef.current;
    if (!targetLayer) return;

    onLinePointsChange(normalizeCoordinates(targetLayer));
  }, [onLinePointsChange, normalizeCoordinates]);

  const disableAllLineTools = useCallback(() => {
    const pmMap = map as L.Map & { pm?: PmMapApi };
    if (!pmMap.pm) return;

    pmMap.pm.disableDraw?.("Line");
    pmMap.pm.disableGlobalDrawMode?.();
    pmMap.pm.disableGlobalEditMode?.();
    pmMap.pm.disableGlobalRemovalMode?.();
  }, [map]);

  useEffect(() => {
    if (!linePoints || linePoints.length < 2) {
      if (lineLayerRef.current) {
        map.removeLayer(lineLayerRef.current);
        lineLayerRef.current = null;
      }
      return;
    }

    if (lineLayerRef.current) {
      const currentPoints = normalizeCoordinates(lineLayerRef.current);
      if (areCoordinatesEqual(currentPoints, linePoints)) {
        applyLineStyles(lineLayerRef.current);
        return;
      }

      if (activeTool === "edit-line" || activeTool === "none") {
        syncPointsFromLayer(lineLayerRef.current);
        applyLineStyles(lineLayerRef.current);
        return;
      }

      map.removeLayer(lineLayerRef.current);
      lineLayerRef.current = null;
    }

    const layer = L.polyline(linePoints.map(([lat, lng]) => L.latLng(lat, lng)));
    layer.addTo(map);
    lineLayerRef.current = layer;
    applyLineStyles(layer);

    const pmMap = map as L.Map & { pm?: PmMapApi };
    if (activeTool === "edit-line") {
      pmMap.pm?.enableGlobalEditMode?.({ allowSelfIntersection: false });
    }
  }, [map, linePoints, activeTool, applyLineStyles, normalizeCoordinates, syncPointsFromLayer]);

  useEffect(() => {
    const pmMap = map as L.Map & { pm?: PmMapApi };
    if (!pmMap.pm) return;

    const handleCreate = (event: { layer: L.Polyline }) => {
      if (lineLayerRef.current) {
        map.removeLayer(lineLayerRef.current);
      }

      const layer = event.layer;
      lineLayerRef.current = layer;
      applyLineStyles(layer);
      onLinePointsChange(normalizeCoordinates(layer));
      onToolComplete();
    };

    const handleGeometryMutated = (event: { layer?: L.Polyline }) => {
      if (event.layer && event.layer !== lineLayerRef.current) return;
      syncPointsFromLayer(event.layer ?? lineLayerRef.current);
    };

    const handleRemove = (event: { layer: L.Polyline }) => {
      if (!event.layer || event.layer !== lineLayerRef.current) return;
      lineLayerRef.current = null;
      onLinePointsChange([]);
    };

    pmMap.pm.setGlobalOptions?.({ continueDrawing: false });
    map.on("pm:create", handleCreate);
    map.on("pm:edit", handleGeometryMutated);
    map.on("pm:update", handleGeometryMutated);
    map.on("pm:markerdragend", handleGeometryMutated);
    map.on("pm:vertexadded", handleGeometryMutated);
    map.on("pm:vertexremoved", handleGeometryMutated);
    map.on("pm:remove", handleRemove);

    return () => {
      map.off("pm:create", handleCreate);
      map.off("pm:edit", handleGeometryMutated);
      map.off("pm:update", handleGeometryMutated);
      map.off("pm:markerdragend", handleGeometryMutated);
      map.off("pm:vertexadded", handleGeometryMutated);
      map.off("pm:vertexremoved", handleGeometryMutated);
      map.off("pm:remove", handleRemove);
      disableAllLineTools();
    };
  }, [map, onLinePointsChange, onToolComplete, normalizeCoordinates, syncPointsFromLayer, applyLineStyles, disableAllLineTools]);

  useEffect(() => {
    const pmMap = map as L.Map & { pm?: PmMapApi };
    if (!pmMap.pm) return;

    disableAllLineTools();

    if (activeTool === "draw-line") {
      if (lineLayerRef.current) {
        map.removeLayer(lineLayerRef.current);
        lineLayerRef.current = null;
      }

      onLinePointsChange([]);
      pmMap.pm.enableDraw?.("Line", { continueDrawing: false });
      return;
    }

    if (activeTool === "edit-line" && lineLayerRef.current) {
      pmMap.pm.enableGlobalEditMode?.({ allowSelfIntersection: false });
    }
  }, [activeTool, map, disableAllLineTools, onLinePointsChange]);

  useEffect(() => {
    if (!autoDrawRequested) {
      return;
    }

    const pmMap = map as L.Map & { pm?: PmMapApi };
    if (!pmMap.pm) {
      return;
    }

    disableAllLineTools();
    pmMap.pm.enableDraw?.("Line", { continueDrawing: false });
    consumeAutoDrawRequest();
  }, [autoDrawRequested, map, consumeAutoDrawRequest, disableAllLineTools]);

  useEffect(() => () => {
    if (!lineLayerRef.current) return;

    map.removeLayer(lineLayerRef.current);
    lineLayerRef.current = null;
  }, [map]);

  return null;
};

const PendingStopMarker = ({
  point,
  onDragEnd,
}: {
  point: [number, number];
  onDragEnd?: (point: [number, number]) => void;
}) => {
  return (
    <Marker
      position={point}
      icon={createTransitPointIcon(true)}
      draggable
      autoPan
      eventHandlers={{
        dragend: (event) => {
          const marker = event.target as L.Marker;
          const { lat, lng } = marker.getLatLng();
          onDragEnd?.([lat, lng]);
        },
      }}
    />
  );
};

const StopMarkersLayer = ({
  stops,
  selectedStopId,
  editingStopId,
  onStopClick,
}: {
  stops: StopResponseList;
  selectedStopId?: string | null;
  editingStopId?: string | null;
  onStopClick?: (stop: StopResponse) => void;
}) => {
  return (
    <>
      {stops.map((stop) => {
        if (!stop.point) {
          return null;
        }

        if (stop.id === editingStopId) {
          return null;
        }

        const isSelected = stop.id === selectedStopId;

        return (
          <CircleMarker
            key={stop.id}
            center={stop.point}
            radius={8}
            pathOptions={{
              color: stop.isPublic ? "#059669" : isSelected ? "#2563eb" : "#b45309",
              fillColor: stop.isPublic ? "#059669" : isSelected ? "#2563eb" : "#b45309",
              fillOpacity: 0.85,
              weight: 2,
            }}
            eventHandlers={{
              click: (event) => {
                const originalEvent = event.originalEvent as unknown as Event | undefined;
                if (originalEvent) {
                  L.DomEvent.stopPropagation(originalEvent);
                  L.DomEvent.preventDefault(originalEvent);
                }
                onStopClick?.(stop);
              },
            }}
          >
            <Tooltip sticky direction="top">
              #{stop.number} · {stop.address}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
};

const RouteOverlayLayer = ({
  routes,
  selectedRouteIds,
}: {
  routes: RouteListItemResponse[];
  selectedRouteIds: string[];
}) => {
  const selectedSet = useMemo(() => new Set(selectedRouteIds), [selectedRouteIds]);

  return (
    <>
      {routes.map((route) => {
        if (!selectedSet.has(route.id)) {
          return null;
        }

        const goingTo = route.polylines.to.trim() ? decodePolyline(route.polylines.to) : [];
        const goingBack = route.polylines.back.trim() ? decodePolyline(route.polylines.back) : [];

        return (
          <span key={route.id}>
            {goingTo.length >= 2 ? (
              <Polyline
                positions={goingTo}
                pathOptions={{
                  color: route.routeColor,
                  weight: 4,
                  opacity: 0.55,
                }}
              />
            ) : null}
            {goingBack.length >= 2 ? (
              <Polyline
                positions={goingBack}
                pathOptions={{
                  color: route.routeColor,
                  weight: 4,
                  opacity: 0.35,
                  dashArray: "8 6",
                }}
              />
            ) : null}
          </span>
        );
      })}
    </>
  );
};

const RbzLinesLayer = ({
  zones,
  onZoneClick,
}: {
  zones: RestrictedBoardingZoneResponseList;
  onZoneClick?: (zone: RestrictedBoardingZoneResponse) => void;
}) => {
  return (
    <>
      {zones.map((zone) => {
        const sortedPoints = getRbzLineCoordinates(zone);

        if (sortedPoints.length < 2) return null;

        return (
          <Polyline
            key={zone.id}
            positions={sortedPoints}
            pathOptions={{
              color: zone.isPublic ? "#059669" : "#b45309",
              weight: 6,
              opacity: 0.9,
            }}
            eventHandlers={{
              click: (event) => {
                const originalEvent = event.originalEvent as unknown as Event | undefined;
                if (originalEvent) {
                  L.DomEvent.stopPropagation(originalEvent);
                  L.DomEvent.preventDefault(originalEvent);
                }
                onZoneClick?.(zone);
              },
            }}
          >
            {zone.name.trim() ? (
              <Tooltip sticky>
                {zone.name}
              </Tooltip>
            ) : null}
          </Polyline>
        );
      })}
    </>
  );
};

export default function StopMapComponent({
  activeTab,
  transitStops,
  rbzList,
  overlayRoutes,
  routeOverlayEnabled,
  selectedOverlayRouteIds,
  onTransitStopClick,
  onRbzClick,
  onMapClick,
  onPendingPointDragEnd,
  onEditingPointDragEnd,
  focusedWaypoints,
  focusKey,
}: StopMapProps) {
  const {
    panelMode,
    rbzDraft,
    activeRbzTool,
    updateRbzDraftPoints,
    finishRbzToolEditing,
    autoDrawRequested,
    consumeAutoDrawRequest,
    transitStopCreateMode,
    pendingCreatePoint,
    selectedTransitStopId,
    transitStopEditingPoint,
  } = useStopDashboard();

  useEffect(() => {
    fixLeafletIcons();
  }, []);

  const isEditingRbz = panelMode === "editor";
  const linePoints = useMemo(() => {
    return [...(rbzDraft?.points ?? [])]
      .sort((a, b) => a.sequence - b.sequence)
      .map((point) => point.point);
  }, [rbzDraft?.points]);

  const mapTransitStops = useMemo(() => {
    if (activeTab !== "stops") {
      return [];
    }

    return transitStops ?? [];
  }, [activeTab, transitStops]);

  const mapRbzList = useMemo(() => {
    if (activeTab !== "restricted-zones") {
      return [];
    }

    return rbzList ?? [];
  }, [activeTab, rbzList]);

  return (
    <div className="relative h-full w-full">
      <MapContainer center={[10.7302, 122.5591]} zoom={13} className="h-full w-full">
        <VectorTileLayer />
        <FocusStopView focusKey={focusKey} focusedWaypoints={focusedWaypoints} />
        <MapClickHandler
          enabled={activeTab === "stops" && transitStopCreateMode && !isEditingRbz}
          onMapClick={onMapClick}
        />

        {activeTab === "stops" && routeOverlayEnabled ? (
          <RouteOverlayLayer
            routes={overlayRoutes ?? []}
            selectedRouteIds={selectedOverlayRouteIds ?? []}
          />
        ) : null}

        {activeTab === "stops" && !isEditingRbz ? (
          <StopMarkersLayer
            stops={mapTransitStops}
            selectedStopId={selectedTransitStopId}
            editingStopId={transitStopEditingPoint ? selectedTransitStopId : null}
            onStopClick={onTransitStopClick}
          />
        ) : null}

        {activeTab === "stops" && pendingCreatePoint ? (
          <PendingStopMarker
            point={pendingCreatePoint}
            onDragEnd={onPendingPointDragEnd}
          />
        ) : null}

        {activeTab === "stops" && transitStopEditingPoint ? (
          <PendingStopMarker
            point={transitStopEditingPoint}
            onDragEnd={onEditingPointDragEnd}
          />
        ) : null}

        {isEditingRbz ? (
          <StopLineDrawingLayer
            activeTool={activeRbzTool}
            linePoints={linePoints}
            onLinePointsChange={updateRbzDraftPoints}
            onToolComplete={finishRbzToolEditing}
            autoDrawRequested={autoDrawRequested}
            consumeAutoDrawRequest={consumeAutoDrawRequest}
          />
        ) : null}

        {activeTab === "restricted-zones" && !isEditingRbz ? (
          <RbzLinesLayer
            zones={mapRbzList}
            onZoneClick={onRbzClick}
          />
        ) : null}
      </MapContainer>
    </div>
  );
}
