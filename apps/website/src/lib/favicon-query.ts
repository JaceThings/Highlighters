/** Opt in with `?favicon=light` to always use the white-barrel favicon (no dark-mode swap). */
export function faviconLightOnly(search: string): boolean {
  return new URLSearchParams(search).get("favicon") === "light";
}
