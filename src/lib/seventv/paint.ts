// Turns a 7TV paint into CSS for a username: gradient/image clipped to the text plus drop shadows.
import type { CdnImage, Paint, PaintStop } from "./api";

export interface PaintCss {
  backgroundImage: string;
  backgroundSize?: string;
  filter?: string;
}

/** Multiply a layer's opacity into an #RRGGBBAA color. */
function withOpacity(hex: string, opacity: number): string {
  if (opacity >= 1 || !/^#[0-9a-f]{8}$/i.test(hex)) return hex;
  const alpha = Math.round(parseInt(hex.slice(7, 9), 16) * opacity);
  return hex.slice(0, 7) + alpha.toString(16).padStart(2, "0");
}

function stopList(stops: PaintStop[], opacity: number): string {
  return stops.map((s) => `${withOpacity(s.color.hex, opacity)} ${+(s.at * 100).toFixed(2)}%`).join(", ");
}

/** Prefer an animated WebP at 1x; fall back to whatever exists. */
function pickImage(images: CdnImage[]): string | undefined {
  const webp = images.filter((i) => i.mime === "image/webp");
  const pool = webp.length ? webp : images;
  const animated = pool.filter((i) => !i.url.includes("_static"));
  const candidates = animated.length ? animated : pool;
  return [...candidates].sort((a, b) => a.scale - b.scale)[0]?.url;
}

export function paintToCss(paint: Paint): PaintCss | null {
  const backgrounds: string[] = [];
  let backgroundSize: string | undefined;

  // CSS draws the first background on top; 7TV lists layers bottom-up.
  for (const layer of [...paint.data.layers].reverse()) {
    const ty = layer.ty;
    const opacity = layer.opacity ?? 1;
    switch (ty.__typename) {
      case "PaintLayerTypeSingleColor": {
        const c = withOpacity(ty.color.hex, opacity);
        backgrounds.push(`linear-gradient(${c}, ${c})`);
        break;
      }
      case "PaintLayerTypeLinearGradient":
        backgrounds.push(
          `${ty.repeating ? "repeating-" : ""}linear-gradient(${ty.angle}deg, ${stopList(ty.stops, opacity)})`,
        );
        break;
      case "PaintLayerTypeRadialGradient":
        backgrounds.push(
          `${ty.repeating ? "repeating-" : ""}radial-gradient(${ty.shape === "CIRCLE" ? "circle" : "ellipse"}, ${stopList(ty.stops, opacity)})`,
        );
        break;
      case "PaintLayerTypeImage": {
        const url = pickImage(ty.images);
        if (url) {
          backgrounds.push(`url("${url}")`);
          backgroundSize = "cover";
        }
        break;
      }
    }
  }
  if (!backgrounds.length) return null;

  const shadows = paint.data.shadows
    .map((s) => `drop-shadow(${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.color.hex})`)
    .join(" ");

  return { backgroundImage: backgrounds.join(", "), backgroundSize, filter: shadows || undefined };
}

export function badgeImage(images: CdnImage[]): string | undefined {
  const webp = images.filter((i) => i.mime === "image/webp");
  const pool = webp.length ? webp : images;
  // 2x looks sharp at 18px on high-DPI screens.
  return [...pool].sort((a, b) => Math.abs(a.scale - 2) - Math.abs(b.scale - 2))[0]?.url;
}
