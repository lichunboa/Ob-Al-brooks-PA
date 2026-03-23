import fs from 'fs';
import path from 'path';

function firstExecutable(candidates: Array<string | undefined | null>): string | null {
  for (const candidate of candidates) {
    const text = String(candidate || '').trim();
    if (!text) continue;
    if (!path.isAbsolute(text)) {
      return text;
    }
    try {
      fs.accessSync(text, fs.constants.X_OK);
      return text;
    } catch {
      continue;
    }
  }
  return null;
}

export function buildChartCommand(agentRoot: string, scriptPath: string, payloadPath: string, outputPath: string) {
  const home = process.env.HOME || '';
  const agentPython = path.join(agentRoot, '.venv', 'bin', 'python');
  try {
    fs.accessSync(agentPython, fs.constants.X_OK);
    return {
      command: agentPython,
      args: [scriptPath, '--payload-file', payloadPath, '--output', outputPath],
    };
  } catch {
    // 回退到 uv / 系统 python。
  }

  const uvBinary = firstExecutable([
    process.env.AB_PATROL_TOOL_UV,
    process.env.UV_BIN,
    path.join(home, '.local', 'bin', 'uv'),
    '/opt/homebrew/bin/uv',
    '/usr/local/bin/uv',
    'uv',
  ]);

  if (uvBinary) {
    return {
      command: uvBinary,
      args: ['run', '--no-project', 'python', scriptPath, '--payload-file', payloadPath, '--output', outputPath],
    };
  }

  const pythonBinary = firstExecutable([
    process.env.AB_PATROL_TOOL_PYTHON,
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    'python3',
  ]);

  return {
    command: pythonBinary || 'python3',
    args: [scriptPath, '--payload-file', payloadPath, '--output', outputPath],
  };
}
