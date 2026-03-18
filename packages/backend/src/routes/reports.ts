import { Router } from 'express';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';
import { getDb } from '../utils/db.js';
import '../types.js';

export function reportsRouter(deps: { db: Pool; redis: Redis }) {
  const { db: rawDb } = deps;
  const router = Router();

  // ── GET /reports/manager ────────────────────────────
  // Admin only. Tabs: load | results | stale | finance
  router.get('/reports/manager', requireAuth, requireRole('admin'), async (req, res) => {
    const db = getDb(req, rawDb);
    const tab = (req.query.tab as string) || 'load';

    switch (tab) {
      case 'load': {
        const { rows } = await db.query(LOAD_SQL);
        return res.json({ data: rows.map(formatLawyerLoad) });
      }
      case 'results': {
        const { rows } = await db.query(RESULTS_SQL);
        return res.json({ data: rows.map(formatLawyerResults) });
      }
      case 'stale': {
        const { rows } = await db.query(STALE_SQL);
        return res.json({ data: rows.map(formatStaleCase) });
      }
      case 'finance': {
        const { rows } = await db.query(FINANCE_SQL);
        return res.json({ data: rows.map(formatFinance) });
      }
      default:
        throw AppError.badRequest(
          `Неизвестный tab: ${tab}. Допустимые: load, results, stale, finance.`,
        );
    }
  });

  // ── GET /reports/cases ──────────────────────────────
  // Admin only. Tabs: summary | duration | instances
  router.get('/reports/cases', requireAuth, requireRole('admin'), async (req, res) => {
    const db = getDb(req, rawDb);
    const tab = (req.query.tab as string) || 'summary';
    const dateFrom = (req.query.dateFrom as string) || null;
    const dateTo = (req.query.dateTo as string) || null;

    switch (tab) {
      case 'summary': {
        const { rows } = await db.query(SUMMARY_SQL, [dateFrom, dateTo]);
        return res.json({ data: rows.map(formatSummary) });
      }
      case 'duration': {
        const { rows } = await db.query(DURATION_SQL, [dateFrom, dateTo]);
        return res.json({ data: rows.map(formatDuration) });
      }
      case 'instances': {
        const { rows } = await db.query(INSTANCES_SQL, [dateFrom, dateTo]);
        return res.json({ data: rows.map(formatInstances) });
      }
      default:
        throw AppError.badRequest(
          `Неизвестный tab: ${tab}. Допустимые: summary, duration, instances.`,
        );
    }
  });

  // ── GET /reports/my ─────────────────────────────────
  // Admin + Lawyer (own stats)
  router.get('/reports/my', requireAuth, requireRole('admin', 'lawyer'), async (req, res) => {
    const db = getDb(req, rawDb);
    const userId = req.user!.id;

    const [loadRes, resultsRes] = await Promise.all([
      db.query(MY_LOAD_SQL, [userId]),
      db.query(MY_RESULTS_SQL, [userId]),
    ]);

    res.json({
      data: {
        load: loadRes.rows[0] ? formatMyLoad(loadRes.rows[0]) : emptyLoad(),
        results: resultsRes.rows[0] ? formatLawyerResults(resultsRes.rows[0]) : emptyResults(),
      },
    });
  });

  // ── GET /reports/calendar ───────────────────────────
  // All roles. Lawyer sees own, Admin/Viewer see all.
  router.get('/reports/calendar', requireAuth, async (req, res) => {
    const db = getDb(req, rawDb);
    const rawYear = parseInt(req.query.year as string);
    const rawMonth = parseInt(req.query.month as string);
    const year = Number.isNaN(rawYear) ? new Date().getFullYear() : rawYear;
    const month = Number.isNaN(rawMonth) ? new Date().getMonth() + 1 : rawMonth;

    if (month < 1 || month > 12) {
      throw AppError.badRequest('month должен быть от 1 до 12.');
    }

    const isLawyer = req.user!.role === 'lawyer';
    const sql = isLawyer ? CALENDAR_LAWYER_SQL : CALENDAR_SQL;
    const params = isLawyer ? [year, month, req.user!.id] : [year, month];

    const { rows } = await db.query(sql, params);
    res.json({ data: rows.map(formatCalendarEvent) });
  });

  return router;
}

