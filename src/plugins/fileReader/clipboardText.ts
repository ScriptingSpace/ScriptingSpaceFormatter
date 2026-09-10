// CLIPBOARD TEXT → FILE NAMING HELPERS
// Used by the file-reader plugin's `onPaste` hook (FileReaderPlugin.ts) to
// turn pasted clipboard text into a sidebar entry named after TODAY's date:
// - plain text        → [date].txt   (e.g. 2026-09-11.txt)
// - structured JSON   → [date].json  (an object or array — bare scalars
//   like `5` or `"hello"` are valid JSON but read better as plain text)
// A repeated paste on the same day never overwrites the earlier entry: the
// name gets an incrementing suffix ([date]-2.txt, [date]-3.txt, …).

// Local-date stamp formatted as zero-padded YYYY-MM-DD (e.g. 2026-09-11).
// `now` is injectable so tests are deterministic — production calls it with
// no arguments (cross-reference: clipboardText.test.ts passes fixed dates).
export const dateStamp = (now = new Date()): string => {
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
};

// Detects whether pasted text is STRUCTURED JSON (an object or array).
// Whitespace around the payload is tolerated. Bare scalar JSON (`5`,
// `"hello"`, `true`, `null`) deliberately does NOT count — pasting a bare
// number should stay a .txt entry. Broken JSON that merely LOOKS like JSON
// (`{"name": `) also falls back to .txt.
export const isJsonText = (text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
    try {
        JSON.parse(trimmed);
        return true;
    } catch {
        return false;
    }
};

// Builds the pasted-entry file name for one clipboard paste:
// `[stamp].[extension]` when free, otherwise `[stamp]-2`, `[stamp]-3`, …
// until an unused name is found. `existingNames` are the names already in
// the session (store.files); `stamp` is injectable for deterministic tests.
export const clipboardFileName = (
    extension: string,
    existingNames: string[],
    stamp = dateStamp(),
): string => {
    const base = `${stamp}.${extension}`;
    if (!existingNames.includes(base)) return base;
    // Base name taken → walk the counter until a free name appears
    let counter = 2;
    while (existingNames.includes(`${stamp}-${counter}.${extension}`)) counter += 1;
    return `${stamp}-${counter}.${extension}`;
};
