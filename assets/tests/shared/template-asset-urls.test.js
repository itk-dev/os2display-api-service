import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ASSETS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

const STYLE_EXTENSIONS = [".scss", ".css"];
const URL_PATTERN = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;

function collectStyleSheets(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return entry.name === "node_modules" ? [] : collectStyleSheets(fullPath);
    }

    return STYLE_EXTENSIONS.includes(path.extname(entry.name))
      ? [fullPath]
      : [];
  });
}

function relativeUrlReferences(styleSheet) {
  const contents = fs.readFileSync(styleSheet, "utf8");

  return [...contents.matchAll(URL_PATTERN)]
    .map(([, reference]) => reference.trim().split(/[?#]/)[0])
    .filter(
      (reference) =>
        reference.length > 0 && !/^(data:|https?:|\/\/|\/)/.test(reference)
    );
}

describe("stylesheet asset references", () => {
  it("resolves every relative url() to a file on disk", () => {
    const missing = collectStyleSheets(ASSETS_DIR).flatMap((styleSheet) =>
      relativeUrlReferences(styleSheet)
        .filter(
          (reference) =>
            !fs.existsSync(path.resolve(path.dirname(styleSheet), reference))
        )
        .map(
          (reference) =>
            `${path.relative(ASSETS_DIR, styleSheet)} -> ${reference}`
        )
    );

    expect(missing).toEqual([]);
  });

  it("loads the webfont used by the travel template", () => {
    const styleSheet = path.join(
      ASSETS_DIR,
      "shared/templates/travel/travel.scss"
    );
    const [fontReference] = relativeUrlReferences(styleSheet);

    expect(
      fs.existsSync(path.resolve(path.dirname(styleSheet), fontReference))
    ).toBe(true);
  });
});
