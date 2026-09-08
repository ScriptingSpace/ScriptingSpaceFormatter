import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { FileSidebar } from './FileSidebar';
import type { FormatterFile } from '../functions';

afterEach(() => {
    cleanup();
});

// Two-file fixture in drop order — a.txt is the active entry
const FILES: FormatterFile[] = [
    { name: 'a.txt', kind: 'text', mime: 'text/plain', content: 'aaa' },
    { name: 'b.txt', kind: 'text', mime: 'text/plain', content: 'bbb' },
];

// Spy helpers recording select/close invocations from the component
const makeSpies = () => {
    const calls: string[] = [];
    return {
        calls,
        onSelect: (name: string) => calls.push(`select:${name}`),
        onClose: (name: string) => calls.push(`close:${name}`),
    };
};

describe('FileSidebar', () => {
    it('shows the empty-state hint when no files have been accepted', () => {
        render(<FileSidebar files={[]} activeFileId={null} onSelect={() => {}} onClose={() => {}} />);

        // Header has no count suffix when the list is empty
        expect(screen.getByTestId('file-sidebar').textContent).toBe(
            'FilesNo files yet — drop files anywhere on the page to add them here.',
        );
        expect(screen.queryByTestId('sidebar-file-a.txt')).toBeNull();
    });

    it('renders one entry per accepted file, in drop order', () => {
        const spies = makeSpies();
        render(
            <FileSidebar
                files={FILES}
                activeFileId="a.txt"
                onSelect={spies.onSelect}
                onClose={spies.onClose}
            />,
        );

        // Header shows the file count
        expect(screen.getByText('Files (2)')).toBeDefined();
        // One entry per file in drop order (matched by testid prefix — the ×
        // close buttons are also role="button", so role queries would over-match)
        const entries = screen.getAllByTestId(/^sidebar-file-/);
        expect(entries.map((entry) => entry.textContent)).toEqual(['a.txt×', 'b.txt×']);
    });

    it('marks only the active entry as selected', () => {
        render(
            <FileSidebar files={FILES} activeFileId="b.txt" onSelect={() => {}} onClose={() => {}} />,
        );

        expect(screen.getByTestId('sidebar-file-a.txt').getAttribute('aria-pressed')).toBe('false');
        expect(screen.getByTestId('sidebar-file-b.txt').getAttribute('aria-pressed')).toBe('true');
    });

    it('selects a file when its entry is clicked', () => {
        const spies = makeSpies();
        render(
            <FileSidebar
                files={FILES}
                activeFileId="a.txt"
                onSelect={spies.onSelect}
                onClose={spies.onClose}
            />,
        );

        fireEvent.click(screen.getByTestId('sidebar-file-b.txt'));

        expect(spies.calls).toEqual(['select:b.txt']);
    });

    it('removes a file via its close button without selecting it', () => {
        const spies = makeSpies();
        render(
            <FileSidebar
                files={FILES}
                activeFileId="a.txt"
                onSelect={spies.onSelect}
                onClose={spies.onClose}
            />,
        );

        fireEvent.click(screen.getByTestId('remove-file-b.txt'));

        // The × stops propagation — only close fires, never select
        expect(spies.calls).toEqual(['close:b.txt']);
    });

    it('selects a file via keyboard (Enter / Space)', () => {
        const spies = makeSpies();
        render(
            <FileSidebar
                files={FILES}
                activeFileId={null}
                onSelect={spies.onSelect}
                onClose={spies.onClose}
            />,
        );

        const entry = screen.getByTestId('sidebar-file-a.txt');
        fireEvent.keyDown(entry, { key: 'Enter' });
        fireEvent.keyDown(entry, { key: ' ' });

        expect(spies.calls).toEqual(['select:a.txt', 'select:a.txt']);
    });
});
