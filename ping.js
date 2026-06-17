const { DEFAULT_TABLE } = require('./keepalive');

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

function resolveServiceRoleKey(project) {
  return project.serviceRoleKey || project.service_role_key || null;
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
        serviceRoleKey: resolveServiceRoleKey(project),
        table: project.table || DEFAULT_TABLE,
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
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || null,
        table: process.env.SUPABASE_TABLE || DEFAULT_TABLE,
      },
    ];
  }

  throw new Error(
    'No Supabase projects configured. Set SUPABASE_PROJECTS or NEXT_PUBLIC_SUPABASE_URL with an API key'
  );
}

function authHeaders(apiKey) {
  return {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
  };
}

async function pingPath(project, path, apiKey = project.apiKey) {
  return fetch(`${project.url}${path}`, {
    headers: authHeaders(apiKey),
  });
}

async function pingTable(project) {
  try {
    const path = `/rest/v1/${encodeURIComponent(project.table)}?select=id&limit=1`;
    const response = await pingPath(project, path);

    if (response.ok) {
      return { ok: true, detail: `database select on "${project.table}"` };
    }

    if (response.status === 404) {
      return {
        ok: false,
        detail: `table "${project.table}" not found — run npm run setup or sql/keepalive.sql in the SQL Editor`,
      };
    }

    return { ok: false, detail: `database select returned HTTP ${response.status}` };
  } catch (error) {
    return {
      ok: false,
      detail: error.message.includes('fetch failed')
        ? 'project unreachable — it may already be paused'
        : `database select failed: ${error.message}`,
    };
  }
}

async function pingAuthAdmin(project) {
  if (!project.serviceRoleKey) {
    return { ok: false, detail: 'no service role key configured' };
  }

  try {
    const response = await pingPath(
      project,
      '/auth/v1/admin/users?page=1&per_page=1',
      project.serviceRoleKey
    );

    if (response.ok) {
      return { ok: true, detail: 'auth admin users query' };
    }

    return { ok: false, detail: `auth admin returned HTTP ${response.status}` };
  } catch (error) {
    return {
      ok: false,
      detail: error.message.includes('fetch failed')
        ? 'project unreachable — it may already be paused'
        : `auth admin failed: ${error.message}`,
    };
  }
}

async function pingProject(project) {
  const tableResult = await pingTable(project);
  if (tableResult.ok) {
    return tableResult;
  }

  if (!project.serviceRoleKey) {
    return tableResult;
  }

  const authResult = await pingAuthAdmin(project);
  if (authResult.ok) {
    return authResult;
  }

  return authResult;
}

module.exports = {
  normalizeUrl,
  loadProjects,
  pingTable,
  pingAuthAdmin,
  pingProject,
};
