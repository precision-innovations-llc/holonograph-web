/* Holonograph — The Guide: search.
   Opens on ⌘K / Ctrl-K / "/", or by clicking the search field in the sidebar.
   The index (_assets/search-index.json, built by scripts/build-guide-search.mjs)
   is fetched on first open, not on page load. Without JS the trigger is an
   ordinary link to the single-page Guide, where the browser's own find works. */
(function () {
  "use strict";

  var INDEX_URL = new URL("./_assets/search-index.json", document.baseURI).href;
  var WEIGHT = { path: 70, term: 65, title: 60, heading: 50, body: 10 };
  var LIMIT = 40;

  var index = null;
  var loading = null;
  var el = {};
  var results = [];
  var cursor = 0;

  /* ─── index ───────────────────────────────────────────────────────────── */

  function load() {
    if (index) return Promise.resolve(index);
    if (loading) return loading;
    loading = fetch(INDEX_URL, { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        index = data;
        // Pre-lowercase once; every keystroke reads these.
        index.records.forEach(function (rec) {
          var ch = rec.ci >= 0 ? index.chapters[rec.ci] : null;
          rec._ch = ch;
          rec._cl = ch ? ch.title.toLowerCase() : "the guide";
          rec._hl = (rec.h || "").toLowerCase();
          rec._tl = (rec.t || "").toLowerCase();
          rec._vl = (rec.v || "").toLowerCase();
          rec._pl = (rec.p || "").toLowerCase();
        });
        return index;
      })
      .catch(function (err) {
        loading = null;
        throw err;
      });
    return loading;
  }

  /* ─── scoring ─────────────────────────────────────────────────────────── */

  // A field's contribution: exact beats prefix beats word-start beats substring.
  function hit(haystack, needle, weight) {
    if (!haystack) return 0;
    var at = haystack.indexOf(needle);
    if (at < 0) return 0;
    if (haystack === needle) return weight * 3;
    if (at === 0) return weight * 2;
    if (/[^a-z0-9]/.test(haystack.charAt(at - 1))) return weight * 1.5;
    return weight;
  }

  function score(rec, tokens) {
    var total = 0;
    for (var i = 0; i < tokens.length; i += 1) {
      var q = tokens[i];
      var best = 0;
      if (rec.k === "e") {
        best = Math.max(hit(rec._pl, q, WEIGHT.path), hit(rec._hl, q, WEIGHT.heading), hit(rec._cl, q, WEIGHT.title));
        if (rec.m && rec.m.toLowerCase() === q) best = Math.max(best, WEIGHT.path);
      } else if (rec.k === "t") {
        // The identifier itself has to match. Falling back to the chapter title
        // would list every symbol in "Seams" for the query "seam".
        best = hit(rec._vl, q, WEIGHT.term);
      } else {
        best = Math.max(
          hit(rec._hl, q, WEIGHT.heading),
          hit(rec._cl, q, WEIGHT.title),
          hit(rec._tl, q, WEIGHT.body),
        );
      }
      if (best === 0) return 0; // every token must land somewhere
      total += best;
    }
    // A chapter's own opening section outranks a mid-chapter heading of equal fit.
    if (rec.k === "s" && rec.l === 1) total += 8;
    return total;
  }

  function runTokens(tokens) {
    var scored = [];
    for (var i = 0; i < index.records.length; i += 1) {
      var s = score(index.records[i], tokens);
      if (s > 0) scored.push({ rec: index.records[i], s: s });
    }
    return scored;
  }

  // Every token has to land, so "rubric drafter" finds nothing while the
  // drafter is undocumented. Rather than a dead end, fall back to the single
  // token that matches most, and say which.
  var relaxedTo = "";

  function search(query) {
    relaxedTo = "";
    var tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length || !index) return [];
    var scored = runTokens(tokens);
    if (!scored.length && tokens.length > 1) {
      var best = [];
      var bestToken = "";
      tokens.forEach(function (t) {
        var got = runTokens([t]);
        if (got.length > best.length) { best = got; bestToken = t; }
      });
      if (best.length) { scored = best; relaxedTo = bestToken; }
    }
    scored.sort(function (a, b) {
      if (b.s !== a.s) return b.s - a.s;
      var ka = a.rec.k === "e" ? 0 : a.rec.k === "t" ? 1 : 2;
      var kb = b.rec.k === "e" ? 0 : b.rec.k === "t" ? 1 : 2;
      if (ka !== kb) return ka - kb;
      return (a.rec._ch ? a.rec._ch.num : "00").localeCompare(b.rec._ch ? b.rec._ch.num : "00");
    });
    return scored.slice(0, LIMIT);
  }

  /* ─── rendering ───────────────────────────────────────────────────────── */

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function mark(text, tokens) {
    var out = esc(text);
    tokens.forEach(function (q) {
      if (!q) return;
      var re = new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
      out = out.replace(re, "<em>$1</em>");
    });
    return out;
  }

  // The window of body text around the first match, so a hit deep in a section
  // is visible rather than implied.
  function snippet(rec, tokens) {
    if (!rec.t) return "";
    var at = -1;
    for (var i = 0; i < tokens.length && at < 0; i += 1) at = rec._tl.indexOf(tokens[i]);
    if (at < 0) at = 0;
    var from = Math.max(0, at - 70);
    var text = rec.t.slice(from, from + 220);
    return (from > 0 ? "…" : "") + text + (from + 220 < rec.t.length ? "…" : "");
  }

  function href(rec) {
    var slug = rec._ch ? rec._ch.slug : "index";
    return "./" + slug + (rec.a ? "#" + rec.a : "");
  }

  function label(rec) {
    if (!rec._ch) return "The Guide";
    return rec._ch.num + " · " + rec._ch.title;
  }

  var GROUPS = [
    { k: "e", title: "Endpoints" },
    { k: "t", title: "Fields, codes and symbols" },
    { k: "s", title: "Sections" },
  ];

  function render(query) {
    var tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    results = search(query);
    cursor = 0;

    if (!query.trim()) {
      el.results.innerHTML =
        '<p class="gq-hint">Search endpoints, contract fields, error codes and chapter prose. ' +
        "Try <kbd>rubric</kbd>, <kbd>/lens/attention</kbd>, <kbd>409</kbd> or <kbd>passThreshold</kbd>.</p>";
      el.count.textContent = "";
      return;
    }
    if (!results.length) {
      el.results.innerHTML =
        '<p class="gq-hint">Nothing for “' + esc(query) + "”. " +
        'The <a href="./all">whole Guide on one page</a> is another way in.</p>';
      el.count.textContent = "no matches";
      return;
    }

    var html = "";
    if (relaxedTo) {
      tokens = [relaxedTo];
      html +=
        '<p class="gq-hint gq-relaxed">Nothing for all of \u201c' + esc(query) +
        '\u201d. Showing <kbd>' + esc(relaxedTo) + "</kbd> instead.</p>";
    }
    var n = 0;
    GROUPS.forEach(function (g) {
      var rows = results.filter(function (r) { return r.rec.k === g.k; });
      if (!rows.length) return;
      html += '<p class="gq-group">' + g.title + "</p>";
      rows.forEach(function (row) {
        var rec = row.rec;
        var primary =
          rec.k === "e"
            ? '<span class="gq-method">' + esc(rec.m) + "</span> " + mark(rec.p, tokens)
            : rec.k === "t"
              ? mark(rec.v, tokens)
              : mark(rec.h, tokens);
        var meta = esc(label(rec)) + (rec.k !== "s" && rec.h ? " · " + esc(rec.h) : "");
        html +=
          '<a class="gq-row" data-i="' + n + '" href="' + esc(href(rec)) + '">' +
          '<span class="gq-primary gq-' + rec.k + '">' + primary + "</span>" +
          '<span class="gq-meta">' + meta + "</span>" +
          (rec.k === "s" ? '<span class="gq-snip">' + mark(snippet(rec, tokens), tokens) + "</span>" : "") +
          "</a>";
        row.i = n;
        n += 1;
      });
    });
    el.results.innerHTML = html;
    el.count.textContent = results.length >= LIMIT ? LIMIT + "+ matches" : results.length + (results.length === 1 ? " match" : " matches");
    // results[] is grouped in the DOM but indexed in score order; re-sort to DOM order
    results.sort(function (a, b) { return a.i - b.i; });
    highlight();
  }

  function highlight() {
    var rows = el.results.querySelectorAll(".gq-row");
    for (var i = 0; i < rows.length; i += 1) {
      var on = i === cursor;
      rows[i].classList.toggle("is-current", on);
      if (on) {
        rows[i].setAttribute("aria-selected", "true");
        rows[i].scrollIntoView({ block: "nearest" });
      } else {
        rows[i].removeAttribute("aria-selected");
      }
    }
  }

  function go() {
    var rows = el.results.querySelectorAll(".gq-row");
    if (rows[cursor]) window.location.href = rows[cursor].getAttribute("href");
  }

  /* ─── dialog ──────────────────────────────────────────────────────────── */

  function build() {
    if (el.root) return;
    var root = document.createElement("div");
    root.className = "gq-overlay";
    root.hidden = true;
    root.innerHTML =
      '<div class="gq-panel" role="dialog" aria-modal="true" aria-label="Search the Guide">' +
      '  <div class="gq-bar">' +
      '    <input class="gq-input" type="search" autocomplete="off" spellcheck="false"' +
      '           placeholder="Search the Guide" aria-label="Search the Guide" />' +
      '    <span class="gq-count" aria-live="polite"></span>' +
      '    <button class="gq-close" type="button" aria-label="Close">Esc</button>' +
      "  </div>" +
      '  <div class="gq-results" role="listbox"></div>' +
      "</div>";
    document.body.appendChild(root);
    el.root = root;
    el.panel = root.querySelector(".gq-panel");
    el.input = root.querySelector(".gq-input");
    el.count = root.querySelector(".gq-count");
    el.results = root.querySelector(".gq-results");

    root.addEventListener("mousedown", function (e) { if (e.target === root) close(); });
    root.querySelector(".gq-close").addEventListener("click", close);
    el.input.addEventListener("input", function () { render(el.input.value); });
    el.results.addEventListener("mousemove", function (e) {
      var row = e.target.closest ? e.target.closest(".gq-row") : null;
      if (row) { cursor = Number(row.getAttribute("data-i")); highlight(); }
    });
    el.panel.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || (e.key === "n" && e.ctrlKey)) {
        e.preventDefault();
        cursor = Math.min(cursor + 1, el.results.querySelectorAll(".gq-row").length - 1);
        highlight();
      } else if (e.key === "ArrowUp" || (e.key === "p" && e.ctrlKey)) {
        e.preventDefault();
        cursor = Math.max(cursor - 1, 0);
        highlight();
      } else if (e.key === "Enter") {
        e.preventDefault();
        go();
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    });
  }

  function open(seed) {
    build();
    el.root.hidden = false;
    document.documentElement.classList.add("gq-open");
    el.input.value = seed || "";
    el.input.focus();
    el.input.select();
    render(el.input.value);
    load().then(function () {
      render(el.input.value);
    }).catch(function () {
      el.results.innerHTML =
        '<p class="gq-hint">The search index did not load. ' +
        'The <a href="./all">whole Guide on one page</a> works without it.</p>';
    });
  }

  function close() {
    if (!el.root) return;
    el.root.hidden = true;
    document.documentElement.classList.remove("gq-open");
  }

  /* ─── triggers ────────────────────────────────────────────────────────── */

  function typing(e) {
    var t = e.target;
    if (!t) return false;
    var tag = (t.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || t.isContentEditable;
  }

  document.addEventListener("keydown", function (e) {
    var openNow = el.root && !el.root.hidden;
    if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (openNow) close(); else open();
      return;
    }
    if (openNow) return;
    if (e.key === "/" && !typing(e) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      open();
    }
  });

  // The trigger field is a link to the single-page Guide until this intercepts
  // it. Delegated, so the copy guidenav.js clones into the mobile sub-nav is
  // live too, whichever script ran first.
  document.addEventListener("click", function (e) {
    var trigger = e.target.closest ? e.target.closest("[data-guide-search]") : null;
    if (!trigger) return;
    e.preventDefault();
    open();
  });

  function keyHint() {
    var mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    var hints = document.querySelectorAll("[data-guide-search-key]");
    for (var i = 0; i < hints.length; i += 1) {
      hints[i].textContent = mac ? "\u2318K" : "Ctrl K";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", keyHint);
  } else {
    keyHint();
  }
})();
