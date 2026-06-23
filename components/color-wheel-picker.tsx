"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { TRANSIT_COLORS } from "@/lib/constants/transit-colors";
import {
  hexToHsb,
  hexToRgb,
  hsbToCss,
  hsbToHex,
  isValidHex,
  normalizeHex,
  rgbToHex,
  type Hsb,
  type Rgb,
} from "@/lib/color/hsb";
import { cn } from "@/lib/utils";

type ColorPreset = {
  label: string;
  value: string;
};

export type ColorWheelPickerProps = {
  value: string;
  onChange: (hex: string) => void;
  presets?: readonly ColorPreset[];
  className?: string;
  variant?: "inline" | "popover";
};

type Point = { x: number; y: number };

const CANVAS_SIZE = 220;
const CENTER = CANVAS_SIZE / 2;
const OUTER_RADIUS = 102;
const INNER_RADIUS = 62;
const TRIANGLE_RADIUS = 52;

function getTriangleVertices(cx: number, cy: number, radius: number) {
  return {
    white: { x: cx, y: cy - radius },
    black: {
      x: cx - (radius * Math.sqrt(3)) / 2,
      y: cy + radius / 2,
    },
    hue: {
      x: cx + (radius * Math.sqrt(3)) / 2,
      y: cy + radius / 2,
    },
  };
}

function barycentric(
  point: Point,
  white: Point,
  black: Point,
  hue: Point,
): { white: number; black: number; hue: number } | null {
  const denominator =
    (black.y - hue.y) * (white.x - hue.x) + (hue.x - black.x) * (white.y - hue.y);
  if (denominator === 0) {
    return null;
  }

  const wWhite =
    ((black.y - hue.y) * (point.x - hue.x) + (hue.x - black.x) * (point.y - hue.y)) /
    denominator;
  const wBlack =
    ((hue.y - white.y) * (point.x - hue.x) + (white.x - hue.x) * (point.y - hue.y)) /
    denominator;
  const wHue = 1 - wWhite - wBlack;

  return { white: wWhite, black: wBlack, hue: wHue };
}

function isInsideTriangle(weights: { white: number; black: number; hue: number }) {
  const epsilon = -0.001;
  return (
    weights.white >= epsilon &&
    weights.black >= epsilon &&
    weights.hue >= epsilon
  );
}

function hsbFromTriangleWeights(weights: {
  white: number;
  black: number;
  hue: number;
}): Pick<Hsb, "s" | "b"> {
  return {
    s: Math.round(Math.min(100, Math.max(0, weights.hue * 100))),
    b: Math.round(Math.min(100, Math.max(0, (weights.white + weights.hue) * 100))),
  };
}

function trianglePointFromHsb(hsb: Hsb, cx: number, cy: number, radius: number): Point {
  const vertices = getTriangleVertices(cx, cy, radius);
  const s = hsb.s / 100;
  const brightness = hsb.b / 100;

  const wWhite = brightness * (1 - s);
  const wHue = brightness * s;
  const wBlack = 1 - wWhite - wHue;

  return {
    x:
      vertices.white.x * wWhite +
      vertices.black.x * wBlack +
      vertices.hue.x * wHue,
    y:
      vertices.white.y * wWhite +
      vertices.black.y * wBlack +
      vertices.hue.y * wHue,
  };
}

