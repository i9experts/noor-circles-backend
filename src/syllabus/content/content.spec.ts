import { WRITTEN_CONTENT } from './index';
import { defaultPlan } from '../syllabus.service';
import { PART_KEYS } from '../syllabus.schema';

describe('written syllabus content', () => {
  const plan = defaultPlan();

  for (const [age, sessions] of Object.entries(WRITTEN_CONTENT)) {
    describe(age, () => {
      it('has the 40 sessions in order, each in the right month', () => {
        expect(sessions!.map((s) => s.number)).toEqual(plan.map((_, i) => i + 1));
        expect(sessions!.map((s) => s.month)).toEqual(plan.map((p) => p.month));
      });

      it.each(sessions!.map((s) => [s.number, s] as const))('session %i fits the limits and has every part written', (_n, s) => {
        expect(s.title.length).toBeGreaterThan(0);
        expect(s.title.length).toBeLessThanOrEqual(150);
        expect(s.objectives.length).toBeGreaterThanOrEqual(2);
        expect(s.homeActivity.length).toBeGreaterThan(0);
        expect(s.homeActivity.length).toBeLessThanOrEqual(1000);
        expect(Object.keys(s.parts).sort()).toEqual([...PART_KEYS].sort());
        for (const k of PART_KEYS) {
          expect(s.parts[k].title.length).toBeGreaterThan(0);
          expect(s.parts[k].title.length).toBeLessThanOrEqual(150);
          expect(s.parts[k].details.length).toBeGreaterThan(0);
          expect(s.parts[k].details.length).toBeLessThanOrEqual(2000);
        }
      });

      it('is written in Urdu script (no Latin letters)', () => {
        const latin = sessions!.flatMap((s) =>
          [s.title, ...s.objectives, s.homeActivity, ...Object.values(s.parts).flatMap((p) => [p.title, p.details])]
            .filter((t) => /[A-Za-z]/.test(t))
            .map((t) => `#${s.number}: ${t.match(/.{0,20}[A-Za-z]+.{0,20}/)?.[0]}`));
        expect(latin).toEqual([]);
      });
    });
  }
});
