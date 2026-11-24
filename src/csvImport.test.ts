import { describe, expect, it } from 'vitest';
import { artErkennen, csvLesen, datumLesen, vorschauErstellen } from './csvImport';

const leer = { eintraege: [], kmStaende: [] };

describe('csvImport', () => {
  it('parses quoted fields with commas, quotes and line breaks', () => {
    expect(csvLesen('a,"b, c","d ""e""",\r\n"x\ny",2\n')).toEqual([
      ['a', 'b, c', 'd "e"', ''],
      ['x\ny', '2'],
    ]);
  });

  it('detects semicolon separated files', () => {
    expect(csvLesen('2024-01-01;12.345\n')).toEqual([['2024-01-01', '12.345']]);
  });

  it('reads ISO and German dates', () => {
    expect(datumLesen('2024-3-5')).toBe('2024-03-05');
    expect(datumLesen('05.03.2024')).toBe('2024-03-05');
    expect(datumLesen('gestern')).toBeNull();
  });

  it('tells Kilometer from Einträge files', () => {
    expect(artErkennen([['Datum', 'Km'], ['2024-01-01', '100']])).toBe('kilometer');
    expect(artErkennen([['a', '2024-01-01', '100', 'motoroel', 'Motoröl', 'R', '', '', '', '']])).toBe('eintraege');
  });

  it('skips km readings that already exist or repeat in the file', () => {
    const v = vorschauErstellen('Datum,Km\n2024-01-01,1000\n2024-06-01,2000\n2024-06-01,2000\nkaputt,1\n', {
      eintraege: [],
      kmStaende: [{ datum: '2024-01-01', km: 1000 }],
    });
    expect(v.art).toBe('kilometer');
    expect(v.neu).toEqual([['2024-06-01', 2000]]);
    expect(v.doppelt).toBe(2);
    expect(v.fehlerhaft).toHaveLength(1);
  });

  it('skips entries whose ID already exists and fills missing IDs', () => {
    const csv = [
      'e1,2024-01-01,1000,motoroel,Motoröl & Ölfilter,R,"Öl 4,3 l",89.90,"Notiz, mit Komma",',
      'e2,2024-01-01,1000,bremsen,Bremsen,I,,,,',
      ',01.06.2024,2.000,luftfilter,Luftfilter,r,,"12,50",,',
    ].join('\n');
    const v = vorschauErstellen(
      csv,
      {
        ...leer,
        eintraege: [{ id: 'e2', datum: '2024-01-01', km: 1000, positionId: 'bremsen', aktion: 'I', teile: '', kosten: null, notiz: '', belege: [] }],
      },
      () => 'neu-1',
    );
    expect(v.art).toBe('eintraege');
    expect(v.doppelt).toBe(1);
    expect(v.neu).toEqual([
      ['e1', '2024-01-01', 1000, 'motoroel', 'Motoröl & Ölfilter', 'R', 'Öl 4,3 l', 89.9, 'Notiz, mit Komma', ''],
      ['neu-1', '2024-06-01', 2000, 'luftfilter', 'Luftfilter', 'R', '', 12.5, '', ''],
    ]);
    // Importing the same file again finds nothing new
    const zweites = vorschauErstellen(csv, {
      ...leer,
      eintraege: v.neu.map((z) => ({
        id: String(z[0]), datum: String(z[1]), km: Number(z[2]), positionId: String(z[3]),
        aktion: z[5] as 'I', teile: '', kosten: null, notiz: '', belege: [],
      })).concat({ id: 'e2', datum: '2024-01-01', km: 1000, positionId: 'bremsen', aktion: 'I', teile: '', kosten: null, notiz: '', belege: [] }),
    });
    expect(zweites.neu).toEqual([]);
    expect(zweites.doppelt).toBe(3);
  });
});
