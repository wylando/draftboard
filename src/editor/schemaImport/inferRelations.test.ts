import { describe, expect, it } from 'vitest';
import { inferRelations } from './inferRelations';
import type { ImportedColumn, ImportedRelation, ImportedSchema, ImportedTable } from './types';

const col = (name: string, primaryKey = false): ImportedColumn => ({
  name,
  dataType: 'integer',
  primaryKey,
  nullable: !primaryKey,
  unique: false,
});

const table = (name: string, ...columns: (string | ImportedColumn)[]): ImportedTable => ({
  name,
  columns: columns.map((c) => (typeof c === 'string' ? col(c) : c)),
  indexes: [],
});

const schema = (tables: ImportedTable[], relations: ImportedRelation[] = []): ImportedSchema => ({
  format: 'postgres',
  tables,
  relations,
  warnings: [],
});

const guess = (fromTable: string, fromColumn: string, toTable: string, toColumn: string): ImportedRelation => ({
  fromTable,
  fromColumn,
  toTable,
  toColumn,
  declared: false,
});

const pk = (name = 'id') => col(name, true);

describe('inferRelations', () => {
  // [reason, from column, target table, expected target table]
  const names: [string, string, string, string][] = [
    ['plural', 'user_id', 'users', 'users'],
    ['camel Id', 'authorId', 'authors', 'authors'],
    ['camel ID', 'authorID', 'authors', 'authors'],
    ['upper _ID', 'USER_ID', 'users', 'users'],
    ['y to ies', 'category_id', 'categories', 'categories'],
    ['es plural', 'box_id', 'boxes', 'boxes'],
    ['exact name', 'user_id', 'user', 'user'],
    ['case-insensitive table', 'user_id', 'Users', 'Users'],
  ];
  it.each(names)('%s: %s -> %s', (_reason, column, target, expected) => {
    const s = schema([table('posts', pk(), column), table(target, pk())]);
    expect(inferRelations(s)).toEqual([guess('posts', column, expected, 'id')]);
  });

  it('prefers the exact name over the plural', () => {
    const s = schema([table('posts', pk(), 'user_id'), table('users', pk()), table('user', pk())]);
    expect(inferRelations(s)).toEqual([guess('posts', 'user_id', 'user', 'id')]);
  });

  it('points at the target primary key whatever its name', () => {
    const s = schema([table('posts', pk(), 'user_id'), table('users', pk('uid'))]);
    expect(inferRelations(s)).toEqual([guess('posts', 'user_id', 'users', 'uid')]);
  });

  it('skips a column a declared relation already covers', () => {
    const declared: ImportedRelation = { ...guess('POSTS', 'USER_ID', 'users', 'id'), declared: true };
    const s = schema([table('posts', pk(), 'user_id'), table('users', pk())], [declared]);
    expect(inferRelations(s)).toEqual([]);
  });

  it("skips the table's own single-column primary key", () => {
    const s = schema([table('users', pk('user_id')), table('user', pk())]);
    expect(inferRelations(s)).toEqual([]);
  });

  it('guesses for one column of a composite primary key', () => {
    const s = schema([
      table('memberships', pk('user_id'), pk('team_id')),
      table('users', pk()),
      table('teams', pk()),
    ]);
    expect(inferRelations(s)).toEqual([
      guess('memberships', 'user_id', 'users', 'id'),
      guess('memberships', 'team_id', 'teams', 'id'),
    ]);
  });

  it('skips a target without a primary key', () => {
    expect(inferRelations(schema([table('posts', pk(), 'user_id'), table('users', 'id')]))).toEqual([]);
  });

  it('skips a target with a composite primary key', () => {
    const s = schema([table('posts', pk(), 'user_id'), table('users', pk('a'), pk('b'))]);
    expect(inferRelations(s)).toEqual([]);
  });

  it('guesses nothing when no table matches', () => {
    const s = schema([table('posts', pk(), 'parent_id', 'user_id', 'id'), table('tags', pk())]);
    expect(inferRelations(s)).toEqual([]);
  });

  // Last-segment fallbacks (stripe_customer_id -> customers) were false positives.
  it.each(['stripe_customer_id', 'author_user_id', 'device_session_id'])('does not shorten %s to its last segment', (column) => {
    const s = schema([table('posts', pk(), column), table('customers', pk()), table('users', pk()), table('sessions', pk())]);
    expect(inferRelations(s)).toEqual([]);
  });

  it('skips a column naming its own table, which is a duplicate key rather than a parent link', () => {
    expect(inferRelations(schema([table('users', pk(), 'user_id', 'users_id')]))).toEqual([]);
  });

  it.each(['UUID', 'PAID', 'VALID', 'id', 'Id', '_id', 'x_id', 'xId'])('finds no stem in %s', (column) => {
    const s = schema([table('posts', pk(), column), table('uus', pk()), table('pas', pk()), table('vals', pk()), table('xs', pk())]);
    expect(inferRelations(s)).toEqual([]);
  });

  it.each(['userID', 'USER_ID', 'userId', 'user_id'])('finds the stem in %s', (column) => {
    const s = schema([table('posts', pk(), column), table('users', pk())]);
    expect(inferRelations(s)).toEqual([guess('posts', column, 'users', 'id')]);
  });

  it('skips a pair already declared in the opposite direction', () => {
    const declared: ImportedRelation = { ...guess('users', 'id', 'profiles', 'user_id'), declared: true };
    const s = schema([table('users', pk()), table('profiles', pk(), 'user_id')], [declared]);
    expect(inferRelations(s)).toEqual([]);
  });

  it('skips when both types are known and differ', () => {
    const typed = (t: string): ImportedColumn => ({ ...col('id', true), dataType: t });
    const key = (t: string): ImportedColumn => ({ ...col('user_id'), dataType: t });
    const mk = (a: string, b: string) => schema([table('posts', pk(), key(a)), table('users', typed(b))]);
    expect(inferRelations(mk('uuid', 'text'))).toEqual([]);
    expect(inferRelations(mk('INTEGER', 'integer'))).toEqual([guess('posts', 'user_id', 'users', 'id')]);
    // A serial key is an int column with a default, so an int column refers to it.
    expect(inferRelations(mk('int', 'serial'))).toEqual([guess('posts', 'user_id', 'users', 'id')]);
  });

  it('does not guess when several tables match', () => {
    const s = schema([table('posts', pk(), 'user_id'), table('auth.users', pk()), table('other.users', pk())]);
    expect(inferRelations(s)).toEqual([]);
  });

  it('matches the part after the schema dot', () => {
    const s = schema([table('profiles', pk(), 'user_id'), table('auth.users', pk())]);
    expect(inferRelations(s)).toEqual([guess('profiles', 'user_id', 'auth.users', 'id')]);
  });

  it('prefers a table in the same schema, bare names being public', () => {
    const s = schema([
      table('auth.users', pk()),
      table('users', pk()),
      table('profiles', pk(), 'user_id'),
      table('auth.sessions', pk(), 'user_id'),
    ]);
    expect(inferRelations(s)).toEqual([
      guess('profiles', 'user_id', 'users', 'id'),
      guess('auth.sessions', 'user_id', 'auth.users', 'id'),
    ]);
  });

  it('orders output by table, then column', () => {
    const s = schema([
      table('b', pk(), 'user_id', 'team_id'),
      table('a', pk(), 'user_id'),
      table('teams', pk()),
      table('users', pk()),
    ]);
    expect(inferRelations(s)).toEqual([
      guess('b', 'user_id', 'users', 'id'),
      guess('b', 'team_id', 'teams', 'id'),
      guess('a', 'user_id', 'users', 'id'),
    ]);
  });
});
