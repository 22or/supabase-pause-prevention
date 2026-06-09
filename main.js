require('dotenv').config();

const PING_INTERVAL_MS = 1000 * 60 * 60 * 24; // 24 hours

const PING_ENDPOINTS = [
  { path: '/auth/v1/health', label: 'auth health' },
  { path: '/rest/v1/', label: 'rest api' },
];

function normalizeUrl(url) {
  return url.replace(/\/+$/, '');
}

function resolveApiKey(project, index) {
  const apiKey =
    project.anonKey ||
    project.anon_key ||
    project.key ||
    project.serviceRoleKey ||
    project.service_role_key;

  if (!apiKey) {
    throw new Error(
      `Project at index ${index} is missing an API key ("anonKey" recommended, or "key"/"serviceRoleKey")`
    );
  }

  return apiKey;
}

function loadProjects() {
  if (process.env.SUPABASE_PROJECTS) {
    let projects;
    try {
      projects = JSON.parse(process.env.SUPABASE_PROJECTS);
    } catch {
      throw new Error('SUPABASE_PROJECTS must be valid JSON');
    }

    if (!Array.isArray(projects) || projects.length === 0) {
      throw new Error('SUPABASE_PROJECTS must be a non-empty JSON array');
    }

    return projects.map((project, index) => {
      const url = project.url;

      if (!url) {
        throw new Error(`Project at index ${index} is missing "url"`);
      }

      return {
        name: project.name || `project-${index + 1}`,
        url: normalizeUrl(url),
        apiKey: resolveApiKey(project, index),
      };
    });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apiKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && apiKey) {
    return [
      {
        name: process.env.SUPABASE_PROJECT_NAME || 'default',
        url: normalizeUrl(url),
        apiKey,
      },
    ];
  }

  throw new Error(
    'No Supabase projects configured. Set SUPABASE_PROJECTS or NEXT_PUBLIC_SUPABASE_URL with an API key'
  );
}

const projects = loadProjects();

async function pingEndpoint(project, endpoint) {
  const response = await fetch(`${project.url}${endpoint.path}`, {
    headers: {
      apikey: project.apiKey,
      Authorization: `Bearer ${project.apiKey}`,
    },
  });

  return { endpoint, response };
}

async function pingProject(project) {
  for (const endpoint of PING_ENDPOINTS) {
    try {
      const { response } = await pingEndpoint(project, endpoint);

      if (response.ok) {
        console.log(`[${project.name}] Ping succeeded via ${endpoint.label}`);
        return;
      }

      console.warn(
        `[${project.name}] ${endpoint.label} returned HTTP ${response.status}`
      );
    } catch (error) {
      console.warn(`[${project.name}] ${endpoint.label} failed:`, error.message);
    }
  }

  console.error(`[${project.name}] All ping methods failed`);
}

async function pingAllProjects() {
  await Promise.all(projects.map(pingProject));
}

pingAllProjects();
setInterval(pingAllProjects, PING_INTERVAL_MS);
