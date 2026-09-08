import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { FormatterDashboard } from './FormatterDashboard';

afterEach(() => {
    cleanup();
});

describe('FormatterDashboard', () => {
    it('renders the dashboard header and the empty left content pane', () => {
        render(<FormatterDashboard />);

        // The title also appears in the footer — assert on the header heading
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Formatter Dashboard');
        expect(
            screen.getByText('Drop files anywhere — they are collected in the sidebar.'),
        ).toBeDefined();
        // Left pane is reserved for formatter output — placeholder only
        expect(screen.getByTestId('content-placeholder').textContent).toBe(
            'Formatter content will appear here.',
        );
    });

    it('renders the sidebar with the empty-state hint when no file is accepted (drop-only flow)', () => {
        render(<FormatterDashboard />);

        expect(screen.getByTestId('file-sidebar')).toBeDefined();
        expect(screen.getByTestId('file-list-empty')).toBeDefined();
        expect(screen.queryByTestId('sidebar-file-anything.txt')).toBeNull();
        expect(screen.getByTestId('drop-outline')).toBeDefined();
    });

    it('adds a file dropped anywhere on the dashboard to the sidebar (global drop)', async () => {
        render(<FormatterDashboard />);

        const file = new File(['dropped anywhere'], 'anywhere.txt', { type: 'text/plain' });
        // Drop targets the full-viewport root — files can enter anywhere
        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: { files: [file] },
        });

        // The file session opens as its own sidebar entry and becomes active
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-anywhere.txt')).toBeDefined();
        });
        expect(screen.queryByTestId('file-list-empty')).toBeNull();
        expect(
            screen.getByTestId('sidebar-file-anywhere.txt').getAttribute('aria-pressed'),
        ).toBe('true');
    });

    it('hides the dashed outline once a file is accepted', async () => {
        render(<FormatterDashboard />);

        expect(screen.getByTestId('drop-outline')).toBeDefined();

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [new File(['content'], 'open.txt', { type: 'text/plain' })],
            },
        });

        // Outline disappears as soon as a file is in the sidebar
        await waitFor(() => {
            expect(screen.queryByTestId('drop-outline')).toBeNull();
        });
    });

    it('gives each accepted file its own sidebar entry, activating the latest drop', async () => {
        render(<FormatterDashboard />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: { files: [new File(['first'], 'one.txt', { type: 'text/plain' })] },
        });
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-one.txt')).toBeDefined();
        });

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: { files: [new File(['second'], 'two.txt', { type: 'text/plain' })] },
        });

        // Two entries; the latest drop is the active one
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-two.txt').getAttribute('aria-pressed')).toBe(
                'true',
            );
        });
        expect(screen.getByTestId('sidebar-file-one.txt').getAttribute('aria-pressed')).toBe(
            'false',
        );
    });

    it('loads every file in a single multi-file drop, not just the first', async () => {
        render(<FormatterDashboard />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['alpha'], 'alpha.txt', { type: 'text/plain' }),
                    new File(['beta'], 'beta.txt', { type: 'text/plain' }),
                    new File(['gamma'], 'gamma.txt', { type: 'text/plain' }),
                ],
            },
        });

        // All three files get their own sidebar entry, in drop order
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-alpha.txt')).toBeDefined();
        });
        expect(screen.getByTestId('sidebar-file-beta.txt')).toBeDefined();
        expect(screen.getByTestId('sidebar-file-gamma.txt')).toBeDefined();

        // The last file in the drop is the active entry
        expect(screen.getByTestId('sidebar-file-gamma.txt').getAttribute('aria-pressed')).toBe(
            'true',
        );
    });

    it('re-dropping an accepted file name replaces its entry instead of duplicating it', async () => {
        render(<FormatterDashboard />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: { files: [new File(['first'], 'one.txt', { type: 'text/plain' })] },
        });
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-one.txt')).toBeDefined();
        });

        // Same name dropped again → still exactly one entry for that name
        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: { files: [new File(['second'], 'one.txt', { type: 'text/plain' })] },
        });

        await waitFor(() => {
            expect(screen.getByTestId('dashboard-footer').textContent).toBe(
                'Formatter Dashboard1 file loaded',
            );
        });
        expect(screen.getAllByTestId('sidebar-file-one.txt')).toHaveLength(1);
    });

    it('selects a sidebar entry on click and highlights it', async () => {
        render(<FormatterDashboard />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['alpha'], 'alpha.txt', { type: 'text/plain' }),
                    new File(['beta'], 'beta.txt', { type: 'text/plain' }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-beta.txt')).toBeDefined();
        });

        // Clicking an earlier entry re-selects it
        fireEvent.click(screen.getByTestId('sidebar-file-alpha.txt'));

        expect(screen.getByTestId('sidebar-file-alpha.txt').getAttribute('aria-pressed')).toBe(
            'true',
        );
        expect(screen.getByTestId('sidebar-file-beta.txt').getAttribute('aria-pressed')).toBe(
            'false',
        );
    });

    it('removes a sidebar entry via its close button and falls back to the latest remaining entry', async () => {
        render(<FormatterDashboard />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['alpha'], 'alpha.txt', { type: 'text/plain' }),
                    new File(['beta'], 'beta.txt', { type: 'text/plain' }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-beta.txt')).toBeDefined();
        });

        // Remove beta (the active entry) → alpha becomes active again
        fireEvent.click(screen.getByTestId('remove-file-beta.txt'));

        await waitFor(() => {
            expect(screen.queryByTestId('sidebar-file-beta.txt')).toBeNull();
        });
        expect(screen.getByTestId('sidebar-file-alpha.txt').getAttribute('aria-pressed')).toBe(
            'true',
        );
    });

    it('intensifies the outline while dragging and calms it on leave', () => {
        render(<FormatterDashboard />);

        fireEvent.dragOver(screen.getByTestId('dashboard-root'));

        expect(screen.getByTestId('drop-outline').textContent).toBe('Drop to add files');

        fireEvent.dragLeave(screen.getByTestId('dashboard-root'));

        expect(screen.getByTestId('drop-outline').textContent).toBe('');
    });

    it('renders the footer with the loaded file count', async () => {
        render(<FormatterDashboard />);

        // Empty session → zero files
        expect(screen.getByTestId('dashboard-footer').textContent).toBe(
            'Formatter Dashboard0 files loaded',
        );

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['alpha'], 'alpha.txt', { type: 'text/plain' }),
                    new File(['beta'], 'beta.txt', { type: 'text/plain' }),
                ],
            },
        });

        await waitFor(() => {
            expect(screen.getByTestId('dashboard-footer').textContent).toBe(
                'Formatter Dashboard2 files loaded',
            );
        });
    });
});
