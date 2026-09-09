import { parseDocument } from 'yaml';
import {
    arrayEach,
    arrayEnsures,
    isNumber,
    isObject,
    isString,
    objectEach,
    objectHasKey,
} from '@presource/core';

// ─── YAML document detection ─────────────────────────────────────────────────
// Content-based classification of a text file's YAML document. Used by the
// YAML plugin (plugins/yaml/YamlPlugin.tsx) to decide WHAT to render for a
// selected text file:
//
// - 'invalid'  → the text is YAML-ish but the parser found errors (broken
//                .yaml/.yml files render a parse-error view)
// - 'openapi'  → an OpenAPI 3.x spec (an `openapi` key with a 3.x value) —
//                renders the formatted spec summary (OpenApiView.tsx)
// - 'swagger'  → a Swagger 2.0 spec (a `swagger` key) — same summary view
// - 'yaml'     → any other valid YAML document (scalar / array / plain map) —
//                contributes nothing (the text plugin renders the raw text)
//
// JSON is a YAML subset — a .json OpenAPI document detects as 'openapi' too.
// Detection is CONTENT-based (not extension-based) so a spec dropped with a
// wrong name/extension still renders; only the invalid-YAML error view is
// extension-gated (see YamlPlugin.tsx) to keep random text files tab-free.

// One parse failure, normalized: yaml's error message embeds a
// " at line X, column Y:\n<source>" suffix — stripped here; the structured
// position lives in line/column (1-based, from yaml's error.linePos —
// cross-reference: yaml/dist/errors.d.ts YAMLError.linePos).
export type YamlParseIssue = {
    message: string;
    line: number;
    column: number;
};

// One server entry (OpenAPI 3 `servers` list item, or a Swagger 2.0
// scheme://host/basePath combination — one entry per scheme)
export type OpenApiServerInfo = {
    url: string;
    description: string | null;
};

// One operation inside a path item
export type OpenApiOperationInfo = {
    // Lowercase HTTP method (get/post/put/…)
    method: string;
    summary: string | null;
    operationId: string | null;
};

// One path entry with its operations, in YAML key order; operations in the
// fixed OPERATION_METHODS display order
export type OpenApiPathInfo = {
    path: string;
    operations: OpenApiOperationInfo[];
};

// Shared shape for both spec flavors — the view renders them identically
// (only the badge text differs: "OpenAPI 3.0.0" vs "Swagger 2")
export type ApiSpecDetection = {
    kind: 'openapi' | 'swagger';
    // Normalized version string (`openapi: 3` → '3', `swagger: 2.0` → '2' —
    // YAML parses a bare 2.0 as a number, so versions go through String())
    version: string;
    // info.title / info.version / info.description — null when absent or
    // not text/number-shaped
    title: string | null;
    apiVersion: string | null;
    description: string | null;
    servers: OpenApiServerInfo[];
    paths: OpenApiPathInfo[];
};

export type YamlDetection =
    | { kind: 'invalid'; issues: YamlParseIssue[] }
    | { kind: 'yaml'; data: unknown }
    | ApiSpecDetection;

// HTTP operation methods recognized inside a path item — fixed DISPLAY order
// so the rendered operation list is deterministic regardless of YAML key
// order (both OpenAPI 3.x and Swagger 2.0 share this set; trace exists only
// in 3.x but tolerating it in 2.0 docs is harmless)
const OPERATION_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

// String-or-null coercion for display text: strings pass through, numbers
// are stringified (YAML parses `version: 1` as a number — still a
// displayable version), everything else → null
const textOrNull = (value: unknown): string | null => {
    if (isString(value)) return value;
    if (isNumber(value)) return String(value);
    return null;
};

// Extracts the operations of one path item, walking OPERATION_METHODS in
// display order. NOTE: the arrayEach callback must never RETURN a value —
// arrayEach SHORT-CIRCUITS on a non-undefined return (same block-body
// pitfall documented in plugins/exportPdf/exportFilesToPdf.ts appendFile).
const extractOperations = (pathItem: unknown): OpenApiOperationInfo[] => {
    if (!isObject(pathItem)) return [];
    const operations: OpenApiOperationInfo[] = [];
    arrayEach(OPERATION_METHODS, ({ value: method }) => {
        if (!objectHasKey(pathItem, method)) return;
        const operation = pathItem[method];
        if (!isObject(operation)) return;
        operations.push({
            method,
            summary: textOrNull(operation.summary),
            operationId: textOrNull(operation.operationId),
        });
    });
    return operations;
};

// Extracts the `paths` map: one entry per path key in YAML insertion order
// (objectEach walks own enumerable keys; non-object path items still yield
// an entry with zero operations so the path name stays visible)
const extractPaths = (paths: unknown): OpenApiPathInfo[] => {
    if (!isObject(paths)) return [];
    const result: OpenApiPathInfo[] = [];
    objectEach(paths, ({ key, value }) => {
        // YAML map keys are always strings — the objectEach generic widens
        // `key` to `string | number`, so narrow it back explicitly
        const pathName = typeof key === 'string' ? key : String(key);
        result.push({ path: pathName, operations: extractOperations(value) });
    });
    return result;
};

