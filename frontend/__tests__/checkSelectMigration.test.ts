import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Runs the gate against a miniature tree and returns { code, stderr }. */
async function gate(files: Record<string, string>) {
  const root = await mkdtemp(path.join(tmpdir(), 'select-gate-'));
  try {
    for (const [relative, content] of Object.entries(files)) {
      const target = path.join(root, relative);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content, 'utf8');
    }
    const script = path.resolve(process.cwd(), 'scripts', 'check-select-migration.mjs');
    const result = await run(process.execPath, [script, '--root', root]).catch(error => error);
    return {
      code: result.code ?? 0,
      output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const cleanApp = `
import { FormSelect } from './components/FormSelect';
export function App() {
  return <FormSelect aria-label="site" value={null} options={[{ value: '', label: 'All' }]} />;
}
`;

describe('check-select-migration gate', () => {
  it('passes a clean production tree', async () => {
    const { code, output } = await gate({
      'App.tsx': cleanApp,
      'components/FormSelect.tsx': 'export const FormSelect = () => null;',
    });
    expect(code).toBe(0);
    expect(output).toContain('passed');
  });

  it('catches a direct NativeSelect JSX usage', async () => {
    const { code, output } = await gate({
      'modules/Bad.tsx': "import { NativeSelect } from './ui/native-select';\nexport const Bad = () => <NativeSelect />;",
    });
    expect(code).toBe(1);
    expect(output).toContain('modules/Bad.tsx');
  });

  it('catches an aliased import that renames NativeSelect', async () => {
    const { code, output } = await gate({
      'modules/Bad.tsx': "import { NativeSelect as NS } from '../components/ui/native-select';\nexport const Bad = () => <NS />;",
    });
    expect(code).toBe(1);
    expect(output).toContain('imports');
    expect(output).toContain('modules/Bad.tsx');
  });

  it('catches namespace member access and re-exports of the removed module', async () => {
    const { code, output } = await gate({
      'modules/Bad.tsx': "import * as ui from '../components/ui/native-select';\nexport const Bad = () => <ui.NativeSelect />;",
      'modules/Reexport.tsx': "export { NativeSelect } from '../components/ui/native-select';",
    });
    expect(code).toBe(1);
    expect(output).toContain('modules/Bad.tsx');
    expect(output).toContain('modules/Reexport.tsx');
  });

  it('catches native select, datalist and input[list] JSX', async () => {
    const { code, output } = await gate({
      'modules/Native.tsx': 'export const Native = () => <select aria-label="site" />;',
      'modules/Data.tsx': 'export const Data = () => <datalist id="x"><option value="a" /></datalist>;',
      'modules/Bound.tsx': 'export const Bound = () => <input list="x" />;',
    });
    expect(code).toBe(1);
    expect(output).toContain('<select>');
    expect(output).toContain('<datalist>');
    expect(output).toContain('input list=');
  });

  it('does not treat an input without list, or an exported const, as a violation', async () => {
    const { code } = await gate({
      'modules/Plain.tsx': 'export const Plain = () => <input aria-label="name" />;',
    });
    expect(code).toBe(0);
  });

  it('catches leftover native-select CSS markers', async () => {
    const { code, output } = await gate({
      'modules/legacy.css': '[data-ui="native-select"] { color: red; }',
    });
    expect(code).toBe(1);
    expect(output).toContain('legacy.css');
  });

  it('ignores excluded directories such as __tests__ and e2e', async () => {
    const { code } = await gate({
      '__tests__/helper.tsx': "import { NativeSelect } from '../components/ui/native-select';\nexport const H = () => <NativeSelect />;",
      'e2e/page.tsx': 'export const P = () => <select />;',
    });
    expect(code).toBe(0);
  });
});
