import { describe, expect, test } from 'vitest';

import { inviteCode, inviteUrl } from './invite';

describe('invite links', () => {
  test('a code is short, URL-safe, stable, and differs between users', () => {
    const code = inviteCode('k17abc123def456ghi789jkl0mn1pq2r');
    expect(code).toMatch(/^[0-9a-z]{10}$/);
    expect(inviteCode('k17abc123def456ghi789jkl0mn1pq2r')).toBe(code);
    expect(inviteCode('k17abc123def456ghi789jkl0mn1pq2s')).not.toBe(code);
  });

  test('a link says where it was handed out, and by whom when known', () => {
    expect(inviteUrl('stake')).toBe('https://useanteapp.com/get?from=stake');
    expect(inviteUrl('heads_up', 'abc123defg')).toBe(
      'https://useanteapp.com/get?from=heads_up&ref=abc123defg',
    );
  });
});
