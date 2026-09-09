import { describe, it, expect } from 'vitest';
import { detectYamlDocument } from './detectYamlDocument';

// ─── detectYamlDocument — content-based YAML document classification ────────
// Every assertion pins the EXACT detection result (kind + full payload) —
// no fuzzy checks. The yaml library version is pinned (^2.9.0) so error
// messages/positions stay stable; if the library bumps and changes wording,
// these tests fail loudly and the expectations get re-pinned.

describe('detectYamlDocument', () => {
    // ─── OpenAPI 3.x detection ───────────────────────────────────────────

    it('detects a minimal OpenAPI 3.0 YAML document with its full summary shape', () => {
        const content = [
            'openapi: 3.0.0',
            'info:',
            '  title: Pet Store',
            '  version: 1.0.0',
            '  description: A sample API.',
            'servers:',
            '  - url: https://petstore.example.com/v1',
            '    description: Production server',
            'paths:',
            '  /pets:',
            '    get:',
            '      summary: List all pets',
            '      operationId: listPets',
            '    post:',
            '      summary: Create a pet',
            '  /pets/{id}:',
            '    delete:',
            '      summary: Delete a pet',
        ].join('\n');

        expect(detectYamlDocument(content)).toEqual({
            kind: 'openapi',
            version: '3.0.0',
            title: 'Pet Store',
            apiVersion: '1.0.0',
            description: 'A sample API.',
            servers: [{ url: 'https://petstore.example.com/v1', description: 'Production server' }],
            paths: [
                {
                    path: '/pets',
                    operations: [
                        { method: 'get', summary: 'List all pets', operationId: 'listPets' },
                        { method: 'post', summary: 'Create a pet', operationId: null },
                    ],
                },
                {
                    path: '/pets/{id}',
                    operations: [{ method: 'delete', summary: 'Delete a pet', operationId: null }],
                },
            ],
        });
    });

    it('detects a bare-number openapi version (YAML parses `3` as a number)', () => {
        const content = 'openapi: 3\ninfo:\n  title: T\npaths: {}';
        expect(detectYamlDocument(content)).toEqual({
            kind: 'openapi',
            version: '3',
            title: 'T',
            apiVersion: null,
            description: null,
            servers: [],
            paths: [],
        });
    });

    it('detects a float openapi version (YAML parses `3.1` as a number)', () => {
        const content = 'openapi: 3.1\npaths: {}';
        const detection = detectYamlDocument(content);
        expect(detection).toEqual({
            kind: 'openapi',
            version: '3.1',
            title: null,
            apiVersion: null,
            description: null,
            servers: [],
            paths: [],
        });
    });

    it('detects an OpenAPI document delivered as JSON (JSON is a YAML subset)', () => {
        const content = '{"openapi":"3.0.1","info":{"title":"JSON Spec"},"paths":{"/a":{"get":{"summary":"G"}}}}';
        expect(detectYamlDocument(content)).toEqual({
            kind: 'openapi',
            version: '3.0.1',
            title: 'JSON Spec',
            apiVersion: null,
            description: null,
            servers: [],
            paths: [{ path: '/a', operations: [{ method: 'get', summary: 'G', operationId: null }] }],
        });
    });

    it('skips malformed server entries without a url', () => {
        const content = [
            'openapi: 3.0.0',
            'servers:',
            '  - description: no url here',
            '  - url: https://ok.example.com',
            'paths: {}',
        ].join('\n');
        expect(detectYamlDocument(content)).toEqual({
            kind: 'openapi',
            version: '3.0.0',
            title: null,
            apiVersion: null,
            description: null,
            servers: [{ url: 'https://ok.example.com', description: null }],
            paths: [],
        });
    });

    it('keeps a path entry with zero operations visible', () => {
        const content = 'openapi: 3.0.0\npaths:\n  /empty: {}';
        expect(detectYamlDocument(content)).toEqual({
            kind: 'openapi',
            version: '3.0.0',
            title: null,
            apiVersion: null,
            description: null,
            servers: [],
            paths: [{ path: '/empty', operations: [] }],
        });
    });

    it('coerces a numeric info.version into a string', () => {
        const content = 'openapi: 3.0.0\ninfo:\n  title: T\n  version: 2\npaths: {}';
        expect(detectYamlDocument(content)).toEqual({
            kind: 'openapi',
            version: '3.0.0',
            title: 'T',
            apiVersion: '2',
            description: null,
            servers: [],
            paths: [],
        });
    });

    it('classifies a non-3.x openapi value as plain YAML', () => {
        // `openapi: 2.0` is not an OpenAPI 3 document — no spec tab
        const content = 'openapi: 2.0\npaths: {}';
        expect(detectYamlDocument(content)).toEqual({ kind: 'yaml', data: { openapi: 2, paths: {} } });
    });

    it('lists operations in the fixed display order regardless of YAML key order', () => {
        const content = [
            'openapi: 3.0.0',
            'paths:',
            '  /x:',
            '    post: {}',
            '    delete: {}',
            '    get: {}',
            '    patch: {}',
        ].join('\n');
        const detection = detectYamlDocument(content);
        // Narrow: the assertion itself pins the shape — this guard only
        // satisfies TypeScript's discriminated-union access
        if (detection.kind !== 'openapi') throw new Error('expected openapi');
        expect(detection.paths[0].operations.map((operation) => operation.method)).toEqual([
            'get',
            'post',
            'delete',
            'patch',
        ]);
    });

    // ─── Swagger 2.0 detection ───────────────────────────────────────────

    it('detects a Swagger 2.0 document and composes its servers from host/basePath/schemes', () => {
        const content = [
            'swagger: "2.0"',
            'info:',
            '  title: Old Store',
            '  version: 2.0.0',
            'host: petstore.example.com',
            'basePath: /v2',
            'schemes:',
            '  - https',
            '  - http',
            'paths:',
            '  /pets:',
            '    get:',
            '      summary: List pets',
        ].join('\n');

        expect(detectYamlDocument(content)).toEqual({
            kind: 'swagger',
            version: '2.0',
            title: 'Old Store',
            apiVersion: '2.0.0',
            description: null,
            servers: [
                { url: 'https://petstore.example.com/v2', description: null },
                { url: 'http://petstore.example.com/v2', description: null },
            ],
            paths: [{ path: '/pets', operations: [{ method: 'get', summary: 'List pets', operationId: null }] }],
        });
    });

    it('detects a bare-number swagger version (YAML parses a bare 2.0 as a number)', () => {
        const content = 'swagger: 2.0\npaths: {}';
        expect(detectYamlDocument(content)).toEqual({
            kind: 'swagger',
            version: '2',
            title: null,
            apiVersion: null,
            description: null,
            servers: [],
            paths: [],
        });
    });

    it('produces one scheme-less server URL when Swagger has host/basePath but no schemes', () => {
        const content = 'swagger: "2.0"\nhost: api.example.com\nbasePath: /v1\npaths: {}';
        expect(detectYamlDocument(content)).toEqual({
            kind: 'swagger',
            version: '2.0',
            title: null,
            apiVersion: null,
            description: null,
            servers: [{ url: 'api.example.com/v1', description: null }],
            paths: [],
        });
    });

    it('produces no servers when Swagger has neither host nor basePath', () => {
        const content = 'swagger: "2.0"\ninfo:\n  title: T\npaths: {}';
        expect(detectYamlDocument(content)).toEqual({
            kind: 'swagger',
            version: '2.0',
            title: 'T',
            apiVersion: null,
            description: null,
            servers: [],
            paths: [],
        });
    });

    it('prefers the openapi marker when both openapi and swagger keys exist', () => {
        const content = 'openapi: 3.0.0\nswagger: 2.0\npaths: {}';
        const detection = detectYamlDocument(content);
        // The swagger value is NOT the version source when openapi wins
        expect(detection).toEqual({
            kind: 'openapi',
            version: '3.0.0',
            title: null,
            apiVersion: null,
            description: null,
            servers: [],
            paths: [],
        });
    });

    // ─── Plain YAML / non-YAML content ───────────────────────────────────

    it('classifies a plain YAML map as plain yaml with its parsed data', () => {
        const content = 'key: value\nnested:\n  list:\n    - 1\n    - 2';
        expect(detectYamlDocument(content)).toEqual({
            kind: 'yaml',
            data: { key: 'value', nested: { list: [1, 2] } },
        });
    });

    it('classifies a YAML array root as plain yaml', () => {
        expect(detectYamlDocument('- a\n- b')).toEqual({ kind: 'yaml', data: ['a', 'b'] });
    });

    it('classifies a scalar document as plain yaml', () => {
        expect(detectYamlDocument('hello')).toEqual({ kind: 'yaml', data: 'hello' });
    });

    it('classifies an empty document as plain yaml with null data', () => {
        expect(detectYamlDocument('')).toEqual({ kind: 'yaml', data: null });
    });

    it('classifies arbitrary prose as plain yaml (no errors, scalar data)', () => {
        const content = 'The quick brown fox\njumps over the lazy dog.';
        // Multi-line plain scalars fold — the exact folded value is pinned
        expect(detectYamlDocument(content)).toEqual({
            kind: 'yaml',
            data: 'The quick brown fox jumps over the lazy dog.',
        });
    });

    // ─── Invalid YAML ────────────────────────────────────────────────────

    it('reports an unclosed flow sequence with the exact message and 1-based position', () => {
        // The caret in yaml's message sits at column 19 (one past the end);
        // the structured linePos col matches — both 1-based
        const detection = detectYamlDocument('openapi: [unclosed');
        expect(detection).toEqual({
            kind: 'invalid',
            issues: [
                {
                    message: 'Flow sequence in block collection must be sufficiently indented and end with a ]',
                    line: 1,
                    column: 19,
                },
            ],
        });
    });

    it('reports a duplicate key with its line/column', () => {
        const detection = detectYamlDocument('a: 1\na: 2');
        expect(detection).toEqual({
            kind: 'invalid',
            issues: [
                {
                    message: 'Map keys must be unique',
                    line: 2,
                    column: 1,
                },
            ],
        });
    });

    it('reports a bad indentation error with its line/column', () => {
        const detection = detectYamlDocument('info:\n  title: ok\n bad: indent');
        expect(detection).toEqual({
            kind: 'invalid',
            issues: [
                {
                    message: 'All mapping items must start at the same column',
                    line: 3,
                    column: 1,
                },
            ],
        });
    });

    it('collects ALL parse errors, not just the first', () => {
        // Two independent errors: the unclosed flow sequence (line 1) and a
        // duplicate key (line 3)
        const detection = detectYamlDocument('a: [x\nb: 1\nb: 2');
        if (detection.kind !== 'invalid') throw new Error('expected invalid');
        expect(detection.issues.length).toBe(2);
        expect(detection.issues[0].message).toBe(
            'Flow sequence in block collection must be sufficiently indented and end with a ]',
        );
        // yaml reports the unclosed flow sequence at the point where the
        // block mapping resumes (line 2), not where the `[` opened (line 1)
        expect(detection.issues[0].line).toBe(2);
        expect(detection.issues[0].column).toBe(1);
        expect(detection.issues[1].message).toBe('Map keys must be unique');
        expect(detection.issues[1].line).toBe(3);
        expect(detection.issues[1].column).toBe(1);
    });

    // ─── Memoization ─────────────────────────────────────────────────────

    it('returns the SAME result object for a repeated identical content (reference-stable memo)', () => {
        const content = 'openapi: 3.0.0\npaths: {}';
        const first = detectYamlDocument(content);
        const second = detectYamlDocument(content);
        // Reference identity — the one-entry memo must not reparse/rebuild
        expect(second).toBe(first);
        // A different content evicts the memo and reparses
        expect(detectYamlDocument('swagger: 2.0\npaths: {}')).not.toBe(first);
    });
});
