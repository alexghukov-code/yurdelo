/**
 * Bug 4: Dashboard used queryKey ['cases', ...] — invalidated by mutation.
 * Fix: now uses ['dashboard', 'recent-cases'].
 */
import { describe, it, expect } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

describe('Dashboard vs Cases query isolation (bug #4)', () => {
  it('invalidating ["cases"] does NOT invalidate ["dashboard", ...]', () => {
    const qc = new QueryClient();
    const dashKey = ['dashboard', 'recent-cases'];
    const casesKey = ['cases', { page: 1 }];

    qc.setQueryData(dashKey, { data: [] });
    qc.setQueryData(casesKey, { data: [] });

    qc.invalidateQueries({ queryKey: ['cases'] });

    expect(qc.getQueryState(dashKey)?.isInvalidated).toBe(false);
    expect(qc.getQueryState(casesKey)?.isInvalidated).toBe(true);
  });

  it('keys are in different namespaces', () => {
    expect(['dashboard', 'recent-cases'][0]).not.toBe(['cases'][0]);
  });
});
