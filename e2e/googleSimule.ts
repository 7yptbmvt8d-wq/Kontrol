// Google (connexion OAuth et Drive v3) simulé en mémoire pour les tests de parcours : aucun appel réseau réel.
import type { BrowserContext, Route } from '@playwright/test';

export interface FichierSimule {
  id: string; name: string; mimeType: string; parent: string; trashed: boolean;
  appProperties: Record<string, string>; body?: Buffer; createdTime: string;
}

const DOSSIER = 'application/vnd.google-apps.folder';

export async function simulerGoogle(ctx: BrowserContext) {
  const F = new Map<string, FichierSimule>();
  let n = 0;
  const sessions = new Map<string, Record<string, unknown>>();
  const ajout = (o: Partial<FichierSimule> & { name: string; mimeType: string; parent: string }) => {
    const f: FichierSimule = { id: `X${++n}`, trashed: false, appProperties: {}, createdTime: new Date(Date.now() + n).toISOString(), ...o };
    F.set(f.id, f);
    return f;
  };
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'location' };
  const json = (r: Route, o: unknown, status = 200) => r.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
  const vue = (f: FichierSimule) => ({ id: f.id, name: f.name, mimeType: f.mimeType, appProperties: f.appProperties, size: f.body ? String(f.body.length) : undefined, createdTime: f.createdTime });
  const filtrer = (q: string) => {
    let l = [...F.values()].filter((f) => !f.trashed);
    const par = /'([^']+)' in parents/.exec(q); if (par) l = l.filter((f) => f.parent === par[1]);
    const nom = /name='([^']+)'/.exec(q); if (nom) l = l.filter((f) => f.name === nom[1]);
    const mt = /mimeType='([^']+)'/.exec(q); if (mt) l = l.filter((f) => f.mimeType === mt[1]);
    for (const [, k, v] of q.matchAll(/appProperties has \{ key='([^']+)' and value='([^']+)' \}/g)) l = l.filter((f) => f.appProperties[k] === v);
    return l.sort((a, b) => b.createdTime.localeCompare(a.createdTime));
  };
  const multipart = (buf: Buffer, ct: string) => {
    const lim = Buffer.from('--' + /boundary=(.+)$/.exec(ct)![1]);
    const parts: Buffer[] = [];
    let i = buf.indexOf(lim);
    while (i >= 0) { const j = buf.indexOf(lim, i + lim.length); if (j < 0) break; parts.push(buf.subarray(i + lim.length + 2, j - 2)); i = j; }
    const corps = (p: Buffer) => p.subarray(p.indexOf('\r\n\r\n') + 4);
    return { meta: JSON.parse(corps(parts[0]).toString()), body: Buffer.from(corps(parts[1])) };
  };

  await ctx.route('https://accounts.google.com/**', (route) => {
    const u = new URL(route.request().url());
    const frag = `access_token=JETON&token_type=Bearer&expires_in=3599&scope=${encodeURIComponent('https://www.googleapis.com/auth/drive.file')}&state=${u.searchParams.get('state')}`;
    return route.fulfill({ status: 302, headers: { location: `${u.searchParams.get('redirect_uri')}#${frag}` } });
  });
  await ctx.route('https://www.googleapis.com/**', async (route) => {
    const r = route.request(); const u = new URL(r.url()); const m = r.method();
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (u.pathname === '/drive/v3/about') return json(route, { user: { emailAddress: 'moe@exemple.fr', displayName: 'MOE' } });
    if (u.pathname === '/drive/v3/files' && m === 'GET') return json(route, { files: filtrer(u.searchParams.get('q') ?? '').map(vue) });
    if (u.pathname === '/drive/v3/files' && m === 'POST') {
      const meta = JSON.parse(r.postData() ?? '{}');
      return json(route, { id: ajout({ name: meta.name, mimeType: meta.mimeType, parent: meta.parents?.[0] ?? 'root', appProperties: meta.appProperties ?? {} }).id });
    }
    const up = /^\/upload\/drive\/v3\/files(?:\/([^/]+))?$/.exec(u.pathname);
    if (up && u.searchParams.get('uploadType') === 'multipart') {
      const { meta, body } = multipart(r.postDataBuffer()!, r.headers()['content-type']);
      if (up[1]) { const f = F.get(up[1])!; Object.assign(f, { name: meta.name, body, appProperties: { ...f.appProperties, ...meta.appProperties } }); return json(route, { id: f.id }); }
      return json(route, { id: ajout({ name: meta.name, mimeType: meta.mimeType, parent: meta.parents[0], appProperties: meta.appProperties ?? {}, body }).id });
    }
    if (up && u.searchParams.get('uploadType') === 'resumable') {
      const s = `S${++n}`; sessions.set(s, JSON.parse(r.postData() ?? '{}'));
      return route.fulfill({ status: 200, headers: { ...cors, location: `https://www.googleapis.com/upload/session/${s}` }, body: '' });
    }
    if (u.pathname.startsWith('/upload/session/')) {
      const meta = sessions.get(u.pathname.split('/').pop()!) as { name: string; mimeType: string; parents: string[]; appProperties?: Record<string, string> };
      return json(route, vue(ajout({ name: meta.name, mimeType: meta.mimeType, parent: meta.parents[0], appProperties: meta.appProperties ?? {}, body: r.postDataBuffer()! })));
    }
    const fm = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname);
    const f = fm && F.get(fm[1]);
    if (fm && !f) return json(route, { error: { message: 'not found' } }, 404);
    if (f && m === 'DELETE') { F.delete(f.id); return route.fulfill({ status: 204, headers: cors }); }
    if (f && m === 'PATCH') {
      if (u.searchParams.get('addParents')) f.parent = u.searchParams.get('addParents')!;
      const meta = r.postData() ? JSON.parse(r.postData()!) : {};
      if (meta.name) f.name = meta.name;
      if (meta.trashed) f.trashed = true;
      return json(route, { id: f.id });
    }
    if (f && u.searchParams.get('alt') === 'media') return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/zip' }, body: f.body });
    if (f) return json(route, { id: f.id, trashed: f.trashed });
    return json(route, { error: { message: `non simulé ${m} ${u.pathname}` } }, 400);
  });

  /** Chemins des fichiers présents (« Kontrol/Sauvegardes/… »). */
  const chemins = () => {
    const chemin = (f: FichierSimule): string => (f.parent === 'root' ? f.name : `${chemin(F.get(f.parent)!)}/${f.name}`);
    return [...F.values()].filter((f) => !f.trashed && f.mimeType !== DOSSIER).map(chemin).sort();
  };
  return { fichiers: F, chemins };
}