function drawWheelBase(canvas: HTMLCanvasElement, hue: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const vertices = getTriangleVertices(CENTER, CENTER, TRIANGLE_RADIUS);

  for (let angle = 0; angle < 360; angle += 1) {
    const start = ((angle - 90) * Math.PI) / 180;
    const end = ((angle + 1 - 90) * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(
      CENTER + INNER_RADIUS * Math.cos(start),
      CENTER + INNER_RADIUS * Math.sin(start),
    );
    ctx.arc(CENTER, CENTER, OUTER_RADIUS, start, end);
    ctx.arc(CENTER, CENTER, INNER_RADIUS, end, start, true);
    ctx.closePath();
    ctx.fillStyle = `hsl(${angle} 100% 50%)`;
    ctx.fill();
  }

  for (let y = 0; y < CANVAS_SIZE; y += 1) {
    for (let x = 0; x < CANVAS_SIZE; x += 1) {
      const weights = barycentric(
        { x, y },
        vertices.white,
        vertices.black,
        vertices.hue,
      );
      if (!weights || !isInsideTriangle(weights)) {
        continue;
      }

      const { s, b } = hsbFromTriangleWeights(weights);
      ctx.fillStyle = hsbToCss(hue, s, b);
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function drawWheelIndicators(canvas: HTMLCanvasElement, hsb: Hsb, hue: number) {
  drawWheelBase(canvas, hue);
  drawIndicators(canvas, hsb);
}

function drawIndicators(
  canvas: HTMLCanvasElement,
  hsb: Hsb,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const hueAngle = ((hsb.h - 90) * Math.PI) / 180;
  const hueRadius = (INNER_RADIUS + OUTER_RADIUS) / 2;
  const hueX = CENTER + hueRadius * Math.cos(hueAngle);
  const hueY = CENTER + hueRadius * Math.sin(hueAngle);

  const triPoint = trianglePointFromHsb(hsb, CENTER, CENTER, TRIANGLE_RADIUS);

  const drawHandle = (x: number, y: number) => {
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    ctx.stroke();
  };

  drawHandle(hueX, hueY);
  drawHandle(triPoint.x, triPoint.y);
}

type DragTarget = "hue" | "triangle" | null;

function clampHsb(next: Hsb): Hsb {
  return {
    h: Math.round(((next.h % 360) + 360) % 360),
    s: Math.round(Math.min(100, Math.max(0, next.s))),
    b: Math.round(Math.min(100, Math.max(0, next.b))),
  };
}

type ColorMode = "hsb" | "rgb";

function ValueSliderRow({
  label,
  value,
  min,
  max,
  unit,
  trackStyle,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  trackStyle: React.CSSProperties;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const displayValue = draft ?? String(value);

  const commitInput = () => {
    const parsed = Number(displayValue);
    if (!Number.isFinite(parsed)) {
      setDraft(null);
      return;
    }
    onChange(Math.round(Math.min(max, Math.max(min, parsed))));
    setDraft(null);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="w-3 text-xs font-medium text-muted-foreground">{label}</span>
      <div className="relative min-w-0 flex-1">
        <Slider
          min={min}
          max={max}
          step={1}
          value={[value]}
          onValueChange={(next) => onChange(next[0] ?? value)}
          className="[&_[data-slot=slider-track]]:bg-transparent [&_[data-slot=slider-range]]:bg-transparent"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 right-3 flex items-center"
        >
          <div
            className="h-1.5 w-full rounded-full"
            style={trackStyle}
          />
        </div>
      </div>
      <div className={cn("flex items-center gap-0.5", unit ? "w-14" : "w-11")}>
        <Input
          value={displayValue}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitInput}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitInput();
            }
          }}
          className="h-7 px-1 text-center text-xs"
          inputMode="numeric"
        />
        {unit ? (
          <span className="text-[10px] text-muted-foreground">{unit}</span>
        ) : null}
      </div>
    </div>
  );
}

function HexInputField({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const displayValue = draft ?? value;

  const commitInput = () => {
    const trimmed = displayValue.trim();
    const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    if (!isValidHex(withHash)) {
      setDraft(null);
      return;
    }
    onChange(normalizeHex(withHash));
    setDraft(null);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">Hex</span>
      <Input
        value={displayValue}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitInput}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commitInput();
          }
        }}
        className="h-8 font-mono text-sm"
        placeholder="#000000"
        spellCheck={false}
        aria-label="Hex color value"
      />
    </div>
  );
}

