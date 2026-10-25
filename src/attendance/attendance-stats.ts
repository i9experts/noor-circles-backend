import { Model } from 'mongoose';
import { AttendanceDocument } from './attendance.schema';

export interface PresentTotal { present: number; total: number }

/**
 * Present/total attendance counts computed in MongoDB, optionally grouped by
 * a session field (e.g. 'submittedBy'). Dashboards used to load every
 * session document into memory to count these.
 */
export async function attendanceTotals(
  model: Model<AttendanceDocument>,
  match: Record<string, unknown> = {},
  groupBy?: 'submittedBy' | 'circle',
): Promise<Map<string, PresentTotal>> {
  const rows = await model.aggregate<{ _id: unknown; present: number; total: number }>([
    { $match: match },
    { $unwind: '$records' },
    {
      $group: {
        _id    : groupBy ? `$${groupBy}` : null,
        present: { $sum: { $cond: [{ $eq: ['$records.status', 'present'] }, 1, 0] } },
        total  : { $sum: 1 },
      },
    },
  ]);
  return new Map(rows.map((r) => [r._id == null ? 'all' : String(r._id), { present: r.present, total: r.total }]));
}

export const rateOf = (t?: PresentTotal) => (t && t.total > 0 ? Math.round((t.present / t.total) * 100) : 0);
