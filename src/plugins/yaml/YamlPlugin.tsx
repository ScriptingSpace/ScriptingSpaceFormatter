import React from 'react';
import { arrayEach, arrayEnsures, isObject, isString } from '@presource/core';
import { styledComponent } from '@presource/react';
import type { DashboardPlugin } from '../core';
import { detectYamlDocument } from './detectYamlDocument';
import type {
    ApiSpecDetection,
    OpenApiOperationInfo,
    OpenApiPathInfo,
    OpenApiServerInfo,
    YamlDetection,
    YamlParseIssue,
} from './detectYamlDocument';

// ─── YAML PLUGIN ─────────────────────────────────────────────────────────────
// Content hook for YAML documents. A selected text file whose content parses
// as YAML contributes:
//
// - an "OpenAPI"/"Swagger" tab rendering the formatted API spec summary
//   (specs are detected CONTENT-based — the file extension does not matter)
// - a "YAML" tab rendering a parse-error report for .yaml/.yml files whose
//   content is BROKEN YAML (extension-gated so arbitrary broken text files
//   never get a YAML tab)
//
// Plain valid YAML (scalars, arrays, non-spec maps) contributes NOTHING —
// the built-in text plugin renders those raw.

// ─── Spec summary styled shell ───────────────────────────────────────────────

// Scrollable summary frame — the only scrolling region (dashboard panes
// never scroll; every view owns its own scroller, same as TextView)
const SpecFrame = styledComponent('div', {
    width: '100%',
    height: '100%',
    minHeight: 0,
    overflow: 'auto' as const,
    boxSizing: 'border-box' as const,
    padding: 16,
    background: '#0b1120',
    color: '#e2e8f0',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
});

// Spec header: version badge + title on one row
const SpecHeader = styledComponent('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
});

// Flavor + version badge ("OpenAPI 3.0.0" / "Swagger 2") — pill shaped
const SpecBadge = styledComponent('span', {
    padding: '2px 10px',
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 999,
    background: '#1d4ed8',
    color: '#ffffff',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
});

// Spec title (info.title) — truncated so long titles never push the badge out
const SpecTitle = styledComponent('span', {
    fontSize: 16,
    fontWeight: 600,
    color: '#f8fafc',
    overflow: 'hidden' as const,
    whiteSpace: 'nowrap' as const,
    textOverflow: 'ellipsis' as const,
});

// info.description block under the header
const SpecDescription = styledComponent('p', {
    margin: '4px 0 12px',
    fontSize: 13,
    lineHeight: 1.6,
    color: '#94a3b8',
    whiteSpace: 'pre-wrap' as const,
});

// Section title ("Servers", "Paths")
const SpecSectionTitle = styledComponent('h2', {
    margin: '16px 0 6px',
    fontSize: 13,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em' as const,
    color: '#64748b',
});

// One server row — URL in monospace, optional description after it
const ServerRow = styledComponent('div', {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    padding: '4px 0',
    fontSize: 13,
});

const ServerUrl = styledComponent('code', {
    fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
    fontSize: 12,
    color: '#7dd3fc',
    wordBreak: 'break-all' as const,
});

const ServerDescription = styledComponent('span', {
    fontSize: 12,
    color: '#64748b',
});

// One path row: method pills + path name
const PathRow = styledComponent('div', {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
    padding: '5px 0',
    borderBottom: '1px solid #1e293b',
    flexWrap: 'wrap' as const,
});

// HTTP method pill — colored per method family (read=blue, write=green,
// delete=red, other=slate) so GET/POST/DELETE read at a glance
const MethodPill = styledComponent<{ method: string }>('span', {
    padding: '1px 8px',
    fontSize: 11,
    fontWeight: 700,
    borderRadius: 4,
    fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
    textTransform: 'uppercase' as const,
    flexShrink: 0,
    background: ({ method }) => methodBackground(method),
    color: ({ method }) => methodColor(method),
});

