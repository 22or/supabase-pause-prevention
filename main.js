require('dotenv').config({ quiet: true });

const { loadProjects, pingTable, pingAuthAdmin } = require('./ping');

const DEFAULT_PING_INTERVAL_DAYS = 3;
const RUN_ONCE = process.argv.includes('--once');

function parsePingIntervalDays() {
  const raw = process.env.PING_INTERVAL_DAYS;
  if (!raw) {
    return DEFAULT_PING_INTERVAL_DAYS;
  }

  const days = Number(raw);
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error('PING_INTERVAL_DAYS must be a positive number');
  }

  return days;
}

const PING_INTERVAL_DAYS = parsePingIntervalDays();
const PING_INTERVAL_MS = PING_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
const projects = loadProjects();

function ts() {
  return new Date().toISOString();
}

function log(level, message) {
  const line = `${ts()} ${message}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function nextPingAt() {
  return new Date(Date.now() + PING_INTERVAL_MS).toISOString();
}

function logStartup() {
  const names = projects.map((p) => p.name).join(', ');
  log('info', 'keep-alive service starting');
  log('info', `loaded ${projects.length} project(s): ${names}`);
  log('info', `ping interval: every ${PING_INTERVAL_DAYS} days`);
}

async function runProjectPing(project) {
  const tableResult = await pingTable(project);
  if (tableResult.ok) {
    log('info', `[${project.name}] ping succeeded via ${tableResult.detail}`);
    return true;
  }

  log('warn', `[${project.name}] ${tableResult.detail}`);

  const authResult = await pingAuthAdmin(project);
  if (authResult.ok) {
    log('info', `[${project.name}] ping succeeded via ${authResult.detail}`);
    return true;
  }

  if (project.serviceRoleKey) {
    log('warn', `[${project.name}] ${authResult.detail}`);
  }

  log(
    'error',
    `[${project.name}] ping failed — run npm run setup to create _keepalive, or add a service role key`
  );
  return false;
}

async function pingAllProjects() {
  log('info', 'ping cycle starting');

  const results = await Promise.all(projects.map(runProjectPing));
  const failed = results.filter((ok) => !ok).length;
  const succeeded = projects.length - failed;

  if (failed === 0) {
    log('info', `ping cycle complete: ${succeeded}/${projects.length} succeeded`);
  } else {
    log('error', `ping cycle complete: ${succeeded}/${projects.length} succeeded, ${failed} failed`);
    if (RUN_ONCE) {
      process.exit(1);
    }
    return;
  }

  if (!RUN_ONCE) {
    log('info', `next ping at ${nextPingAt()}`);
  }
}

process.on('unhandledRejection', (error) => {
  log('error', `unhandled rejection: ${error.message}`);
  process.exit(1);
});

logStartup();
pingAllProjects();

if (!RUN_ONCE) {
  setInterval(pingAllProjects, PING_INTERVAL_MS);
}
