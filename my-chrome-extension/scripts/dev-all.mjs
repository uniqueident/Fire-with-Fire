import { execFileSync, spawn } from 'node:child_process';
import process from 'node:process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const windows = process.platform === 'win32';
const devPorts = [5173, 4317];

await stopExistingListeners();

const children = ['dev', 'bridge'].map((script) => spawn(
  windows ? process.env.ComSpec || 'cmd.exe' : npmCommand,
  windows ? ['/d', '/c', `npm run ${script}`] : ['run', script],
  { stdio: 'inherit', detached: !windows },
));

let stopping = false;
let closedChildren = 0;

async function stopExistingListeners() {
  const listeners = new Map();
  for (const port of devPorts) {
    for (const pid of getListeningPids(port)) listeners.set(pid, [...(listeners.get(pid) ?? []), port]);
  }

  for (const [pid, ports] of listeners) {
    console.log(`Stopping existing dev process ${pid} on port${ports.length === 1 ? '' : 's'} ${ports.join(', ')}.`);
    if (windows) {
      try {
        execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        });
      } catch (error) {
        if (devPorts.some((port) => getListeningPids(port).includes(pid))) {
          throw new Error(`Could not stop process ${pid} listening on port ${ports.join(', ')}.`, { cause: error });
        }
      }
    } else {
      try {
        process.kill(pid, 'SIGTERM');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
  }

  const deadline = Date.now() + 5000;
  while (devPorts.some((port) => getListeningPids(port).length > 0) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const occupiedPorts = devPorts.filter((port) => getListeningPids(port).length > 0);
  if (occupiedPorts.length > 0) {
    throw new Error(`Could not free dev port${occupiedPorts.length === 1 ? '' : 's'} ${occupiedPorts.join(', ')}.`);
  }
}

function getListeningPids(port) {
  if (windows) {
    const output = execFileSync('netstat', ['-ano', '-p', 'tcp'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });

    return output.split(/\r?\n/).flatMap((line) => {
      const columns = line.trim().split(/\s+/);
      if (columns[0] !== 'TCP' || columns[3] !== 'LISTENING') return [];
      const localPort = Number(columns[1].slice(columns[1].lastIndexOf(':') + 1));
      const pid = Number(columns[4]);
      return localPort === port && Number.isInteger(pid) ? [pid] : [];
    });
  }

  const isMac = process.platform === 'darwin';
  let output;
  try {
    output = execFileSync(isMac ? 'lsof' : 'fuser', isMac
      ? [`-tiTCP:${port}`, '-sTCP:LISTEN']
      : ['-n', 'tcp', String(port)], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
  } catch (error) {
    if (error.status === 1) return [];
    throw new Error(`Could not inspect listeners on port ${port}.`, { cause: error });
  }

  const pidOutput = isMac ? output : output.replace(/^\s*\d+\/tcp:\s*/, '');
  return [...new Set((pidOutput.match(/\d+/g) ?? []).map(Number))];
}

function stop(signal) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue;
    terminateChild(child, signal);
  }
}

function terminateChild(child, signal) {
  if (!child.pid) return;

  if (windows) {
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } catch {
      // The process tree may already have exited.
    }
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

process.once('exit', () => {
  for (const child of children) {
    if (child.exitCode === null) terminateChild(child, 'SIGTERM');
  }
});

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