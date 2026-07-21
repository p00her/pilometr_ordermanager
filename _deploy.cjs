const { Client } = require('ssh2');
const conn = new Client();
const cmds = [
  'cd /root/pilometr_ordermanager && git pull',
  'cd /root/pilometr_ordermanager && docker build -t order-manager .',
  'docker rm -f order-manager && docker run -d --restart=unless-stopped --name order-manager -p 8088:8088 -v order-manager-data:/app/data -v /data/compose/1/letsencrypt:/etc/letsencrypt:ro order-manager && docker network connect npm_default order-manager',
  'echo "---done---"',
];
let idx = 0;
function run() {
  if (idx >= cmds.length) { conn.end(); return; }
  conn.exec(cmds[idx++], (err, stream) => {
    if (err) { console.log('ERR:', err.message); run(); return; }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stdout.write(d.toString()));
    stream.on('close', () => run());
  });
}
conn.on('ready', run).on('error', e => console.log('ERR:', e.message)).connect({
  host: '188.225.18.11', username: 'root', password: 'ndW-_Q-Ee,p79f', readyTimeout: 15000
});
