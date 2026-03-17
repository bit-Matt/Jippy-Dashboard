"use client";

import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polygon, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

import "@maplibre/maplibre-gl-leaflet";
import "@geoman-io/leaflet-geoman-free";
import "leaflet-routing-machine";
import "leaflet.vectorgrid";
import "lrm-mapzen";

import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";

import { useRegionEditor } from "@/contexts/RegionEditorContext";
import { useRouteEditor } from "@/contexts/RouteEditorContext";
import { useClosureEditor } from "@/contexts/ClosureEditorContext";

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
  // delete (L.Icon.Default.prototype)._getIconUrl;

  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  });
};

const MapClickHandler = () => {
  const { isCreating, addWaypoint } = useRouteEditor();
  const {
    showRegionEditor,
    regionShape,
    isAddingStation,
    addStation,
  } = useRegionEditor();
  const {
    mode: closureMode,
    addLinePoint,
    addRegionPoint,
  } = useClosureEditor();

  useMapEvents({
    click: (e) => {
      if (isCreating) {
        addWaypoint(e.latlng.lat, e.latlng.lng);
        return;
      }

      if (closureMode === "creating-line" || closureMode === "editing-line") {
        addLinePoint(e.latlng.lat, e.latlng.lng);
        return;
      }

      if (closureMode === "creating-region" || closureMode === "editing-region") {
        addRegionPoint(e.latlng.lat, e.latlng.lng);
        return;
      }

      if (!showRegionEditor || !regionShape || !isAddingStation) {
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
    }).addTo(map) as unknown as L.Control & L.Evented;

    const handleRoutesFound: L.LeafletEventHandlerFn = (event) => {
      if (!onRouteCoordinatesChange) return;
      const routeEvent = event as L.LeafletEvent & {
        routes?: Array<{
          coordinates?: L.LatLng[];
        }>;
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

const RegionDrawingLayer = ({
  enabled,
  regionName,
  regionColor,
  regionShape,
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

    const pmLayer = layer as L.Layer & {
      pm?: {
        enable: (options?: object) => void;
      };
    };

    pmLayer.pm?.enable({
      allowSelfIntersection: false,
      draggable: false,
    });
  }, [enabled, map, regionShape, applyRegionLabel, applyRegionStyles, areShapesEqual, bindLayerMutationEvents, toShapeFromLayer, unbindLayerMutationEvents]);

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

      unbindLayerMutationEvents(regionLayerRef.current);
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
      bindLayerMutationEvents(layer);

      onRegionShapeChange({
        type: event.shape === "Rectangle" ? "Rectangle" : "Polygon",
        coordinates: normalizeCoordinates(layer),
      });

      const pmLayer = layer as L.Layer & {
        pm?: {
          enable: (options?: object) => void;
        };
      };

      pmLayer.pm?.enable({
        allowSelfIntersection: false,
        draggable: false,
      });
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
      map.on("pm:edit", handleEdit);
      map.on("pm:update", handleGeometryMutated);
      map.on("pm:markerdragend", handleGeometryMutated);
      map.on("pm:vertexadded", handleGeometryMutated);
      map.on("pm:vertexremoved", handleGeometryMutated);
      map.on("pm:remove", handleRemove);
    } else {
      pmMap.pm.removeControls();
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

      if (pmMap.pm) {
        pmMap.pm.removeControls();
      }

      if (!enabled) {
        clearRegionLayer();
      }
    };
  }, [enabled, map, onRegionShapeChange, applyRegionLabel, applyRegionStyles, normalizeCoordinates, syncShapeFromLayer, bindLayerMutationEvents, unbindLayerMutationEvents]);

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
  // Arrow SVG points to the right (east) by default, while bearing 0 points north.
  // Offset by -90deg so cardinal directions line up with map movement.
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

const ClosureLinesLayer = ({ closures }: ClosureLinesLayerProps) => {
  return (
    <>
      {closures.map(closure => {
        const sortedPoints = [...closure.points]
          .sort((a, b) => a.sequence - b.sequence)
          .map(p => p.point);

        if (sortedPoints.length < 2) return null;

        return (
          <Polygon
            // Polygon with no fill effectively behaves like a polyline here
            key={closure.id}
            positions={sortedPoints}
            pathOptions={{
              color: closure.color,
              weight: 4,
              dashArray: "6 4",
              fill: false,
            }}
          >
            {closure.label && (
              <Tooltip
                permanent={false}
                direction="top"
                opacity={0.9}
              >
                {closure.label} ({closure.direction === "one_way" ? "one-way" : "both ways"})
              </Tooltip>
            )}
          </Polygon>
        );
      })}
    </>
  );
};

const ClosureRegionsLayer = ({ closures }: ClosureRegionsLayerProps) => {
  return (
    <>
      {closures.map(closure => {
        const sortedPoints = [...closure.points]
          .sort((a, b) => a.sequence - b.sequence)
          .map(p => p.point);

        if (sortedPoints.length < 3) return null;

        return (
          <Polygon
            key={closure.id}
            positions={sortedPoints}
            pathOptions={{
              color: closure.color,
              fillColor: closure.color,
              fillOpacity: 0.25,
              weight: 2,
            }}
          >
            {closure.label && (
              <Tooltip
                permanent
                direction="center"
                opacity={1}
                className="region-name-label"
              >
                {closure.label}
              </Tooltip>
            )}
          </Polygon>
        );
      })}
    </>
  );
};

export default function MapComponent({
  regions,
  routing,
  focusedWaypoints,
  focusKey,
  focusedRegionWaypoints,
  regionFocusKey,
  closureLines,
  closureRegions,
}: MapProps) {
  const { isCreating, waypoints, selectedColor } = useRouteEditor();
  const [activeRouteCoordinates, setActiveRouteCoordinates] = useState<Array<[number, number]>>([]);
  const activeRoutingWaypoints = useMemo(
    () => waypoints.map((waypoint) => [waypoint.lat, waypoint.lng] as [number, number]),
    [waypoints],
  );
  const {
    showRegionEditor,
    hasDefinedPolygon,
    regionShape,
    regionName,
    regionColor,
    setRegionShape,
  } = useRegionEditor();
  const { mode: closureMode, lineDraft, regionDraft } = useClosureEditor();

  useEffect(() => {
    fixLeafletIcons();
  }, []);

  const shouldRenderDirectionArrows = isCreating
    && !showRegionEditor
    && (activeRouteCoordinates.length >= 2 || activeRoutingWaypoints.length >= 2);

  return (
    <MapContainer center={[10.7302, 122.5591]} zoom={13} className="h-full w-full">
      <VectorTileLayer />
      <MapClickHandler />
      <FocusRouteView focusKey={focusKey} focusedWaypoints={focusedWaypoints} />
      <FocusRegionView regionFocusKey={regionFocusKey} focusedRegionWaypoints={focusedRegionWaypoints} />
      <RegionDrawingLayer
        enabled={!isCreating && showRegionEditor}
        regionName={regionName}
        regionColor={regionColor}
        regionShape={regionShape}
        onRegionShapeChange={setRegionShape}
      />
      {!showRegionEditor && <RegionsLayer regions={regions ?? []} />}
      {!isCreating && showRegionEditor && hasDefinedPolygon && <StationMarkers />}
      {isCreating && <WaypointMarkers />}
      {shouldRenderDirectionArrows && <DirectionArrows routeCoordinates={activeRouteCoordinates} />}

      {isCreating && activeRoutingWaypoints.length >= 2 && (
        <RoutingMachine
          waypoints={activeRoutingWaypoints}
          color={selectedColor}
          onRouteCoordinatesChange={setActiveRouteCoordinates}
        />
      )}

      {routing && !isCreating
        ? routing.map((r, i) => (
          <RoutingMachine key={i} waypoints={r.waypoints} color={r.color} />
        ))
        : null}

      {/* Existing persisted closures */}
      <ClosureLinesLayer
        closures={closureLines ?? []}
      />
      <ClosureRegionsLayer
        closures={closureRegions ?? []}
      />
    </MapContainer>
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

export interface MapProps {
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
  routing?: Array<ComponentProps<typeof RoutingMachine>>;
  focusedWaypoints?: Array<[number, number]>;
  focusKey?: string | number | null;
  focusedRegionWaypoints?: Array<[number, number]>;
  regionFocusKey?: string | number | null;
  closureLines?: Array<{
    id: string;
    type: "line";
    label: string;
    color: string;
    direction: "one_way" | "both";
    points: Array<{
      id: string;
      sequence: number;
      address: string;
      point: [number, number];
    }>;
  }>;
  closureRegions?: Array<{
    id: string;
    type: "region";
    label: string;
    color: string;
    points: Array<{
      id: string;
      sequence: number;
      point: [number, number];
    }>;
  }>;
}

interface FocusRouteViewProps {
  focusedWaypoints?: Array<[number, number]>;
  focusKey?: string | number | null;
}

interface FocusRegionViewProps {
  focusedRegionWaypoints?: Array<[number, number]>;
  regionFocusKey?: string | number | null;
}

interface RegionDrawingLayerProps {
  enabled: boolean;
  regionName: string;
  regionColor: string;
  regionShape: RegionDraftShape | null;
  onRegionShapeChange: (shape: RegionDraftShape | null) => void;
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

interface ClosureLinesLayerProps {
  closures: NonNullable<MapProps["closureLines"]>;
}

interface ClosureRegionsLayerProps {
  closures: NonNullable<MapProps["closureRegions"]>;
}

export interface RegionDraftShape {
  type: "Polygon" | "Rectangle";
  coordinates: Array<[number, number]>;
}