const PathName = styledComponent('code', {
    fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
    fontSize: 12,
    color: '#e2e8f0',
    wordBreak: 'break-all' as const,
});

// Shared method tint tables — kept next to MethodPill so pill colors resolve
// in one place (read methods blue, write methods green, delete red)
const methodColor = (method: string): string =>
    method === 'get' || method === 'head'
        ? '#60a5fa'
        : method === 'post'
          ? '#4ade80'
          : method === 'put' || method === 'patch'
            ? '#fbbf24'
            : method === 'delete'
              ? '#f87171'
              : '#94a3b8';

const methodBackground = (method: string): string =>
    method === 'get' || method === 'head'
        ? 'rgba(96, 165, 250, 0.12)'
        : method === 'post'
          ? 'rgba(74, 222, 128, 0.12)'
          : method === 'put' || method === 'patch'
            ? 'rgba(251, 191, 36, 0.12)'
            : method === 'delete'
              ? 'rgba(248, 113, 113, 0.12)'
              : 'rgba(148, 163, 184, 0.12)';

// Muted empty-section note ("No servers defined." / "No paths defined.")
const SpecEmpty = styledComponent('div', {
    fontSize: 13,
    color: '#475569',
    padding: '4px 0',
});

// Operation detail line under a path row (summary / operationId)
const OperationLine = styledComponent('div', {
    padding: '2px 0 6px 8px',
    fontSize: 12,
    color: '#94a3b8',
    borderBottom: '1px solid #1e293b',
});

// ─── Spec summary view ───────────────────────────────────────────────────────

const SpecServers = ({ servers }: { servers: OpenApiServerInfo[] }) => (
    <>
        <SpecSectionTitle>Servers</SpecSectionTitle>
        {servers.length === 0 ? (
            <SpecEmpty data-testid="openapi-servers-empty">No servers defined.</SpecEmpty>
        ) : (
            arrayEnsures(servers).map((server, index) => (
                <ServerRow key={`${server.url}-${index}`} data-testid={`openapi-server-${index}`}>
                    <ServerUrl>{server.url}</ServerUrl>
                    {server.description ? (
                        <ServerDescription>— {server.description}</ServerDescription>
                    ) : null}
                </ServerRow>
            ))
        )}
    </>
);

const SpecOperations = ({ operations }: { operations: OpenApiOperationInfo[] }) =>
    operations.map((operation) => (
        <OperationLine
            key={operation.method}
            data-testid={`openapi-operation-${operation.method}`}
        >
            {operation.summary ?? (operation.operationId ? operation.operationId : '')}
        </OperationLine>
    ));

const SpecPaths = ({ paths }: { paths: OpenApiPathInfo[] }) => (
    <>
        <SpecSectionTitle>Paths</SpecSectionTitle>
        {paths.length === 0 ? (
            <SpecEmpty data-testid="openapi-paths-empty">No paths defined.</SpecEmpty>
        ) : (
            paths.map((path) => (
                <React.Fragment key={path.path}>
                    <PathRow data-testid={`openapi-path-${path.path}`}>
                        {path.operations.map((operation) => (
                            <MethodPill key={operation.method} method={operation.method}>
                                {operation.method}
                            </MethodPill>
                        ))}
                        <PathName>{path.path}</PathName>
                    </PathRow>
                    <SpecOperations operations={path.operations} />
                </React.Fragment>
            ))
        )}
    </>
);

// The formatted API spec summary. Renders BOTH flavors (OpenAPI 3.x and
// Swagger 2.0) — they share the info/servers/paths shape; only the badge
// text differs.
const OpenApiView = ({ spec }: { spec: ApiSpecDetection }) => (
    <SpecFrame data-testid="openapi-view">
        <SpecHeader>
            <SpecBadge data-testid="openapi-badge">
                {spec.kind === 'openapi' ? `OpenAPI ${spec.version}` : `Swagger ${spec.version}`}
            </SpecBadge>
            {spec.title ? <SpecTitle>{spec.title}</SpecTitle> : null}
        </SpecHeader>
        {spec.description ? <SpecDescription>{spec.description}</SpecDescription> : null}
        <SpecServers servers={spec.servers} />
        <SpecPaths paths={spec.paths} />
    </SpecFrame>
);

