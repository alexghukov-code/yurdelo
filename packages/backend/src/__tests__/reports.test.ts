import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildTestApp, USERS, authHeader } from './helpers.js';
import {
  _formatLawyerResults,
  _formatLawyerLoad,
  _formatFinance,
  _formatDuration,
  _formatStaleCase,
  _emptyResults,
  _emptyLoad,
  _RESULTS_SQL,
  _LOAD_SQL,
  _STALE_SQL,
  _FINANCE_SQL,
  _SUMMARY_SQL,
  _DURATION_SQL,
  _MY_LOAD_SQL,
  _MY_RESULTS_SQL,
  _CALENDAR_SQL,
  _CALENDAR_LAWYER_SQL,
} from '../routes/reports.js';

let app: Express;
let pool: ReturnType<typeof buildTestApp>['pool'];

beforeEach(() => {
  const ctx = buildTestApp();
  app = ctx.app;
  pool = ctx.pool;
});

// ═══════════════════════════════════════════════════════
// 1. ФОРМУЛЫ — unit-тесты
// ═══════════════════════════════════════════════════════

describe('win_rate formula correctness', () => {
  it('10 wins / (10+5 losses) = 66.7%', () => {
    const r = _formatLawyerResults({
      id: '1',
      last_name: 'T',
      first_name: 'T',
      wins: 10,
      losses: 5,
      partial: 2,
      decided: 17,
      win_rate: '66.7',
    });
    expect(r.winRate).toBe(66.7);
  });

  it('0 wins + 0 losses → null (no divisor)', () => {
    const r = _formatLawyerResults({
      id: '1',
      last_name: 'T',
      first_name: 'T',
      wins: 0,
      losses: 0,
      partial: 0,
      decided: 0,
      win_rate: null,
    });
    expect(r.winRate).toBeNull();
  });

  it('all wins → 100%', () => {
    const r = _formatLawyerResults({
      id: '1',
      last_name: 'T',
      first_name: 'T',
      wins: 7,
      losses: 0,
      partial: 0,
      decided: 7,
      win_rate: '100.0',
    });
    expect(r.winRate).toBe(100);
  });

  it('all losses → 0%', () => {
    const r = _formatLawyerResults({
      id: '1',
      last_name: 'T',
      first_name: 'T',
      wins: 0,
      losses: 3,
      partial: 0,
      decided: 3,
      win_rate: '0.0',
    });
    expect(r.winRate).toBe(0);
  });

  it('1 win + 0 losses → 100% (edge: single case)', () => {
    const r = _formatLawyerResults({
      id: '1',
      last_name: 'T',
      first_name: 'T',
      wins: 1,
      losses: 0,
      partial: 0,
      decided: 1,
      win_rate: '100.0',
    });
    expect(r.winRate).toBe(100);
  });

  it('only "part" results → null (part excluded from win/lose)', () => {
    const r = _formatLawyerResults({
      id: '1',
      last_name: 'T',
      first_name: 'T',
      wins: 0,
      losses: 0,
      partial: 5,
      decided: 5,
      win_rate: null,
    });
    expect(r.winRate).toBeNull();
    expect(r.decided).toBe(5);
  });

  it('only "world" results → null (world excluded from win/lose)', () => {
    // world cases have final_result set but are neither win nor lose
    const r = _formatLawyerResults({
      id: '1',
      last_name: 'T',
      first_name: 'T',
      wins: 0,
      losses: 0,
      partial: 0,
      decided: 3,
      win_rate: null,
    });
    expect(r.winRate).toBeNull();
  });

  it('winRate returned as number, not string', () => {
    const r = _formatLawyerResults({
      id: '1',
      last_name: 'T',
      first_name: 'T',
      wins: 1,
      losses: 2,
      partial: 0,
      decided: 3,
      win_rate: '33.3',
    });
    expect(typeof r.winRate).toBe('number');
    expect(r.winRate).toBe(33.3);
  });
});

