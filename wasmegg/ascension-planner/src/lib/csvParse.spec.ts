/**
 * The one CSV reader for uploads (owner's item 13): quoted cells, commas and line breaks inside quotes,
 * BOM, CRLF, `#` comment lines, the writer's formula guard undone, and limits that refuse in words.
 */
import { describe, expect, it } from 'vitest';
import { parseCsv, readCsv, unguardCell } from './csvParse';
import { UploadError } from './uploadGuard';

describe('readCsv', () => {
  it('reads quoted cells with commas, quotes and line breaks in them', () => {
    const { records } = parseCsv('a,"b, c","say ""hi""","two\nlines",e\n1,2,3,4,5\n');
    expect(records).toEqual([
      ['a', 'b, c', 'say "hi"', 'two\nlines', 'e'],
      ['1', '2', '3', '4', '5'],
    ]);
  });

  it('BOM, CRLF and lone CR, blank lines, an empty last cell, no final newline', () => {
    const { records } = parseCsv('﻿a,b\r\n\r\nc,\rd,"x\r\ny"');
    expect(records).toEqual([['a', 'b'], ['c', ''], ['d', 'x\r\ny']]);
  });

  it('hands comment lines back whole, never reading their quotes', () => {
    const comments: string[] = [];
    const records: string[][] = [];
    readCsv('# note: he said "hi\n1,2\n', { comment: t => void comments.push(t), record: c => void records.push(c) });
    expect(comments).toEqual(['# note: he said "hi']);
    expect(records).toEqual([['1', '2']]);
  });

  it('undoes the formula guard the writer adds, and only that', () => {
    expect(parseCsv(`"'=HYPERLINK(""x"")",'-2+3,'plain,-3.25\n`).records[0]).toEqual(['=HYPERLINK("x")', '-2+3', "'plain", '-3.25']);
    expect(unguardCell("'@x")).toBe('@x');
    expect(unguardCell("'")).toBe("'");
  });

  it('records the line each record starts on, across quoted line breaks', () => {
    const lines: number[] = [];
    readCsv('a\n"b\nc",d\ne\n', { record: (_c, l) => void lines.push(l) });
    expect(lines).toEqual([1, 2, 4]);
  });

  it('refuses a damaged or hostile file in words', () => {
    expect(() => parseCsv('a,"never closed\n1,2\n')).toThrow(UploadError);
    expect(() => parseCsv('a,"never closed\n1,2\n')).toThrow(/never closed/);
    expect(() => parseCsv('"a"b,c\n')).toThrow(/after a closing quote/);
    expect(() => parseCsv('1\n2\n3\n4\n', { maxRows: 3 })).toThrow(/more than 3 rows/);
    expect(() => parseCsv(`a,${'x'.repeat(50)}\n`, { maxCellChars: 40 })).toThrow(/longer than 40/);
    expect(() => parseCsv(`a,"${'x'.repeat(50)}"\n`, { maxCellChars: 40 })).toThrow(/longer than 40/);
    expect(() => parseCsv(`${'a,'.repeat(20)}a\n`, { maxCells: 10 })).toThrow(/more than 10 cells/);
  });
});
