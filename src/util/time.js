export const nowSec = () => Math.floor(Date.now()/1000);
export function fmtMMSS(sec) {
  const m = String(Math.floor(sec/60)).padStart(2,'0');
  const s = String(sec%60).padStart(2,'0');
  return `${m}:${s}`;
}
