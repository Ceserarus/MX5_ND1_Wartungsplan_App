import { describe, expect, it } from 'vitest';
import { kmAm, kmImMonat, kmProJahr, kmVerlauf } from './km';

const verlauf = kmVerlauf(
  [
    { datum: '2024-07-01', km: 10000 },
    { datum: '2025-07-01', km: 20000 },
  ],
  [{ id: 'a', datum: '2025-07-01', km: 20010, positionId: 'motoroel', aktion: 'R', teile: '', kosten: null, notiz: '', belege: [] }],
);

describe('km', () => {
  it('merges readings per day, keeping the highest', () => {
    expect(verlauf).toEqual([
      { datum: '2024-07-01', km: 10000 },
      { datum: '2025-07-01', km: 20010 },
    ]);
  });

  it('interpolates between readings', () => {
    const mitte = kmAm(verlauf, '2025-01-01')!;
    expect(mitte).toBeGreaterThan(15000);
    expect(mitte).toBeLessThan(15100);
    expect(kmAm(verlauf, '2023-01-01')).toBeNull();
  });

  it('splits driven km into calendar years', () => {
    const jahre = kmProJahr(verlauf);
    expect(jahre.map((j) => j.jahr)).toEqual([2024, 2025]);
    expect(jahre[0].km + jahre[1].km).toBe(10010);
    expect(jahre.every((j) => j.teilweise)).toBe(true);
  });

  it('detects a missing monthly reading', () => {
    expect(kmImMonat([{ datum: '2026-11-02', km: 1 }], '2026-11-19')).toBe(true);
    expect(kmImMonat([{ datum: '2026-10-30', km: 1 }], '2026-11-19')).toBe(false);
  });
});
