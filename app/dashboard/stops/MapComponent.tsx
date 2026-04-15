"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { MapContainer, Polyline, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";

import "@maplibre/maplibre-gl-leaflet";
import "@geoman-io/leaflet-geoman-free";
import "leaflet.vectorgrid";

import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

import type { StopResponse, StopResponseList } from "@/contracts/responses";
import { useStopDashboard } from "@/contexts/StopDashboardContext";

interface StopMapProps {
  stops?: StopResponseList;
  onStopClick?: (stop: StopResponse) => void;
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
      style: "/tileserver/style.json",
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

const StopLinesLayer = ({
  stops,
  onStopClick,
}: {
  stops: StopResponseList;
  onStopClick?: (stop: StopResponse) => void;
}) => {
  return (
    <>
      {stops.map((stop) => {
        const sortedPoints = [...stop.points]
          .sort((a, b) => a.sequence - b.sequence)
          .map((point) => point.point);

        if (sortedPoints.length < 2) return null;

        return (
          <Polyline
            key={stop.id}
            positions={sortedPoints}
            pathOptions={{
              color: stop.isPublic ? "#059669" : "#b45309",
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
                onStopClick?.(stop);
              },
            }}
          >
            {stop.name.trim() ? (
              <Tooltip sticky>
                {stop.name}
              </Tooltip>
            ) : null}
          </Polyline>
        );
      })}
    </>
  );
};

export default function StopMapComponent({
  stops,
  onStopClick,
  focusedWaypoints,
  focusKey,
}: StopMapProps) {
  const {
    panelMode,
    draft,
    activeStopTool,
    updateDraftPoints,
    finishStopToolEditing,
    autoDrawRequested,
    consumeAutoDrawRequest,
  } = useStopDashboard();

  useEffect(() => {
    fixLeafletIcons();
  }, []);

  const isEditing = panelMode === "editor";
  const draftPoints = draft?.points ?? [];
  const linePoints = useMemo(() => {
    return [...draftPoints]
      .sort((a, b) => a.sequence - b.sequence)
      .map((point) => point.point);
  }, [draftPoints]);

  return (
    <div className="relative h-full w-full">
      <MapContainer center={[10.7302, 122.5591]} zoom={13} className="h-full w-full">
        <VectorTileLayer />
        <FocusStopView focusKey={focusKey} focusedWaypoints={focusedWaypoints} />

        {isEditing ? (
          <StopLineDrawingLayer
            activeTool={activeStopTool}
            linePoints={linePoints}
            onLinePointsChange={updateDraftPoints}
            onToolComplete={finishStopToolEditing}
            autoDrawRequested={autoDrawRequested}
            consumeAutoDrawRequest={consumeAutoDrawRequest}
          />
        ) : null}

        {!isEditing ? (
          <StopLinesLayer
            stops={stops ?? []}
            onStopClick={onStopClick}
          />
        ) : null}
      </MapContainer>
    </div>
  );
}
