// api/deploy.js — Vercel Serverless Function
// Token GitHub disimpan di Environment Variable Vercel, tidak ada di kode ini

const GITHUB_API = 'https://api.github.com';

export default async function handler(req, res) {
  // CORS — izinkan request dari mana saja
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Ambil token dari Environment Variable Vercel (aman)
  const TOKEN   = process.env.GITHUB_TOKEN;
  const GH_USER = process.env.GITHUB_USER;

  if (!TOKEN || !GH_USER) {
    return res.status(500).json({ ok: false, error: 'Server belum dikonfigurasi. Hubungi admin.' });
  }

  const { action, name, gasUrl } = req.body;

  // Validasi input
  if (!name || !gasUrl) {
    return res.status(400).json({ ok: false, error: 'Nama project dan URL GAS wajib diisi.' });
  }
  if (!gasUrl.startsWith('https://script.google.com')) {
    return res.status(400).json({ ok: false, error: 'URL GAS tidak valid.' });
  }

  const repoName = name.toLowerCase().replace(/\s+/g, '-');
  const liveUrl  = `https://${GH_USER}.github.io/${repoName}/`;

  try {
    // Cek apakah repo sudah ada
    const checkRes = await fetch(`${GITHUB_API}/repos/${GH_USER}/${repoName}`, {
      headers: { Authorization: `token ${TOKEN}` }
    });
    const repoExists = checkRes.status === 200;

    const htmlContent = buildHtml(gasUrl, repoName);
    const encoded     = Buffer.from(htmlContent).toString('base64');

    if (repoExists) {
      // Update file yang sudah ada
      await updateFile(TOKEN, GH_USER, repoName, encoded);
      return res.status(200).json({ ok: true, url: liveUrl, action: 'updated' });
    }

    // Buat repo baru
    await createRepo(TOKEN, GH_USER, repoName);
    await delay(1500);
    await createFile(TOKEN, GH_USER, repoName, encoded);
    await delay(2000);
    await enablePages(TOKEN, GH_USER, repoName);

    return res.status(200).json({ ok: true, url: liveUrl, action: 'created' });

  } catch (err) {
    console.error('Deploy error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ── GITHUB API HELPERS ──────────────────────────────────────

async function createRepo(token, user, repo) {
  const r = await fetch(`${GITHUB_API}/user/repos`, {
    method: 'POST',
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: repo,
      private: false,
      auto_init: true,
      description: `Survey - ${repo}`
    })
  });
  if (!r.ok) {
    const d = await r.json();
    throw new Error(d.message || 'Gagal membuat repository');
  }
  return r.json();
}

async function createFile(token, user, repo, encoded) {
  const r = await fetch(`${GITHUB_API}/repos/${user}/${repo}/contents/index.html`, {
    method: 'PUT',
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: 'Add survey page',
      content: encoded
    })
  });
  if (!r.ok) {
    const d = await r.json();
    throw new Error(d.message || 'Gagal upload file');
  }
  return r.json();
}

async function updateFile(token, user, repo, encoded) {
  // Ambil SHA file yang ada
  const fileRes = await fetch(`${GITHUB_API}/repos/${user}/${repo}/contents/index.html`, {
    headers: { Authorization: `token ${token}` }
  });
  const fileData = await fileRes.json();
  const sha = fileData.sha || '';

  const r = await fetch(`${GITHUB_API}/repos/${user}/${repo}/contents/index.html`, {
    method: 'PUT',
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: 'Update survey URL',
      content: encoded,
      sha: sha
    })
  });
  if (!r.ok) {
    const d = await r.json();
    throw new Error(d.message || 'Gagal update file');
  }
  return r.json();
}

async function enablePages(token, user, repo) {
  const r = await fetch(`${GITHUB_API}/repos/${user}/${repo}/pages`, {
    method: 'POST',
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.switcheroo-preview+json'
    },
    body: JSON.stringify({ source: { branch: 'main', path: '/' } })
  });
  // 201 = created, 409 = sudah ada — keduanya OK
  if (r.status !== 201 && r.status !== 409) {
    const d = await r.json();
    throw new Error(d.message || 'Gagal aktifkan GitHub Pages');
  }
  return r.json();
}

// ── BUILD HTML ──────────────────────────────────────────────

function buildHtml(gasUrl, title) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; }
  iframe { display: block; width: 100%; height: 100vh; height: 100dvh; border: none; }
</style>
</head>
<body>
  <iframe src="${gasUrl}" allow="camera; microphone; geolocation" allowfullscreen></iframe>
</body>
</html>`;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