// ─── Parse-error view ────────────────────────────────────────────────────────

// Scrollable error report frame (same shell family as SpecFrame)
const ErrorFrame = styledComponent('div', {
    width: '100%',
    height: '100%',
    minHeight: 0,
    overflow: 'auto' as const,
    boxSizing: 'border-box' as const,
    padding: 16,
    background: '#0b1120',
    color: '#e2e8f0',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
});

const ErrorTitle = styledComponent('h2', {
    margin: '0 0 4px',
    fontSize: 15,
    fontWeight: 700,
    color: '#f87171',
});

const ErrorSubtitle = styledComponent('p', {
    margin: '0 0 12px',
    fontSize: 13,
    color: '#94a3b8',
});

// One error row — "line X, column Y" prefix + the parser's message
const ErrorRow = styledComponent('div', {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    padding: '8px 12px',
    marginBottom: 8,
    borderRadius: 8,
    border: '1px solid rgba(248, 113, 113, 0.25)',
    background: 'rgba(248, 113, 113, 0.06)',
});

const ErrorPosition = styledComponent('span', {
    fontSize: 11,
    fontWeight: 700,
    fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
    color: '#f87171',
});

const ErrorMessage = styledComponent('span', {
    fontSize: 13,
    lineHeight: 1.5,
    color: '#e2e8f0',
});

const YamlErrorView = ({ issues }: { issues: YamlParseIssue[] }) => (
    <ErrorFrame data-testid="yaml-error-view">
        <ErrorTitle>Invalid YAML</ErrorTitle>
        <ErrorSubtitle>
            This document could not be parsed — {issues.length} error
            {issues.length === 1 ? '' : 's'} found.
        </ErrorSubtitle>
        {issues.map((issue, index) => (
            <ErrorRow key={`${issue.line}-${issue.column}-${index}`} data-testid={`yaml-error-${index}`}>
                <ErrorPosition>
                    line {issue.line}, column {issue.column}
                </ErrorPosition>
                <ErrorMessage>{issue.message}</ErrorMessage>
            </ErrorRow>
        ))}
    </ErrorFrame>
);

// ─── Plugin definition ───────────────────────────────────────────────────────

// A broken YAML tab only makes sense for files NAMED as YAML — a random
// broken .txt must not grow a YAML tab (extension-gated; spec detection is
// content-based and needs no gate). Case-insensitive to match Windows-style
// naming (.YML / .Yaml).
const isYamlNamed = (name: string): boolean => {
    const lowered = name.toLowerCase();
    return lowered.endsWith('.yaml') || lowered.endsWith('.yml');
};

export const yamlPlugin: DashboardPlugin = {
    id: 'yaml',
    label: 'YAML',
    renderFile: (file) => {
        // Only text files carry parseable content — media/binary kinds yield
        // null so the matching plugins take over
        if (file.kind !== 'text') return null;
        const detection: YamlDetection = detectYamlDocument(file.content);
        // Broken YAML on a .yaml/.yml file → the parse-error tab. (The
        // detection result is still handed to the view — the extension gate
        // lives here, the parse lives in detectYamlDocument.)
        if (detection.kind === 'invalid') {
            return isYamlNamed(file.name) ? <YamlErrorView issues={detection.issues} /> : null;
        }
        // API specs (either flavor) → the formatted spec summary tab
        if (detection.kind === 'openapi' || detection.kind === 'swagger') {
            return <OpenApiView spec={detection} />;
        }
        // Plain valid YAML → nothing (the text plugin renders the raw text);
        // keeps arbitrary config files tab-free
        return null;
    },
};
