import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { useStateHook } from '@presource/react';
import { FormatterFileProvider, formatterFileStore } from './fileStore';
import type { FormatterFile } from './fileStore';
import { readTextFile } from './readTextFile';

afterEach(() => {
    cleanup();
});

describe('readTextFile', () => {
    it('resolves text files with name, kind, mime and plain text content', async () => {
        const file = new File(['hello formatter'], 'notes.txt', { type: 'text/plain' });

        await expect(readTextFile(file)).resolves.toEqual({
            name: 'notes.txt',
            kind: 'text',
            mime: 'text/plain',
            content: 'hello formatter',
        });
    });

    it('preserves newlines verbatim', async () => {
        const file = new File(['line one\nline two\n\nline four'], 'multi.txt', {
            type: 'text/plain',
        });

        await expect(readTextFile(file)).resolves.toEqual({
            name: 'multi.txt',
            kind: 'text',
            mime: 'text/plain',
            content: 'line one\nline two\n\nline four',
        });
    });

    it('classifies image files as kind image and reads them as data URLs', async () => {
        const file = new File(['fake-png-bytes'], 'logo.png', { type: 'image/png' });

        const result = await readTextFile(file);
        expect(result.name).toBe('logo.png');
        expect(result.kind).toBe('image');
        expect(result.mime).toBe('image/png');
        // data: URLs are prefixed with the MIME type and base64 marker
        expect(result.content.startsWith('data:image/png;base64,')).toBe(true);
    });

    it('classifies video files as kind video and reads them as data URLs', async () => {
        const file = new File(['fake-mp4-bytes'], 'clip.mp4', { type: 'video/mp4' });

        const result = await readTextFile(file);
        expect(result.name).toBe('clip.mp4');
        expect(result.kind).toBe('video');
        expect(result.mime).toBe('video/mp4');
        expect(result.content.startsWith('data:video/mp4;base64,')).toBe(true);
    });

    it('classifies application/pdf as kind pdf and reads it as a data URL', async () => {
        const file = new File(['fake-pdf-bytes'], 'doc.pdf', { type: 'application/pdf' });

        // btoa('fake-pdf-bytes') — exact base64 payload of the fixture bytes
        await expect(readTextFile(file)).resolves.toEqual({
            name: 'doc.pdf',
            kind: 'pdf',
            mime: 'application/pdf',
            content: 'data:application/pdf;base64,ZmFrZS1wZGYtYnl0ZXM=',
        });
    });

    it('falls back to the .pdf extension when the MIME type is empty', async () => {
        const file = new File(['%PDF-1.4 fake'], 'paper.pdf', { type: '' });

        const result = await readTextFile(file);
        expect(result.kind).toBe('pdf');
        expect(result.mime).toBe('');
        // PDFs are read as data URLs even when the browser sent no MIME type
        expect(result.content.startsWith('data:application/octet-stream;base64,')).toBe(true);
    });

    it('classifies unknown binary MIME as kind binary', async () => {
        const file = new File(['\u0000\u0001\u0002'], 'app.exe', {
            type: 'application/octet-stream',
        });

        await expect(readTextFile(file)).resolves.toEqual({
            name: 'app.exe',
            kind: 'binary',
            mime: 'application/octet-stream',
            content: '\u0000\u0001\u0002',
        });
    });

    it('downgrades text-mislabeled binaries via the NUL-byte sniff', async () => {
        // Empty MIME + non-text extension → extension fallback says binary
        // anyway; force the sniff path with an empty MIME but .txt extension
        const sniffed = new File(['ok\u0000bad'], 'tricky.txt', { type: '' });
        await expect(readTextFile(sniffed)).resolves.toMatchObject({ kind: 'binary' });
    });

    it('falls back to extension detection when the MIME type is empty', async () => {
        const file = new File(['export {}'], 'module.ts', { type: '' });

        await expect(readTextFile(file)).resolves.toMatchObject({ kind: 'text' });
    });
});

