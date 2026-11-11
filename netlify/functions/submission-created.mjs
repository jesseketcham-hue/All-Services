// Runs automatically after every verified Netlify Forms submission on this site.
// Forwards quote requests to the main site (thecleanupcompany), which holds the
// Jobber connection and creates the client + request there.
const env = k => (globalThis.Netlify ? globalThis.Netlify.env.get(k) : process.env[k]) || '';

async function alertFailure(base, payload, error) {
  const d = (payload && payload.data) || {};
  const body = new URLSearchParams({
    'form-name': 'jobber-sync-error',
    subject: 'Jobber sync failed: ' + (d['customer-name'] || 'unknown customer'),
    'customer-name': d['customer-name'] || '', email: d.email || '', phone: d.phone || '', 'request-id': d['request-id'] || '',
    message: 'This quote request did NOT reach Jobber. Add it by hand. Reason: ' + String(error && error.message || error),
  });
  try { await fetch(base + '/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() }); }
  catch (e) { console.error('Could not send failure alert: ' + e.message); }
}

export default async (req) => {
  const { payload } = await req.json();
  if (!payload || payload.form_name !== 'quote') return new Response('skipped');
  const hub = (env('JOBBER_HUB_URL') || 'https://thecleanupcompany.netlify.app').replace(/\/$/, '');
  const base = (env('URL') || new URL(req.url).origin).replace(/\/$/, '');
  try {
    if (!env('SYNC_SECRET')) throw new Error('SYNC_SECRET is not set on the full-service site.');
    let res, text;
    for (let attempt = 1; attempt <= 2; attempt++) {
      res = await fetch(hub + '/jobber/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-sync-secret': env('SYNC_SECRET') },
        body: JSON.stringify({ payload }),
      });
      text = await res.text();
      if (res.ok || res.status < 500) break;
    }
    if (!res.ok) throw new Error('Main site answered ' + res.status + ': ' + text.slice(0, 300));
    console.log('Jobber sync result: ' + text);
  } catch (e) {
    console.error('Jobber sync FAILED for submission ' + payload.id + ': ' + e.message);
    await alertFailure(base, payload, e);
  }
  return new Response('ok');
};
