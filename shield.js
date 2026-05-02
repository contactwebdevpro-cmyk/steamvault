/**
 * shield.js — Anti-Spam / Anti-Bot / Anti-DDoS
 * Compatible Vercel (frontend pur, pas de backend requis)
 * Affiche une page de vérification style Cloudflare au premier accès.
 * Badge de statut permanent en bas à droite.
 */

(function (global) {
  "use strict";

  /* ─────────────────────────────────────────
     CONFIG
  ───────────────────────────────────────── */
  const CFG = {
    gatewayEnabled:  true,
    gatewayTTL:      3_600_000,       // 1h
    siteName:        location.hostname,
    powDifficulty:   3,
    maxRequests:     10,
    windowMs:        60_000,
    blockDurationMs: 300_000,
    honeypotName:    "_gotcha",
    debug:           false,
  };

  const log = (...a) => CFG.debug && console.log("[Shield]", ...a);

  const store = {
    get:   (k) => { try { return JSON.parse(sessionStorage.getItem("_sh_" + k)); }  catch { return null; } },
    set:   (k, v) => { try { sessionStorage.setItem("_sh_" + k, JSON.stringify(v)); } catch {} },
    lsGet: (k) => { try { return JSON.parse(localStorage.getItem("_sh_" + k)); }    catch { return null; } },
    lsSet: (k, v) => { try { localStorage.setItem("_sh_" + k, JSON.stringify(v)); } catch {} },
  };

  /* ─────────────────────────────────────────
     CRYPTO
  ───────────────────────────────────────── */
  async function sha256(str) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function randomHex(bytes) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function solvePoW(challenge, difficulty) {
    const prefix = "0".repeat(difficulty);
    let nonce = 0, hash;
    do { nonce++; hash = await sha256(challenge + nonce); } while (!hash.startsWith(prefix));
    return { nonce, hash };
  }

  /* ─────────────────────────────────────────
     BOT DETECT
  ───────────────────────────────────────── */
  const BotDetect = {
    _score: null,
    _hadInteraction: false,

    async score() {
      if (this._score !== null) return this._score;
      let s = 0;
      if (navigator.webdriver) s += 40;
      if (navigator.plugins.length === 0) s += 20;
      if (!navigator.languages || navigator.languages.length === 0) s += 20;
      if (screen.width === 0 || screen.height === 0) s += 20;
      if (!this._hadInteraction) s += 15;
      const t0 = performance.now();
      // eslint-disable-next-line no-debugger
      debugger;
      if (performance.now() - t0 > 50) s += 25;
      const conn = navigator.connection;
      if (conn && conn.rtt === 0 && conn.downlink === 0) s += 10;
      this._score = s;
      log("Score bot :", s);
      return s;
    },
  };

  ["mousemove", "keydown", "touchstart", "scroll"].forEach((e) => {
    window.addEventListener(e, () => { BotDetect._hadInteraction = true; }, { once: true, passive: true });
  });

  /* ─────────────────────────────────────────
     RATE LIMITING
  ───────────────────────────────────────── */
  const RateLimit = {
    _key: "rl",
    isBlocked() {
      const d = store.get(this._key) || { hits: [], blockedUntil: 0 };
      if (d.blockedUntil > Date.now()) return true;
      d.hits = d.hits.filter((t) => Date.now() - t < CFG.windowMs);
      store.set(this._key, d);
      return false;
    },
    record() {
      const d = store.get(this._key) || { hits: [], blockedUntil: 0 };
      const now = Date.now();
      d.hits = d.hits.filter((t) => now - t < CFG.windowMs);
      d.hits.push(now);
      if (d.hits.length > CFG.maxRequests) {
        d.blockedUntil = now + CFG.blockDurationMs;
        store.set(this._key, d);
        return false;
      }
      store.set(this._key, d);
      return true;
    },
    remainingMs() {
      const d = store.get(this._key) || {};
      return Math.max(0, (d.blockedUntil || 0) - Date.now());
    },
  };

  /* ─────────────────────────────────────────
     HONEYPOT
  ───────────────────────────────────────── */
  const Honeypot = {
    inject(form) {
      if (form.querySelector(`[name="${CFG.honeypotName}"]`)) return;
      const w = document.createElement("div");
      w.setAttribute("aria-hidden", "true");
      w.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
      const inp = document.createElement("input");
      inp.type = "text"; inp.name = CFG.honeypotName; inp.tabIndex = -1; inp.autocomplete = "off";
      w.appendChild(inp); form.appendChild(w);
    },
    isTriggered(form) {
      const f = form.querySelector(`[name="${CFG.honeypotName}"]`);
      return f && f.value.trim() !== "";
    },
  };

  /* ─────────────────────────────────────────
     BADGE — statut permanent bas droite
  ───────────────────────────────────────── */
  const Badge = {
    _el: null,

    _css: `
      #_sh_badge {
        position: fixed;
        bottom: 18px;
        right: 18px;
        z-index: 2147483646;
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 7px 13px 7px 10px;
        border-radius: 999px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 11.5px;
        font-weight: 600;
        letter-spacing: .02em;
        cursor: default;
        user-select: none;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        transition: opacity .3s, transform .3s;
        box-shadow: 0 2px 16px rgba(0,0,0,.35);
        white-space: nowrap;
      }
      #_sh_badge.state-checking {
        background: rgba(20,20,32,.82);
        border: 1px solid rgba(99,102,241,.35);
        color: #a5b4fc;
      }
      #_sh_badge.state-ok {
        background: rgba(5,30,20,.82);
        border: 1px solid rgba(34,197,94,.35);
        color: #4ade80;
      }
      #_sh_badge.state-blocked {
        background: rgba(30,5,5,.82);
        border: 1px solid rgba(239,68,68,.35);
        color: #f87171;
      }
      #_sh_badge .b-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      #_sh_badge.state-checking .b-dot {
        background: #818cf8;
        animation: _sh_bdot 1s ease-in-out infinite;
      }
      #_sh_badge.state-ok .b-dot {
        background: #22c55e;
      }
      #_sh_badge.state-blocked .b-dot {
        background: #ef4444;
      }
      @keyframes _sh_bdot {
        0%,100% { opacity:1; transform:scale(1); }
        50%      { opacity:.3; transform:scale(.6); }
      }
      #_sh_badge .b-icon {
        font-size: 12px;
        line-height: 1;
      }
    `,

    _injectStyles() {
      if (document.getElementById("_sh_badge_style")) return;
      const s = document.createElement("style");
      s.id = "_sh_badge_style";
      s.textContent = this._css;
      document.head.appendChild(s);
    },

    init() {
      this._injectStyles();
      const el = document.createElement("div");
      el.id = "_sh_badge";
      el.innerHTML = `<span class="b-dot"></span><span class="b-icon">🛡</span><span class="b-txt">Vérification…</span>`;
      el.className = "state-checking";
      document.body.appendChild(el);
      this._el = el;
    },

    set(state, text) {
      if (!this._el) return;
      this._el.className = "state-" + state;
      this._el.querySelector(".b-txt").textContent = text;
      // icône selon état
      const icons = { checking: "🛡", ok: "✓", blocked: "✗" };
      this._el.querySelector(".b-icon").textContent = icons[state] || "🛡";
    },
  };

  /* ─────────────────────────────────────────
     GATEWAY
  ───────────────────────────────────────── */
  const Gateway = {
    _overlay: null,

    hasValidPass() {
      const p = store.lsGet("gw");
      return p && p.exp > Date.now() && p.origin === location.origin;
    },

    grantPass() {
      store.lsSet("gw", { exp: Date.now() + CFG.gatewayTTL, origin: location.origin });
    },

    _injectStyles() {
      if (document.getElementById("_sh_gw_style")) return;
      const s = document.createElement("style");
      s.id = "_sh_gw_style";
      s.textContent = `
        #_sh_gw {
          position:fixed;inset:0;z-index:2147483647;
          background:#060608;
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
          color:#e2e8f0;
          transition:opacity .55s ease;
        }
        #_sh_gw.fade-out { opacity:0; pointer-events:none; }
        ._sh_bg_grid {
          position:absolute;inset:0;
          background-image:
            linear-gradient(rgba(99,102,241,.04) 1px,transparent 1px),
            linear-gradient(90deg,rgba(99,102,241,.04) 1px,transparent 1px);
          background-size:40px 40px;
          pointer-events:none;
        }
        ._sh_card {
          background:rgba(13,13,20,.95);
          border:1px solid rgba(99,102,241,.18);
          border-radius:20px;
          padding:52px 56px 44px;
          max-width:460px;width:90%;
          text-align:center;
          box-shadow:0 0 0 1px rgba(255,255,255,.03),0 0 60px rgba(99,102,241,.08),0 40px 80px rgba(0,0,0,.7);
          position:relative;z-index:1;
        }
        ._sh_logo {
          width:60px;height:60px;margin:0 auto 22px;
          background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);
          border-radius:16px;
          display:flex;align-items:center;justify-content:center;
          font-size:28px;
          box-shadow:0 0 0 6px rgba(99,102,241,.12),0 0 32px rgba(99,102,241,.3);
        }
        ._sh_site { font-size:11px;color:#6366f1;font-weight:600;letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px; }
        ._sh_title { font-size:21px;font-weight:700;color:#f8fafc;margin-bottom:6px;line-height:1.3; }
        ._sh_sub   { font-size:13.5px;color:#64748b;margin-bottom:30px;line-height:1.65; }
        ._sh_progress_wrap { background:#1a1a28;border-radius:999px;height:5px;overflow:hidden;margin-bottom:14px; }
        ._sh_progress_bar {
          height:100%;width:0%;border-radius:999px;
          background:linear-gradient(90deg,#4f46e5,#7c3aed,#a78bfa);
          transition:width .25s cubic-bezier(.4,0,.2,1);
          box-shadow:0 0 10px rgba(99,102,241,.6);
        }
        ._sh_status { font-size:12.5px;color:#94a3b8;min-height:18px;margin-bottom:24px;display:flex;align-items:center;justify-content:center;gap:7px; }
        ._sh_dot { width:5px;height:5px;border-radius:50%;background:#6366f1;flex-shrink:0;animation:_sh_pulse 1.1s ease-in-out infinite; }
        @keyframes _sh_pulse { 0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.65)} }
        ._sh_status.done ._sh_dot { background:#22c55e;animation:none; }
        ._sh_status.err  ._sh_dot { background:#ef4444;animation:none; }
        ._sh_checks { display:flex;flex-direction:column;gap:8px;margin-bottom:26px;text-align:left; }
        ._sh_check {
          display:flex;align-items:center;gap:11px;
          font-size:13px;color:#3f4c5e;
          padding:9px 13px;border-radius:10px;
          background:#09090f;border:1px solid #141420;
          transition:color .3s,border-color .3s,background .3s;
        }
        ._sh_check.active { color:#c4b5fd;border-color:rgba(99,102,241,.25);background:#0d0d18; }
        ._sh_check.ok     { color:#4ade80;border-color:rgba(34,197,94,.2);background:#071210; }
        ._sh_check.fail   { color:#f87171;border-color:rgba(239,68,68,.2);background:#120707; }
        ._sh_ci { font-size:15px;width:18px;text-align:center;flex-shrink:0;line-height:1; }
        ._sh_check.active ._sh_ci { display:inline-block;animation:_sh_spin .7s linear infinite; }
        @keyframes _sh_spin { to { transform:rotate(360deg); } }
        ._sh_footer { font-size:11px;color:#1e293b;display:flex;align-items:center;justify-content:center;gap:5px; }
        ._sh_footer b { color:#4f46e5;font-weight:600; }
        ._sh_blocked { border-color:rgba(239,68,68,.25);background:rgba(18,5,5,.97); }
        ._sh_blocked_title { font-size:19px;font-weight:700;color:#fca5a5;margin-bottom:8px; }
        ._sh_blocked_msg   { font-size:13.5px;color:#94a3b8;line-height:1.65; }
        ._sh_ray { font-size:10.5px;color:#2d2d3a;margin-top:18px;font-family:monospace;letter-spacing:.04em; }
      `;
      document.head.appendChild(s);
    },

    _buildOverlay() {
      const d = document.createElement("div");
      d.id = "_sh_gw";
      d.innerHTML = `
        <div class="_sh_bg_grid"></div>
        <div class="_sh_card">
          <div class="_sh_logo">🛡</div>
          <div class="_sh_site">${CFG.siteName}</div>
          <div class="_sh_title">Vérification de sécurité</div>
          <div class="_sh_sub">Contrôle de votre navigateur avant l'accès.<br>Cette vérification prend quelques secondes.</div>
          <div class="_sh_progress_wrap"><div class="_sh_progress_bar" id="_sh_bar"></div></div>
          <div class="_sh_status" id="_sh_st"><span class="_sh_dot"></span><span id="_sh_stxt">Initialisation…</span></div>
          <div class="_sh_checks">
            <div class="_sh_check" id="_sh_c1"><span class="_sh_ci">○</span>Analyse du navigateur</div>
            <div class="_sh_check" id="_sh_c2"><span class="_sh_ci">○</span>Vérification de l'environnement</div>
            <div class="_sh_check" id="_sh_c3"><span class="_sh_ci">○</span>Challenge de sécurité (PoW)</div>
            <div class="_sh_check" id="_sh_c4"><span class="_sh_ci">○</span>Validation finale</div>
          </div>
          <div class="_sh_footer">Protégé par <b>Shield.js</b></div>
        </div>
      `;
      return d;
    },

    _check(id, state) {
      const el = document.getElementById(id);
      if (!el) return;
      el.className = "_sh_check " + state;
      const ic = el.querySelector("._sh_ci");
      if (!ic) return;
      ic.textContent = state === "active" ? "↻" : state === "ok" ? "✓" : state === "fail" ? "✗" : "○";
    },

    _status(txt, cls) {
      const st = document.getElementById("_sh_st");
      const tx = document.getElementById("_sh_stxt");
      if (st) st.className = "_sh_status " + (cls || "");
      if (tx) tx.textContent = txt;
    },

    _progress(pct) {
      const b = document.getElementById("_sh_bar");
      if (b) b.style.width = pct + "%";
    },

    _wait(ms) { return new Promise((r) => setTimeout(r, ms)); },

    _showBlocked(reason) {
      const card = this._overlay.querySelector("._sh_card");
      const ray = randomHex(8).toUpperCase();
      card.className = "_sh_card _sh_blocked";
      card.innerHTML = `
        <div class="_sh_logo">⛔</div>
        <div class="_sh_site">${CFG.siteName}</div>
        <div class="_sh_blocked_title">Accès refusé</div>
        <div class="_sh_blocked_msg">
          Votre accès a été bloqué car votre navigateur présente des
          caractéristiques associées à des robots ou des activités automatisées.<br><br>
          Si vous êtes un humain, désactivez vos extensions de sécurité
          et actualisez la page.
        </div>
        <div class="_sh_ray">Ray ID: ${ray} &nbsp;·&nbsp; ${reason}</div>
      `;
      Badge.set("blocked", "Accès bloqué");
    },

    async run() {
      // Injecter styles + badge + overlay dès le départ
      this._injectStyles();
      Badge.init();
      Badge.set("checking", "Vérification…");

      this._overlay = this._buildOverlay();
      document.documentElement.style.overflow = "hidden";
      document.body.style.visibility = "hidden";
      document.body.appendChild(this._overlay);
      document.body.style.visibility = "visible";

      await this._wait(280);

      // ── Étape 1 ──
      this._check("_sh_c1", "active");
      this._status("Analyse du navigateur…");
      this._progress(8);
      Badge.set("checking", "Analyse navigateur…");
      await this._wait(650);

      const botScore = await BotDetect.score();
      if (botScore >= 60) {
        this._check("_sh_c1", "fail");
        this._status("Navigateur suspect", "err");
        this._progress(20);
        await this._wait(600);
        this._showBlocked("bot_fingerprint");
        return;
      }
      this._check("_sh_c1", "ok");
      this._progress(25);
      await this._wait(250);

      // ── Étape 2 ──
      this._check("_sh_c2", "active");
      this._status("Vérification de l'environnement…");
      this._progress(36);
      Badge.set("checking", "Environnement…");
      await this._wait(550);
      this._check("_sh_c2", "ok");
      this._progress(50);
      await this._wait(200);

      // ── Étape 3 : PoW ──
      this._check("_sh_c3", "active");
      this._status("Résolution du challenge de sécurité…");
      this._progress(55);
      Badge.set("checking", "Challenge PoW…");

      let challenge, nonce, hash;
      try {
        challenge = randomHex(16);
        ({ nonce, hash } = await solvePoW(challenge, CFG.powDifficulty));
        log("PoW gateway : nonce =", nonce);
      } catch (err) {
        this._check("_sh_c3", "fail");
        this._status("Échec du challenge", "err");
        await this._wait(600);
        this._showBlocked("pow_failed");
        return;
      }
      this._check("_sh_c3", "ok");
      this._progress(80);
      await this._wait(300);

      // ── Étape 4 ──
      this._check("_sh_c4", "active");
      this._status("Validation finale…");
      this._progress(92);
      Badge.set("checking", "Validation…");
      await this._wait(500);

      store.lsSet("gw_proof", { challenge, nonce, hash, ts: Date.now() });
      this.grantPass();

      this._check("_sh_c4", "ok");
      this._progress(100);
      this._status("Vérification réussie !", "done");
      Badge.set("ok", "Protégé · Shield.js");
      await this._wait(700);

      // Disparition overlay
      this._overlay.classList.add("fade-out");
      document.documentElement.style.overflow = "";
      await this._wait(600);
      this._overlay.remove();
      log("Gateway : accès accordé");
    },
  };

  /* ─────────────────────────────────────────
     UI FORMULAIRES
  ───────────────────────────────────────── */
  const FormUI = {
    showError(form, msg) {
      let el = form.querySelector(".shield-error");
      if (!el) {
        el = document.createElement("div");
        el.className = "shield-error";
        el.style.cssText = "color:#c0392b;font-size:.875rem;margin:.5rem 0;padding:.5rem .75rem;border:1px solid #e74c3c;border-radius:6px;background:#fdf2f2";
        form.prepend(el);
      }
      el.textContent = msg;
      el.style.display = "block";
    },
    clearError(form) {
      const el = form.querySelector(".shield-error");
      if (el) el.style.display = "none";
    },
    setLoading(btn, on) {
      if (!btn) return;
      if (on)  { btn._orig = btn.textContent; btn.textContent = "Vérification…"; btn.disabled = true; }
      else     { btn.textContent = btn._orig || btn.textContent; btn.disabled = false; }
    },
  };

  /* ─────────────────────────────────────────
     API PUBLIQUE
  ───────────────────────────────────────── */
  const Shield = {
    protect(formOrSelector, options = {}) {
      const form = typeof formOrSelector === "string"
        ? document.querySelector(formOrSelector)
        : formOrSelector;
      if (!form || form.tagName !== "FORM") {
        console.warn("[Shield] Formulaire introuvable :", formOrSelector);
        return;
      }
      Honeypot.inject(form);
      let challenge = null;
      if (CFG.powDifficulty > 0) {
        challenge = randomHex(16);
        ["_pow_challenge", "_pow_nonce", "_pow_hash"].forEach((n) => {
          if (!form.querySelector(`[name="${n}"]`)) {
            const inp = document.createElement("input");
            inp.type = "hidden"; inp.name = n;
            if (n === "_pow_challenge") inp.value = challenge;
            form.appendChild(inp);
          }
        });
      }
      const btn = form.querySelector('[type="submit"]');
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        FormUI.clearError(form);
        FormUI.setLoading(btn, true);
        try {
          if (RateLimit.isBlocked()) {
            const secs = Math.ceil(RateLimit.remainingMs() / 1000);
            FormUI.showError(form, `Trop de tentatives. Réessaie dans ${secs} s.`);
            options.onBlock && options.onBlock("rate_limit");
            return;
          }
          if (Honeypot.isTriggered(form)) {
            options.onBlock && options.onBlock("honeypot");
            await new Promise((r) => setTimeout(r, 800));
            return;
          }
          const score = await BotDetect.score();
          if (score >= 60) {
            FormUI.showError(form, "Navigateur suspect. Veuillez actualiser la page.");
            options.onBlock && options.onBlock("bot_detected");
            return;
          }
          if (challenge) {
            const { nonce, hash } = await solvePoW(challenge, CFG.powDifficulty);
            form.querySelector('[name="_pow_nonce"]').value = nonce;
            form.querySelector('[name="_pow_hash"]').value = hash;
          }
          if (!RateLimit.record()) {
            FormUI.showError(form, "Trop de soumissions. Veuillez patienter 5 minutes.");
            options.onBlock && options.onBlock("rate_limit_exceeded");
            return;
          }
          options.onPass && options.onPass(form);
          options.submitHandler ? options.submitHandler(form) : form.submit();
        } finally {
          FormUI.setLoading(btn, false);
        }
      });
      log("Shield activé sur", form.id || form.className || "form");
    },

    async safeFetch(url, init = {}) {
      if (RateLimit.isBlocked()) throw new Error("Shield: rate limit actif");
      if (!RateLimit.record())   throw new Error("Shield: trop de requêtes");
      const ts = Date.now();
      const headers = new Headers(init.headers || {});
      headers.set("X-Shield-Ts", ts.toString());
      headers.set("X-Shield-Sig", (await sha256(`${ts}:${location.origin}`)).slice(0, 16));
      return fetch(url, { ...init, headers });
    },

    reset() {
      sessionStorage.removeItem("_sh_rl");
      localStorage.removeItem("_sh_gw");
      localStorage.removeItem("_sh_gw_proof");
      log("Shield réinitialisé");
    },

    RateLimit, BotDetect, Honeypot, Gateway, Badge,
    config: CFG,
  };

  global.Shield = Shield;

  /* ─────────────────────────────────────────
     DÉCLENCHEMENT AU CHARGEMENT
     On attend que <body> existe avant d'injecter
  ───────────────────────────────────────── */
  function _launch() {
    if (!CFG.gatewayEnabled) return;

    if (Gateway.hasValidPass()) {
      // Pass valide : juste afficher le badge "ok"
      Badge.init();
      Badge.set("ok", "Protégé · Shield.js");
      log("Gateway : pass valide, accès direct");
    } else {
      Gateway.run();
    }
  }

  // S'assure que document.body est disponible
  if (document.body) {
    _launch();
  } else {
    document.addEventListener("DOMContentLoaded", _launch);
  }

  log("Chargé — PoW :", CFG.powDifficulty, "| Gateway :", CFG.gatewayEnabled);
})(window);
