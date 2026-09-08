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

// Spy helpers recording select/close/move invocations from the component
const makeSpies = () => {
    const calls: string[] = [];
    return {
        calls,
        onSelect: (name: string) => calls.push(`select:${name}`),
        onClose: (name: string) => calls.push(`close:${name}`),
        onMove: (from: string, toIndex: number) => calls.push(`move:${from}->${toIndex}`),
    };
};

describe('FileSidebar', () => {
    it('shows the empty-state hint when no files have been accepted', () => {
        render(<FileSidebar files={[]} activeFileId={null} onSelect={() => {}} onClose={() => {}} onMove={() => {}} />);

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
                onMove={spies.onMove}
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
            <FileSidebar files={FILES} activeFileId="b.txt" onSelect={() => {}} onClose={() => {}} onMove={() => {}} />,
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
                onMove={spies.onMove}
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
                onMove={spies.onMove}
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
                onMove={spies.onMove}
            />,
        );

        const entry = screen.getByTestId('sidebar-file-a.txt');
        fireEvent.keyDown(entry, { key: 'Enter' });
        fireEvent.keyDown(entry, { key: ' ' });

        expect(spies.calls).toEqual(['select:a.txt', 'select:a.txt']);
    });

    // Minimal dataTransfer stub — jsdom does not implement the DataTransfer
    // interface; only setData is exercised by the drag handlers
    const makeDataTransfer = () => {
        const stored: Record<string, string> = {};
        return {
            setData: (type: string, value: string) => {
                stored[type] = value;
            },
            getData: (type: string) => stored[type] ?? '',
            effectAllowed: 'all',
            dropEffect: 'none',
        };
    };

    // jsdom has NO DragEvent implementation — @testing-library falls back to
    // a plain Event whose init drops clientY/relatedTarget. These helpers
    // dispatch raw events with those fields injected so the pointer-position
    // logic in the drag handlers is testable. (clientY < 0 simulates the top
    // half of an entry; clientY >= 0 the bottom half — jsdom rects are all 0.)
    const fireDragOver = (target: HTMLElement, clientY: number) => {
        const event = new Event('dragover', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'clientY', { value: clientY });
        Object.defineProperty(event, 'dataTransfer', { value: makeDataTransfer() });
        fireEvent(target, event);
    };

    const fireListDragLeave = (list: HTMLElement, relatedTarget: Node | null) => {
        const event = new Event('dragleave', { bubbles: true, cancelable: false });
        Object.defineProperty(event, 'relatedTarget', { value: relatedTarget });
        fireEvent(list, event);
    };

    it('marks every entry as draggable for re-ordering', () => {
        render(
            <FileSidebar
                files={FILES}
                activeFileId={null}
                onSelect={() => {}}
                onClose={() => {}}
                onMove={() => {}}
            />,
        );

        expect(screen.getByTestId('sidebar-file-a.txt').getAttribute('draggable')).toBe('true');
        expect(screen.getByTestId('sidebar-file-b.txt').getAttribute('draggable')).toBe('true');
    });

    it('shows the insertion line below the hovered entry and fires onMove with the slot index', () => {
        const spies = makeSpies();
        render(
            <FileSidebar
                files={FILES}
                activeFileId={null}
                onSelect={spies.onSelect}
                onClose={spies.onClose}
                onMove={spies.onMove}
            />,
        );

        const source = screen.getByTestId('sidebar-file-a.txt');
        const target = screen.getByTestId('sidebar-file-b.txt');

        // Start dragging a.txt, hover the BOTTOM half of b.txt → the line
        // inserts AFTER b.txt (slot index 2)
        fireEvent.dragStart(source, { dataTransfer: makeDataTransfer() });
        fireDragOver(target, 10);

        // Line is the LAST child of the list — after both entries
        const list = screen.getByTestId('file-list');
        const line = screen.getByTestId('drop-line');
        expect(list.children[list.children.length - 1]).toBe(line);

        // Drop → onMove(from=a.txt, toIndex=2) and the line clears
        fireEvent.drop(target, { dataTransfer: makeDataTransfer() });
        expect(spies.calls).toEqual(['move:a.txt->2']);
        expect(screen.queryByTestId('drop-line')).toBeNull();
    });

    it('shows the insertion line above the hovered entry when the pointer is on its top half', () => {
        const spies = makeSpies();
        render(
            <FileSidebar
                files={FILES}
                activeFileId={null}
                onSelect={spies.onSelect}
                onClose={spies.onClose}
                onMove={spies.onMove}
            />,
        );

        const source = screen.getByTestId('sidebar-file-b.txt');
        const target = screen.getByTestId('sidebar-file-a.txt');

        // Drag b.txt onto the TOP half of a.txt (clientY < 0 beats the
        // zero-sized rect midpoint) → the line inserts BEFORE a.txt (slot 0)
        fireEvent.dragStart(source, { dataTransfer: makeDataTransfer() });
        fireDragOver(target, -5);

        // Line is the FIRST child of the list — before both entries
        const list = screen.getByTestId('file-list');
        expect(list.children[0].getAttribute('data-testid')).toBe('drop-line');

        fireEvent.drop(target, { dataTransfer: makeDataTransfer() });
        expect(spies.calls).toEqual(['move:b.txt->0']);
    });

    it('shows no line and fires nothing when the drop would not change the order', () => {
        const spies = makeSpies();
        render(
            <FileSidebar
                files={FILES}
                activeFileId={null}
                onSelect={spies.onSelect}
                onClose={spies.onClose}
                onMove={spies.onMove}
            />,
        );

        // Dragging a.txt onto the TOP half of b.txt = its own current slot
        // (index 1) — a no-op, so no line may render and no move may fire
        fireEvent.dragStart(screen.getByTestId('sidebar-file-a.txt'), {
            dataTransfer: makeDataTransfer(),
        });
        fireDragOver(screen.getByTestId('sidebar-file-b.txt'), -5);
        expect(screen.queryByTestId('drop-line')).toBeNull();

        fireEvent.drop(screen.getByTestId('sidebar-file-b.txt'), {
            dataTransfer: makeDataTransfer(),
        });
        expect(spies.calls).toEqual([]);
    });

    it('ignores drops back onto the entry being dragged', () => {
        const spies = makeSpies();
        render(
            <FileSidebar
                files={FILES}
                activeFileId={null}
                onSelect={spies.onSelect}
                onClose={spies.onClose}
                onMove={spies.onMove}
            />,
        );

        const entry = screen.getByTestId('sidebar-file-a.txt');

        // Both halves of the entry itself resolve to no-op slots
        fireEvent.dragStart(entry, { dataTransfer: makeDataTransfer() });
        fireDragOver(entry, -5);
        fireDragOver(entry, 10);
        expect(screen.queryByTestId('drop-line')).toBeNull();
        fireEvent.drop(entry, { dataTransfer: makeDataTransfer() });

        expect(spies.calls).toEqual([]);
    });

    it('clears the line when the drag is cancelled (dragend without drop)', () => {
        const spies = makeSpies();
        render(
            <FileSidebar
                files={FILES}
                activeFileId={null}
                onSelect={spies.onSelect}
                onClose={spies.onClose}
                onMove={spies.onMove}
            />,
        );

        const source = screen.getByTestId('sidebar-file-a.txt');
        const target = screen.getByTestId('sidebar-file-b.txt');

        // Line appears, then the drag ends without a drop — the line must
        // clear and a later stale drop fires nothing
        fireEvent.dragStart(source, { dataTransfer: makeDataTransfer() });
        fireDragOver(target, 10);
        expect(screen.getByTestId('drop-line')).toBeDefined();
        fireEvent.dragEnd(source);
        expect(screen.queryByTestId('drop-line')).toBeNull();

        fireEvent.drop(target, { dataTransfer: makeDataTransfer() });
        expect(spies.calls).toEqual([]);
    });

    it('clears the line when the drag leaves the file list', () => {
        render(
            <FileSidebar
                files={FILES}
                activeFileId={null}
                onSelect={() => {}}
                onClose={() => {}}
                onMove={() => {}}
            />,
        );

        const source = screen.getByTestId('sidebar-file-a.txt');
        const target = screen.getByTestId('sidebar-file-b.txt');
        const list = screen.getByTestId('file-list');

        fireEvent.dragStart(source, { dataTransfer: makeDataTransfer() });
        fireDragOver(target, 10);
        expect(screen.getByTestId('drop-line')).toBeDefined();

        // Related target INSIDE the list (bubbling child leave) → keep line
        fireListDragLeave(list, target);
        expect(screen.getByTestId('drop-line')).toBeDefined();

        // Related target OUTSIDE the list → the pointer truly left → clear
        fireListDragLeave(list, document.body);
        expect(screen.queryByTestId('drop-line')).toBeNull();
    });
});