describe('SQL formula: win_rate uses count(c.id) not count(*)', () => {
  it('RESULTS_SQL uses count(c.id) to avoid counting NULL joins', () => {
    expect(_RESULTS_SQL).toContain('count(c.id)');
    expect(_RESULTS_SQL).not.toMatch(/count\(\*\)\s+FILTER/);
  });

  it('MY_RESULTS_SQL uses count(id) not count(*)', () => {
    expect(_MY_RESULTS_SQL).toContain('count(id)');
    expect(_MY_RESULTS_SQL).not.toMatch(/count\(\*\)\s+FILTER/);
  });
});

describe('duration formula: GREATEST protects against negative days', () => {
  it('DURATION_SQL uses GREATEST(..., 0) to floor at zero', () => {
    expect(_DURATION_SQL).toContain('GREATEST');
  });

  it('formatDuration handles zero days', () => {
    const r = _formatDuration({
      category: 'civil',
      closed_count: 1,
      avg_days: 0,
      min_days: 0,
      max_days: 0,
    });
    expect(r.avgDays).toBe(0);
    expect(r.minDays).toBe(0);
  });
});

describe('finance formula', () => {
  it('parses numeric strings to numbers', () => {
    const r = _formatFinance({
      id: '1',
      last_name: 'T',
      first_name: 'T',
      active_amount: '1500000.50',
      closed_amount: '0',
      total_amount: '1500000.50',
    });
    expect(r.activeAmount).toBe(1500000.5);
    expect(r.closedAmount).toBe(0);
    expect(typeof r.totalAmount).toBe('number');
  });
});

describe('stale formula', () => {
  it('daysInactive can be null (no hearings at all)', () => {
    const r = _formatStaleCase({
      id: 'c1',
      name: 'Case',
      status: 'active',
      lawyer_id: '1',
      last_name: 'T',
      first_name: 'T',
      last_hearing: null,
      days_inactive: null,
    });
    expect(r.daysInactive).toBeNull();
    expect(r.lastHearing).toBeNull();
  });
});

describe('empty defaults', () => {
  it('emptyResults returns zeros + null winRate', () => {
    const r = _emptyResults();
    expect(r).toEqual({ wins: 0, losses: 0, partial: 0, decided: 0, winRate: null });
  });

  it('emptyLoad returns zeros', () => {
    const r = _emptyLoad();
    expect(r).toEqual({ activeCases: 0, closedCases: 0, totalCases: 0 });
  });
});

// ═══════════════════════════════════════════════════════
// 2. N+1 — verify query count per endpoint
// ═══════════════════════════════════════════════════════

