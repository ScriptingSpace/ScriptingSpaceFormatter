import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { FormatterDashboard } from '../../dashboards/FormatterDashboard';
import { defaultPlugins } from '../../plugins';

// ─── YAML PLUGIN — integration tests through the real dashboard ─────────────
// The yaml plugin hooks renderFile for text files whose CONTENT is an
// OpenAPI/Swagger document (spec tab) or broken YAML on a .yaml/.yml file
// (error tab). Plain valid YAML contributes NO tab — the text plugin renders
// it raw. Because the yaml plugin contributes alongside the text plugin for
// the same file, the content area switches to TABS.

afterEach(() => {
    cleanup();
});

// A small but complete OpenAPI 3 document used across the tab tests
const PET_STORE_YAML = [
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
    '    post:',
    '      summary: Create a pet',
    '  /pets/{id}:',
    '    delete:',
    '      summary: Delete a pet',
].join('\n');

describe('yamlPlugin', () => {
    // ─── OpenAPI spec tab ────────────────────────────────────────────────

    it('adds a YAML spec tab alongside the Text tab for a dropped OpenAPI document', async () => {
        render(<FormatterDashboard plugins={defaultPlugins} />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [new File([PET_STORE_YAML], 'openapi.yaml', { type: 'text/yaml' })],
            },
        });

        // Both the text plugin and the yaml plugin contribute → tabs
        await waitFor(() => {
            expect(screen.getByTestId('content-tabs')).toBeDefined();
        });
        expect(screen.getByTestId('content-tab-text').textContent).toBe('Text');
        expect(screen.getByTestId('content-tab-yaml').textContent).toBe('YAML');

        // Default active tab = the FIRST contributor (text) — the raw YAML
        // renders first, the spec view is mounted only on tab click
        expect(screen.getByTestId('file-content-text')).toBeDefined();
        expect(screen.queryByTestId('openapi-view')).toBeNull();
    });

    it('renders the formatted OpenAPI summary when the YAML tab is clicked', async () => {
        render(<FormatterDashboard plugins={defaultPlugins} />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [new File([PET_STORE_YAML], 'openapi.yaml', { type: 'text/yaml' })],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('content-tab-yaml')).toBeDefined();
        });
        fireEvent.click(screen.getByTestId('content-tab-yaml'));

        // Badge: flavor + version
        expect(screen.getByTestId('openapi-badge').textContent).toBe('OpenAPI 3.0.0');
        expect(screen.getByTestId('openapi-view').textContent).toContain('Pet Store');
        expect(screen.getByTestId('openapi-view').textContent).toContain('A sample API.');

        // Servers: one entry, url + description
        expect(screen.getByTestId('openapi-server-0').textContent).toBe(
            'https://petstore.example.com/v1— Production server',
        );

        // Paths: method pills + path name + summary lines, in display order
        expect(screen.getByTestId('openapi-path-/pets').textContent).toBe('getpost/pets');
        expect(screen.getByTestId('openapi-operation-get').textContent).toBe('List all pets');
        expect(screen.getByTestId('openapi-operation-post').textContent).toBe('Create a pet');
        expect(screen.getByTestId('openapi-path-/pets/{id}').textContent).toBe('delete/pets/{id}');
        expect(screen.getByTestId('openapi-operation-delete').textContent).toBe('Delete a pet');
    });

    it('detects an OpenAPI spec by CONTENT even when the file has a wrong extension', async () => {
        render(<FormatterDashboard plugins={defaultPlugins} />);

        // Dropped as .txt — the text plugin renders the raw content AND the
        // yaml plugin still contributes its spec tab (content-based detection)
        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['openapi: 3.0.0\ninfo:\n  title: Misnamed\npaths: {}'], 'spec.txt', {
                        type: 'text/plain',
                    }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('content-tab-yaml')).toBeDefined();
        });
        fireEvent.click(screen.getByTestId('content-tab-yaml'));

        expect(screen.getByTestId('openapi-badge').textContent).toBe('OpenAPI 3.0.0');
        expect(screen.getByTestId('openapi-view').textContent).toContain('Misnamed');
    });

    it('detects a JSON OpenAPI document (JSON is a YAML subset)', async () => {
        render(<FormatterDashboard plugins={defaultPlugins} />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(
                        ['{"openapi":"3.0.1","info":{"title":"JSON Spec"},"paths":{}}'],
                        'openapi.json',
                        { type: 'application/json' },
                    ),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('content-tab-yaml')).toBeDefined();
        });
        fireEvent.click(screen.getByTestId('content-tab-yaml'));

        expect(screen.getByTestId('openapi-badge').textContent).toBe('OpenAPI 3.0.1');
        expect(screen.getByTestId('openapi-view').textContent).toContain('JSON Spec');
    });

    it('shows empty-section notes for a spec without servers or paths', async () => {
        render(<FormatterDashboard plugins={defaultPlugins} />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['openapi: 3.0.0\ninfo:\n  title: Bare\npaths: {}'], 'bare.yaml', {
                        type: 'text/yaml',
                    }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('content-tab-yaml')).toBeDefined();
        });
        fireEvent.click(screen.getByTestId('content-tab-yaml'));

        expect(screen.getByTestId('openapi-servers-empty').textContent).toBe('No servers defined.');
        expect(screen.getByTestId('openapi-paths-empty').textContent).toBe('No paths defined.');
    });

    // ─── Swagger 2.0 tab ─────────────────────────────────────────────────

    it('renders a Swagger 2.0 summary with composed server URLs', async () => {
        render(<FormatterDashboard plugins={defaultPlugins} />);

        const swagger = [
            'swagger: "2.0"',
            'info:',
            '  title: Old Store',
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

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [new File([swagger], 'swagger.yaml', { type: 'text/yaml' })],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('content-tab-yaml')).toBeDefined();
        });
        fireEvent.click(screen.getByTestId('content-tab-yaml'));

        expect(screen.getByTestId('openapi-badge').textContent).toBe('Swagger 2.0');
        // One server URL per scheme, host+basePath composed
        expect(screen.getByTestId('openapi-server-0').textContent).toBe(
            'https://petstore.example.com/v2',
        );
        expect(screen.getByTestId('openapi-server-1').textContent).toBe(
            'http://petstore.example.com/v2',
        );
        expect(screen.getByTestId('openapi-path-/pets').textContent).toBe('get/pets');
    });

    // ─── Broken YAML error tab ───────────────────────────────────────────

    it('renders a parse-error tab for a broken .yaml file', async () => {
        render(<FormatterDashboard plugins={defaultPlugins} />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['info:\n  title: ok\n bad: indent'], 'broken.yaml', {
                        type: 'text/yaml',
                    }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('content-tab-yaml')).toBeDefined();
        });
        fireEvent.click(screen.getByTestId('content-tab-yaml'));

        expect(screen.getByTestId('yaml-error-view')).toBeDefined();
        // Exactly one error with the exact message and 1-based position
        expect(screen.getByTestId('yaml-error-0').textContent).toBe(
            'line 3, column 1All mapping items must start at the same column',
        );
    });

    it('shows NO yaml tab for broken YAML content in a non-YAML file', async () => {
        render(<FormatterDashboard plugins={defaultPlugins} />);

        // Same broken content but named .txt — the extension gate keeps the
        // tab off (arbitrary broken text files must not grow a YAML tab)
        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['info:\n  title: ok\n bad: indent'], 'broken.txt', {
                        type: 'text/plain',
                    }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('file-content-text')).toBeDefined();
        });

        // Only the text plugin contributes → direct render, no tabs at all
        expect(screen.queryByTestId('content-tab-yaml')).toBeNull();
        expect(screen.queryByTestId('content-tabs')).toBeNull();
        expect(screen.queryByTestId('yaml-error-view')).toBeNull();
    });

    // ─── Plain YAML — no tab ─────────────────────────────────────────────

    it('adds NO yaml tab for plain valid YAML (the text plugin renders it raw)', async () => {
        render(<FormatterDashboard plugins={defaultPlugins} />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['key: value\nnested:\n  - 1\n  - 2'], 'config.yaml', {
                        type: 'text/yaml',
                    }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('file-content-text')).toBeDefined();
        });

        // Plain YAML → the yaml plugin contributes nothing → direct text
        // render, no tab bar
        expect(screen.queryByTestId('content-tab-yaml')).toBeNull();
        expect(screen.queryByTestId('content-tabs')).toBeNull();
        expect(screen.getByTestId('file-content-text').textContent).toBe(
            'key: value\nnested:\n  - 1\n  - 2',
        );
    });

    it('adds NO yaml tab for arbitrary prose or other text files', async () => {
        render(<FormatterDashboard plugins={defaultPlugins} />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['just some notes\nabout nothing'], 'notes.txt', {
                        type: 'text/plain',
                    }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('file-content-text')).toBeDefined();
        });

        expect(screen.queryByTestId('content-tab-yaml')).toBeNull();
        expect(screen.queryByTestId('content-tabs')).toBeNull();
    });

    // ─── Non-text kinds ──────────────────────────────────────────────────

    it('adds NO yaml tab for image files', async () => {
        render(<FormatterDashboard plugins={defaultPlugins} />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [new File(['fake-png-bytes'], 'logo.png', { type: 'image/png' })],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('file-content-image')).toBeDefined();
        });

        expect(screen.queryByTestId('content-tab-yaml')).toBeNull();
        expect(screen.queryByTestId('content-tabs')).toBeNull();
    });

    // ─── Tab interaction ─────────────────────────────────────────────────

    it('switches between the Text and YAML tabs back and forth', async () => {
        render(<FormatterDashboard plugins={defaultPlugins} />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [new File([PET_STORE_YAML], 'openapi.yaml', { type: 'text/yaml' })],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('content-tab-yaml')).toBeDefined();
        });

        // Text tab first
        expect(screen.getByTestId('file-content-text')).toBeDefined();
        expect(screen.queryByTestId('openapi-view')).toBeNull();

        // Click YAML → spec view replaces the text panel
        fireEvent.click(screen.getByTestId('content-tab-yaml'));
        expect(screen.getByTestId('openapi-view')).toBeDefined();
        expect(screen.queryByTestId('file-content-text')).toBeNull();

        // Back to Text → raw YAML again
        fireEvent.click(screen.getByTestId('content-tab-text'));
        expect(screen.getByTestId('file-content-text')).toBeDefined();
        expect(screen.queryByTestId('openapi-view')).toBeNull();
    });

    it('keeps the yaml tab working in the multi-select file-options layout', async () => {
        render(<FormatterDashboard plugins={defaultPlugins} />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File([PET_STORE_YAML], 'openapi.yaml', { type: 'text/yaml' }),
                    new File(['plain notes'], 'notes.txt', { type: 'text/plain' }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-notes.txt')).toBeDefined();
        });

        // Multi-select: the drop left ONLY notes.txt selected (openFile makes
        // each drop the only selected file). Clicking openapi.yaml toggles it
        // INTO the selection and makes it focused (last): selection =
        // [notes.txt, openapi.yaml] → the file-options layout appears with
        // the focused openapi file's plugin tabs inside its panel.
        fireEvent.click(screen.getByTestId('sidebar-file-openapi.yaml'));
        expect(screen.getByTestId('file-options')).toBeDefined();
        expect(screen.getByTestId('file-option-panel-openapi.yaml')).toBeDefined();

        // The focused openapi file gets its plugin tabs, followed by the
        // selection-level Compare tab (both selected files are text → the
        // compare plugin contributes)
        const tabTestIds = Array.from(
            screen
                .getByTestId('file-option-panel-openapi.yaml')
                .querySelector('[data-testid="content-tabs"]')!.children[0].children,
        ).map((tab) => tab.getAttribute('data-testid'));
        expect(tabTestIds).toEqual(['content-tab-text', 'content-tab-yaml', 'content-tab-differenceCsv']);

        // Click the YAML tab → the spec view renders inside the panel
        fireEvent.click(screen.getByTestId('content-tab-yaml'));
        expect(screen.getByTestId('openapi-view')).toBeDefined();
        expect(screen.getByTestId('openapi-badge').textContent).toBe('OpenAPI 3.0.0');
    });
});
