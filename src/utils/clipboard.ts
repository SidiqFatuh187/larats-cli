import { spawn } from 'node:child_process';

/**
 * Copy text to system clipboard using native platform utilities (zero dependencies).
 * Returns true if successful, false if clipboard utility is unavailable.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const platform = process.platform;

  let command: string;
  let args: string[] = [];

  if (platform === 'win32') {
    command = 'clip';
  } else if (platform === 'darwin') {
    command = 'pbcopy';
  } else {
    command = process.env.WAYLAND_DISPLAY ? 'wl-copy' : 'xclip';
    if (command === 'xclip') {
      args = ['-selection', 'clipboard'];
    }
  }

  return new Promise<boolean>((resolve) => {
    try {
      const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'ignore'] });

      child.on('error', () => {
        resolve(false);
      });

      child.on('close', (code) => {
        resolve(code === 0);
      });

      child.stdin.write(text);
      child.stdin.end();
    } catch {
      resolve(false);
    }
  });
}