// ═══════════════════════════════════════════════════════
// SQL constants
// ═══════════════════════════════════════════════════════

const LOAD_SQL = `
  SELECT u.id, u.last_name, u.first_name,
         count(c.id) FILTER (WHERE c.status='active')::int  AS active_cases,
         count(c.id) FILTER (WHERE c.status='closed')::int  AS closed_cases,
         count(c.id)::int                                     AS total_cases
  FROM users u
  LEFT JOIN cases c ON c.lawyer_id = u.id AND c.deleted_at IS NULL
  WHERE u.role = 'lawyer' AND u.status = 'active' AND u.deleted_at IS NULL
  GROUP BY u.id ORDER BY active_cases DESC`;

const RESULTS_SQL = `
  SELECT u.id, u.last_name, u.first_name,
         count(c.id) FILTER (WHERE c.final_result='win')::int   AS wins,
         count(c.id) FILTER (WHERE c.final_result='lose')::int  AS losses,
         count(c.id) FILTER (WHERE c.final_result='part')::int  AS partial,
         count(c.id) FILTER (WHERE c.final_result IS NOT NULL)::int AS decided,
         CASE WHEN count(c.id) FILTER (WHERE c.final_result IN ('win','lose')) > 0
              THEN round(
                count(c.id) FILTER (WHERE c.final_result='win')::numeric /
                count(c.id) FILTER (WHERE c.final_result IN ('win','lose')) * 100, 1
              )
              ELSE NULL END AS win_rate
  FROM users u
  LEFT JOIN cases c ON c.lawyer_id = u.id AND c.deleted_at IS NULL
  WHERE u.role='lawyer' AND u.status='active' AND u.deleted_at IS NULL
  GROUP BY u.id`;

const STALE_SQL = `
  SELECT c.id, c.name, c.status, c.lawyer_id,
         u.last_name, u.first_name,
         max(h.datetime) AS last_hearing,
         EXTRACT(DAY FROM NOW() - max(h.datetime))::int AS days_inactive
  FROM cases c
  JOIN users u ON u.id = c.lawyer_id
  LEFT JOIN stages s ON s.case_id = c.id AND s.deleted_at IS NULL
  LEFT JOIN hearings h ON h.stage_id = s.id AND h.deleted_at IS NULL
  WHERE c.status = 'active' AND c.deleted_at IS NULL
  GROUP BY c.id, u.id
  HAVING max(h.datetime) IS NULL
      OR max(h.datetime) < NOW() - INTERVAL '30 days'
  ORDER BY days_inactive DESC NULLS FIRST`;

const FINANCE_SQL = `
  SELECT u.id, u.last_name, u.first_name,
         coalesce(sum(c.claim_amount) FILTER (WHERE c.status='active'), 0)::numeric AS active_amount,
         coalesce(sum(c.claim_amount) FILTER (WHERE c.status='closed'), 0)::numeric AS closed_amount,
         coalesce(sum(c.claim_amount), 0)::numeric AS total_amount
  FROM users u
  LEFT JOIN cases c ON c.lawyer_id = u.id AND c.deleted_at IS NULL
  WHERE u.role='lawyer' AND u.status='active' AND u.deleted_at IS NULL
  GROUP BY u.id ORDER BY total_amount DESC`;

