import { describe, expect, it } from 'vitest';
import { extraireIdClient } from '../src/drive/identifiant';

const ID = '765363733479-abc123def.apps.googleusercontent.com';

describe('extraireIdClient', () => {
  it('accepte l’identifiant seul', () => expect(extraireIdClient(ID)).toBe(ID));
  it('tolère espaces, retours à la ligne et caractères invisibles', () => {
    expect(extraireIdClient(` ${ID}\n`)).toBe(ID);
    expect(extraireIdClient('765363733479-abc123def.app\ns.googleusercontent.com')).toBe(ID);
    expect(extraireIdClient(`​${ID} ﻿`)).toBe(ID);
  });
  it('ignore le texte autour et la casse', () => {
    expect(extraireIdClient(`ID client ${ID.toUpperCase()} Code secret`)).toBe(ID);
  });
  it('refuse un texte sans identifiant', () => {
    expect(extraireIdClient('GOCSPX-xxxx')).toBeNull();
    expect(extraireIdClient('')).toBeNull();
  });
});
