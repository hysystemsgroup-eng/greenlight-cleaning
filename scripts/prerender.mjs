// Post-build step: writes one HTML file per route with the correct head tags
// (title, meta description, canonical, Open Graph, Twitter) so Google sees them
// in the initial HTML without running JavaScript. Also writes dist/404.html.
import { createServer } from "vite";
import fs from "node:fs";
import path from "node:path";

const DIST = path.resolve("dist");
const base = fs.readFileSync(path.join(DIST, "index.html"), "utf8");

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});
const app = await server.ssrLoadModule("/src/App.tsx");
const { SITE_URL, SERVICES, SUBURBS, seoForPath, NOT_FOUND_META } = app;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function setTag(html, re, replacement, label) {
  if (!re.test(html)) throw new Error("Template tag not found: " + label);
  return html.replace(re, replacement);
}

function render(pathname, meta, { noindex = false } = {}) {
  const url = SITE_URL + (pathname === "/" ? "/" : pathname);
  let h = base;
  h = setTag(h, /<title>[\s\S]*?<\/title>/, `<title>${esc(meta.title)}</title>`, "title");
  h = setTag(h, /<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(meta.description)}" />`, "description");
  h = setTag(h, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`, "canonical");
  h = setTag(h, /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${esc(meta.title)}" />`, "og:title");
  h = setTag(h, /<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${esc(meta.description)}" />`, "og:description");
  h = setTag(h, /<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`, "og:url");
  h = setTag(h, /<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${esc(meta.title)}" />`, "twitter:title");
  h = setTag(h, /<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${esc(meta.description)}" />`, "twitter:description");
  if (noindex) {
    h = h.replace(/\s*<link rel="canonical" href="[^"]*" \/>/, "");
    h = h.replace("</head>", '    <meta name="robots" content="noindex" />\n  </head>');
  }
  return h;
}

const routes = ["/", "/services", "/service-areas", "/gallery", "/about", "/contact"];
for (const k of Object.keys(SERVICES)) routes.push("/services/" + k);
for (const k of Object.keys(SUBURBS)) routes.push("/service-areas/" + k + "-cleaning-services");

const seen = new Set();
for (const r of routes) {
  const meta = seoForPath(r);
  if (meta === NOT_FOUND_META) throw new Error("Route resolved to 404 metadata: " + r);
  const key = meta.title;
  if (seen.has(key)) throw new Error("Duplicate title: " + key);
  seen.add(key);
  const out = r === "/" ? path.join(DIST, "index.html") : path.join(DIST, r.slice(1), "index.html");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, render(r, meta));
}
fs.writeFileSync(path.join(DIST, "404.html"), render("/404", NOT_FOUND_META, { noindex: true }));

// Keep sitemap in step with the real routes
const sm = fs.readFileSync(path.join(DIST, "sitemap.xml"), "utf8");
for (const r of routes) {
  const loc = SITE_URL + (r === "/" ? "/" : r);
  if (!sm.includes("<loc>" + loc + "</loc>")) throw new Error("Route missing from sitemap: " + loc);
}
console.log("Prerendered " + routes.length + " routes + 404.html");
await server.close();