const SUMMARY_SQL = `
  SELECT c.category,
         count(*)::int                                          AS total,
         count(*) FILTER (WHERE c.status='active')::int         AS active,
         count(*) FILTER (WHERE c.status='closed')::int         AS closed,
         count(*) FILTER (WHERE c.final_result='win')::int      AS wins,
         count(*) FILTER (WHERE c.final_result='lose')::int     AS losses
  FROM cases c
  WHERE c.deleted_at IS NULL
    AND ($1::date IS NULL OR c.created_at >= $1::date)
    AND ($2::date IS NULL OR c.created_at <= $2::date)
  GROUP BY c.category ORDER BY total DESC`;

const DURATION_SQL = `
  SELECT c.category,
         count(*)::int AS closed_count,
         round(avg(GREATEST(EXTRACT(EPOCH FROM (c.closed_at - c.created_at)), 0)/86400))::int AS avg_days,
         round(min(GREATEST(EXTRACT(EPOCH FROM (c.closed_at - c.created_at)), 0)/86400))::int AS min_days,
         round(max(GREATEST(EXTRACT(EPOCH FROM (c.closed_at - c.created_at)), 0)/86400))::int AS max_days
  FROM cases c
  WHERE c.status='closed' AND c.deleted_at IS NULL AND c.closed_at IS NOT NULL
    AND ($1::date IS NULL OR c.created_at >= $1::date)
    AND ($2::date IS NULL OR c.created_at <= $2::date)
  GROUP BY c.category`;

const INSTANCES_SQL = `
  SELECT st.name AS stage_type, st.sort_order,
         count(DISTINCT s.case_id)::int AS cases_count,
         count(s.id)::int               AS stages_count
  FROM stages s
  JOIN stage_types st ON st.id = s.stage_type_id
  JOIN cases c ON c.id = s.case_id AND c.deleted_at IS NULL
  WHERE s.deleted_at IS NULL
    AND ($1::date IS NULL OR c.created_at >= $1::date)
    AND ($2::date IS NULL OR c.created_at <= $2::date)
  GROUP BY st.id ORDER BY st.sort_order`;

const MY_LOAD_SQL = `
  SELECT
    count(*) FILTER (WHERE status='active')::int  AS active_cases,
    count(*) FILTER (WHERE status='closed')::int  AS closed_cases,
    count(*)::int                                   AS total_cases
  FROM cases WHERE lawyer_id = $1 AND deleted_at IS NULL`;

const MY_RESULTS_SQL = `
  SELECT
    count(id) FILTER (WHERE final_result='win')::int   AS wins,
    count(id) FILTER (WHERE final_result='lose')::int  AS losses,
    count(id) FILTER (WHERE final_result='part')::int  AS partial,
    count(id) FILTER (WHERE final_result IS NOT NULL)::int AS decided,
    CASE WHEN count(id) FILTER (WHERE final_result IN ('win','lose')) > 0
         THEN round(
           count(id) FILTER (WHERE final_result='win')::numeric /
           count(id) FILTER (WHERE final_result IN ('win','lose')) * 100, 1
         )
         ELSE NULL END AS win_rate
  FROM cases WHERE lawyer_id = $1 AND deleted_at IS NULL`;

const CALENDAR_SQL = `
  SELECT h.id, h.type, h.datetime, h.result,
         s.court, s.case_number,
         c.id AS case_id, c.name AS case_name, c.lawyer_id
  FROM hearings h
  JOIN stages s ON s.id = h.stage_id AND s.deleted_at IS NULL
  JOIN cases c ON c.id = s.case_id AND c.deleted_at IS NULL
  WHERE h.deleted_at IS NULL
    AND h.datetime >= make_date($1::int, $2::int, 1)
    AND h.datetime <  make_date($1::int, $2::int, 1) + INTERVAL '1 month'
  ORDER BY h.datetime`;

