// An isolated TCP service used to verify ownership and process cleanup.
import net from 'node:net';
import fs from 'node:fs';
const args = process.argv.slice(2), endpoint = args[args.indexOf('-s') + 1];
if (args.includes('-m')) {
  const server = net.createServer(socket => socket.end());
  server.on('error', () => process.exit(2));
  server.listen(Number(endpoint.split(':').at(-1)), '127.0.0.1');
  if (process.env.CYH_FAKE_PID) fs.writeFileSync(process.env.CYH_FAKE_PID, String(process.pid));
} else {
  if (!args.includes('-p')) throw Error('clients must not auto-start a server');
  console.log('[Empty]');
}
