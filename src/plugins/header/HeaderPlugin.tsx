import { styledComponent } from '@presource/react';
import type { DashboardPlugin } from '../core';

// Header identity block — assigns the dashboard title + subtitle into the
// header slot. flex:1 pushes any later header-slot assignment (the export
// button from plugins/exportPdf) to the RIGHT edge of the header row.
const HeaderIdentity = styledComponent('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    flex: 1,
    minWidth: 0,
});

const HeaderTitle = styledComponent('h1', {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: '#f8fafc',
});

const HeaderSubtitle = styledComponent('p', {
    margin: 0,
    fontSize: 13,
    color: '#94a3b8',
});

// HEADER PLUGIN — the only contributor to the header slot in the default
// sequence that renders the identity block; the Export PDF button comes from
// its own plugin (plugins/exportPdf) so header areas stay independently
// assignable.
export const headerPlugin: DashboardPlugin = {
    id: 'header',
    slots: {
        header: (
            <HeaderIdentity>
                <HeaderTitle>Formatter Dashboard</HeaderTitle>
                <HeaderSubtitle>
                    Drop files anywhere — they are collected in the sidebar.
                </HeaderSubtitle>
            </HeaderIdentity>
        ),
    },
};