const CALENDAR_LAWYER_SQL = `
  SELECT h.id, h.type, h.datetime, h.result,
         s.court, s.case_number,
         c.id AS case_id, c.name AS case_name, c.lawyer_id
  FROM hearings h
  JOIN stages s ON s.id = h.stage_id AND s.deleted_at IS NULL
  JOIN cases c ON c.id = s.case_id AND c.deleted_at IS NULL
  WHERE h.deleted_at IS NULL
    AND c.lawyer_id = $3
    AND h.datetime >= make_date($1::int, $2::int, 1)
    AND h.datetime <  make_date($1::int, $2::int, 1) + INTERVAL '1 month'
  ORDER BY h.datetime`;

// ═══════════════════════════════════════════════════════
// Formatters
// ═══════════════════════════════════════════════════════

function formatLawyerLoad(r: any) {
  return {
    id: r.id,
    lastName: r.last_name,
    firstName: r.first_name,
    activeCases: r.active_cases,
    closedCases: r.closed_cases,
    totalCases: r.total_cases,
  };
}

function formatLawyerResults(r: any) {
  return {
    id: r.id,
    lastName: r.last_name,
    firstName: r.first_name,
    wins: r.wins,
    losses: r.losses,
    partial: r.partial,
    decided: r.decided,
    winRate: r.win_rate !== null ? Number(r.win_rate) : null,
  };
}

function formatStaleCase(r: any) {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    lawyerId: r.lawyer_id,
    lawyerName: `${r.last_name} ${r.first_name}`,
    lastHearing: r.last_hearing,
    daysInactive: r.days_inactive,
  };
}

function formatFinance(r: any) {
  return {
    id: r.id,
    lastName: r.last_name,
    firstName: r.first_name,
    activeAmount: Number(r.active_amount),
    closedAmount: Number(r.closed_amount),
    totalAmount: Number(r.total_amount),
  };
}

function formatSummary(r: any) {
  return {
    category: r.category,
    total: r.total,
    active: r.active,
    closed: r.closed,
    wins: r.wins,
    losses: r.losses,
  };
}

function formatDuration(r: any) {
  return {
    category: r.category,
    closedCount: r.closed_count,
    avgDays: r.avg_days,
    minDays: r.min_days,
    maxDays: r.max_days,
  };
}

function formatInstances(r: any) {
  return {
    stageType: r.stage_type,
    sortOrder: r.sort_order,
    casesCount: r.cases_count,
    stagesCount: r.stages_count,
  };
}

function formatMyLoad(r: any) {
  return { activeCases: r.active_cases, closedCases: r.closed_cases, totalCases: r.total_cases };
}

function formatCalendarEvent(r: any) {
  return {
    id: r.id,
    type: r.type,
    datetime: r.datetime,
    result: r.result,
    court: r.court,
    caseNumber: r.case_number,
    caseId: r.case_id,
    caseName: r.case_name,
    lawyerId: r.lawyer_id,
  };
}

function emptyLoad() {
  return { activeCases: 0, closedCases: 0, totalCases: 0 };
}

function emptyResults() {
  return { wins: 0, losses: 0, partial: 0, decided: 0, winRate: null };
}

// Exported for unit tests
export {
  formatLawyerResults as _formatLawyerResults,
  formatLawyerLoad as _formatLawyerLoad,
  formatFinance as _formatFinance,
  formatDuration as _formatDuration,
  formatStaleCase as _formatStaleCase,
  emptyResults as _emptyResults,
  emptyLoad as _emptyLoad,
  // SQL constants for assertion
  RESULTS_SQL as _RESULTS_SQL,
  LOAD_SQL as _LOAD_SQL,
  STALE_SQL as _STALE_SQL,
  FINANCE_SQL as _FINANCE_SQL,
  SUMMARY_SQL as _SUMMARY_SQL,
  DURATION_SQL as _DURATION_SQL,
  MY_LOAD_SQL as _MY_LOAD_SQL,
  MY_RESULTS_SQL as _MY_RESULTS_SQL,
  CALENDAR_SQL as _CALENDAR_SQL,
  CALENDAR_LAWYER_SQL as _CALENDAR_LAWYER_SQL,
};
