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

function authHeaders(apiKey, extra = {}) {
  return {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    ...extra,
  };
}

async function pingPath(project, path, apiKey = project.apiKey) {
  return fetch(`${project.url}${path}`, {
    headers: authHeaders(apiKey),
  });
}

async function updateKeepalive(project, apiKey) {
  const path = `/rest/v1/${encodeURIComponent(project.table)}?id=eq.1`;

  try {
    const response = await fetch(`${project.url}${path}`, {
      method: 'PATCH',
      headers: authHeaders(apiKey, {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      }),
      body: JSON.stringify({ pinged_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(15000),
    });

    if (response.ok) {
      let rows = [];
      try {
        rows = await response.json();
      } catch {
        rows = [];
      }

      if (Array.isArray(rows) && rows.length > 0) {
        return { ok: true, detail: `database update on "${project.table}"` };
      }

      return {
        ok: false,
        missingPolicy: true,
        detail: `table "${project.table}" missing anon UPDATE policy — re-run sql/keepalive.sql in the SQL Editor`,
      };
    }

    if (response.status === 404) {
      return {
        ok: false,
        detail: `table "${project.table}" not found — run npm run setup or sql/keepalive.sql in the SQL Editor`,
      };
    }

    return { ok: false, detail: `database update returned HTTP ${response.status}` };
  } catch (error) {
    return {
      ok: false,
      networkError: true,
      detail: error.message.includes('fetch failed')
        ? 'project unreachable — it may already be paused'
        : `database update failed: ${error.message}`,
    };
  }
}

async function pingTable(project) {
  let result = await updateKeepalive(project, project.apiKey);

  if (!result.ok && result.networkError) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    result = await updateKeepalive(project, project.apiKey);
  }

  if (!result.ok && result.missingPolicy && project.serviceRoleKey) {
    result = await updateKeepalive(project, project.serviceRoleKey);
  }

  return result;
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
