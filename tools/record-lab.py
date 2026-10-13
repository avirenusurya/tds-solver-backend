#!/usr/bin/env python3
"""Drive real shell input through the official recorder's PTY; never edit a cast."""
import errno, fcntl, json, os, pty, re, select, signal, struct, sys, termios, time
from pathlib import Path

spec = json.loads(Path(sys.argv[1]).read_text())
pid, master = pty.fork()
if pid == 0:
    os.chdir(spec['cwd'])
    os.execvp(spec['command'], [spec['command'], 'rec', '--command', 'bash --noprofile --norc -i', '--window-size', '512x60', '--return', spec['cast']])
fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', 60, 512, 0, 0))
deadline = time.monotonic() + spec.get('timeout', 900)
output = b''

def read_until(pattern, timeout=120):
    global output
    start = time.monotonic()
    while time.monotonic() < deadline and time.monotonic() - start < timeout:
        ready, _, _ = select.select([master], [], [], 0.2)
        if not ready:
            done, status = os.waitpid(pid, os.WNOHANG)
            if done: raise RuntimeError('Recorder exited before the lab completed.')
            continue
        try: chunk = os.read(master, 65536)
        except OSError as error:
            if error.errno == errno.EIO: raise RuntimeError('Recorder terminal closed unexpectedly.')
            raise
        if not chunk: raise RuntimeError('Recorder terminal closed unexpectedly.')
        output = (output + chunk)[-500000:]
        text = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', output.decode(errors='replace')).replace('\r', '')
        match = re.search(pattern, text)
        if match:
            output = b''
            return match, text
    raise RuntimeError('Timed out waiting for the real command output.')

try:
    time.sleep(0.5)
    os.write(master, b"printf '\\n__TDS_READY__\\n'\n")
    read_until(r'\n__TDS_READY__\n', 30)
    for index, command in enumerate(spec['commands']):
        marker = '__TDS_DONE_' + str(index) + '__'
        os.write(master, (command + '\nprintf "\\n' + marker + '%s\\n" "$?"\n').encode())
        match, text = read_until(r'\n' + marker + r'(\d+)\n')
        if int(match.group(1)) != 0: raise RuntimeError('Lab command ' + str(index + 1) + ' failed with exit status ' + match.group(1))
    os.write(master, b'exit\n')
    while time.monotonic() < deadline:
        done, status = os.waitpid(pid, os.WNOHANG)
        if done:
            if os.waitstatus_to_exitcode(status) != 0: raise RuntimeError('Recorder exited with an error.')
            break
        readable, _, _ = select.select([master], [], [], 0.2)
        if readable:
            try: os.read(master, 65536)
            except OSError: pass
    else: raise RuntimeError('Recorder did not flush its signed receipt.')
    if not Path(spec['cwd'], spec['cast'] + '.jwt').exists(): raise RuntimeError('Official signed receipt was not written.')
    print(json.dumps({'ok': True, 'commands': len(spec['commands'])}))
except Exception as error:
    try: os.write(master, b'exit\n')
    except OSError: pass
    try: os.kill(pid, signal.SIGTERM)
    except ProcessLookupError: pass
    print(str(error), file=sys.stderr)
    sys.exit(1)
finally:
    os.close(master)
