import { hexToOklch, lightenOklch, oklchToRgb } from "../components/dock/oklch.ts";
import { TIPS } from "../components/dock/PenSvg.tsx";
import type { PenTip } from "../selection-style.tsx";

// Live favicon: the brand marker with its nib + ink band painted in the user's current colour. The
// barrel contrasts the browser theme so the marker stays legible against the tab (light/dark rules
// below). Drop shadows are omitted: invisible at favicon size, and they bloat the data-URL we swap
// on every colour change.

const FUNNEL =
  "M13.9258 79.0329V99.3356H59.4419V79.0329C59.4419 74.7124 58.3143 70.4666 56.1707 66.7153L54.4373 63.6819C52.2937 59.9306 51.1662 55.6848 51.1662 51.3642V26.9237H22.2014V51.3642C22.2014 55.6848 21.0739 59.9306 18.9303 63.6819L17.1969 66.7153C15.0533 70.4666 13.9258 74.7124 13.9258 79.0329Z";
const BODY = "M13.9258 99.3357H59.4419V276.195H13.9258V99.3357Z";
const BAND = "M13.9258 99.3357H59.4419V117.956H13.9258V99.3357Z";

// Place a shared dock nib (PenSvg TIPS, drawn in a 0-15 box with the base at y=16 after its `ty`)
// into the marker's nib region: centred on the barrel, base seated in the funnel mouth.
const NIB_W = 14.2627; // nib-box width
const NIB_BASE = 16; // base line, once each tip's `ty` is applied
const NIB_SCALE = 1.74; // matches the original chisel nib's size
const BARREL_CX = 36.684; // (13.9258 + 59.4419) / 2
const NIB_BASE_Y = 29; // seated just inside the funnel top (26.92) so the taller tips don't clip
const NIB_TX = BARREL_CX - NIB_SCALE * (NIB_W / 2);
const NIB_TY = NIB_BASE_Y - NIB_SCALE * NIB_BASE;

function nibPath(tip: PenTip): string {
  const t = TIPS[tip];
  return `<g transform="translate(${NIB_TX} ${NIB_TY}) scale(${NIB_SCALE}) translate(0 ${t.ty})"><path d="${t.d}" fill="url(#nib)"/></g>`;
}

const LIGHT_BARREL =
  '<stop stop-color="#DBDBDB"/><stop offset=".064" stop-color="#EBEBEB"/><stop offset=".178" stop-color="#DADADA"/><stop offset=".488" stop-color="#F6F6F6"/><stop offset=".757" stop-color="#EFEFEF"/><stop offset="1" stop-color="#DDDDDD"/>';
const DARK_BARREL =
  '<stop stop-color="#2E2E2E"/><stop offset=".047" stop-color="#393939"/><stop offset=".146" stop-color="#212121"/><stop offset=".734" stop-color="#373737"/><stop offset=".906" stop-color="#2C2C2C"/><stop offset="1" stop-color="#363636"/>';

/** SVG markup (not a data-URL) for the marker in `color` with `tip`, theme-aware via prefers-color-scheme. */
function buildFaviconSvg(color: string, tip: PenTip, lightOnly = false): string {
  const ok = hexToOklch(color);
  const ink = oklchToRgb(ok);
  const inkTop = oklchToRgb(lightenOklch(ok, 0.06)); // nib gradient top
  const inkLift = oklchToRgb(lightenOklch(ok, 0.18)); // lifted so it reads on the dark (light-mode) barrel
  const inkLiftTop = oklchToRgb(lightenOklch(ok, 0.24));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="6 0 62 124">` +
    // Light mode: dark barrel + lifted ink. Dark mode: light barrel + true ink. Either way the barrel
    // contrasts the tab so the marker reads.
    `<style>` +
    (lightOnly
      ? `.barrel{fill:url(#bl)}.ink{fill:${ink}}.nt{stop-color:${inkTop}}.nb{stop-color:${ink}}`
      : `.barrel{fill:url(#bd)}.ink{fill:${inkLift}}.nt{stop-color:${inkLiftTop}}.nb{stop-color:${inkLift}}` +
        `@media(prefers-color-scheme:dark){.barrel{fill:url(#bl)}.ink{fill:${ink}}.nt{stop-color:${inkTop}}.nb{stop-color:${ink}}}`) +
    `</style>` +
    `<defs>` +
    `<linearGradient id="bl" x1="13.93" y1="0" x2="59.44" y2="0" gradientUnits="userSpaceOnUse">${LIGHT_BARREL}</linearGradient>` +
    `<linearGradient id="bd" x1="13.93" y1="0" x2="59.44" y2="0" gradientUnits="userSpaceOnUse">${DARK_BARREL}</linearGradient>` +
    // objectBoundingBox (the default) so the nib gradient follows the tip through its transform.
    `<linearGradient id="nib" x2="0" y2="1"><stop class="nt"/><stop offset="1" class="nb"/></linearGradient>` +
    `<linearGradient id="sheen" x1="13.93" y1="0" x2="59.44" y2="0" gradientUnits="userSpaceOnUse"><stop stop-color="#1D1D1D" stop-opacity="0"/><stop offset=".5" stop-color="#4F4F4F"/><stop offset="1" stop-color="#313131" stop-opacity="0"/></linearGradient>` +
    `</defs>` +
    `<path class="barrel" d="${FUNNEL}"/>` +
    `<path class="barrel" d="${BODY}"/>` +
    `<path class="ink" d="${BAND}"/>` +
    `<path d="${BAND}" fill="url(#sheen)" style="mix-blend-mode:color-dodge"/>` +
    nibPath(tip) +
    `</svg>`
  );
}

/** Ready-to-assign `<link rel=icon>` href for the marker in `color` with `tip`. */
export function buildFaviconDataUrl(color: string, tip: PenTip, lightOnly = false): string {
  return `data:image/svg+xml,${encodeURIComponent(buildFaviconSvg(color, tip, lightOnly))}`;
}
