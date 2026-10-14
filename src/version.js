// <meta name="app-version"> is rewritten at deploy time by .github/build-site.sh:
// a release tag (e.g. v0.0.1), "next" for main, or "dev" when run locally.
export const VER = document.querySelector('meta[name="app-version"]')?.content || 'dev';
export const RELEASE = /^v\d/.test(VER);
export const VER_LABEL = RELEASE ? VER : VER === 'next' ? '開発版（next）' : 'ローカル（dev）';
