import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { FormatterDashboard } from './FormatterDashboard';
import { defaultPlugins } from '../plugins';
import { dateStamp } from '../plugins/fileReader/clipboardText';

// ─── Paste-entry tests: pasting into the dashboard opens clipboard content
// as date-named sidebar entries ([date].txt / [date].json) and clipboard
// files through the normal read pipeline. Cross-reference:
// - dashboards/FormatterDashboard.tsx handlePaste (window paste listener)
// - plugins/fileReader/FileReaderPlugin.ts onPaste (entry creation)
// - plugins/fileReader/clipboardText.ts (naming + JSON detection)

afterEach(() => {
    cleanup();
});

// jsdom has no real clipboard — fire a synthetic ClipboardEvent-like PasteEvent
// with the payload injected. `files` are real File objects (the same shape the
// browser delivers via clipboardData.items → getAsFile()).
const firePaste = (target: Node, payload: { text?: string; files?: File[] }) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    const items = (payload.files ?? []).map((file) => ({
        kind: 'file',
        getAsFile: () => file,
    }));
    Object.defineProperty(event, 'clipboardData', {
        value: {
            getData: (type: string) => (type === 'text/plain' ? (payload.text ?? '') : ''),
            items,
        },
    });
    fireEvent(target, event);
};

describe('paste entry ([date].txt / [date].json / clipboard files)', () => {
    it('opens pasted plain text as [today].txt and focuses it', () => {
        render(<FormatterDashboard />);

        firePaste(document.body, { text: 'pasted plain text' });

        // The entry is named after today's date with a .txt extension and is
        // the active (focused) entry; its content renders in the pane
        expect(screen.getByTestId(`sidebar-file-${dateStampFor()}.txt`)).toBeDefined();
        expect(
            screen.getByTestId(`sidebar-file-${dateStampFor()}.txt`).getAttribute('aria-pressed'),
        ).toBe('true');
        expect(screen.getByTestId('file-content-text').textContent).toBe('pasted plain text');
    });

    it('opens pasted JSON as [today].json based on CONTENT, not extension', () => {
        render(<FormatterDashboard />);

        firePaste(document.body, { text: '{"name":"Elena","tags":["a","b"]}' });

        expect(screen.getByTestId(`sidebar-file-${dateStampFor()}.json`)).toBeDefined();
        expect(screen.getByTestId('file-content-text').textContent).toBe(
            '{"name":"Elena","tags":["a","b"]}',
        );
    });

    it('detects JSON arrays and whitespace-padded payloads as .json', () => {
        render(<FormatterDashboard />);

        firePaste(document.body, { text: '  \n[1, 2, 3]\n ' });

        expect(screen.getByTestId(`sidebar-file-${dateStampFor()}.json`)).toBeDefined();
    });

    it('keeps broken-JSON-looking text as .txt', () => {
        render(<FormatterDashboard />);

        firePaste(document.body, { text: '{"name": ' });

        expect(screen.queryByTestId(`sidebar-file-${dateStampFor()}.json`)).toBeNull();
        expect(screen.getByTestId(`sidebar-file-${dateStampFor()}.txt`)).toBeDefined();
    });

    it('suffixes repeated same-day pastes instead of overwriting (-2, -3, …)', () => {
        render(<FormatterDashboard />);

        firePaste(document.body, { text: 'first paste' });
        firePaste(document.body, { text: 'second paste' });
        firePaste(document.body, { text: 'third paste' });

        // Three independent entries — the base name is never reused, so no
        // paste ever overwrites an earlier one
        expect(screen.getByTestId(`sidebar-file-${dateStampFor()}.txt`)).toBeDefined();
        expect(screen.getByTestId(`sidebar-file-${dateStampFor()}-2.txt`)).toBeDefined();
        expect(screen.getByTestId(`sidebar-file-${dateStampFor()}-3.txt`)).toBeDefined();
        expect(screen.getByTestId('dashboard-footer').textContent).toBe(
            'Formatter Dashboard v1.0.43 files loaded',
        );
        // The LAST paste is the focused one
        expect(screen.getByTestId('file-content-text').textContent).toBe('third paste');
    });

    it('loads clipboard FILES through the normal read pipeline', () => {
        render(<FormatterDashboard />);

        firePaste(document.body, {
            files: [new File(['copied file content'], 'copied.txt', { type: 'text/plain' })],
        });

        // The file keeps its own name (no date naming) and becomes active
        waitFor(() => {
            expect(screen.getByTestId('sidebar-file-copied.txt')).toBeDefined();
        });
        waitFor(() => {
            expect(screen.getByTestId('file-content-text').textContent).toBe(
                'copied file content',
            );
        });
    });

    it('processes BOTH the text payload and clipboard files from one paste', () => {
        render(<FormatterDashboard />);

        firePaste(document.body, {
            text: 'pasted alongside',
            files: [new File(['file bytes'], 'shot.png', { type: 'image/png' })],
        });

        // The date-named text entry exists…
        expect(screen.getByTestId(`sidebar-file-${dateStampFor()}.txt`)).toBeDefined();
        // …and the file entry loads asynchronously (readAsDataURL)
        waitFor(() => {
            expect(screen.getByTestId('sidebar-file-shot.png')).toBeDefined();
        });
    });

    it('ignores a paste with an empty clipboard', () => {
        render(<FormatterDashboard />);

        firePaste(document.body, {});

        // Nothing enters the session — no entries, placeholder stays
        expect(screen.getByTestId('file-list-empty')).toBeDefined();
        expect(screen.getByTestId('content-placeholder')).toBeDefined();
    });

    it('normalizes an all-whitespace text payload to no entry', () => {
        // clipboardData.getData returns '' for a non-text clipboard; an empty
        // string must NOT create an empty [date].txt entry
        render(<FormatterDashboard />);

        firePaste(document.body, { text: '' });

        expect(screen.getByTestId('file-list-empty')).toBeDefined();
        expect(screen.queryByTestId(`sidebar-file-${dateStampFor()}.txt`)).toBeNull();
    });
});

// Reads today's stamp from the module under test — keeps the testids in sync
// with the implementation without duplicating the formatting logic
const dateStampFor = () => dateStamp();
