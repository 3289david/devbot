const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const fmt = (level, args) => [`[${stamp()}] ${level}`, ...args];

export const log = {
  info: (...a) => console.log(...fmt('INFO ', a)),
  warn: (...a) => console.warn(...fmt('WARN ', a)),
  error: (...a) => console.error(...fmt('ERROR', a)),
};
