// Browser globals the game's UI modules read when they load (i18n: the language from the URL), for tools run in Node.
// Import it first. LANG_UI=es|en picks the language of the texts (default es).
const g = globalThis as unknown as Record<string, unknown>;
g.window ??= { addEventListener() {} };
g.location ??= { search: `?lang=${process.env.LANG_UI ?? 'es'}` };
g.document ??= { documentElement: {} };
export {};
