/* AMAN Admin — مكوّنات العرض الخاصة بالإدارة (لا تعتمد على أي ملف خاص بالعميل). */
(function (root) {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const P = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z"/>',
    receipt: '<path d="M5 3h14v18l-3-2-4 2-4-2-3 2z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    tasks: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 9 1.5 1.5L12 8M14 10h2M8 16h2M14 16h2"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5.5a3 3 0 0 1 0 5.8M18 14a5 5 0 0 1 3 4.5V20"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.5-4 3-6 7-6s6.5 2 7 6"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    back: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    chev: '<path d="m15 5-7 7 7 7"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    wallet: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M10 5h4M10 18h4"/>',
    building: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3"/>',
    box: '<path d="m3 7 9-4 9 4v10l-9 4-9-4z"/><path d="m3 7 9 4 9-4M12 11v10"/>',
    shield: '<path d="M12 3 20 6v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M7 15h3"/>',
    bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/>',
    doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/>',
    audit: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>',
    sliders: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/>',
    calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    logout: '<path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/>',
    caret: '<path d="m6 9 6 6 6-6"/>',
    ledger: '<path d="M4 19V5M4 19h16"/><path d="m8 15 3-4 3 3 5-7"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    repeat: '<path d="M4 11V9a3 3 0 0 1 3-3h11l-3-3M20 13v2a3 3 0 0 1-3 3H6l3 3"/>',
    inbox: '<path d="M4 13 6.5 5h11L20 13v6H4z"/><path d="M4 13h4l1 2h6l1-2h4"/>',
    text: '<path d="M5 6h14M5 12h14M5 18h9"/>'
  };
  const ico = (n, cls = '') => `<svg class="${esc(cls)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || P.doc}</svg>`;
  const tile = (n, tone = '') => `<span class="ico ${tone}">${ico(n)}</span>`;
  const pill = (t, tone = '') => `<span class="pill ${tone}">${esc(t)}</span>`;

  /* ----- الرأس ----- */
  const bar = (title, sub = '', end = '') =>
    `<header class="bar"><button type="button" class="tile-btn" data-act="back" aria-label="رجوع">${ico('back')}</button><div class="bar-title"><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${end || '<span></span>'}</header>`;
  const tileAction = (act, icon, label, attrs = '') => `<button type="button" class="tile-btn" data-act="${esc(act)}" aria-label="${esc(label)}" title="${esc(label)}" ${attrs}>${ico(icon)}</button>`;
  const section = (t, end = '') => `<div class="section"><span>${esc(t)}</span>${end ? `<b>${end}</b>` : ''}</div>`;

  /* ----- الصفوف والبطاقات ----- */
  // صف قابل للنقر. opts: icon, tone, title, sub, val, pill, to, act, attrs, ltrTitle
  function row(o) {
    const tag = o.to || o.act ? 'button' : 'div';
    const attrs = o.to ? `type="button" data-act="go" data-to="${esc(o.to)}"` : o.act ? `type="button" data-act="${esc(o.act)}" ${o.attrs || ''}` : '';
    const title = o.ltr ? `<span class="ltr">${esc(o.title)}</span>` : esc(o.title);
    return `<${tag} class="row ${o.plain ? 'plain' : ''} ${o.cls || ''}" ${attrs} ${o.status ? `data-status="${esc(o.status)}"` : ''}>${o.icon ? tile(o.icon, o.tone) : ''}<span class="rmain"><span class="rtitle">${title}</span>${o.sub ? `<span class="rsub">${o.sub}</span>` : ''}${o.sub2 ? `<span class="rsub">${o.sub2}</span>` : ''}${o.badges ? `<span class="rbadges">${o.badges}</span>` : ''}</span><span class="rend">${o.val ? `<span class="rval">${o.val}</span>` : ''}${o.pill || ''}${o.to || o.act ? ico('chev', 'chev') : ''}</span></${tag}>`;
  }
  const card = rows => `<div class="card">${rows.join('')}</div>`;
  const kv = rows => `<div class="kv">${rows.map(([k, v, s]) => `<div><span>${esc(k)}</span><b class="${s ? 'strong' : ''}">${v}</b></div>`).join('')}</div>`;
  const empty = (t, icon = 'inbox', title = '', action = '') => `<div class="card empty">${tile(icon)}${title ? `<b>${esc(title)}</b>` : ''}<p>${esc(t)}</p>${action ? `<div class="empty-action">${action}</div>` : ''}</div>`;
  const skeleton = (rows = 4) => `<div class="skeleton" role="status" aria-busy="true" aria-label="جارٍ التحميل"><div class="sk sk-title"></div>${Array.from({ length: rows }, () => '<div class="sk sk-row" aria-hidden="true"></div>').join('')}</div>`;
  const COPY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>';
  const copyBtn = (value, what) => `<button type="button" class="copy-mini" data-act="copy" data-copy="${esc(value)}" data-label="${esc(what)}" aria-label="نسخ ${esc(what)}">${COPY_SVG}</button>`;
  const note = t => `<p class="note">${esc(t)}</p>`;
  const callout = (icon, title, text, dark = false, attrs = '') => `<div class="callout ${dark ? 'dark' : ''}" ${attrs}>${tile(icon)}<div><b>${esc(title)}</b>${text}</div></div>`;
  const metrics = items => `<div class="metrics">${items.map(([l, v]) => `<div class="metric"><small>${esc(l)}</small><b>${v}</b></div>`).join('')}</div>`;

  /* ----- التبويبات والبحث ----- */
  const tabs = (items, current, group) => `<div class="tabs" role="tablist" data-group="${esc(group)}">${items.map(([k, label, count]) => `<button type="button" role="tab" aria-selected="${k === current}" data-act="tab" data-tab="${esc(k)}">${esc(label)}${count == null ? '' : `<span class="count">${count}</span>`}</button>`).join('')}</div>`;
  const toolbar = (placeholder, q = '', options = null, value = 'all') =>
    `<div class="toolbar ${options ? '' : 'single'}"><label class="search">${ico('search')}<input type="search" id="q" value="${esc(q)}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" autocomplete="off"></label>${options ? `<label class="select">${ico('caret')}<select id="flt" aria-label="تصفية النتائج">${options.map(([k, l]) => `<option value="${esc(k)}" ${k === value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>` : ''}</div>`;

  /* ----- الأزرار والنماذج ----- */
  const btn = (label, act, cls = '', attrs = '', icon = '') => `<button type="button" class="btn ${cls}" data-act="${esc(act)}" ${attrs}>${icon ? ico(icon) : ''}${esc(label)}</button>`;
  const submitBtn = (label, formId, cls = 'primary') => `<button type="submit" form="${esc(formId)}" class="btn ${cls}" data-submit>${esc(label)}</button>`;
  const field = (o) => {
    const id = 'f_' + o.name, v = o.value ?? '', req = o.required ? 'required' : '';
    let ctl;
    if (o.type === 'select') ctl = `<select id="${id}" name="${esc(o.name)}" ${req} aria-describedby="${id}-err">${o.options.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    else if (o.type === 'textarea') ctl = `<textarea id="${id}" name="${esc(o.name)}" ${req} aria-describedby="${id}-err" ${o.minlength ? `minlength="${o.minlength}"` : ''} ${o.placeholder ? `placeholder="${esc(o.placeholder)}"` : ''} rows="${o.rows || 4}">${esc(v)}</textarea>`;
    else ctl = `<input id="${id}" name="${esc(o.name)}" type="${o.type || 'text'}" value="${esc(v)}" ${req} ${o.min != null ? `min="${o.min}"` : ''} ${o.step ? `step="${o.step}"` : ''} ${o.inputmode ? `inputmode="${o.inputmode}"` : ''} ${o.placeholder ? `placeholder="${esc(o.placeholder)}"` : ''} ${o.dir ? `dir="${o.dir}"` : ''} ${o.autocomplete ? `autocomplete="${o.autocomplete}"` : 'autocomplete="off"'} aria-describedby="${id}-err">`;
    return `<div class="field"><label for="${id}">${esc(o.label)}</label>${ctl}${o.help ? `<small>${esc(o.help)}</small>` : ''}<small class="ferr hidden" id="${id}-err" role="alert"></small></div>`;
  };
  const toggle = (name, label, checked, help = '', attrs = '') => `<label class="toggle"><span>${esc(label)}${help ? `<small>${esc(help)}</small>` : ''}</span><input class="switch" type="checkbox" role="switch" name="${esc(name)}" ${checked ? 'checked' : ''} ${attrs}></label>`;
  const fields = html => `<div class="fields">${html}</div>`;

  /* ----- النافذة السفلية ----- */
  const sheet = (title, body, foot = '', id = '') =>
    `<div class="scrim" data-act="sheet-scrim"><section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}" ${id ? `id="${esc(id)}"` : ''}><div class="sheet-head"><button type="button" class="tile-btn" data-act="sheet-close" aria-label="إغلاق">${ico('close')}</button><h2>${esc(title)}</h2><span></span></div><div class="sheet-body">${body}</div>${foot ? `<div class="sheet-foot">${foot}</div>` : ''}</section></div>`;

  root.AmanAdminKit = { esc, ico, tile, pill, bar, tileAction, section, row, card, kv, empty, skeleton, copyBtn, note, callout, metrics, tabs, toolbar, btn, submitBtn, field, toggle, fields, sheet };
})(window);
