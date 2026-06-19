import L from "leaflet";

export function createTransitPointIcon(isActive: boolean = true) {
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
        box-shadow: 0 2px 6px rgba(0,0,0,0.25);
      "></div>
    </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}
