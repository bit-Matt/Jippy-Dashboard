export type Hsb = {
  h: number;
  s: number;
  b: number;
};

const HEX_COLOR_PATTERN = /^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

export function isValidHex(input: string): boolean {
  return HEX_COLOR_PATTERN.test(input.trim());
}

export function normalizeHex(input: string): string {
  const trimmed = input.trim();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (!HEX_COLOR_PATTERN.test(withHash)) {
    return "#000000";
  }

  let hex = withHash.slice(1);
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((char) => char + char)
      .join("");
  }

  return `#${hex.toLowerCase()}`;
}

export type Rgb = {
  r: number;
  g: number;
  b: number;
};

function hexToRgbUnit(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHex(hex);
  return {
    r: parseInt(normalized.slice(1, 3), 16) / 255,
    g: parseInt(normalized.slice(3, 5), 16) / 255,
    b: parseInt(normalized.slice(5, 7), 16) / 255,
  };
}

export function hexToRgb(hex: string): Rgb {
  const normalized = normalizeHex(hex);
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbUnitToHex(r: number, g: number, b: number): string {
  const toByte = (value: number) =>
    Math.round(Math.min(255, Math.max(0, value * 255)))
      .toString(16)
      .padStart(2, "0");

  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (value: number) => Math.round(Math.min(255, Math.max(0, value)));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

export function hexToHsb(hex: string): Hsb {
  const { r, g, b } = hexToRgbUnit(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
      h = ((b - r) / delta + 2) / 6;
    } else {
      h = ((r - g) / delta + 4) / 6;
    }
  }

  const s = max === 0 ? 0 : delta / max;
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    b: Math.round(max * 100),
  };
}

export function hsbToHex(h: number, s: number, b: number): string {
  const hue = ((h % 360) + 360) % 360;
  const saturation = Math.min(100, Math.max(0, s)) / 100;
  const brightness = Math.min(100, Math.max(0, b)) / 100;

  const k = (n: number) => (n + hue / 60) % 6;
  const f = (n: number) =>
    brightness * (1 - saturation * Math.max(0, Math.min(k(n), 4 - k(n), 1)));

  return rgbUnitToHex(f(5), f(3), f(1));
}

export function hsbToCss(h: number, s: number, b: number): string {
  return hsbToHex(h, s, b);
}