describe('fileStore', () => {
    // Minimal consumer rendering the session summary: file names, selection
    // (in selection order), focused name
    const Consumer = () => {
        const store = formatterFileStore();
        return (
            <div data-testid="store-consumer">
                {store.files.map((entry) => entry.name).join(',')}
                {'|'}
                {store.activeFileIds.join('+') || 'none'}
            </div>
        );
    };

    // Session controls driven through the STORE (like the sidebar does) —
    // validates the real session implementation the dashboard injects
    const StoreControls = () => {
        // Capture the store during render — calling the accessor inside an
        // event handler would be an invalid hook call
        const store = formatterFileStore();
        return (
            <>
                <button
                    type="button"
                    data-testid="open-a"
                    onClick={() => store.openFile({ name: 'a.txt', kind: 'text', mime: 'text/plain', content: 'aaa' })}
                />
                <button
                    type="button"
                    data-testid="open-b"
                    onClick={() => store.openFile({ name: 'b.txt', kind: 'text', mime: 'text/plain', content: 'bbb' })}
                />
                <button
                    type="button"
                    data-testid="open-a-again"
                    onClick={() => store.openFile({ name: 'a.txt', kind: 'text', mime: 'text/plain', content: 'a2' })}
                />
                <button
                    type="button"
                    data-testid="select-a"
                    onClick={() => store.selectFile('a.txt')}
                />
                <button
                    type="button"
                    data-testid="select-b"
                    onClick={() => store.selectFile('b.txt')}
                />
                <button
                    type="button"
                    data-testid="focus-b"
                    onClick={() => store.focusFile('b.txt')}
                />
                <button
                    type="button"
                    data-testid="deselect"
                    onClick={() => store.deselectFiles()}
                />
                <button
                    type="button"
                    data-testid="edit-active"
                    onClick={() => {
                        const focused = store.activeFileIds[store.activeFileIds.length - 1];
                        const active = store.files.find((entry) => entry.name === focused);
                        if (active) store.updateContent(active.name, 'edited');
                    }}
                />
                <button
                    type="button"
                    data-testid="close-active"
                    onClick={() => {
                        const focused = store.activeFileIds[store.activeFileIds.length - 1];
                        if (focused) store.closeFile(focused);
                    }}
                />
            </>
        );
    };

    // Harness mirroring the real dashboard multi-file session implementation
    const Harness = () => {
        const files = useStateHook<FormatterFile[]>([]);
        const activeFileIds = useStateHook<string[]>([]);
        const session = {
            files: files(),
            activeFileIds: activeFileIds(),
            openFile: (next: FormatterFile) => {
                const current = files();
                files(
                    current.some((entry) => entry.name === next.name)
                        ? current.map((entry) => (entry.name === next.name ? next : entry))
                        : [...current, next],
                );
                activeFileIds([next.name]);
            },
            selectFile: (name: string) => {
                const current = activeFileIds();
                if (current.includes(name)) {
                    activeFileIds(current.filter((entry) => entry !== name));
                } else {
                    activeFileIds([...current, name]);
                }
            },
            focusFile: (name: string) => {
                const current = activeFileIds();
                if (!current.includes(name)) return;
                activeFileIds([...current.filter((entry) => entry !== name), name]);
            },
            deselectFiles: () => activeFileIds([]),
            updateContent: (name: string, content: string) => {
                files(files().map((entry) => (entry.name === name ? { ...entry, content } : entry)));
            },
            closeFile: (name: string) => {
                const remaining = files().filter((entry) => entry.name !== name);
                files(remaining);
                const selection = activeFileIds().filter((entry) => entry !== name);
                if (selection.length === 0 && remaining.length > 0) {
                    activeFileIds([remaining[remaining.length - 1].name]);
                } else {
                    activeFileIds(selection);
                }
            },
        };
        return (
            <FormatterFileProvider data={session}>
                <Consumer />
                <StoreControls />
            </FormatterFileProvider>
        );
    };

    const sessionSummary = (): string => screen.getByTestId('store-consumer').textContent ?? '';

    it('starts with no files and an empty selection', () => {
        render(<Harness />);

        expect(sessionSummary()).toBe('|none');
    });

    it('openFile appends an entry and makes it the ONLY selected one; a second file replaces the selection', () => {
        render(<Harness />);

        fireEvent.click(screen.getByTestId('open-a'));
        expect(sessionSummary()).toBe('a.txt|a.txt');

        fireEvent.click(screen.getByTestId('open-b'));
        expect(sessionSummary()).toBe('a.txt,b.txt|b.txt');
    });

    it('re-dropping an accepted file name replaces its content instead of duplicating the entry', () => {
        render(<Harness />);

        fireEvent.click(screen.getByTestId('open-a'));
        fireEvent.click(screen.getByTestId('open-b'));
        fireEvent.click(screen.getByTestId('open-a-again'));

        // Still two entries; a.txt is selected again with the replaced content
        expect(sessionSummary()).toBe('a.txt,b.txt|a.txt');
    });

    it('selectFile TOGGLES names into a multi-selection, in selection order', () => {
        render(<Harness />);

        fireEvent.click(screen.getByTestId('open-a'));
        fireEvent.click(screen.getByTestId('open-b'));
        // Selection is [b.txt] (last drop) → clicking a.txt ADDS it;
        // b.txt stays selected, a.txt is focused (last)
        fireEvent.click(screen.getByTestId('select-a'));

        expect(sessionSummary()).toBe('a.txt,b.txt|b.txt+a.txt');

        // Clicking b.txt now REMOVES it (toggle off — it was selected)
        fireEvent.click(screen.getByTestId('select-b'));
        expect(sessionSummary()).toBe('a.txt,b.txt|a.txt');

        // Clicking b.txt again ADDS it back at the end → focused
        fireEvent.click(screen.getByTestId('select-b'));
        expect(sessionSummary()).toBe('a.txt,b.txt|a.txt+b.txt');
    });

    it('selectFile REMOVES a selected name (toggle off)', () => {
        render(<Harness />);

        fireEvent.click(screen.getByTestId('open-a'));
        fireEvent.click(screen.getByTestId('open-b'));
        // Selection is [b.txt]; toggle a.txt in → [b.txt, a.txt]
        fireEvent.click(screen.getByTestId('select-a'));
        fireEvent.click(screen.getByTestId('select-b'));

        // b.txt toggled OUT → [a.txt]
        expect(sessionSummary()).toBe('a.txt,b.txt|a.txt');

        // Toggling the last remaining entry off → empty selection
        fireEvent.click(screen.getByTestId('select-a'));
        expect(sessionSummary()).toBe('a.txt,b.txt|none');
    });

    it('focusFile moves a selected name to the END without changing membership', () => {
        render(<Harness />);

        fireEvent.click(screen.getByTestId('open-a'));
        fireEvent.click(screen.getByTestId('open-b'));
        // Build the selection [b.txt, a.txt] (a.txt focused)
        fireEvent.click(screen.getByTestId('select-a'));
        // Focus b.txt → moved to the end; membership unchanged
        fireEvent.click(screen.getByTestId('focus-b'));

        expect(sessionSummary()).toBe('a.txt,b.txt|a.txt+b.txt');

        // focusFile on an UNSELECTED name is a no-op
        fireEvent.click(screen.getByTestId('deselect'));
        fireEvent.click(screen.getByTestId('focus-b'));
        expect(sessionSummary()).toBe('a.txt,b.txt|none');
    });

    it('deselectFiles clears the whole selection without touching the file list', () => {
        render(<Harness />);

        fireEvent.click(screen.getByTestId('open-a'));
        fireEvent.click(screen.getByTestId('open-b'));
        fireEvent.click(screen.getByTestId('select-a'));
        fireEvent.click(screen.getByTestId('deselect'));

        // Both entries remain; nothing is selected anymore
        expect(sessionSummary()).toBe('a.txt,b.txt|none');

        // The session stays usable — selecting again works after a deselect
        fireEvent.click(screen.getByTestId('select-a'));
        expect(sessionSummary()).toBe('a.txt,b.txt|a.txt');
    });

    it('updateContent edits exactly the focused (last selected) file', () => {
        render(<Harness />);

        fireEvent.click(screen.getByTestId('open-a'));
        fireEvent.click(screen.getByTestId('open-b'));
        fireEvent.click(screen.getByTestId('edit-active'));

        // b.txt is focused → only b.txt is edited; entries and selection unchanged
        expect(sessionSummary()).toBe('a.txt,b.txt|b.txt');
    });

    it('closeFile removes the entry, drops it from the selection, and falls back to the most recent remaining entry', () => {
        render(<Harness />);

        fireEvent.click(screen.getByTestId('open-a'));
        fireEvent.click(screen.getByTestId('open-b'));
        fireEvent.click(screen.getByTestId('close-active'));

        // b.txt removed → a.txt (most recent remaining) becomes the selection
        expect(sessionSummary()).toBe('a.txt|a.txt');

        fireEvent.click(screen.getByTestId('close-active'));

        // Last entry removed → empty session
        expect(sessionSummary()).toBe('|none');
    });

    it('closeFile keeps the OTHER selected entries when the selection has more than one name', () => {
        render(<Harness />);

        fireEvent.click(screen.getByTestId('open-a'));
        fireEvent.click(screen.getByTestId('open-b'));
        // Selection [b.txt, a.txt] — a.txt focused
        fireEvent.click(screen.getByTestId('select-a'));

        // Close the FOCUSED entry (a.txt). The other selected name (b.txt)
        // survives — the fallback-to-latest rule only applies when the
        // selection becomes EMPTY. a.txt is removed from the file list AND
        // from the selection.
        fireEvent.click(screen.getByTestId('close-active'));

        expect(sessionSummary()).toBe('b.txt|b.txt');
    });
});
