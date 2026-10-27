import { describe, expect, it } from 'vitest';
import { fuzzyFilter } from './fuzzyMatch';

const names = (items: string[], query: string) => fuzzyFilter(items, query, (s) => s);

describe('fuzzyFilter', () => {
  it('keeps every item in its order for an empty or blank query', () => {
    expect(names(['b', 'a', 'c'], '')).toEqual(['b', 'a', 'c']);
    expect(names(['b', 'a'], '  ')).toEqual(['b', 'a']);
  });

  it('matches the query letters in order, ignoring case and gaps', () => {
    expect(names(['created_at', 'cart_id', 'rating'], 'crat')).toEqual(['created_at']);
    expect(names(['CreatedAt', 'name'], 'cat')).toEqual(['CreatedAt']);
    expect(names(['name'], 'x')).toEqual([]);
  });

  it('ranks an exact name, then a prefix, then a word start, then scattered letters', () => {
    expect(names(['i_d', 'user_id', 'idx_name', 'id'], 'id')).toEqual(['id', 'idx_name', 'user_id', 'i_d']);
  });

  it('finds the best place for the letters, not just the first one', () => {
    // Greedy matching would take the "i" and "d" of "invalid" and rank this as scattered.
    expect(names(['i_x_d', 'invalid_id'], 'id')).toEqual(['invalid_id', 'i_x_d']);
  });

  it('breaks ties by the shorter name, then the original order', () => {
    expect(names(['email_address', 'email_at'], 'email')).toEqual(['email_at', 'email_address']);
    expect(names(['ab_x', 'ab_y'], 'ab')).toEqual(['ab_x', 'ab_y']);
  });
});
