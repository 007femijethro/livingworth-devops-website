export const academyOrigin = 'https://bridgess.co.uk';

/** Route academy data to HTTPS, keeping bundled assets and third-party URLs intact. */
export function resolveAcademyUrl(value: string, localOrigin: string): string {
  const url = new URL(value, localOrigin);
  return url.origin === localOrigin && /^\/(api|uploads)(\/|$)/.test(url.pathname)
    ? academyOrigin + url.pathname + url.search + url.hash : url.href;
}
