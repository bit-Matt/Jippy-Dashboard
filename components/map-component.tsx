"use client";

import { type ComponentProps, useCallback, useEffect, useRef } from "react";
import { MapContainer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

import "@maplibre/maplibre-gl-leaflet";
import "@geoman-io/leaflet-geoman-free";
import "leaflet-routing-machine";
import "lrm-mapzen";

import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";

import { useRegionEditor } from "@/contexts/RegionEditorContext";
import { useRouteEditor } from "@/contexts/RouteEditorContext";

const FocusRouteView = ({ focusKey, focusedWaypoints }: FocusRouteViewProps) => {
  const map = useMap();
  const lastFocusedKeyRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (!map || focusKey === null || focusKey === undefined || !focusedWaypoints?.length) return;
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
  // delete (L.Icon.Default.prototype)._getIconUrl;

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
      if (isCreating) {
        addWaypoint(e.latlng.lat, e.latlng.lng);
      }
    },
  });

  return null;
};

const VectorTileLayer = () => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const glLayer = L.maplibreGL({
      style: "https://api.maptiler.com/maps/openstreetmap/style.json?key=mNI9bvVhZy4T5HcVvqIr",
    });

    glLayer.addTo(map);

    return () => {
      map.removeLayer(glLayer);
    };
  }, [map]);

  return null;
};

const RoutingMachine = ({ waypoints, color }: RoutingMachineProps) => {
  const map = useMap();

  useEffect(() => {
    if (!map || waypoints.length < 2) return;

    const serviceUrl = new URL("/api/restricted/osm/valhalla/route", window.location.origin);

    // Create Valhalla router instance
    const mapzenRouter = L.Routing.mapzen("valhalla-", {
      costing: "auto",
      serviceUrl: serviceUrl.toString() + "?",
    });

    const routingControl = L.Routing.control({
      router: mapzenRouter,
      formatter: new L.Routing.mapzenFormatter(),
      waypoints: waypoints.map(([lat, lng]) => L.latLng(lat, lng)),
      routeWhileDragging: true,
      // @ts-expect-error - createMarker is required but we don't need it since we're using custom markers
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
    }).addTo(map);

    return () => {
      map.removeControl(routingControl);
    };
  }, [map, waypoints, color]);

  return null;
};

const RegionDrawingLayer = ({
  enabled,
  regionName,
  regionColor,
  onRegionShapeChange,
}: RegionDrawingLayerProps) => {
  const map = useMap();
  const regionLayerRef = useRef<L.Polygon | L.Rectangle | null>(null);

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

  useEffect(() => {
    if (!enabled || !regionLayerRef.current) return;

    applyRegionStyles(regionLayerRef.current);
    applyRegionLabel(regionLayerRef.current);
  }, [enabled, regionColor, regionName, applyRegionLabel, applyRegionStyles]);

  useEffect(() => {
    const pmMap = map as L.Map & {
      pm?: {
        addControls: (options: object) => void;
        removeControls: () => void;
        setGlobalOptions: (options: object) => void;
      };
    };

    if (!pmMap.pm) return;

    const clearRegionLayer = () => {
      if (!regionLayerRef.current) return;

      map.removeLayer(regionLayerRef.current);
      regionLayerRef.current = null;
      onRegionShapeChange(null);
    };

    const handleCreate: (event: { layer: L.Polygon | L.Rectangle; shape?: string }) => void = (event) => {
      if (regionLayerRef.current) {
        map.removeLayer(regionLayerRef.current);
      }

      const layer = event.layer;
      regionLayerRef.current = layer;

      applyRegionStyles(layer);
      applyRegionLabel(layer);

      onRegionShapeChange({
        type: event.shape === "Rectangle" ? "Rectangle" : "Polygon",
        coordinates: normalizeCoordinates(layer),
      });
    };

    if (enabled) {
      pmMap.pm.addControls({
        position: "bottomleft",
        drawCircle: false,
        drawCircleMarker: false,
        drawMarker: false,
        drawPolyline: false,
        drawText: false,
        drawPolygon: true,
        drawRectangle: true,
        editMode: true,
        dragMode: false,
        cutPolygon: false,
        removalMode: true,
        rotateMode: true,
      });
      pmMap.pm.setGlobalOptions({ continueDrawing: false });
      map.on("pm:create", handleCreate);
    } else {
      pmMap.pm.removeControls();
      clearRegionLayer();
    }

    return () => {
      map.off("pm:create", handleCreate);

      if (pmMap.pm) {
        pmMap.pm.removeControls();
      }

      if (!enabled) {
        clearRegionLayer();
      }
    };
  }, [enabled, map, onRegionShapeChange, applyRegionLabel, applyRegionStyles, normalizeCoordinates]);

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

export default function MapComponent({
  routing,
  focusedWaypoints,
  focusKey,
}: MapProps) {
  const { isCreating, waypoints, selectedColor } = useRouteEditor();
  const {
    showRegionEditor,
    regionName,
    regionColor,
    setRegionShape,
  } = useRegionEditor();

  useEffect(() => {
    fixLeafletIcons();
  }, []);

  return (
    <MapContainer center={[10.7302, 122.5591]} zoom={13} className="h-full w-full">
      <VectorTileLayer />
      <MapClickHandler />
      <FocusRouteView focusKey={focusKey} focusedWaypoints={focusedWaypoints} />
      <RegionDrawingLayer
        enabled={!isCreating && showRegionEditor}
        regionName={regionName}
        regionColor={regionColor}
        onRegionShapeChange={setRegionShape}
      />
      {isCreating && <WaypointMarkers />}

      {isCreating && waypoints.length >= 2 && (
        <RoutingMachine
          waypoints={waypoints.map(wp => [wp.lat, wp.lng])}
          color={selectedColor}
        />
      )}

      {routing && !isCreating
        ? routing.map((r, i) => (
          <RoutingMachine key={i} waypoints={r.waypoints} color={r.color} />
        ))
        : null}
    </MapContainer>
  );
}

export interface RoutingMachineProps {
  waypoints: Array<[number, number]>;
  color: string;
}

export interface MapProps {
  routing?: Array<ComponentProps<typeof RoutingMachine>>;
  focusedWaypoints?: Array<[number, number]>;
  focusKey?: string | number | null;
}

interface FocusRouteViewProps {
  focusedWaypoints?: Array<[number, number]>;
  focusKey?: string | number | null;
}

interface RegionDrawingLayerProps {
  enabled: boolean;
  regionName: string;
  regionColor: string;
  onRegionShapeChange: (shape: RegionDraftShape | null) => void;
}

export interface RegionDraftShape {
  type: "Polygon" | "Rectangle";
  coordinates: Array<[number, number]>;
}
