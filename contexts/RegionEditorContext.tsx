"use client";

import { createContext, useContext, useState } from "react";

export interface RegionDraftShape {
  type: "Polygon" | "Rectangle";
  coordinates: Array<[number, number]>;
}

interface RegionEditorContextType {
  showRegionEditor: boolean;
  regionName: string;
  regionColor: string;
  regionShape: RegionDraftShape | null;
  hasDefinedPolygon: boolean;

  openRegionEditor: () => void;
  closeRegionEditor: () => void;
  setRegionName: (name: string) => void;
  setRegionColor: (color: string) => void;
  setRegionShape: (shape: RegionDraftShape | null) => void;
  saveRegionTemplate: () => void;
}

const RegionEditorContext = createContext<RegionEditorContextType | undefined>(undefined);

export function RegionEditorProvider({ children }: { children: React.ReactNode }) {
  const [showRegionEditor, setShowRegionEditor] = useState(false);
  const [regionName, setRegionName] = useState("");
  const [regionColor, setRegionColor] = useState("#fff100");
  const [regionShape, setRegionShape] = useState<RegionDraftShape | null>(null);

  const openRegionEditor = () => {
    setShowRegionEditor(true);
    setRegionName("");
    setRegionColor("#fff100");
    setRegionShape(null);
  };

  const closeRegionEditor = () => {
    setShowRegionEditor(false);
    setRegionShape(null);
  };

  const saveRegionTemplate = () => {
    if (!regionShape) {
      console.warn("A polygon or rectangle must be defined before saving.");
      return;
    }

    console.log("Region template save:", {
      name: regionName,
      color: regionColor,
      shape: regionShape,
    });
  };

  const value: RegionEditorContextType = {
    showRegionEditor,
    regionName,
    regionColor,
    regionShape,
    hasDefinedPolygon: regionShape !== null,
    openRegionEditor,
    closeRegionEditor,
    setRegionName,
    setRegionColor,
    setRegionShape,
    saveRegionTemplate,
  };

  return (
    <RegionEditorContext.Provider value={value}>
      {children}
    </RegionEditorContext.Provider>
  );
}

export function useRegionEditor() {
  const context = useContext(RegionEditorContext);
  if (!context) {
    throw new Error("useRegionEditor must be used within a RegionEditorProvider");
  }

  return context;
}
