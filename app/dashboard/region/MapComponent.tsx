"use client";

import { useCallback, useEffect, useRef } from "react";
import { MapContainer, Marker, Polygon, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

import "@maplibre/maplibre-gl-leaflet";
import "@geoman-io/leaflet-geoman-free";
import "leaflet.vectorgrid";

import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

import { useRegionEditor, type ActiveRegionTool } from "@/contexts/RegionEditorContext";

const FocusRegionView = ({ regionFocusKey, focusedRegionWaypoints }: FocusRegionViewProps) => {
  const map = useMap();
  const lastFocusedRegionKeyRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (regionFocusKey === null || regionFocusKey === undefined) {
      lastFocusedRegionKeyRef.current = null;
      return;
    }

    if (!map || !focusedRegionWaypoints?.length) return;
    if (lastFocusedRegionKeyRef.current === regionFocusKey) return;

    if (focusedRegionWaypoints.length === 1) {
      map.setView(focusedRegionWaypoints[0], 16, { animate: true });
      lastFocusedRegionKeyRef.current = regionFocusKey;
      return;
    }

    const bounds = L.latLngBounds(focusedRegionWaypoints.map(([lat, lng]) => L.latLng(lat, lng)));
    if (!bounds.isValid()) return;

    map.fitBounds(bounds, { padding: [40, 40], animate: true, maxZoom: 16 });
    lastFocusedRegionKeyRef.current = regionFocusKey;
  }, [map, regionFocusKey, focusedRegionWaypoints]);

  return null;
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

const isPointInsidePolygon = (polygon: Array<[number, number]>, point: [number, number]) => {
  const [lat, lng] = point;
  const x = lng;
  const y = lat;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][1];
    const yi = polygon[i][0];
    const xj = polygon[j][1];
    const yj = polygon[j][0];

    const intersect = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
};

const isPointInsideRegion = (shape: RegionDraftShape, point: [number, number]) => {
  if (shape.coordinates.length < 3) return false;

  if (shape.type === "Rectangle") {
    const bounds = L.latLngBounds(shape.coordinates.map(([lat, lng]) => L.latLng(lat, lng)));
    return bounds.contains(L.latLng(point[0], point[1]));
  }

  return isPointInsidePolygon(shape.coordinates, point);
};

const MapClickHandler = () => {
  const {
    showRegionEditor,
    editorPage,
    regionShape,
    isAddingStation,
    addStation,
  } = useRegionEditor();

  useMapEvents({
    click: (e) => {
      if (!showRegionEditor || editorPage !== "stations" || !regionShape || !isAddingStation) {
        return;
      }

      if (!isPointInsideRegion(regionShape, [e.latlng.lat, e.latlng.lng])) {
        console.warn("Station must be inside the region.");
        return;
      }

      addStation(e.latlng.lat, e.latlng.lng);
    },
  });

  return null;
};

