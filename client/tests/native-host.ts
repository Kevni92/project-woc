import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export function binary(name: string): string {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  return fileURLToPath(new URL('../../build/native/' + name + suffix, import.meta.url));
}

export async function startServer(manual: boolean) {
  const command = manual ? ['--port', '0', '--manual-clock'] : ['--port', '0'];
  const child = spawn(binary('woc_server'), command, { stdio: ['ignore', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout });
  let diagnostic = '';
  child.stderr.setEncoding('utf8').on('data', chunk => { diagnostic += chunk; });
  try {
    const [url] = await Promise.race([
      once(lines, 'line'),
      once(child, 'exit').then(([code]) => { throw new Error('Server exited (' + code + '): ' + diagnostic); }),
    ]);
    if (typeof url !== 'string' || !/^ws:\/\/127\.0\.0\.1:\d+$/.test(url)) {
      throw new Error('Unexpected server address: ' + url);
    }
    return {
      url,
      async stop() {
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, 'exit');
          child.kill();
          await exited;
        }
      },
    };
  } catch (error) {
    child.kill();
    throw error;
  } finally {
    lines.close();
  }
}
