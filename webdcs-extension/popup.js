/**
 * The popup: one job — let the user allow the site in the current tab.
 *
 * HMA spreads its dealer tools across hosts (the portal, the DCM Dashboard
 * behind an SSO link, DPM on its own domain) and the extension may only read
 * tabs on hosts it has been granted. Rather than ship a new build for every
 * host, the user clicks the icon on the page in question and allows it.
 * Chrome persists the grant; nothing else changes.
 *
 * Reading the current tab's URL here relies on activeTab, which the click on
 * the icon grants for that tab only.
 */
const REQUIRED = ['https://wdcs.hyundaidealer.com/*', 'https://*.hyundaidealer.com/*'];

const $ = (id) => document.getElementById(id);

function originPatternFor(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.host}/*`;
  } catch {
    return null;
  }
}

function isRequired(pattern) {
  return REQUIRED.some((r) => {
    if (r === pattern) return true;
    const wild = r.match(/^https:\/\/\*\.([^/]+)\/\*$/);
    return wild ? new RegExp(`^https://([^/]+\\.)?${wild[1].replace(/\./g, '\\.')}/\\*$`).test(pattern) : false;
  });
}

async function refreshGranted() {
  const all = await chrome.permissions.getAll();
  const origins = (all.origins || []).filter((o) => !isRequired(o));
  const list = $('granted');
  list.innerHTML = '';
  for (const r of REQUIRED) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="host">${r.replace(/\/\*$/, '')}</span><span class="muted">always</span>`;
    list.appendChild(li);
  }
  for (const o of origins) {
    const li = document.createElement('li');
    const host = document.createElement('span');
    host.className = 'host';
    host.textContent = o.replace(/\/\*$/, '');
    const btn = document.createElement('button');
    btn.className = 'ghost';
    btn.textContent = 'Remove';
    btn.addEventListener('click', async () => {
      await chrome.permissions.remove({ origins: [o] });
      await refreshGranted();
      await refreshCurrent();
    });
    li.append(host, btn);
    list.appendChild(li);
  }
  return new Set([...(all.origins || [])]);
}

let currentPattern = null;

async function refreshCurrent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const pattern = tab && tab.url ? originPatternFor(tab.url) : null;
  currentPattern = pattern;
  const allow = $('allow');
  const status = $('status');
  if (!pattern) {
    $('host').textContent = 'Not a web page';
    allow.disabled = true;
    status.textContent = '';
    return;
  }
  $('host').textContent = pattern.replace(/\/\*$/, '');
  const granted = await chrome.permissions.contains({ origins: [pattern] });
  if (isRequired(pattern) || granted) {
    allow.disabled = true;
    allow.textContent = 'Allowed';
    status.innerHTML = '<span class="ok">The assistant can read this site.</span>';
  } else {
    allow.disabled = false;
    allow.textContent = 'Allow this site';
    status.innerHTML = '<span class="warn">Not allowed yet — the dashboard cannot read this tab.</span>';
  }
}

$('allow').addEventListener('click', async () => {
  if (!currentPattern) return;
  const ok = await chrome.permissions.request({ origins: [currentPattern] });
  $('status').innerHTML = ok
    ? '<span class="ok">Allowed. Go back to the dashboard and run the check.</span>'
    : '<span class="warn">Not granted.</span>';
  await refreshGranted();
  await refreshCurrent();
});

/**
 * Ask the worker which other HMA sites the portal links to, and offer to
 * allow each by name — so DPM can be allowed from the portal tab without
 * anyone reading an address bar. A grant from a popup click is a valid user
 * gesture for any origin, not only the current tab's.
 */
async function refreshDetected() {
  const section = $('detected-section');
  const list = $('detected');
  list.innerHTML = '';
  let res;
  try {
    res = await chrome.runtime.sendMessage({ type: 'webdcs.discover' });
  } catch {
    res = null;
  }
  const sites = (res && res.ok && res.sites) || [];
  const all = await chrome.permissions.getAll();
  const granted = new Set(all.origins || []);
  const pending = sites.filter((s) => !granted.has(s.origin) && !isRequired(s.origin));
  section.hidden = pending.length === 0;
  for (const s of pending) {
    const li = document.createElement('li');
    const host = document.createElement('span');
    host.className = 'host';
    host.textContent = `${s.label} — ${s.origin.replace(/^https:\/\//, '').replace(/\/\*$/, '')}`;
    const btn = document.createElement('button');
    btn.className = 'primary';
    btn.style.width = 'auto';
    btn.style.marginTop = '0';
    btn.textContent = 'Allow';
    btn.addEventListener('click', async () => {
      const ok = await chrome.permissions.request({ origins: [s.origin] });
      $('status').innerHTML = ok
        ? `<span class="ok">${s.label} allowed. Open it and run the check.</span>`
        : '<span class="warn">Not granted.</span>';
      await refreshGranted();
      await refreshDetected();
      await refreshCurrent();
    });
    li.append(host, btn);
    list.appendChild(li);
  }
}

(async () => {
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;
  await refreshGranted();
  await refreshCurrent();
  await refreshDetected();
})();
