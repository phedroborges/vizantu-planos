const RESERVED_SLUGS = new Set([
  "api",
  "login",
  "logout",
  "admin",
  "dashboard",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "_next",
]);

export function toSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function isAllowedSlug(slug: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && !RESERVED_SLUGS.has(slug);
}
