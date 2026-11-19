import { describe, expect, it } from 'vitest';
import { addMonths, berechneFaelligkeit, POSITIONEN, type Eintrag } from './plan';

const oel = POSITIONEN.find((p) => p.id === 'motoroel')!;
const kuehlmittel = POSITIONEN.find((p) => p.id === 'kuehlmittel')!;

function eintrag(partial: Partial<Eintrag>): Eintrag {
  return { id: 'x', datum: '2026-01-01', km: 0, positionId: 'motoroel', aktion: 'R', teile: '', kosten: null, notiz: '', belege: [], ...partial };
}

describe('addMonths', () => {
  it('clamps to month end', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-19', 12)).toBe('2027-11-19');
  });
});

describe('berechneFaelligkeit', () => {
  it('is due 20.000 km / 12 months after the last oil change', () => {
    const f = berechneFaelligkeit(oel, [eintrag({ datum: '2026-05-01', km: 40000 })], 45000, '2026-11-19', null);
    expect(f.faelligKm).toBe(60000);
    expect(f.faelligDatum).toBe('2027-05-01');
    expect(f.restKm).toBe(15000);
    expect(f.status).toBe('ok');
  });

  it('whichever comes first: time', () => {
    const f = berechneFaelligkeit(oel, [eintrag({ datum: '2025-11-01', km: 40000 })], 41000, '2026-11-19', null);
    expect(f.status).toBe('ueberfaellig');
  });

  it('warns shortly before due', () => {
    const f = berechneFaelligkeit(oel, [eintrag({ datum: '2026-05-01', km: 40000 })], 58500, '2026-11-19', null);
    expect(f.status).toBe('bald');
  });

  it('uses first registration and first interval without entries', () => {
    const f = berechneFaelligkeit(kuehlmittel, [], 50000, '2026-11-19', '2018-06-01');
    expect(f.faelligKm).toBe(200000);
    expect(f.faelligDatum).toBe('2028-06-01');
  });

  it('uses the latest entry', () => {
    const f = berechneFaelligkeit(
      oel,
      [eintrag({ km: 20000, datum: '2024-01-01' }), eintrag({ km: 40000, datum: '2026-05-01' })],
      45000,
      '2026-11-19',
      null,
    );
    expect(f.letzter?.km).toBe(40000);
  });
});
