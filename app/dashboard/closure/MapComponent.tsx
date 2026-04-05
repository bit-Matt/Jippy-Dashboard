"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { MapContainer, Polygon, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";

import "@maplibre/maplibre-gl-leaflet";
import "@geoman-io/leaflet-geoman-free";
import "leaflet.vectorgrid";

import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

import type { AllResponse } from "@/components/app-sidebar";
import { useClosureEditor } from "@/contexts/ClosureEditorContext";

type ClosureDrawingTool = "none" | "draw-polygon" | "edit-region";

interface RegionDraftShape {
	type: "Polygon";
	coordinates: Array<[number, number]>;
}

interface ClosureMapProps {
	closures?: AllResponse["closures"];
	onClosureClick?: (closure: AllResponse["closures"][0]) => void;
	focusedWaypoints?: Array<[number, number]>;
	focusKey?: string | number | null;
}

interface FocusClosureViewProps {
	focusedWaypoints?: Array<[number, number]>;
	focusKey?: string | number | null;
}

interface RegionDrawingLayerProps {
	activeTool: ClosureDrawingTool;
	regionName: string;
	regionColor: string;
	regionShape: RegionDraftShape | null;
	onRegionShapeChange: (shape: RegionDraftShape | null) => void;
	onToolComplete: () => void;
}

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

