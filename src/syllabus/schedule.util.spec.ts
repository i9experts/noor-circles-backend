import { addDays, expectedSessions, meetingDates, nextMeeting, pkToday, weekdayOf } from './schedule.util';
import { defaultPlan } from './syllabus.service';

describe('schedule utils (Pakistan time)', () => {
  it('pkToday rolls over at midnight Pakistan time', () => {
    expect(pkToday(new Date('2026-10-24T18:59:00Z'))).toBe('2026-10-24');
    expect(pkToday(new Date('2026-10-24T19:00:00Z'))).toBe('2026-10-25');
  });

  it('meetingDates finds each weekday and skips closures', () => {
    // 2026-10-02 is a Friday
    expect(weekdayOf('2026-10-02')).toBe(5);
    expect(meetingDates(5, '2026-10-01', '2026-10-31')).toEqual(['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30']);
    expect(meetingDates(5, '2026-10-01', '2026-10-31', [{ startDate: '2026-10-08', endDate: '2026-10-17' }]))
      .toEqual(['2026-10-02', '2026-10-23', '2026-10-30']);
  });

  it('expectedSessions counts meetings that have started', () => {
    const c = { meetingDay: 5, meetingTime: '17:00', startDate: '2026-10-02' };
    // Friday 23 Oct, 16:00 PKT: the 23rd hasn't started yet
    expect(expectedSessions(c, [], new Date('2026-10-23T11:00:00Z'))).toBe(3);
    // 17:30 PKT: it has
    expect(expectedSessions(c, [], new Date('2026-10-23T12:30:00Z'))).toBe(4);
    expect(expectedSessions({ meetingDay: null, meetingTime: null, startDate: null }, [])).toBeNull();
  });

  it('nextMeeting is today until the meeting is well over, then next week', () => {
    const c = { meetingDay: 5, meetingTime: '17:00', startDate: '2026-10-02' };
    expect(nextMeeting(c, [], new Date('2026-10-23T13:00:00Z'))).toBe('2026-10-23'); // 18:00 PKT, in progress
    expect(nextMeeting(c, [], new Date('2026-10-23T16:30:00Z'))).toBe('2026-10-30'); // 21:30 PKT
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
});

describe('default syllabus plan', () => {
  it('has 40 sessions over the 12 themes', () => {
    const plan = defaultPlan();
    expect(plan).toHaveLength(40);
    expect(new Set(plan.map((p) => p.month)).size).toBe(12);
    expect(plan[0]).toEqual({ month: 1, theme: 'Identity', part: 1 });
  });
});
