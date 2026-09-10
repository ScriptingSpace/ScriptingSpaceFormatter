import { describe, it, expect } from 'vitest';
import { dateStamp, isJsonText, clipboardFileName } from './clipboardText';

// Deterministic dates — every test pins the clock instead of relying on the
// real system date
const noon = (isoDate: string) => new Date(`${isoDate}T12:00:00`);

describe('dateStamp', () => {
    it('formats a local date as zero-padded YYYY-MM-DD', () => {
        expect(dateStamp(noon('2026-09-11'))).toBe('2026-09-11');
    });

    it('zero-pads single-digit months and days', () => {
        expect(dateStamp(noon('2026-03-05'))).toBe('2026-03-05');
    });

    it('defaults to the current date', () => {
        // Run once with the real clock — assert only the SHAPE here (the
        // deterministic variants above cover the exact formatting)
        expect(dateStamp()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});

describe('isJsonText', () => {
    it('detects a JSON object payload', () => {
        expect(isJsonText('{"name":"Elena","age":30}')).toBe(true);
    });

    it('detects a JSON array payload', () => {
        expect(isJsonText('[1, 2, 3]')).toBe(true);
    });

    it('tolerates surrounding whitespace', () => {
        expect(isJsonText('  \n{"ok": true}\n  ')).toBe(true);
    });

    it('treats plain text as non-JSON', () => {
        expect(isJsonText('hello world')).toBe(false);
    });

    it('treats a bare scalar JSON value as non-JSON (stays .txt)', () => {
        // `5` / `"hello"` / `true` are valid JSON but pasting a bare number
        // reads better as plain text — objects/arrays only
        expect(isJsonText('5')).toBe(false);
        expect(isJsonText('"hello"')).toBe(false);
        expect(isJsonText('true')).toBe(false);
        expect(isJsonText('null')).toBe(false);
    });

    it('treats broken JSON that looks like JSON as non-JSON (stays .txt)', () => {
        expect(isJsonText('{"name": ')).toBe(false);
        expect(isJsonText('[1, 2')).toBe(false);
    });
});

describe('clipboardFileName', () => {
    it('returns [date].txt for the first paste of the day', () => {
        expect(clipboardFileName('txt', [], '2026-09-11')).toBe('2026-09-11.txt');
    });

    it('returns [date].json when the paste is JSON', () => {
        expect(clipboardFileName('json', [], '2026-09-11')).toBe('2026-09-11.json');
    });

    it('suffices with -2 for a second paste of the same day and kind', () => {
        expect(clipboardFileName('txt', ['2026-09-11.txt'], '2026-09-11')).toBe(
            '2026-09-11-2.txt',
        );
    });

    it('walks the counter past existing suffixes', () => {
        expect(
            clipboardFileName('txt', ['2026-09-11.txt', '2026-09-11-2.txt', '2026-09-11-3.txt'], '2026-09-11'),
        ).toBe('2026-09-11-4.txt');
    });

    it('keeps .txt and .json counters independent', () => {
        // A .json paste does not collide with existing .txt entries of the
        // same day (and vice versa)
        expect(clipboardFileName('json', ['2026-09-11.txt', '2026-09-11-2.txt'], '2026-09-11')).toBe(
            '2026-09-11.json',
        );
        expect(clipboardFileName('txt', ['2026-09-11.json'], '2026-09-11')).toBe('2026-09-11.txt');
    });

    it('ignores names from other days', () => {
        expect(clipboardFileName('txt', ['2026-09-10.txt'], '2026-09-11')).toBe('2026-09-11.txt');
    });
});
