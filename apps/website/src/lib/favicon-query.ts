export function faviconLightOnly(search: string): boolean {
  return new URLSearchParams(search).get("favicon") === "light";
}
