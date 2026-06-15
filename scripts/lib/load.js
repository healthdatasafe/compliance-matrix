#!/usr/bin/env node
/**
 * load.js — shared loaders for the HDS compliance matrix.
 *
 * Reads the three data sources into plain JS so validate.js, build.js and the
 * preview share one parser:
 *   - vendor/pryv/scopes/*.yml   the inherited platform layer (Pryv format)
 *   - scopes/*.yml               the HDS matrix (HDS layered format)
 *   - templates/*.md             agreement templates (YAML frontmatter + body)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { glob } from 'glob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..', '..');

export const loadYaml = (file) => yaml.load(fs.readFileSync(file, 'utf8'));

/** Parse a markdown file's YAML frontmatter; returns { data, body }. */
export function parseFrontmatter (file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: null, body: raw };
  return { data: yaml.load(m[1]) || {}, body: m[2] };
}

export async function vendorScopeFiles () {
  return (await glob(path.join(ROOT, 'vendor/pryv/scopes/*.yml'))).sort();
}
export async function hdsScopeFiles () {
  return (await glob(path.join(ROOT, 'scopes/*.yml'))).sort();
}
export async function templateFiles () {
  return (await glob(path.join(ROOT, 'templates/*.md')))
    .filter((f) => path.basename(f).toLowerCase() !== 'readme.md')
    .sort();
}

export const rel = (f) => path.relative(ROOT, f);
