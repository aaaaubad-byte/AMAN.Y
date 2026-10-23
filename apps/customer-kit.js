/* AMAN Customer — مكوّنات العرض الخاصة بالعميل (لا تعتمد على أي ملف خاص بالإدارة). */
(function (root) {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const P = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z"/>',
    radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m12 12 6-6"/>',
    numbers: '<rect x="5" y="2.5" width="14" height="19" rx="2.5"/><path d="M9 6h6M8 11h8M8 15h8M8 18h4"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M10 5h4M10 18h4"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M7 15h3"/>',
    repeat: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.5-3"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.5-4 3-6 7-6s6.5 2 7 6"/>',
    bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/>',
    back: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    chev: '<path d="m15 5-7 7 7 7"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    caret: '<path d="m6 9 6 6 6-6"/>',
    shield: '<path d="M12 3 20 6v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 1 1 4.4 1.9c-1.2 1-1.9 1.4-1.9 3M12 17.5h.01"/>',
    doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
    sliders: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/>',
    logout: '<path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/>',
    wallet: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    inbox: '<path d="M4 13 6.5 5h11L20 13v6H4z"/><path d="M4 13h4l1 2h6l1-2h4"/>',
    building: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    receipt: '<path d="M5 3h14v18l-3-2-4 2-4-2-3 2z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>'
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
  // opts: icon, tone, title, sub, sub2, val, pill, to, act, attrs, ltr, plain
  function row(o) {
    const tag = o.to || o.act ? 'button' : 'div';
    const attrs = o.to ? `type="button" data-act="go" data-to="${esc(o.to)}"` : o.act ? `type="button" data-act="${esc(o.act)}" ${o.attrs || ''}` : '';
    const title = o.ltr ? `<span class="ltr">${esc(o.title)}</span>` : esc(o.title);
    return `<${tag} class="row ${o.plain ? 'plain' : ''}" ${attrs}>${o.icon ? tile(o.icon, o.tone) : ''}<span class="rmain"><span class="rtitle">${title}</span>${o.sub ? `<span class="rsub">${o.sub}</span>` : ''}${o.sub2 ? `<span class="rsub">${o.sub2}</span>` : ''}</span><span class="rend">${o.val ? `<span class="rval">${o.val}</span>` : ''}${o.pill || ''}${o.to || o.act ? ico('chev', 'chev') : ''}</span></${tag}>`;
  }
  const card = rows => `<div class="card">${rows.join('')}</div>`;
  const kv = rows => `<div class="kv">${rows.map(([k, v, s]) => `<div><span>${esc(k)}</span><b class="${s ? 'strong' : ''}">${v}</b></div>`).join('')}</div>`;
  const empty = (t, icon = 'inbox', title = '') => `<div class="card empty">${tile(icon)}${title ? `<b>${esc(title)}</b>` : ''}<p>${esc(t)}</p></div>`;
  const note = (t, attrs = '') => `<p class="note" ${attrs}>${esc(t)}</p>`;
  const callout = (icon, title, text, dark = false, attrs = '') => `<div class="callout ${dark ? 'dark' : ''}" ${attrs}>${tile(icon)}<div><b>${esc(title)}</b>${text}</div></div>`;

  /* ----- البحث والفلترة ----- */
  const toolbar = (placeholder, q = '', options = null, value = '') =>
    `<div class="toolbar ${options ? '' : 'single'}"><label class="search">${ico('search')}<input type="search" id="q" value="${esc(q)}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" autocomplete="off"></label>${options ? `<label class="select">${ico('caret')}<select id="flt" aria-label="تصفية حسب الشركة">${options.map(([k, l]) => `<option value="${esc(k)}" ${k === value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>` : ''}</div>`;

  /* ----- الأزرار والنماذج ----- */
  const btn = (label, act, cls = '', attrs = '', icon = '') => `<button type="button" class="btn ${cls}" data-act="${esc(act)}" ${attrs}>${icon ? ico(icon) : ''}${esc(label)}</button>`;
  const submitBtn = (label, formId, cls = 'primary', attrs = '') => `<button type="submit" form="${esc(formId)}" class="btn ${cls}" data-submit ${attrs}>${esc(label)}</button>`;
  const field = o => {
    const id = o.id || 'f_' + o.name, v = o.value ?? '', req = o.required ? 'required' : '';
    let ctl;
    if (o.type === 'select') ctl = `<select id="${id}" name="${esc(o.name)}" ${req}>${o.options.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    else ctl = `<input id="${id}" name="${esc(o.name)}" type="${o.type || 'text'}" value="${esc(v)}" ${req} ${o.minlength ? `minlength="${o.minlength}"` : ''} ${o.inputmode ? `inputmode="${o.inputmode}"` : ''} ${o.placeholder ? `placeholder="${esc(o.placeholder)}"` : ''} ${o.dir ? `dir="${o.dir}"` : ''} autocomplete="${esc(o.autocomplete || 'off')}">`;
    return `<div class="field"><label for="${id}">${esc(o.label)}</label>${ctl}${o.help ? `<small>${esc(o.help)}</small>` : ''}</div>`;
  };
  const toggle = (id, label, checked, help = '') => `<label class="toggle"><span>${esc(label)}${help ? `<small>${esc(help)}</small>` : ''}</span><input class="switch" type="checkbox" role="switch" id="${esc(id)}" ${checked ? 'checked' : ''}></label>`;
  const fields = html => `<div class="fields">${html}</div>`;

  /* ----- النافذة السفلية ----- */
  const sheet = (title, body, foot = '') =>
    `<div class="scrim" data-act="sheet-scrim"><section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet-head"><button type="button" class="tile-btn" data-act="sheet-close" aria-label="إغلاق">${ico('close')}</button><h2>${esc(title)}</h2><span></span></div><div class="sheet-body">${body}</div>${foot ? `<div class="sheet-foot">${foot}</div>` : ''}</section></div>`;

  root.AmanCustomerKit = { esc, ico, tile, pill, bar, tileAction, section, row, card, kv, empty, note, callout, toolbar, btn, submitBtn, field, toggle, fields, sheet };
})(window);
