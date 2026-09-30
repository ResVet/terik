import { describe, expect, it } from 'vitest';
import { slug } from './download';

describe('slug', () => {
  it('makes place names safe for file names', () => {
    expect(slug('São Paulo')).toBe('sao-paulo');
    expect(slug('Kota Yogyakarta')).toBe('kota-yogyakarta');
    expect(slug('  St. John\u2019s ')).toBe('st-john-s');
    expect(slug('東京')).toBe('place');
  });
});
