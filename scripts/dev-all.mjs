import { spawn } from 'node:child_process';

const server = spawn('npx', ['tsx', 'watch', 'server/index.ts'], { stdio: 'inherit' });
const web = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5173'], { stdio: 'inherit' });

function stop() {
  server.kill('SIGTERM');
  web.kill('SIGTERM');
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (code) => {
  web.kill('SIGTERM');
  process.exit(code ?? 0);
});
web.on('exit', (code) => {
  server.kill('SIGTERM');
  process.exit(code ?? 0);
});