describe('no N+1: each tab = exactly 1 query', () => {
  it('manager/load: 1 query', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/v1/reports/manager?tab=load')
      .set('Authorization', authHeader(USERS.admin));
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('manager/results: 1 query', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/v1/reports/manager?tab=results')
      .set('Authorization', authHeader(USERS.admin));
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('manager/stale: 1 query', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/v1/reports/manager?tab=stale')
      .set('Authorization', authHeader(USERS.admin));
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('manager/finance: 1 query', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/v1/reports/manager?tab=finance')
      .set('Authorization', authHeader(USERS.admin));
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('cases/summary: 1 query', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/v1/reports/cases?tab=summary')
      .set('Authorization', authHeader(USERS.admin));
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('cases/duration: 1 query', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/v1/reports/cases?tab=duration')
      .set('Authorization', authHeader(USERS.admin));
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('cases/instances: 1 query', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/v1/reports/cases?tab=instances')
      .set('Authorization', authHeader(USERS.admin));
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('my: exactly 2 parallel queries (load + results)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ active_cases: 0, closed_cases: 0, total_cases: 0 }] })
      .mockResolvedValueOnce({
        rows: [{ wins: 0, losses: 0, partial: 0, decided: 0, win_rate: null }],
      });
    await request(app).get('/v1/reports/my').set('Authorization', authHeader(USERS.lawyer));
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('calendar: 1 query', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/v1/reports/calendar?year=2026&month=4')
      .set('Authorization', authHeader(USERS.admin));
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════
// 3. SQL structure checks — no subselects per row
// ═══════════════════════════════════════════════════════

describe('SQL structure: aggregation in single pass, no subselects', () => {
  it('LOAD_SQL: single GROUP BY, no subquery', () => {
    expect(_LOAD_SQL).toContain('GROUP BY u.id');
    expect(_LOAD_SQL).not.toContain('SELECT (SELECT');
    expect(_LOAD_SQL.match(/SELECT/g)!.length).toBe(1);
  });

  it('RESULTS_SQL: single GROUP BY, no subquery', () => {
    expect(_RESULTS_SQL).toContain('GROUP BY u.id');
    expect(_RESULTS_SQL.match(/FROM/g)!.length).toBe(1);
  });

  it('STALE_SQL: single GROUP BY with HAVING, no correlated subquery', () => {
    expect(_STALE_SQL).toContain('GROUP BY c.id');
    expect(_STALE_SQL).toContain('HAVING');
    expect(_STALE_SQL).not.toContain('SELECT (SELECT');
  });

  it('SUMMARY_SQL: single scan on cases, no joins', () => {
    expect(_SUMMARY_SQL).toContain('GROUP BY c.category');
    expect(_SUMMARY_SQL).not.toContain('JOIN');
  });

  it('CALENDAR_SQL: index-friendly range scan on datetime', () => {
    expect(_CALENDAR_SQL).toContain('h.datetime >=');
    expect(_CALENDAR_SQL).toContain('h.datetime <');
    // Range on datetime → uses idx_hearings_datetime or idx_hearings_type_dt
  });

  it('CALENDAR_LAWYER_SQL: adds lawyer_id filter (uses idx_cases_lawyer_id)', () => {
    expect(_CALENDAR_LAWYER_SQL).toContain('c.lawyer_id = $3');
  });
});

// ═══════════════════════════════════════════════════════
// 4. API integration (quick checks)
// ═══════════════════════════════════════════════════════

describe('GET /v1/reports/manager', () => {
  it('tab=load returns formatted data', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: '1',
          last_name: 'P',
          first_name: 'M',
          active_cases: 5,
          closed_cases: 3,
          total_cases: 8,
        },
      ],
    });
    const res = await request(app)
      .get('/v1/reports/manager?tab=load')
      .set('Authorization', authHeader(USERS.admin));
    expect(res.status).toBe(200);
    expect(res.body.data[0].activeCases).toBe(5);
  });

  it('tab=results returns winRate as number', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: '1',
          last_name: 'P',
          first_name: 'M',
          wins: 4,
          losses: 1,
          partial: 1,
          decided: 6,
          win_rate: '80.0',
        },
      ],
    });
    const res = await request(app)
      .get('/v1/reports/manager?tab=results')
      .set('Authorization', authHeader(USERS.admin));
    expect(res.body.data[0].winRate).toBe(80);
    expect(typeof res.body.data[0].winRate).toBe('number');
  });

  it('tab=stale handles null days_inactive (no hearings)', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'c1',
          name: 'Case',
          status: 'active',
          lawyer_id: '1',
          last_name: 'P',
          first_name: 'M',
          last_hearing: null,
          days_inactive: null,
        },
      ],
    });
    const res = await request(app)
      .get('/v1/reports/manager?tab=stale')
      .set('Authorization', authHeader(USERS.admin));
    expect(res.body.data[0].daysInactive).toBeNull();
  });

  it('tab=stale returns empty when all cases have recent hearings', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/v1/reports/manager?tab=stale')
      .set('Authorization', authHeader(USERS.admin));
    expect(res.body.data).toEqual([]);
  });

  it('tab=finance parses amounts as numbers', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: '1',
          last_name: 'P',
          first_name: 'M',
          active_amount: '1500000',
          closed_amount: '500000',
          total_amount: '2000000',
        },
      ],
    });
    const res = await request(app)
      .get('/v1/reports/manager?tab=finance')
      .set('Authorization', authHeader(USERS.admin));
    expect(typeof res.body.data[0].totalAmount).toBe('number');
    expect(res.body.data[0].activeAmount).toBe(1500000);
  });

  it('invalid tab → 400', async () => {
    const res = await request(app)
      .get('/v1/reports/manager?tab=bad')
      .set('Authorization', authHeader(USERS.admin));
    expect(res.status).toBe(400);
  });

  it('lawyer → 403', async () => {
    const res = await request(app)
      .get('/v1/reports/manager')
      .set('Authorization', authHeader(USERS.lawyer));
    expect(res.status).toBe(403);
  });

  it('401 without auth', async () => {
    const res = await request(app).get('/v1/reports/manager');
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/reports/cases', () => {
  it('passes dateFrom/dateTo params', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/v1/reports/cases?tab=summary&dateFrom=2026-01-01&dateTo=2026-12-31')
      .set('Authorization', authHeader(USERS.admin));
    expect(pool.query).toHaveBeenCalledWith(expect.any(String), ['2026-01-01', '2026-12-31']);
  });

  it('passes nulls when no date params', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/v1/reports/cases?tab=summary')
      .set('Authorization', authHeader(USERS.admin));
    expect(pool.query).toHaveBeenCalledWith(expect.any(String), [null, null]);
  });
});

