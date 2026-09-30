/// <reference types="node" />
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

describe('deployment config', () => {
  it('allows the inline theme script in the Content Security Policy', () => {
    const scripts = [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    expect(scripts).toHaveLength(1);
    const hash = `sha256-${createHash('sha256').update(scripts[0]!, 'utf8').digest('base64')}`;
    expect(read('netlify.toml')).toContain(`'${hash}'`);
  });

  it('lets the app reach every API host it calls', () => {
    const csp = /Content-Security-Policy = "([^"]+)"/.exec(read('netlify.toml'))![1]!;
    const connect = csp.split(';').find((d) => d.trim().startsWith('connect-src'))!;
    const sources = [read('src/data/openMeteo.ts'), read('src/data/climate.ts')].join('\n');
    const hosts = new Set([...sources.matchAll(/https:\/\/([a-z0-9.-]+)\//g)].map((m) => m[1]!));
    expect(hosts.size).toBeGreaterThan(3);
    for (const host of hosts) expect(connect).toContain(`https://${host}`);
  });
});
