// Geliştirme: sunucuyu (3001) ve Vite istemcisini (5173) birlikte çalıştırır.
import { spawn } from 'node:child_process';

const run = (script) =>
  spawn('npm', ['run', script], { stdio: 'inherit', shell: true });

const procs = [run('dev:server'), run('dev:client')];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