describe('GET /v1/reports/my', () => {
  it('returns load + results for current user', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ active_cases: 3, closed_cases: 2, total_cases: 5 }] })
      .mockResolvedValueOnce({
        rows: [{ wins: 2, losses: 0, partial: 0, decided: 2, win_rate: '100.0' }],
      });
    const res = await request(app)
      .get('/v1/reports/my')
      .set('Authorization', authHeader(USERS.lawyer));
    expect(res.body.data.load.activeCases).toBe(3);
    expect(res.body.data.results.winRate).toBe(100);
  });

  it('returns zeros when no cases', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/v1/reports/my')
      .set('Authorization', authHeader(USERS.lawyer));
    expect(res.body.data.load).toEqual({ activeCases: 0, closedCases: 0, totalCases: 0 });
    expect(res.body.data.results.winRate).toBeNull();
  });

  it('passes userId to both queries', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ active_cases: 0, closed_cases: 0, total_cases: 0 }] })
      .mockResolvedValueOnce({
        rows: [{ wins: 0, losses: 0, partial: 0, decided: 0, win_rate: null }],
      });
    await request(app).get('/v1/reports/my').set('Authorization', authHeader(USERS.lawyer));
    // Both queries should receive the lawyer's userId
    const calls = pool.query.mock.calls;
    expect(calls[0][1]).toEqual([USERS.lawyer.id]);
    expect(calls[1][1]).toEqual([USERS.lawyer.id]);
  });

  it('viewer → 403', async () => {
    const res = await request(app)
      .get('/v1/reports/my')
      .set('Authorization', authHeader(USERS.viewer));
    expect(res.status).toBe(403);
  });
});

describe('GET /v1/reports/calendar', () => {
  it('lawyer query includes lawyer_id param', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/v1/reports/calendar?year=2026&month=4')
      .set('Authorization', authHeader(USERS.lawyer));
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('lawyer_id'), [
      2026,
      4,
      USERS.lawyer.id,
    ]);
  });

  it('admin query has 2 params (year, month)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/v1/reports/calendar?year=2026&month=4')
      .set('Authorization', authHeader(USERS.admin));
    expect(pool.query).toHaveBeenCalledWith(expect.any(String), [2026, 4]);
  });

  it('invalid month → 400', async () => {
    const res = await request(app)
      .get('/v1/reports/calendar?month=13')
      .set('Authorization', authHeader(USERS.admin));
    expect(res.status).toBe(400);
  });

  it('month=0 → 400', async () => {
    const res = await request(app)
      .get('/v1/reports/calendar?month=0')
      .set('Authorization', authHeader(USERS.admin));
    expect(res.status).toBe(400);
  });
});
