import { spawn } from 'node:child_process';
import process from 'node:process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const windows = process.platform === 'win32';
const children = ['dev', 'bridge'].map((script) => spawn(
  windows ? process.env.ComSpec || 'cmd.exe' : npmCommand,
  windows ? ['/d', '/c', `npm run ${script}`] : ['run', script],
  { stdio: 'inherit' },
));

let stopping = false;
let closedChildren = 0;

function stop(signal) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue;
    if (windows) {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      killer.unref();
    } else {
      child.kill(signal);
    }
  }
}

for (const child of children) {
  child.on('error', (error) => {
    console.error('Could not start a development process:', error.message);
    process.exitCode = 1;
    stop('SIGTERM');
  });

  child.on('close', (code) => {
    closedChildren += 1;
    if (!stopping) {
      if (code !== 0) process.exitCode = code ?? 1;
      stop('SIGTERM');
    }
    if (closedChildren === children.length && stopping) {
      process.exitCode ??= 0;
    }
  });
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));