import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
import { renderWithProviders } from './renderWith';
import { Routes, Route } from 'react-router-dom';
import { USERS, EMPTY_LIST, EMPTY_NOTIFICATIONS, EMPTY_REPORT } from './mocks/fixtures';
import { AppShell } from '../components/AppShell';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { CasesPage } from '../pages/CasesPage';

function loginAsLawyer() {
  localStorage.setItem('accessToken', 'token');
  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json({ data: USERS.lawyer })),
    http.get('/api/v1/notifications', () => HttpResponse.json(EMPTY_NOTIFICATIONS)),
    http.get('/api/v1/reports/my', () => HttpResponse.json(EMPTY_REPORT)),
    http.get('/api/v1/cases', () => HttpResponse.json(EMPTY_LIST)),
  );
}

function renderApp() {
  return renderWithProviders(
    <Routes>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="cases" element={<CasesPage />} />
        </Route>
      </Route>
    </Routes>,
    { route: '/cases' },
  );
}

describe('Mobile sidebar', () => {
  beforeEach(() => {
    localStorage.clear();
    loginAsLawyer();
  });

  it('renders hamburger menu button', async () => {
    renderApp();

    await waitFor(() => {
      // Menu button exists (md:hidden but still in DOM)
      const buttons = screen.getAllByRole('button');
      const menuBtn = buttons.find((b) => b.querySelector('svg.lucide-menu'));
      expect(menuBtn).toBeDefined();
    });
  });

  it('sidebar drawer opens on hamburger click', async () => {
    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Контрагенты')).toBeInTheDocument();
    });

    // Find and click the menu button
    const buttons = screen.getAllByRole('button');
    const menuBtn = buttons.find((b) => b.querySelector('svg.lucide-menu'));
    fireEvent.click(menuBtn!);

    // Drawer should show a second set of nav items (mobile overlay)
    await waitFor(() => {
      const allContragents = screen.getAllByText('Контрагенты');
      expect(allContragents.length).toBeGreaterThanOrEqual(2); // desktop + mobile
    });
  });

  it('sidebar drawer closes on X button click', async () => {
    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Контрагенты')).toBeInTheDocument();
    });

    // Open drawer
    const buttons = screen.getAllByRole('button');
    const menuBtn = buttons.find((b) => b.querySelector('svg.lucide-menu'));
    fireEvent.click(menuBtn!);

    await waitFor(() => {
      expect(screen.getAllByText('Контрагенты').length).toBeGreaterThanOrEqual(2);
    });

    // Find X button (inside mobile drawer)
    const closeBtn = screen.getAllByRole('button').find((b) => b.querySelector('svg.lucide-x'));
    expect(closeBtn).toBeDefined();
    fireEvent.click(closeBtn!);

    // Drawer should close — back to single set
    await waitFor(() => {
      expect(screen.getAllByText('Контрагенты').length).toBe(1);
    });
  });

  it('sidebar drawer closes on backdrop click', async () => {
    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Контрагенты')).toBeInTheDocument();
    });

    // Open drawer
    const buttons = screen.getAllByRole('button');
    const menuBtn = buttons.find((b) => b.querySelector('svg.lucide-menu'));
    fireEvent.click(menuBtn!);

    await waitFor(() => {
      expect(screen.getAllByText('Контрагенты').length).toBeGreaterThanOrEqual(2);
    });

    // Click backdrop (the bg-black/40 div)
    const backdrop = document.querySelector('.bg-black\\/40');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);

    await waitFor(() => {
      expect(screen.getAllByText('Контрагенты').length).toBe(1);
    });
  });

  it('desktop sidebar is always in DOM (hidden via CSS)', async () => {
    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Контрагенты')).toBeInTheDocument();
    });

    // Desktop sidebar has class "hidden md:flex"
    const asides = document.querySelectorAll('aside');
    const desktopSidebar = Array.from(asides).find((a) => a.classList.contains('md:flex'));
    expect(desktopSidebar).toBeTruthy();
  });
});
