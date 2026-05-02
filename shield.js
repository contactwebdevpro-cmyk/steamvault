/**
 * shield.js — Anti-Spam / Anti-Bot / Anti-DDoS
 * Compatible Vercel (frontend pur, pas de backend requis)
 * Usage : <script src="shield.js"></script>
 *         Appeler Shield.protect() sur chaque formulaire.
 */

(function (global) {
  "use strict";

  /* ─────────────────────────────────────────
     CONFIG  (modifie selon tes besoins)
  ───────────────────────────────────────── */
  const CFG = {
    // Rate limiting
    maxRequests: 10,          // nb max de soumissions par fenêtre
    windowMs: 60_000,         // fenêtre en ms (60 s)
    blockDurationMs: 300_000, // durée du blocage (5 min)

    // Proof of Work
    powEnabled: true,         // activer le challenge PoW sur les forms
    powDifficulty: 3,         // nb de zéros hex en tête du hash (1-4)

    // Honeypot
    honeypotName: "_gotcha",  // nom du champ honeypot

    // Logs
    debug: false,
  };

  /* ─────────────────────────────────────────
     UTILITAIRES
  ───────────────────────────────────────── */
  const log = (...a) => CFG.debug && console.log("[Shield]", ...a);

  // Clé de stockage propre au domaine
  const store = {
    get: (k) => { try { return JSON.parse(sessionStorage.getItem("_sh_" + k)); } catch { return null; } },
    set: (k, v) => { try { sessionStorage.setItem("_sh_" + k, JSON.stringify(v)); } catch {} },
  };

  /* ─────────────────────────────────────────
     1. RATE LIMITING (côté client)
        Stocke les timestamps des soumissions.
        Bloque si > maxRequests dans windowMs.
  ───────────────────────────────────────── */
  const RateLimit = {
    _key: "rl",

    isBlocked() {
      const data = store.get(this._key) || { hits: [], blockedUntil: 0 };
      if (data.blockedUntil > Date.now()) return true;

      // Nettoyage de la fenêtre glissante
      const now = Date.now();
      data.hits = data.hits.filter((t) => now - t < CFG.windowMs);
      store.set(this._key, data);

      return false;
    },

    record() {
      const data = store.get(this._key) || { hits: [], blockedUntil: 0 };
      const now = Date.now();
      data.hits = data.hits.filter((t) => now - t < CFG.windowMs);
      data.hits.push(now);

      if (data.hits.length > CFG.maxRequests) {
        data.blockedUntil = now + CFG.blockDurationMs;
        store.set(this._key, data);
        log("Rate limit atteint — bloqué pour", CFG.blockDurationMs / 1000, "s");
        return false;
      }

      store.set(this._key, data);
      log("Rate limit OK :", data.hits.length, "/", CFG.maxRequests);
      return true;
    },

    remainingMs() {
      const data = store.get(this._key) || {};
      return Math.max(0, (data.blockedUntil || 0) - Date.now());
    },
  };

  /* ─────────────────────────────────────────
     2. DÉTECTION BOT / HEADLESS
        Vérifie plusieurs signaux passifs.
  ───────────────────────────────────────── */
  const BotDetect = {
    _score: null,

    async score() {
      if (this._score !== null) return this._score;
      let s = 0;

      // Webdriver (Selenium, Puppeteer sans flags)
      if (navigator.webdriver) s += 40;

      // Plugins absents (headless Chrome)
      if (navigator.plugins.length === 0) s += 20;

      // Languages vide
      if (!navigator.languages || navigator.languages.length === 0) s += 20;

      // Résolution incohérente
      if (screen.width === 0 || screen.height === 0) s += 20;

      // Pas d'interaction humaine depuis le chargement
      if (!this._hadInteraction) s += 15;

      // DevTools ouverts (méthode timing)
      const t0 = performance.now();
      // eslint-disable-next-line no-debugger
      debugger;
      if (performance.now() - t0 > 50) s += 25;

      // Connection type (bots souvent sur fast ethernet sans throttling)
      const conn = navigator.connection;
      if (conn && conn.rtt === 0 && conn.downlink === 0) s += 10;

      log("Score bot :", s);
      this._score = s;
      return s;
    },

    _hadInteraction: false,
  };

  // Réinitialise le flag dès la première interaction humaine
  ["mousemove", "keydown", "touchstart", "scroll"].forEach((evt) => {
    window.addEventListener(evt, () => { BotDetect._hadInteraction = true; }, { once: true, passive: true });
  });

  /* ─────────────────────────────────────────
     3. HONEYPOT
        Injecte un champ caché dans le form.
        Si rempli → bot détecté.
  ───────────────────────────────────────── */
  const Honeypot = {
    inject(form) {
      if (form.querySelector(`[name="${CFG.honeypotName}"]`)) return;

      const wrapper = document.createElement("div");
      wrapper.setAttribute("aria-hidden", "true");
      wrapper.style.cssText =
        "position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";

      const input = document.createElement("input");
      input.type = "text";
      input.name = CFG.honeypotName;
      input.tabIndex = -1;
      input.autocomplete = "off";

      wrapper.appendChild(input);
      form.appendChild(wrapper);
      log("Honeypot injecté :", CFG.honeypotName);
    },

    isTriggered(form) {
      const field = form.querySelector(`[name="${CFG.honeypotName}"]`);
      return field && field.value.trim() !== "";
    },
  };

  /* ─────────────────────────────────────────
     4. PROOF OF WORK (SHA-256)
        Résoudre un challenge CPU léger avant
        de soumettre → ralentit les bots massivement.
  ───────────────────────────────────────── */
  const PoW = {
    // Génère un challenge aléatoire
    newChallenge() {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    },

    // Hash SHA-256 via WebCrypto
    async sha256(str) {
      const buf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(str)
      );
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    },

    // Résoudre : trouver nonce tel que sha256(challenge+nonce) commence par N zéros
    async solve(challenge) {
      const prefix = "0".repeat(CFG.powDifficulty);
      let nonce = 0;
      let hash;
      do {
        nonce++;
        hash = await this.sha256(challenge + nonce);
      } while (!hash.startsWith(prefix));
      log("PoW résolu : nonce =", nonce, "hash =", hash.slice(0, 12) + "…");
      return { nonce, hash };
    },

    // Vérifier (utile si tu as un micro-backend ou Edge Function Vercel)
    async verify(challenge, nonce) {
      const prefix = "0".repeat(CFG.powDifficulty);
      const hash = await this.sha256(challenge + nonce);
      return hash.startsWith(prefix);
    },

    // Injecte les champs cachés dans le form
    injectFields(form, challenge) {
      ["_pow_challenge", "_pow_nonce", "_pow_hash"].forEach((n) => {
        let el = form.querySelector(`[name="${n}"]`);
        if (!el) {
          el = document.createElement("input");
          el.type = "hidden";
          el.name = n;
          form.appendChild(el);
        }
        if (n === "_pow_challenge") el.value = challenge;
      });
    },

    fillFields(form, nonce, hash) {
      form.querySelector('[name="_pow_nonce"]').value = nonce;
      form.querySelector('[name="_pow_hash"]').value = hash;
    },
  };

  /* ─────────────────────────────────────────
     5. UI — Retour visuel utilisateur
  ───────────────────────────────────────── */
  const UI = {
    showError(form, msg) {
      let el = form.querySelector(".shield-error");
      if (!el) {
        el = document.createElement("div");
        el.className = "shield-error";
        el.style.cssText =
          "color:#c0392b;font-size:.875rem;margin:.5rem 0;padding:.5rem .75rem;" +
          "border:1px solid #e74c3c;border-radius:6px;background:#fdf2f2";
        form.prepend(el);
      }
      el.textContent = msg;
      el.style.display = "block";
    },

    clearError(form) {
      const el = form.querySelector(".shield-error");
      if (el) el.style.display = "none";
    },

    setSubmitLoading(btn, loading) {
      if (!btn) return;
      if (loading) {
        btn._origText = btn.textContent;
        btn.textContent = "Vérification…";
        btn.disabled = true;
      } else {
        btn.textContent = btn._origText || btn.textContent;
        btn.disabled = false;
      }
    },
  };

  /* ─────────────────────────────────────────
     6. API PUBLIQUE
  ───────────────────────────────────────── */
  const Shield = {
    /**
     * Protège un formulaire.
     * @param {HTMLFormElement|string} formOrSelector
     * @param {Object} options
     *   onBlock(reason) — appelé si bloqué
     *   onPass(form)    — appelé si OK (avant submit natif)
     *   submitHandler(form) — remplace le submit natif
     */
    protect(formOrSelector, options = {}) {
      const form =
        typeof formOrSelector === "string"
          ? document.querySelector(formOrSelector)
          : formOrSelector;

      if (!form || form.tagName !== "FORM") {
        console.warn("[Shield] Formulaire introuvable :", formOrSelector);
        return;
      }

      // Préparer honeypot
      Honeypot.inject(form);

      // Préparer PoW
      let challenge = null;
      if (CFG.powEnabled) {
        challenge = PoW.newChallenge();
        PoW.injectFields(form, challenge);
      }

      const submitBtn = form.querySelector('[type="submit"]');

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        UI.clearError(form);
        UI.setSubmitLoading(submitBtn, true);

        try {
          // Vérif rate limit
          if (RateLimit.isBlocked()) {
            const secs = Math.ceil(RateLimit.remainingMs() / 1000);
            const msg = `Trop de tentatives. Réessaie dans ${secs} s.`;
            UI.showError(form, msg);
            options.onBlock && options.onBlock("rate_limit");
            log("Bloqué par rate limit");
            return;
          }

          // Honeypot
          if (Honeypot.isTriggered(form)) {
            // Silencieux : simuler succès pour tromper les bots
            log("Honeypot déclenché — soumission ignorée silencieusement");
            options.onBlock && options.onBlock("honeypot");
            // Simuler délai puis "réussite" sans rien envoyer
            await new Promise((r) => setTimeout(r, 800));
            return;
          }

          // Détection bot
          const botScore = await BotDetect.score();
          if (botScore >= 60) {
            UI.showError(form, "Votre navigateur semble suspect. Veuillez actualiser la page.");
            options.onBlock && options.onBlock("bot_detected");
            log("Bot bloqué, score =", botScore);
            return;
          }

          // Proof of Work
          if (CFG.powEnabled && challenge) {
            const { nonce, hash } = await PoW.solve(challenge);
            PoW.fillFields(form, nonce, hash);
          }

          // Enregistrer la tentative
          if (!RateLimit.record()) {
            UI.showError(form, "Trop de soumissions. Veuillez patienter 5 minutes.");
            options.onBlock && options.onBlock("rate_limit_exceeded");
            return;
          }

          // Tout est OK
          options.onPass && options.onPass(form);

          if (options.submitHandler) {
            options.submitHandler(form);
          } else {
            form.submit();
          }
        } finally {
          UI.setSubmitLoading(submitBtn, false);
        }
      });

      log("Shield activé sur", form.id || form.className || "form");
    },

    /**
     * Vérifie une URL / endpoint manuellement (fetch protégé).
     * Ajoute un token temporel + fingerprint léger.
     * Pratique pour les appels API depuis JS.
     */
    async safeFetch(url, init = {}) {
      if (RateLimit.isBlocked()) {
        throw new Error("Shield: rate limit actif");
      }
      if (!RateLimit.record()) {
        throw new Error("Shield: trop de requêtes");
      }

      const ts = Date.now();
      const headers = new Headers(init.headers || {});
      headers.set("X-Shield-Ts", ts.toString());
      // Signature simple (timestamp + origin) — à valider côté Edge Function si besoin
      const sig = await PoW.sha256(`${ts}:${location.origin}`);
      headers.set("X-Shield-Sig", sig.slice(0, 16));

      return fetch(url, { ...init, headers });
    },

    /**
     * Réinitialise manuellement le compteur rate limit
     * (utile pour les tests).
     */
    reset() {
      sessionStorage.removeItem("_sh_rl");
      log("Rate limit réinitialisé");
    },

    // Expose les modules internes pour usage avancé
    RateLimit,
    BotDetect,
    Honeypot,
    PoW,
    config: CFG,
  };

  global.Shield = Shield;
  log("Chargé — difficulté PoW :", CFG.powDifficulty, "| Rate limit :", CFG.maxRequests + "/" + CFG.windowMs / 1000 + "s");
})(window);
