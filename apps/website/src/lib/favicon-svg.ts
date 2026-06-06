import { hexToOklch, lightenOklch, oklchToRgb } from "../components/dock/oklch.ts";

// Live favicon built from the brand marker artwork (Marker.svg / Marker-1.svg): a light or dark
// barrel (switched by prefers-color-scheme, so it suits the browser theme) with the nib + ink band
// painted in the user's current colour. Drop shadows/inner shadows are omitted (invisible at favicon
// size, and they bloat the data-URL we swap on every colour change).

const FUNNEL =
  "M13.9258 79.0329V99.3356H59.4419V79.0329C59.4419 74.7124 58.3143 70.4666 56.1707 66.7153L54.4373 63.6819C52.2937 59.9306 51.1662 55.6848 51.1662 51.3642V26.9237H22.2014V51.3642C22.2014 55.6848 21.0739 59.9306 18.9303 63.6819L17.1969 66.7153C15.0533 70.4666 13.9258 74.7124 13.9258 79.0329Z";
const BODY = "M13.9258 99.3357H59.4419V276.195H13.9258V99.3357Z";
const BAND = "M13.9258 99.3357H59.4419V117.956H13.9258V99.3357Z";
// The chisel nib (from the reference). One shape: the nib type is barely legible at favicon size.
const NIB =
  "M24.5547 16.9295V26.8959H49.3816V5.4524C49.3816 3.6512 49.3816 2.75061 49.0024 2.21391C48.6714 1.7454 48.1607 1.43535 47.5924 1.35782C46.9412 1.269 46.1422 1.68449 44.5442 2.51548L28.1208 11.0556C26.825 11.7294 26.1772 12.0663 25.7044 12.5599C25.2863 12.9964 24.9688 13.5192 24.7745 14.0916C24.5547 14.7387 24.5547 15.469 24.5547 16.9295Z";

const LIGHT_BARREL =
  '<stop stop-color="#DBDBDB"/><stop offset=".064" stop-color="#EBEBEB"/><stop offset=".178" stop-color="#DADADA"/><stop offset=".488" stop-color="#F6F6F6"/><stop offset=".757" stop-color="#EFEFEF"/><stop offset="1" stop-color="#DDDDDD"/>';
const DARK_BARREL =
  '<stop stop-color="#2E2E2E"/><stop offset=".047" stop-color="#393939"/><stop offset=".146" stop-color="#212121"/><stop offset=".734" stop-color="#373737"/><stop offset=".906" stop-color="#2C2C2C"/><stop offset="1" stop-color="#363636"/>';

/** SVG markup (not a data-URL) for the marker in `color`, theme-aware via prefers-color-scheme. */
export function buildFaviconSvg(color: string): string {
  const ok = hexToOklch(color);
  const ink = oklchToRgb(ok);
  const inkTop = oklchToRgb(lightenOklch(ok, 0.06)); // nib gradient top
  const inkDark = oklchToRgb(lightenOklch(ok, 0.18)); // lifted so it reads on the dark barrel
  const inkDarkTop = oklchToRgb(lightenOklch(ok, 0.24));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="6 0 62 124">` +
    `<style>.barrel{fill:url(#bl)}.ink{fill:${ink}}.nt{stop-color:${inkTop}}.nb{stop-color:${ink}}` +
    `@media(prefers-color-scheme:dark){.barrel{fill:url(#bd)}.ink{fill:${inkDark}}.nt{stop-color:${inkDarkTop}}.nb{stop-color:${inkDark}}}</style>` +
    `<defs>` +
    `<linearGradient id="bl" x1="13.93" y1="0" x2="59.44" y2="0" gradientUnits="userSpaceOnUse">${LIGHT_BARREL}</linearGradient>` +
    `<linearGradient id="bd" x1="13.93" y1="0" x2="59.44" y2="0" gradientUnits="userSpaceOnUse">${DARK_BARREL}</linearGradient>` +
    `<linearGradient id="nib" x1="37" y1="0" x2="37" y2="26.9" gradientUnits="userSpaceOnUse"><stop class="nt"/><stop offset="1" class="nb"/></linearGradient>` +
    `<linearGradient id="sheen" x1="13.93" y1="0" x2="59.44" y2="0" gradientUnits="userSpaceOnUse"><stop stop-color="#1D1D1D" stop-opacity="0"/><stop offset=".5" stop-color="#4F4F4F"/><stop offset="1" stop-color="#313131" stop-opacity="0"/></linearGradient>` +
    `</defs>` +
    `<path class="barrel" d="${FUNNEL}"/>` +
    `<path class="barrel" d="${BODY}"/>` +
    `<path class="ink" d="${BAND}"/>` +
    `<path d="${BAND}" fill="url(#sheen)" style="mix-blend-mode:color-dodge"/>` +
    `<path d="${NIB}" fill="url(#nib)"/>` +
    `</svg>`
  );
}

/** Ready-to-assign `<link rel=icon>` href for the marker in `color`. */
export function buildFaviconDataUrl(color: string): string {
  return `data:image/svg+xml,${encodeURIComponent(buildFaviconSvg(color))}`;
}