// OpenAPI 3 `servers` list → normalized entries. Non-object items and
// entries without a usable url are SKIPPED (a server without a url is
// malformed and would render an empty row); missing description → null.
const extractOpenApiServers = (servers: unknown): OpenApiServerInfo[] => {
    const result: OpenApiServerInfo[] = [];
    arrayEach(arrayEnsures(servers), ({ value }) => {
        if (!isObject(value)) return;
        const url = textOrNull(value.url);
        if (url === null) return;
        result.push({ url, description: textOrNull(value.description) });
    });
    return result;
};

// Swagger 2.0 has no `servers` list — the base URLs are assembled from
// host + basePath + schemes: one URL per scheme; no schemes → one
// scheme-less URL; neither host nor basePath → no servers at all.
const buildSwaggerServers = (data: { [key: string]: any }): OpenApiServerInfo[] => {
    const host = textOrNull(data.host) ?? '';
    const basePath = textOrNull(data.basePath) ?? '';
    if (host === '' && basePath === '') return [];
    const suffix = `${host}${basePath}`;
    // isString narrows the filter predicate (schemes may contain numbers —
    // e.g. `schemes: [https, 8080]` — non-strings are dropped)
    const schemes = arrayEnsures(data.schemes).filter(
        (scheme): scheme is string => isString(scheme),
    );
    const urls = schemes.length > 0 ? schemes.map((scheme) => `${scheme}://${suffix}`) : [suffix];
    return urls.map((url) => ({ url, description: null }));
};

// Shared spec builder — both flavors share the info/servers/paths shape;
// only the servers source differs (OpenAPI 3 list vs Swagger 2 composition)
const buildSpecDetection = (
    kind: 'openapi' | 'swagger',
    version: string,
    data: { [key: string]: any },
): ApiSpecDetection => {
    const info = isObject(data.info) ? data.info : {};
    return {
        kind,
        version,
        title: textOrNull(info.title),
        apiVersion: textOrNull(info.version),
        description: textOrNull(info.description),
        servers:
            kind === 'openapi' ? extractOpenApiServers(data.servers) : buildSwaggerServers(data),
        paths: extractPaths(data.paths),
    };
};

const detectUncached = (content: string): YamlDetection => {
    // parseDocument COLLECTS errors without throwing (parse() throws) — an
    // invalid document still yields a partial AST plus structured errors
    const doc = parseDocument(content);
    if (doc.errors.length > 0) {
        return {
            kind: 'invalid',
            issues: doc.errors.map((error) => {
                // Strip yaml's " at line X, column Y:\n<source>" message
                // suffix — the structured position comes from linePos
                const cut = error.message.indexOf(' at line ');
                const position = error.linePos?.[0];
                return {
                    message: cut === -1 ? error.message : error.message.slice(0, cut),
                    line: position?.line ?? 1,
                    column: position?.col ?? 1,
                };
            }),
        };
    }
    const data = doc.toJS();
    // Non-map roots (arrays, scalars, empty documents → null) can never be
    // API specs — classify as plain YAML with the parsed value attached
    if (!isObject(data)) return { kind: 'yaml', data };
    // OpenAPI wins when both markers exist — a 3.x document never carries a
    // meaningful swagger key, and the openapi field is the authoritative
    // version marker
    if (objectHasKey(data, 'openapi')) {
        const version = textOrNull(data.openapi);
        // `openapi: 3` parses as a number, `openapi: 3.0.0` as a string and
        // `openapi: 3.1` as a float — all normalize through textOrNull.
        // Anything not 3.x (e.g. `openapi: 2.0`) is NOT OpenAPI 3 and falls
        // through to the plain-YAML classification.
        if (version !== null && (version === '3' || version.indexOf('3.') === 0)) {
            return buildSpecDetection('openapi', version, data);
        }
    }
    if (objectHasKey(data, 'swagger')) {
        const version = textOrNull(data.swagger);
        // Any swagger version value counts (2.0 is the only real one, but a
        // malformed version should still surface as a swagger document)
        if (version !== null) {
            return buildSpecDetection('swagger', version, data);
        }
    }
    return { kind: 'yaml', data };
};

// One-entry memo: the dashboard re-runs every renderFile hook on each shell
// render (tab clicks, selection changes — dashboards/FormatterDashboard.tsx),
// so reparsing a large document on every render would be wasteful. Caching
// the LAST content → result pair keeps the function observationally pure
// (same input → same output object, reference-stable) while making repeat
// calls O(1).
let lastContent: string | null = null;
let lastResult: YamlDetection | null = null;

export const detectYamlDocument = (content: string): YamlDetection => {
    if (lastContent === content && lastResult !== null) return lastResult;
    const result = detectUncached(content);
    lastContent = content;
    lastResult = result;
    return result;
};
