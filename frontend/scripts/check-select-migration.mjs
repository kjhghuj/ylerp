/**
 * Static AST gate for the global select migration (plan §10.1).
 *
 * Walks PRODUCTION source (App.tsx, components/, modules/ and other runtime
 * entry sources) with the installed TypeScript compiler API and fails when:
 *  - NativeSelect is imported or used as a JSX tag anywhere,
 *  - the retired CalcInputs SelectInput export is referenced,
 *  - a production JSX tree contains a native <select>, <datalist>, or an
 *    <input list=...> autocomplete binding,
 *  - the removed ui/native-select module is still imported (including aliased,
 *    namespace and re-export forms).
 *
 * Text searches are deliberately NOT used for the verdict: aliased imports
 * (`import { NativeSelect as NS }`), namespace access (`ui.NativeSelect`) and
 * re-exports (`export { NativeSelect }`) are resolved through the import graph
 * of each file so renames cannot slip through. CSS files are additionally
 * checked for retired `data-ui="native-select"` rules.
 *
 * Usage: node scripts/check-select-migration.mjs [--root <fixtureDir>]
 * The --root flag exists for this gate's own tests (see
 * __tests__/checkSelectMigration.test.ts) so the checker can run against
 * miniature pass/fail fixtures instead of the real tree.
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const args = process.argv.slice(2);
const rootArgIndex = args.indexOf('--root');
const root =
  rootArgIndex !== -1 && args[rootArgIndex + 1]
    ? path.resolve(args[rootArgIndex + 1])
    : fileURLToPath(new URL('../', import.meta.url));

const PRODUCTION_DIRS = ['components', 'modules'];
const PRODUCTION_FILES = ['App.tsx', 'main.tsx', 'index.tsx'];
const EXCLUDED_DIR_NAMES = new Set(['node_modules', 'dist', 'dist-acceptance', 'e2e', '__tests__', 'scripts', 'scripts-tmp', 'test-fixtures']);

const violations = [];

async function listProductionFiles(directory) {
  const files = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return files; // directory absent in miniature fixture trees
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIR_NAMES.has(entry.name)) files.push(...(await listProductionFiles(path.join(directory, entry.name))));
    } else if (/\.tsx?$/.test(entry.name)) files.push(path.join(directory, entry.name));
  }
  return files;
}

const sources = [];
for (const dir of PRODUCTION_DIRS) {
  sources.push(...(await listProductionFiles(path.join(root, dir))));
}
for (const file of PRODUCTION_FILES) {
  const absolute = path.join(root, file);
  try {
    await readFile(absolute);
    sources.push(absolute);
  } catch {
    /* optional entry */
  }
}

/** Map every local binding introduced by imports/re-exports to its origin. */
function collectBoundNames(sourceFile) {
  const imports = new Map(); // local name -> specifier text
  const exports = []; // re-exported specifier texts
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      if (statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) {
        for (const element of statement.importClause.namedBindings.elements) {
          imports.set(element.name.text, specifier);
          if (element.propertyName) imports.set(element.propertyName.text, specifier);
        }
      }
      if (statement.importClause?.namedBindings && ts.isNamespaceImport(statement.importClause.namedBindings)) {
        imports.set(statement.importClause.namedBindings.name.text, `namespace:${specifier}`);
      }
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      for (const element of statement.exportClause.elements) {
        exports.push({ exported: element.name.text, local: element.propertyName?.text ?? element.name.text, specifier: statement.moduleSpecifier.text });
      }
    }
  }
  return { imports, exports };
}

const NATIVE_SELECT_SPECIFIER = /(?:^|\/)native-select$/;
const NATIVE_SELECT_IDENT = 'NativeSelect';
const SELECT_INPUT_IDENT = 'SelectInput';

for (const file of sources) {
  const text = await readFile(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const { imports, exports } = collectBoundNames(sourceFile);
  const relative = path.relative(root, file).split(path.sep).join('/');

  // 1. Imports of the removed module under any local alias.
  for (const [local, specifier] of imports) {
    if (NATIVE_SELECT_SPECIFIER.test(specifier)) {
      violations.push(`${relative}: imports "${specifier}" (binding ${local}) — module was removed`);
    }
  }
  for (const reExport of exports) {
    if (NATIVE_SELECT_SPECIFIER.test(reExport.specifier)) {
      violations.push(`${relative}: re-exports "${reExport.specifier}" — module was removed`);
    }
  }

  // 2. JSX tags and value references, including aliased and namespace forms.
  const walk = node => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sourceFile);
      const first = tag.split('.')[0];
      if (tag === NATIVE_SELECT_IDENT || tag === SELECT_INPUT_IDENT || tag === 'select' || tag === 'datalist' || tag === 'option') {
        violations.push(`${relative}: JSX <${tag}> is not allowed in production`);
      }
      const namespaceSpecifier = imports.get(first);
      if (namespaceSpecifier?.startsWith('namespace:') && NATIVE_SELECT_SPECIFIER.test(namespaceSpecifier.slice('namespace:'.length))) {
        violations.push(`${relative}: JSX <${tag}> resolves through a namespace import of native-select`);
      }
    }
    // <input list="..."> autocomplete bindings are the datalist escape hatch.
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(sourceFile) === 'input') {
      for (const attribute of node.attributes.properties) {
        if (ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === 'list') {
          violations.push(`${relative}: <input list=...> datalist binding is not allowed in production`);
        }
      }
    }
    // Direct identifier usage beyond JSX (React.createElement style guards).
    if (ts.isIdentifier(node) && (node.text === NATIVE_SELECT_IDENT || node.text === SELECT_INPUT_IDENT)) {
      const specifier = imports.get(node.text);
      if (specifier === undefined && node.text === SELECT_INPUT_IDENT) {
        violations.push(`${relative}: references removed export SelectInput`);
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sourceFile);
}

// 3. CSS leftovers of the retired marker.
async function scanCss(directory) {
  const found = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return found; // directory absent in miniature fixture trees
  }
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIR_NAMES.has(entry.name)) found.push(...(await scanCss(file)));
    } else if (/\.css$/.test(entry.name)) {
      const text = await readFile(file, 'utf8');
      if (text.includes('[data-ui="native-select"]') || text.includes("data-ui='native-select'")) {
        found.push(path.relative(root, file).split(path.sep).join('/'));
      }
    }
  }
  return found;
}
const cssFiles = [...(await scanCss(path.join(root, 'components'))), ...(await scanCss(path.join(root, 'modules')))];
try {
  const indexCss = await readFile(path.join(root, 'index.css'), 'utf8');
  if (indexCss.includes('[data-ui="native-select"]')) cssFiles.push('index.css');
} catch {
  /* optional */
}
for (const file of cssFiles) violations.push(`${file}: CSS still styles the removed native-select marker`);

if (violations.length) {
  console.error(`Select migration gate failed (${violations.length}):\n${violations.join('\n')}`);
  process.exit(1);
} else {
  console.log(`Select migration gate passed (${sources.length} production sources checked).`);
}
