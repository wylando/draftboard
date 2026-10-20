#!/usr/bin/env node
/**
 * Verifies that every icon in src/design-system/icons.tsx is plain, static SVG.
 *
 * Icons are often pasted from outside sources (e.g. the better-icons MCP
 * server, which fetches from api.iconify.design), so treat them as untrusted:
 * only an allowlist of SVG shape elements and presentation attributes with
 * literal values may appear. Anything that could run code, load a resource,
 * or style the page (scripts, event handlers, href, url(), style, foreignObject,
 * <image>, <use>, dynamic expressions) fails the check.
 *
 * Usage: node scripts/check-icons.mjs [path/to/icons.tsx]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const file = resolve(process.argv[2] ?? 'src/design-system/icons.tsx');
const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

/** `Icon` is the local 16px stroke wrapper; it renders the only <svg>. */
const ALLOWED_TAGS = new Set(['Icon', 'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon']);
const ALLOWED_ATTRS = new Set([
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points', 'viewBox',
  'transform', 'fill', 'fillRule', 'fillOpacity', 'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin',
  'strokeDasharray', 'strokeDashoffset', 'strokeMiterlimit', 'strokeOpacity', 'opacity', 'clipRule',
  'vectorEffect', 'xmlns', 'aria-hidden',
]);
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]*$/;
const NUMBERS = /^[0-9eE.,\s+-]*$/;
const COLOR = /^(none|currentColor|#[0-9a-fA-F]{3,8})$/;
const TRANSFORM = /^((translate|rotate|scale|matrix|skewX|skewY)\([0-9eE.,\s+-]*\)\s*)*$/;
const KEYWORD = /^[a-zA-Z-]+$/;

const errors = [];
const report = (node, message) => {
  const { line, character } = source.getLineAndCharacterOfPosition(node.getStart());
  errors.push(`${file}:${line + 1}:${character + 1}  ${message}`);
};

function valueOk(name, value) {
  if (/url\(|javascript:|data:|<|&|\\/i.test(value)) return false;
  switch (name) {
    case 'd':
      return PATH_DATA.test(value);
    case 'points':
    case 'viewBox':
    case 'strokeDasharray':
      return NUMBERS.test(value);
    case 'fill':
    case 'stroke':
      return COLOR.test(value);
    case 'transform':
      return TRANSFORM.test(value);
    case 'xmlns':
      return value === 'http://www.w3.org/2000/svg';
    default:
      return NUMBERS.test(value) || KEYWORD.test(value);
  }
}

function checkAttributes(tag, attributes, insideWrapper) {
  for (const attr of attributes.properties) {
    if (ts.isJsxSpreadAttribute(attr)) {
      // Only the wrapper's <svg {...props}> may spread (props are typed SVGProps from callers in this repo).
      if (!(insideWrapper && tag === 'svg')) report(attr, `spread attributes are not allowed on <${tag}>`);
      continue;
    }
    const name = attr.name.getText(source);
    if (!ALLOWED_ATTRS.has(name)) {
      report(attr, `attribute "${name}" is not allowed on <${tag}>`);
      continue;
    }
    const init = attr.initializer;
    if (!init) continue;
    if (ts.isStringLiteral(init)) {
      if (!valueOk(name, init.text)) report(attr, `unsafe or malformed value for ${name}: "${init.text}"`);
    } else if (ts.isJsxExpression(init) && init.expression && (ts.isNumericLiteral(init.expression) || ts.isStringLiteral(init.expression))) {
      if (!valueOk(name, init.expression.text)) report(attr, `unsafe or malformed value for ${name}`);
    } else {
      report(attr, `${name} must be a literal value, not an expression`);
    }
  }
}

function checkJsx(node, insideWrapper) {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    const tag = opening.tagName.getText(source);
    if (!ALLOWED_TAGS.has(tag)) report(opening, `element <${tag}> is not allowed in icons`);
    else if (tag === 'svg' && !insideWrapper) report(opening, 'icons must use the <Icon> wrapper, not a raw <svg>');
    checkAttributes(tag, opening.attributes, insideWrapper);
    if (ts.isJsxElement(node)) {
      for (const child of node.children) {
        if (ts.isJsxText(child)) {
          if (child.getText(source).trim()) report(child, 'text content is not allowed in icons');
        } else if (ts.isJsxExpression(child)) {
          report(child, 'expressions are not allowed inside icon markup');
        } else {
          checkJsx(child, insideWrapper);
        }
      }
    }
    return;
  }
  if (ts.isJsxFragment(node)) report(node, 'fragments are not allowed; wrap shapes in <Icon>');
}

let sawIcons = false;
for (const stmt of source.statements) {
  if (ts.isImportDeclaration(stmt)) {
    const from = stmt.moduleSpecifier.getText(source);
    if (from !== "'react'" || !stmt.importClause?.isTypeOnly) report(stmt, `only "import type … from 'react'" is allowed, got ${from}`);
  } else if (ts.isFunctionDeclaration(stmt) && stmt.name?.text === 'Icon') {
    stmt.body?.forEachChild(function visit(n) {
      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) checkJsx(n, true);
      else n.forEachChild(visit);
    });
  } else if (ts.isVariableStatement(stmt)) {
    for (const decl of stmt.declarationList.declarations) {
      if (decl.name.getText(source) !== 'icons') {
        report(decl, `unexpected declaration "${decl.name.getText(source)}"`);
        continue;
      }
      sawIcons = true;
      let init = decl.initializer;
      while (init && (ts.isAsExpression(init) || ts.isSatisfiesExpression(init) || ts.isParenthesizedExpression(init))) init = init.expression;
      if (!init || !ts.isObjectLiteralExpression(init)) {
        report(decl, '`icons` must be an object literal');
        continue;
      }
      for (const prop of init.properties) {
        const fn = ts.isPropertyAssignment(prop) ? prop.initializer : undefined;
        if (!fn || !ts.isArrowFunction(fn) || fn.parameters.length > 0) {
          report(prop, 'each icon must be a parameterless arrow function returning <Icon>…</Icon>');
          continue;
        }
        let body = fn.body;
        while (ts.isParenthesizedExpression(body)) body = body.expression;
        const root = ts.isJsxElement(body) ? body.openingElement.tagName.getText(source) : undefined;
        if (root !== 'Icon') report(prop, `icon "${prop.name.getText(source)}" must return <Icon>…</Icon>`);
        else checkJsx(body, false);
      }
    }
  } else if (!ts.isTypeAliasDeclaration(stmt) && !ts.isExportDeclaration(stmt)) {
    report(stmt, 'unexpected statement in icons file');
  }
}
if (!sawIcons) errors.push(`${file}: no \`icons\` object found`);

if (errors.length > 0) {
  console.error(`check-icons: ${errors.length} problem(s)\n${errors.join('\n')}`);
  process.exit(1);
}
console.log('check-icons: all icons are static SVG from the allowlist');