const RegionDrawingLayer = ({
  enabled,
  activeRegionTool,
  regionName,
  regionColor,
  regionShape,
  onRegionShapeChange,
  onToolComplete,
}: RegionDrawingLayerProps) => {
  const map = useMap();
  const regionLayerRef = useRef<L.Polygon | L.Rectangle | null>(null);

  type PmMapApi = {
    setGlobalOptions?: (options: object) => void;
    enableDraw?: (shape: "Polygon" | "Rectangle", options?: object) => void;
    disableDraw?: (shape: "Polygon" | "Rectangle") => void;
    globalDrawModeEnabled?: () => boolean;
    disableGlobalDrawMode?: () => void;
    enableGlobalEditMode?: (options?: object) => void;
    globalEditModeEnabled?: () => boolean;
    disableGlobalEditMode?: () => void;
    enableGlobalRemovalMode?: () => void;
    globalRemovalModeEnabled?: () => boolean;
    disableGlobalRemovalMode?: () => void;
  };

  type PmLayerApi = {
    disable?: () => void;
  };

  const normalizeCoordinates = useCallback((layer: L.Polygon | L.Rectangle): Array<[number, number]> => {
    const latLngs = layer.getLatLngs();
    const first = latLngs[0];

    if (Array.isArray(first)) {
      return (first as L.LatLng[]).map((latLng) => [latLng.lat, latLng.lng]);
    }

    return (latLngs as L.LatLng[]).map((latLng) => [latLng.lat, latLng.lng]);
  }, []);

  const applyRegionStyles = useCallback((layer: L.Polygon | L.Rectangle) => {
    layer.setStyle({
      color: regionColor,
      fillColor: regionColor,
      fillOpacity: 0.2,
      weight: 3,
    });
  }, [regionColor]);

  const applyRegionLabel = useCallback((layer: L.Polygon | L.Rectangle) => {
    layer.unbindTooltip();

    const label = regionName.trim();
    if (!label) return;

    const center = layer.getBounds().getCenter();
    layer.bindTooltip(label, {
      permanent: true,
      direction: "center",
      opacity: 1,
      className: "region-name-label",
    });
    layer.openTooltip(center);
  }, [regionName]);

  const toShapeFromLayer = useCallback((layer: L.Polygon | L.Rectangle): RegionDraftShape => ({
    type: layer instanceof L.Rectangle ? "Rectangle" : "Polygon",
    coordinates: normalizeCoordinates(layer),
  }), [normalizeCoordinates]);

  const areShapesEqual = useCallback((left: RegionDraftShape, right: RegionDraftShape) => {
    if (left.type !== right.type) return false;
    if (left.coordinates.length !== right.coordinates.length) return false;

    return left.coordinates.every(([leftLat, leftLng], index) => {
      const [rightLat, rightLng] = right.coordinates[index];
      return Math.abs(leftLat - rightLat) < 1e-7 && Math.abs(leftLng - rightLng) < 1e-7;
    });
  }, []);

  const syncShapeFromLayer = useCallback((layer?: L.Polygon | L.Rectangle | null) => {
    const targetLayer = layer ?? regionLayerRef.current;
    if (!targetLayer) return;
    onRegionShapeChange(toShapeFromLayer(targetLayer));
  }, [onRegionShapeChange, toShapeFromLayer]);

  const bindLayerMutationEvents = useCallback((layer: L.Polygon | L.Rectangle) => {
    const shapeLayer = layer as L.Layer;
    shapeLayer.on("pm:edit", () => syncShapeFromLayer(layer));
    shapeLayer.on("pm:update", () => syncShapeFromLayer(layer));
    shapeLayer.on("pm:markerdragend", () => syncShapeFromLayer(layer));
    shapeLayer.on("pm:vertexadded", () => syncShapeFromLayer(layer));
    shapeLayer.on("pm:vertexremoved", () => syncShapeFromLayer(layer));
  }, [syncShapeFromLayer]);

  const unbindLayerMutationEvents = useCallback((layer: L.Polygon | L.Rectangle) => {
    const shapeLayer = layer as L.Layer;
    shapeLayer.off("pm:edit");
    shapeLayer.off("pm:update");
    shapeLayer.off("pm:markerdragend");
    shapeLayer.off("pm:vertexadded");
    shapeLayer.off("pm:vertexremoved");
  }, []);

  const disableLayerEditing = useCallback(() => {
    const pmLayer = regionLayerRef.current as (L.Layer & { pm?: PmLayerApi }) | null;
    pmLayer?.pm?.disable?.();
  }, []);

  const disableAllRegionTools = useCallback(() => {
    const pmMap = map as L.Map & { pm?: PmMapApi };
    if (!pmMap.pm) return;

    pmMap.pm.disableDraw?.("Polygon");
    pmMap.pm.disableDraw?.("Rectangle");
    try {
      if (!pmMap.pm.globalDrawModeEnabled || pmMap.pm.globalDrawModeEnabled()) {
        pmMap.pm.disableGlobalDrawMode?.();
      }
    } catch {
      // Some Geoman states can throw when disabling a mode that has no listener wiring yet.
    }
    try {
      if (!pmMap.pm.globalEditModeEnabled || pmMap.pm.globalEditModeEnabled()) {
        pmMap.pm.disableGlobalEditMode?.();
      }
    } catch {
      // Some Geoman states can throw when disabling a mode that has no listener wiring yet.
    }
    try {
      if (!pmMap.pm.globalRemovalModeEnabled || pmMap.pm.globalRemovalModeEnabled()) {
        pmMap.pm.disableGlobalRemovalMode?.();
      }
    } catch {
      // Some Geoman states can throw when disabling a mode that has no listener wiring yet.
    }
    disableLayerEditing();
  }, [map, disableLayerEditing]);

  useEffect(() => {
    if (!enabled || !regionLayerRef.current) return;

    applyRegionStyles(regionLayerRef.current);
    applyRegionLabel(regionLayerRef.current);
  }, [enabled, regionColor, regionName, applyRegionLabel, applyRegionStyles]);

  useEffect(() => {
    if (!enabled) return;

    if (!regionShape || regionShape.coordinates.length < 3) {
      if (regionLayerRef.current) {
        unbindLayerMutationEvents(regionLayerRef.current);
        map.removeLayer(regionLayerRef.current);
        regionLayerRef.current = null;
      }
      return;
    }

    if (regionLayerRef.current) {
      const currentShape = toShapeFromLayer(regionLayerRef.current);
      if (areShapesEqual(currentShape, regionShape)) {
        applyRegionStyles(regionLayerRef.current);
        applyRegionLabel(regionLayerRef.current);
        return;
      }
    }

    if (regionLayerRef.current) {
      unbindLayerMutationEvents(regionLayerRef.current);
      map.removeLayer(regionLayerRef.current);
      regionLayerRef.current = null;
    }

    const latLngs = regionShape.coordinates.map(([lat, lng]) => L.latLng(lat, lng));
    const layer = regionShape.type === "Rectangle"
      ? L.rectangle(L.latLngBounds(latLngs))
      : L.polygon(latLngs);

    layer.addTo(map);
    regionLayerRef.current = layer;
    applyRegionStyles(layer);
    applyRegionLabel(layer);
    bindLayerMutationEvents(layer);
  }, [enabled, map, regionShape, applyRegionLabel, applyRegionStyles, areShapesEqual, bindLayerMutationEvents, toShapeFromLayer, unbindLayerMutationEvents]);

  useEffect(() => {
    const pmMap = map as L.Map & { pm?: PmMapApi };

    if (!pmMap.pm) return;

    const clearRegionLayer = () => {
      if (!regionLayerRef.current) return;

      unbindLayerMutationEvents(regionLayerRef.current);
      map.removeLayer(regionLayerRef.current);
      regionLayerRef.current = null;
      onRegionShapeChange(null);
    };

    const handleCreate: (event: { layer: L.Polygon | L.Rectangle; shape?: string }) => void = (event) => {
      if (regionLayerRef.current) {
        unbindLayerMutationEvents(regionLayerRef.current);
        map.removeLayer(regionLayerRef.current);
      }

      const layer = event.layer;
      regionLayerRef.current = layer;

      applyRegionStyles(layer);
      applyRegionLabel(layer);
      bindLayerMutationEvents(layer);

      onRegionShapeChange({
        type: event.shape === "Rectangle" ? "Rectangle" : "Polygon",
        coordinates: normalizeCoordinates(layer),
      });

      onToolComplete();
    };

    const handleEdit = (event: { layer: L.Polygon | L.Rectangle }) => {
      if (!event.layer || event.layer !== regionLayerRef.current) return;
      syncShapeFromLayer(event.layer);
    };

    const handleGeometryMutated = (event: { layer?: L.Polygon | L.Rectangle }) => {
      if (event.layer && event.layer !== regionLayerRef.current) return;
      syncShapeFromLayer(event.layer ?? regionLayerRef.current);
    };

    const handleRemove = (event: { layer: L.Polygon | L.Rectangle }) => {
      if (!event.layer || event.layer !== regionLayerRef.current) return;

      regionLayerRef.current = null;
      onRegionShapeChange(null);
      onToolComplete();
    };

    if (enabled) {
      pmMap.pm.setGlobalOptions?.({ continueDrawing: false });
      map.on("pm:create", handleCreate);
      map.on("pm:edit", handleEdit);
      map.on("pm:update", handleGeometryMutated);
      map.on("pm:markerdragend", handleGeometryMutated);
      map.on("pm:vertexadded", handleGeometryMutated);
      map.on("pm:vertexremoved", handleGeometryMutated);
      map.on("pm:remove", handleRemove);
    } else {
      disableAllRegionTools();
      clearRegionLayer();
    }

    return () => {
      map.off("pm:create", handleCreate);
      map.off("pm:edit", handleEdit);
      map.off("pm:update", handleGeometryMutated);
      map.off("pm:markerdragend", handleGeometryMutated);
      map.off("pm:vertexadded", handleGeometryMutated);
      map.off("pm:vertexremoved", handleGeometryMutated);
      map.off("pm:remove", handleRemove);

      if (regionLayerRef.current) {
        unbindLayerMutationEvents(regionLayerRef.current);
      }
      disableAllRegionTools();

      if (!enabled) {
        clearRegionLayer();
      }
    };
  }, [enabled, map, onRegionShapeChange, applyRegionLabel, applyRegionStyles, normalizeCoordinates, syncShapeFromLayer, bindLayerMutationEvents, unbindLayerMutationEvents, disableAllRegionTools, onToolComplete]);

  useEffect(() => {
    if (!enabled) {
      disableAllRegionTools();
      return;
    }

    const pmMap = map as L.Map & { pm?: PmMapApi };
    if (!pmMap.pm) return;

    disableAllRegionTools();

    if (activeRegionTool === "draw-polygon") {
      pmMap.pm.enableDraw?.("Polygon", {
        continueDrawing: false,
        allowSelfIntersection: false,
      });
      return;
    }

    if (activeRegionTool === "draw-rectangle") {
      pmMap.pm.enableDraw?.("Rectangle", { continueDrawing: false });
      return;
    }

    if (activeRegionTool === "edit-region" && regionLayerRef.current) {
      pmMap.pm.enableGlobalEditMode?.({ allowSelfIntersection: false });
    }
  }, [enabled, map, activeRegionTool, disableAllRegionTools]);

  useEffect(() => () => {
    if (!regionLayerRef.current) return;

    unbindLayerMutationEvents(regionLayerRef.current);
    map.removeLayer(regionLayerRef.current);
    regionLayerRef.current = null;
  }, [map, unbindLayerMutationEvents]);

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

const StationMarkers = () => {
  const {
    regionShape,
    stations,
    activeStationId,
    updateStation,
    setActiveStationId,
  } = useRegionEditor();

  if (!regionShape) return null;

  return (
    <>
      {stations.map((station, position) => {
        const isDraggable = station.id === activeStationId;

        return (
          <Marker
            key={station.id}
            position={[station.lat, station.lng]}
            icon={createSequenceIcon(position + 1, isDraggable)}
            draggable={isDraggable}
            autoPan={true}
            eventHandlers={{
              click: () => {
                setActiveStationId(station.id);
              },
              dragend: (event) => {
                const marker = event.target as L.Marker;
                const { lat, lng } = marker.getLatLng();
                const nextPoint: [number, number] = [lat, lng];

                if (!isPointInsideRegion(regionShape, nextPoint)) {
                  marker.setLatLng(L.latLng(station.lat, station.lng));
                  console.warn("Station must stay inside the region.");
                  return;
                }

                updateStation(station.id, lat, lng);
              },
            }}
          />
        );
      })}
    </>
  );
};

const RegionsLayer = ({ regions }: RegionsLayerProps) => {
  const {
    showRegionEditor,
    editingRegionId,
  } = useRegionEditor();

  const displayRegions = showRegionEditor && editingRegionId
    ? regions.filter((region) => region.id === editingRegionId)
    : regions;

  return (
    <>
      {displayRegions.map((region) => {
        const sortedPoints = [...region.points]
          .sort((a, b) => a.sequence - b.sequence)
          .map((point) => point.point);

        if (sortedPoints.length < 3) return null;

        return (
          <Polygon
            key={region.id}
            positions={sortedPoints}
            pathOptions={{
              color: region.regionColor,
              fillColor: region.regionColor,
              fillOpacity: 0.15,
              weight: 2,
            }}
          >
            <Tooltip
              permanent
              direction="center"
              opacity={1}
              className="region-name-label"
            >
              {region.regionName}
            </Tooltip>
          </Polygon>
        );
      })}
    </>
  );
};

export default function RegionMapComponent({
  regions,
  focusedRegionWaypoints,
  regionFocusKey,
}: RegionMapProps) {
  const {
    showRegionEditor,
    hasDefinedPolygon,
    activeRegionTool,
    regionShape,
    regionName,
    regionColor,
    setRegionShape,
    finishRegionToolEditing,
  } = useRegionEditor();

  useEffect(() => {
    fixLeafletIcons();
  }, []);

  return (
    <div className="relative h-full w-full">
      <MapContainer center={[10.7302, 122.5591]} zoom={13} className="h-full w-full">
        <VectorTileLayer />
        <MapClickHandler />
        <FocusRegionView regionFocusKey={regionFocusKey} focusedRegionWaypoints={focusedRegionWaypoints} />

        {!showRegionEditor ? <RegionsLayer regions={regions ?? []} /> : null}

        {showRegionEditor ? (
          <RegionDrawingLayer
            enabled={true}
            activeRegionTool={activeRegionTool}
            regionName={regionName}
            regionColor={regionColor}
            regionShape={regionShape}
            onRegionShapeChange={setRegionShape}
            onToolComplete={finishRegionToolEditing}
          />
        ) : null}

        {showRegionEditor && hasDefinedPolygon ? <StationMarkers /> : null}
      </MapContainer>
    </div>
  );
}

export interface RegionMapProps {
  regions?: Array<{
    id: string;
    regionName: string;
    regionColor: string;
    regionShape: string;
    points: Array<{
      id: string;
      sequence: number;
      point: [number, number];
    }>;
    stations: Array<{
      id: string;
      address: string;
      point: [number, number];
    }>;
  }>;
  focusedRegionWaypoints?: Array<[number, number]>;
  regionFocusKey?: string | number | null;
}

interface FocusRegionViewProps {
  focusedRegionWaypoints?: Array<[number, number]>;
  regionFocusKey?: string | number | null;
}

interface RegionDrawingLayerProps {
  enabled: boolean;
  activeRegionTool: ActiveRegionTool;
  regionName: string;
  regionColor: string;
  regionShape: RegionDraftShape | null;
  onRegionShapeChange: (shape: RegionDraftShape | null) => void;
  onToolComplete: () => void;
}

interface RegionsLayerProps {
  regions: Array<{
    id: string;
    regionName: string;
    regionColor: string;
    regionShape: string;
    points: Array<{
      id: string;
      sequence: number;
      point: [number, number];
    }>;
    stations: Array<{
      id: string;
      address: string;
      point: [number, number];
    }>;
  }>;
}

export interface RegionDraftShape {
  type: "Polygon" | "Rectangle";
  coordinates: Array<[number, number]>;
}
