// Cloudflare Pages Function - /contact
// Bulletproof contact form: Turnstile anti-spam + field validation + Resend email.
// Env bindings:
//   TURNSTILE_SECRET   (secret key for Cloudflare Turnstile)
//   RESEND_API_KEY     (Resend API key)
//   CONTACT_TO         (inbox: opbevaringafcampingvogne@gmail.com)

const SITE = "opbevaring-af-campingvogne.dk";
const ALLOWED_KOERETOEJ = ["Campingvogn","Autocamper","Bådtrailer m. båd","Bil","Mindre køretøj (MC, ATV)"];

function validEmail(e){ return typeof e==="string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length<=120; }

async function verifyTurnstile(token, secret, ip){
  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  if (ip) form.set("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST", body: form,
  });
  const j = await r.json();
  return j.success === true;
}

async function sendEmail(apiKey, to, data){
  const html = [
    `<h3>Ny forespørgsel fra ${SITE}</h3>`,
    `<p><strong>Navn:</strong> ${data.navn}</p>`,
    `<p><strong>Email:</strong> ${data.email}</p>`,
    `<p><strong>Telefon:</strong> ${data.telefon || "—"}</p>`,
    `<p><strong>Køretøj:</strong> ${data.koeretoej || "—"}</p>`,
    `<p><strong>Besked:</strong></p>`,
    `<p>${data.besked || "—"}</p>`,
  ].join("");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `Opbevaring af campingvogne <on@${SITE}>`,
      to: [to],
      subject: `Ny forespørgsel fra ${SITE}`,
      html,
    }),
  });
  return r.ok;
}

function json(status, body){
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const ip = request.headers.get("CF-Connecting-IP") || "";

  let form;
  try { form = await request.formData(); }
  catch { return json(400, { error: "Ugyldig forespørgsel" }); }

  const token = form.get("cf-turnstile-response") || "";
  if (!token) return json(400, { error: "Spam-check mangler." });
  const ok = await verifyTurnstile(token, env.TURNSTILE_SECRET, ip);
  if (!ok) return json(400, { error: "Spam detekteret. Prøv igen." });

  const navn = String(form.get("navn")||"").trim().slice(0,80);
  const email = String(form.get("email")||"").trim();
  const telefon = String(form.get("telefon")||"").trim().slice(0,30);
  const koeretoej = String(form.get("koeretoej")||"").trim();
  const besked = String(form.get("besked")||"").trim().slice(0,2000);
  if (!navn) return json(400, { error: "Navn er påkrævet." });
  if (!validEmail(email)) return json(400, { error: "Ugyldig email." });
  if (!ALLOWED_KOERETOEJ.includes(koeretoej)) return json(400, { error: "Ugyldigt køretøj." });

  if (!env.RESEND_API_KEY) return json(500, { error: "Kontaktformularen er ikke konfigureret endnu." });
  const sent = await sendEmail(env.RESEND_API_KEY, env.CONTACT_TO, { navn, email, telefon, koeretoej, besked });
  if (!sent) return json(502, { error: "Kunne ikke sende. Prøv igen senere." });

  return json(200, { ok: true });
}