const FocusClosureView = ({ focusKey, focusedWaypoints }: FocusClosureViewProps) => {
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

const RegionDrawingLayer = ({
  activeTool,
  regionName,
  regionColor,
  regionShape,
  onRegionShapeChange,
  onToolComplete,
}: RegionDrawingLayerProps) => {
  const map = useMap();
  const regionLayerRef = useRef<L.Polygon | null>(null);
  const isInternalShapeResetRef = useRef(false);

	type PmMapApi = {
		setGlobalOptions?: (options: object) => void;
		enableDraw?: (shape: "Polygon", options?: object) => void;
		disableDraw?: (shape: "Polygon") => void;
		disableGlobalDrawMode?: () => void;
		enableGlobalEditMode?: (options?: object) => void;
		disableGlobalEditMode?: () => void;
		disableGlobalRemovalMode?: () => void;
	};

	const normalizeCoordinates = useCallback((layer: L.Polygon): Array<[number, number]> => {
	  const latLngs = layer.getLatLngs()[0] as L.LatLng[];
	  return latLngs.map((latLng) => [latLng.lat, latLng.lng]);
	}, []);

	const applyRegionStyles = useCallback((layer: L.Polygon) => {
	  layer.setStyle({
	    color: regionColor,
	    fillColor: regionColor,
	    fillOpacity: 0.2,
	    weight: 3,
	  });
	}, [regionColor]);

	const applyRegionLabel = useCallback((layer: L.Polygon) => {
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

	const syncShapeFromLayer = useCallback((layer?: L.Polygon | null) => {
	  const targetLayer = layer ?? regionLayerRef.current;
	  if (!targetLayer) return;
	  onRegionShapeChange({
	    type: "Polygon",
	    coordinates: normalizeCoordinates(targetLayer),
	  });
	}, [onRegionShapeChange, normalizeCoordinates]);

	const unbindLayerMutationEvents = useCallback((layer: L.Polygon) => {
	  const shapeLayer = layer as L.Layer;
	  shapeLayer.off("pm:edit");
	  shapeLayer.off("pm:update");
	  shapeLayer.off("pm:markerdragend");
	  shapeLayer.off("pm:vertexadded");
	  shapeLayer.off("pm:vertexremoved");
	}, []);

	const disableAllRegionTools = useCallback(() => {
	  const pmMap = map as L.Map & { pm?: PmMapApi };
	  if (!pmMap.pm) return;

	  pmMap.pm.disableDraw?.("Polygon");
	  pmMap.pm.disableGlobalDrawMode?.();
	  pmMap.pm.disableGlobalEditMode?.();
	}, [map]);

	useEffect(() => {
	  if (!regionLayerRef.current || !regionShape || regionShape.coordinates.length < 3) {
	    return;
	  }

	  applyRegionStyles(regionLayerRef.current);
	  applyRegionLabel(regionLayerRef.current);
	}, [regionShape, applyRegionLabel, applyRegionStyles]);

	useEffect(() => {
	  if (!regionShape || regionShape.coordinates.length < 3) {
	    if (regionLayerRef.current) {
	      unbindLayerMutationEvents(regionLayerRef.current);
	      map.removeLayer(regionLayerRef.current);
	      regionLayerRef.current = null;
	    }
	    return;
	  }

	  if (regionLayerRef.current) {
	    const layerCoordinates = normalizeCoordinates(regionLayerRef.current);
	    if (areCoordinatesEqual(layerCoordinates, regionShape.coordinates)) {
	      applyRegionStyles(regionLayerRef.current);
	      applyRegionLabel(regionLayerRef.current);
	      return;
	    }

	    if (activeTool === "edit-region" || activeTool === "none") {
	      syncShapeFromLayer(regionLayerRef.current);
	      applyRegionStyles(regionLayerRef.current);
	      applyRegionLabel(regionLayerRef.current);
	      return;
	    }

	    unbindLayerMutationEvents(regionLayerRef.current);
	    map.removeLayer(regionLayerRef.current);
	    regionLayerRef.current = null;
	  }

	  const layer = L.polygon(regionShape.coordinates.map(([lat, lng]) => L.latLng(lat, lng)));

	  layer.addTo(map);
	  regionLayerRef.current = layer;
	  applyRegionStyles(layer);
	  applyRegionLabel(layer);

	  const pmMap = map as L.Map & { pm?: PmMapApi };
	  if (activeTool === "edit-region") {
	    pmMap.pm?.enableGlobalEditMode?.({ allowSelfIntersection: false });
	  }
	}, [map, regionShape, activeTool, applyRegionLabel, applyRegionStyles, normalizeCoordinates, syncShapeFromLayer, unbindLayerMutationEvents]);

	useEffect(() => {
	  const pmMap = map as L.Map & { pm?: PmMapApi };
	  if (!pmMap.pm) return;

	  const handleCreate: (event: { layer: L.Polygon }) => void = (event) => {
	    if (regionLayerRef.current) {
	      unbindLayerMutationEvents(regionLayerRef.current);
	      map.removeLayer(regionLayerRef.current);
	    }

	    const layer = event.layer;
	    regionLayerRef.current = layer;

	    applyRegionStyles(layer);
	    applyRegionLabel(layer);

	    onRegionShapeChange({
	      type: "Polygon",
	      coordinates: normalizeCoordinates(layer),
	    });

	    onToolComplete();
	  };

	  const handleGeometryMutated = (event: { layer?: L.Polygon }) => {
	    if (event.layer && event.layer !== regionLayerRef.current) return;
	    syncShapeFromLayer(event.layer ?? regionLayerRef.current);
	  };

	  const handleRemove = (event: { layer: L.Polygon }) => {
	    if (!event.layer || event.layer !== regionLayerRef.current) return;
	    regionLayerRef.current = null;

	    if (isInternalShapeResetRef.current) {
	      isInternalShapeResetRef.current = false;
	      return;
	    }

	    onRegionShapeChange(null);
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
	    disableAllRegionTools();
	  };
	}, [map, onRegionShapeChange, applyRegionLabel, applyRegionStyles, normalizeCoordinates, syncShapeFromLayer, unbindLayerMutationEvents, disableAllRegionTools, onToolComplete]);

	useEffect(() => {
	  const pmMap = map as L.Map & { pm?: PmMapApi };
	  if (!pmMap.pm) return;

	  disableAllRegionTools();

	  if (activeTool === "draw-polygon") {
	    if (regionLayerRef.current) {
	      isInternalShapeResetRef.current = true;
	      unbindLayerMutationEvents(regionLayerRef.current);
	      map.removeLayer(regionLayerRef.current);
	      regionLayerRef.current = null;
	      onRegionShapeChange(null);
	    }

	    pmMap.pm.enableDraw?.("Polygon", {
	      continueDrawing: false,
	      allowSelfIntersection: false,
	    });
	    return;
	  }

	  if (activeTool === "edit-region" && regionLayerRef.current) {
	    pmMap.pm.enableGlobalEditMode?.({ allowSelfIntersection: false });
	  }
	}, [activeTool, map, disableAllRegionTools, onRegionShapeChange, unbindLayerMutationEvents]);

	useEffect(() => () => {
	  if (!regionLayerRef.current) return;

	  unbindLayerMutationEvents(regionLayerRef.current);
	  map.removeLayer(regionLayerRef.current);
	  regionLayerRef.current = null;
	}, [map, unbindLayerMutationEvents]);

	return null;
};

const ClosureRegionsLayer = ({
  closures,
  onClosureClick,
}: {
	closures: AllResponse["closures"];
	onClosureClick?: (closure: AllResponse["closures"][0]) => void;
}) => {
  return (
    <>
      {closures.map((closure) => {
        const sortedPoints = [...closure.points]
          .sort((a, b) => a.sequence - b.sequence)
          .map((point) => point.point);

        if (sortedPoints.length < 3) return null;

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
            eventHandlers={{
              click: (event) => {
                const originalEvent = event.originalEvent as unknown as Event | undefined;
                if (originalEvent) {
                  L.DomEvent.stopPropagation(originalEvent);
                  L.DomEvent.preventDefault(originalEvent);
                }
                onClosureClick?.(closure);
              },
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

export default function ClosureMapComponent({
  closures,
  onClosureClick,
  focusedWaypoints,
  focusKey,
}: ClosureMapProps) {
  const {
    mode: closureMode,
    draft: closureDraft,
    activeClosureTool,
    setPolygonPoints,
    finishClosureToolEditing,
  } = useClosureEditor();

  useEffect(() => {
    fixLeafletIcons();
  }, []);

  const isClosureEditing = closureMode === "creating" || closureMode === "editing";
  const closurePoints = closureDraft?.points ?? null;
  const closurePolygon = useMemo<RegionDraftShape | null>(() => {
    if (!closurePoints || closurePoints.length < 3) {
      return null;
    }

    return {
      type: "Polygon",
      coordinates: [...closurePoints]
        .sort((a, b) => a.sequence - b.sequence)
        .map((point) => point.point),
    };
  }, [closurePoints]);

  const mappedClosureTool: ClosureDrawingTool = activeClosureTool === "draw-polygon"
    ? "draw-polygon"
    : activeClosureTool === "edit-polygon"
      ? "edit-region"
      : "none";

  return (
    <div className="relative h-full w-full">
      <MapContainer center={[10.7302, 122.5591]} zoom={13} className="h-full w-full">
        <VectorTileLayer />
        <FocusClosureView focusKey={focusKey} focusedWaypoints={focusedWaypoints} />

        {isClosureEditing ? (
          <RegionDrawingLayer
            activeTool={mappedClosureTool}
            regionName={closureDraft?.closureName ?? ""}
            regionColor="#e81123"
            regionShape={closurePolygon}
            onRegionShapeChange={(shape) => {
              setPolygonPoints(shape?.coordinates ?? []);
            }}
            onToolComplete={finishClosureToolEditing}
          />
        ) : null}

        {!isClosureEditing ? (
          <ClosureRegionsLayer
            closures={closures ?? []}
            onClosureClick={onClosureClick}
          />
        ) : null}
      </MapContainer>
    </div>
  );
}