function ColorWheelPickerPanel({
  value,
  onChange,
  presets = TRANSIT_COLORS,
  className,
}: Omit<ColorWheelPickerProps, "variant">) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragTargetRef = useRef<DragTarget>(null);
  const [colorMode, setColorMode] = useState<ColorMode>("hsb");

  const normalizedValue = normalizeHex(value);
  const hsb = hexToHsb(normalizedValue);
  const rgb = hexToRgb(normalizedValue);

  const emitChange = useCallback(
    (next: Hsb) => {
      const clamped = clampHsb(next);
      onChange(hsbToHex(clamped.h, clamped.s, clamped.b));
    },
    [onChange],
  );

  const emitRgbChange = useCallback(
    (next: Partial<Rgb>) => {
      const merged = { ...hexToRgb(normalizeHex(value)), ...next };
      onChange(rgbToHex(merged.r, merged.g, merged.b));
    },
    [onChange, value],
  );

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    drawWheelIndicators(canvas, hsb, hsb.h);
  }, [hsb]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number, target: DragTarget) => {
      const canvas = canvasRef.current;
      if (!canvas || !target) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_SIZE / rect.width;
      const scaleY = CANVAS_SIZE / rect.height;
      const x = (clientX - rect.left) * scaleX;
      const y = (clientY - rect.top) * scaleY;

      if (target === "hue") {
        const angle = Math.atan2(y - CENTER, x - CENTER);
        const hue = Math.round(((angle * 180) / Math.PI + 90 + 360) % 360);
        emitChange({ ...hsb, h: hue });
        return;
      }

      const vertices = getTriangleVertices(CENTER, CENTER, TRIANGLE_RADIUS);
      const weights = barycentric(
        { x, y },
        vertices.white,
        vertices.black,
        vertices.hue,
      );
      if (!weights) {
        return;
      }

      const clamped = {
        white: Math.max(0, weights.white),
        black: Math.max(0, weights.black),
        hue: Math.max(0, weights.hue),
      };
      const sum = clamped.white + clamped.black + clamped.hue;
      if (sum === 0) {
        return;
      }

      const normalized = {
        white: clamped.white / sum,
        black: clamped.black / sum,
        hue: clamped.hue / sum,
      };
      const { s, b } = hsbFromTriangleWeights(normalized);
      emitChange({ ...hsb, s, b });
    },
    [emitChange, hsb],
  );

  const resolvePointerTarget = useCallback((clientX: number, clientY: number): DragTarget => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_SIZE / rect.width;
    const scaleY = CANVAS_SIZE / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    const dx = x - CENTER;
    const dy = y - CENTER;
    const distance = Math.hypot(dx, dy);

    if (distance >= INNER_RADIUS && distance <= OUTER_RADIUS) {
      return "hue";
    }

    const vertices = getTriangleVertices(CENTER, CENTER, TRIANGLE_RADIUS);
    const weights = barycentric(
      { x, y },
      vertices.white,
      vertices.black,
      vertices.hue,
    );
    if (weights && isInsideTriangle(weights)) {
      return "triangle";
    }

    return distance > OUTER_RADIUS ? "hue" : "triangle";
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const target = resolvePointerTarget(event.clientX, event.clientY);
    dragTargetRef.current = target;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromPointer(event.clientX, event.clientY, target);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragTargetRef.current) {
      return;
    }
    updateFromPointer(event.clientX, event.clientY, dragTargetRef.current);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    dragTargetRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const currentColor = hsbToHex(hsb.h, hsb.s, hsb.b);
  const pureHue = hsbToCss(hsb.h, 100, 100);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-start gap-3">
        <div
          aria-label="Current color"
          className="mt-1 h-8 w-8 shrink-0 rounded-sm border border-border shadow-sm"
          style={{ backgroundColor: currentColor }}
        />
        <div className="min-w-0 flex-1 space-y-2">
          <Select
            value={colorMode}
            onValueChange={(next) => setColorMode(next as ColorMode)}
          >
            <SelectTrigger className="h-8 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hsb">HSB</SelectItem>
              <SelectItem value="rgb">RGB</SelectItem>
            </SelectContent>
          </Select>

          {colorMode === "hsb" ? (
            <>
              <ValueSliderRow
                label="H"
                value={hsb.h}
                min={0}
                max={360}
                unit="°"
                trackStyle={{
                  background:
                    "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
                }}
                onChange={(h) => emitChange({ ...hsb, h })}
              />
              <ValueSliderRow
                label="S"
                value={hsb.s}
                min={0}
                max={100}
                unit="%"
                trackStyle={{
                  background: `linear-gradient(to right, #808080, ${pureHue})`,
                }}
                onChange={(s) => emitChange({ ...hsb, s })}
              />
              <ValueSliderRow
                label="B"
                value={hsb.b}
                min={0}
                max={100}
                unit="%"
                trackStyle={{
                  background: `linear-gradient(to right, #000000, ${pureHue})`,
                }}
                onChange={(b) => emitChange({ ...hsb, b })}
              />
            </>
          ) : (
            <>
              <ValueSliderRow
                label="R"
                value={rgb.r}
                min={0}
                max={255}
                unit=""
                trackStyle={{
                  background: "linear-gradient(to right, #000000, #ff0000)",
                }}
                onChange={(r) => emitRgbChange({ r })}
              />
              <ValueSliderRow
                label="G"
                value={rgb.g}
                min={0}
                max={255}
                unit=""
                trackStyle={{
                  background: "linear-gradient(to right, #000000, #00ff00)",
                }}
                onChange={(g) => emitRgbChange({ g })}
              />
              <ValueSliderRow
                label="B"
                value={rgb.b}
                min={0}
                max={255}
                unit=""
                trackStyle={{
                  background: "linear-gradient(to right, #000000, #0000ff)",
                }}
                onChange={(b) => emitRgbChange({ b })}
              />
            </>
          )}
        </div>
      </div>

      <HexInputField value={normalizedValue} onChange={onChange} />

      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="mx-auto block w-full max-w-[220px] cursor-crosshair touch-none"
        role="application"
        aria-label="Color wheel"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      <div
        className="grid grid-cols-5 gap-2"
        role="radiogroup"
        aria-label="Preset colors"
      >
        {presets.map((preset) => {
          const isSelected = normalizeHex(preset.value) === normalizedValue;
          return (
            <button
              key={preset.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={preset.label}
              title={preset.label}
              className={cn(
                "h-7 w-7 rounded-full border-2 transition-shadow",
                isSelected
                  ? "border-foreground ring-2 ring-foreground/20"
                  : "border-transparent hover:ring-2 hover:ring-foreground/10",
              )}
              style={{ backgroundColor: preset.value }}
              onClick={() => onChange(normalizeHex(preset.value))}
            />
          );
        })}
      </div>
    </div>
  );
}

export function ColorWheelPicker({
  variant = "inline",
  className,
  ...props
}: ColorWheelPickerProps) {
  const normalizedValue = normalizeHex(props.value);

  if (variant === "popover") {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn("w-full justify-between gap-3 font-normal", className)}
            aria-label={`Color ${normalizedValue}`}
          >
            <span className="font-mono text-sm">{normalizedValue}</span>
            <span
              aria-hidden="true"
              className="h-6 w-6 shrink-0 rounded-md border border-border shadow-sm"
              style={{ backgroundColor: normalizedValue }}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" side="right" align="start" sideOffset={8}>
          <ColorWheelPickerPanel {...props} />
        </PopoverContent>
      </Popover>
    );
  }

  return <ColorWheelPickerPanel {...props} className={className} />;
}
