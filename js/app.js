// ===== 存储层 =====
const STORAGE_KEY = 'novel_workbench_v2';
let DB = {};

function loadData() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try { DB = JSON.parse(stored); } catch(e) { DB = {}; }
  }
  Object.keys(SCHEMAS).forEach(mid => {
    if (!DB[mid] || !Array.isArray(DB[mid])) {
      DB[mid] = (DEMO_DATA[mid] || []).map(item => ({ ...item }));
    }
  });
  saveData();
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
}

const Storage = {
  get(mid) { return DB[mid] || []; },
  add(mid, item) {
    if (!DB[mid]) DB[mid] = [];
    item.id = uid();
    item.createdAt = fmtDate();
    DB[mid].unshift(item);
    saveData();
    return item;
  },
  update(mid, id, patch) {
    const arr = DB[mid] || [];
    const i = arr.findIndex(x => x.id === id);
    if (i >= 0) { arr[i] = { ...arr[i], ...patch }; saveData(); }
  },
  del(mid, id) {
    if (!DB[mid]) return;
    DB[mid] = DB[mid].filter(x => x.id !== id);
    saveData();
  },
  count(mid) { return (DB[mid] || []).length; },
  getById(mid, id) { return (DB[mid] || []).find(x => x.id === id); },
  exportAll() { return JSON.stringify(DB, null, 2); },
  importAll(json) {
    const obj = JSON.parse(json);
    Object.keys(SCHEMAS).forEach(mid => {
      if (obj[mid]) {
        // 合并模式：跳过已存在的ID，只追加新条目
        const existing = new Set((DB[mid] || []).map(x => x.id));
        obj[mid].forEach(item => {
          if (!existing.has(item.id)) {
            if (!DB[mid]) DB[mid] = [];
            DB[mid].unshift(item);
          }
        });
      }
    });
    saveData();
  }
};

// ===== 状态 =====
const state = {
  module: 'dashboard',
  search: '',
  filter: 'all',
  detailId: null,
};
let formTags = []; // 标签输入临时存储

// ===== 工具函数 =====
function uid() { return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function fmtDate(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function esc(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}
function truncate(s, n) {
  if (!s) return '';
  s = String(s);
  return s.length > n ? s.slice(0, n) + '...' : s;
}
function toast(msg, type) {
  type = type || 'success';
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'all 0.3s';
    t.style.opacity = '0';
    t.style.transform = 'translateX(40px)';
    setTimeout(() => t.remove(), 300);
  }, 2500);
}

const ICON_EDIT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
const ICON_DEL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
const ICON_BACK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>';

// ===== 侧边栏 =====
function buildSidebar() {
  const nav = document.getElementById('sidebar-nav');
  const cats = {};
  Object.values(SCHEMAS).forEach(m => {
    if (!cats[m.category]) cats[m.category] = [];
    cats[m.category].push(m);
  });

  let html = '<div class="nav-item ' + (state.module === 'dashboard' ? 'active' : '') + '" data-action="nav" data-target="dashboard">' +
    '<span class="nav-item-icon">📊</span><span>工作台总览</span></div>';

  Object.entries(cats).forEach(([cat, mods]) => {
    html += '<div class="nav-section-label">' + esc(cat) + '</div>';
    mods.forEach(m => {
      const cnt = Storage.count(m.id);
      const active = state.module === m.id ? 'active' : '';
      const modCls = m.modClass || '';
      html += '<div class="nav-item ' + modCls + ' ' + active + '" data-action="nav" data-target="' + m.id + '">' +
        '<span class="nav-item-icon">' + m.icon + '</span>' +
        '<span>' + esc(m.name) + '</span>' +
        '<span class="nav-item-badge">' + cnt + '</span></div>';
    });
  });

  nav.innerHTML = html;
}

// ===== 移动端侧边栏控制 =====
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('active');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('active');
}

// ===== 导航 =====
function navigate(mid) {
  state.module = mid;
  state.detailId = null;
  state.filter = 'all';
  state.search = '';
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear').style.display = 'none';
  closeSidebar();
  buildSidebar();
  render();
  // 进入热点模块时也拉取一次
  if (mid === 'hotspots') autoFetchHotspots();
}

// ===== 主渲染入口 =====
function render() {
  const mid = state.module;
  const schema = SCHEMAS[mid];
  if (mid === 'dashboard') {
    renderDashboard();
    return;
  }
  if (state.detailId) {
    renderDetail(mid, state.detailId);
  } else {
    renderModuleList(mid);
  }
}

// ===== 顶栏更新 =====
function updateTopbar(title, subtitle, showAdd, showSearch) {
  document.getElementById('page-title').textContent = title;
  document.getElementById('page-subtitle').textContent = subtitle || '';
  document.getElementById('btn-add').style.display = showAdd ? 'flex' : 'none';
  document.querySelector('.search-box').style.display = showSearch ? 'flex' : 'none';
}

// ===== 仪表盘 =====
function renderDashboard() {
  updateTopbar('工作台总览', '11个模块 · 全流程创作管理系统', false, false);
  const content = document.getElementById('content');
  content.className = '';

  // 全闭环工作流程
  const workflowHtml = '<div class="workflow-flow">' +
    '<div class="workflow-flow-title">🔄 全闭环商业短篇创作流程</div>' +
    '<div class="workflow-steps">' +
      '<span class="workflow-step"><span class="ws-icon">🔥</span>每日热点</span>' +
      '<span class="workflow-arrow">→</span>' +
      '<span class="workflow-step"><span class="ws-icon">🎯</span>选题灵感</span>' +
      '<span class="workflow-arrow">→</span>' +
      '<span class="workflow-step"><span class="ws-icon">🔍</span>对标拆文</span>' +
      '<span class="workflow-arrow">→</span>' +
      '<span class="workflow-step"><span class="ws-icon">📐</span>模板套用</span>' +
      '<span class="workflow-arrow">→</span>' +
      '<span class="workflow-step"><span class="ws-icon">✍️</span>一键原创</span>' +
      '<span class="workflow-arrow">→</span>' +
      '<span class="workflow-step"><span class="ws-icon">📦</span>稿件归档</span>' +
    '</div>' +
    '<div style="margin-top:10px;font-size:12px;color:var(--text-muted);">全程适配知乎、番茄、小程序爆款逻辑</div>' +
  '</div>';

  // 统计卡片
  let totalItems = 0;
  const statsHtml = Object.values(SCHEMAS).map(m => {
    const cnt = Storage.count(m.id);
    totalItems += cnt;
    const modCls = m.modClass || '';
    return '<div class="stat-card ' + modCls + '" data-action="nav" data-target="' + m.id + '">' +
      '<div class="stat-card-icon" style="background:' + m.bg + '">' + m.icon + '</div>' +
      '<div class="stat-card-label">' + esc(m.name) + '</div>' +
      '<div class="stat-card-value">' + cnt + '</div></div>';
  }).join('');

  // 快速导航卡片
  const cats = {};
  Object.values(SCHEMAS).forEach(m => {
    if (!cats[m.category]) cats[m.category] = [];
    cats[m.category].push(m);
  });

  let navHtml = '';
  Object.entries(cats).forEach(([cat, mods]) => {
    navHtml += '<div class="dashboard-section">' +
      '<div class="dashboard-section-title">' + esc(cat) + '</div>' +
      '<div class="quick-nav-grid">';
    mods.forEach(m => {
      const modCls = m.modClass || '';
      navHtml += '<div class="quick-nav-card ' + modCls + '" data-action="nav" data-target="' + m.id + '">' +
        '<div class="quick-nav-icon" style="background:' + m.bg + '">' + m.icon + '</div>' +
        '<div class="quick-nav-info"><h4>' + esc(m.name) + '</h4>' +
        '<p>' + esc(m.desc) + '</p></div></div>';
    });
    navHtml += '</div></div>';
  });

  content.innerHTML =
    '<div class="dashboard-hero">' +
      '<h2>小说创作工作台</h2>' +
      '<p>共 ' + totalItems + ' 条素材 · 从选题到过稿的全流程创作管理</p>' +
    '</div>' +
    workflowHtml +
    '<div class="stats-grid">' + statsHtml + '</div>' +
    navHtml;
}

// ===== 模块列表视图 =====
function renderModuleList(mid) {
  const schema = SCHEMAS[mid];
  updateTopbar(schema.name, schema.desc, true, true);

  // 设置内容区模块样式class
  const content = document.getElementById('content');
  content.className = '';
  if (schema.modClass) content.classList.add(schema.modClass);

  let items = Storage.get(mid);

  // 筛选
  if (state.filter !== 'all' && schema.filterField) {
    items = items.filter(i => i[schema.filterField] === state.filter);
  }

  // 搜索
  if (state.search) {
    const q = state.search.toLowerCase();
    items = items.filter(item => {
      return Object.values(item).some(v => {
        if (Array.isArray(v)) return v.some(t => String(t).toLowerCase().includes(q));
        return String(v).toLowerCase().includes(q);
      });
    });
  }

  // 筛选chips
  let filterHtml = '';
  if (schema.filterField) {
    const allItems = Storage.get(mid);
    const values = [...new Set(allItems.map(i => i[schema.filterField]).filter(Boolean))];
    if (values.length > 0) {
      filterHtml = '<div class="filter-chips">' +
        '<span class="chip ' + (state.filter === 'all' ? 'active' : '') + '" data-action="filter" data-value="all">全部</span>' +
        values.map(v => '<span class="chip ' + (state.filter === v ? 'active' : '') + '" data-action="filter" data-value="' + esc(v) + '">' + esc(v) + '</span>').join('') +
        '</div>';
    }
  }

  // 拆文助手面板（仅analysis模块）
  let panelHtml = '';
  if (schema.hasAssistant) {
    panelHtml = renderAssistantPanel();
  }
  // 热点调取面板（仅hotspots模块）
  if (schema.hasFetch) {
    panelHtml = renderHotspotFetchPanel();
  }

  if (items.length === 0) {
    content.innerHTML = panelHtml + filterHtml +
      '<div class="empty-state">' +
        '<div class="empty-state-icon">' + schema.icon + '</div>' +
        '<h3>暂无数据</h3>' +
        '<p>' + (state.search ? '没有找到匹配的内容' : '点击右上角「新建」开始添加') + '</p>' +
        '<button class="btn-primary" data-action="add" data-module="' + mid + '">+ 新建</button>' +
      '</div>';
    return;
  }

  // 卡片网格
  const cardsHtml = items.map(item => renderCard(mid, item, schema)).join('');

  content.innerHTML = panelHtml + filterHtml +
    '<div style="margin-bottom:12px;color:var(--text-muted);font-size:13px;">共 ' + items.length + ' 条</div>' +
    '<div class="card-grid">' + cardsHtml + '</div>';
}

// ===== 渲染单张卡片 =====
function renderCard(mid, item, schema) {
  const cls = schema.cardClass ? 'data-card ' + schema.cardClass : 'data-card';

  // 标题
  let title = esc(item[schema.cardTitle] || '(未命名)');
  if (schema.cardRaw && item[schema.cardTitle]) {
    title = esc(item[schema.cardTitle]).replace(/\n/g, '<br>');
  }

  // 标签
  let tagsHtml = '';
  if (schema.cardTags) {
    tagsHtml = schema.cardTags.map(f => {
      const v = item[f];
      if (!v) return '';
      return '<span class="tag">' + esc(v) + '</span>';
    }).join('');
  }
  // 特殊处理tags数组字段
  if (item.tags && Array.isArray(item.tags) && item.tags.length > 0) {
    tagsHtml += item.tags.map(t => '<span class="tag tag-gray">' + esc(t) + '</span>').join('');
  }

  // 正文
  let bodyHtml = '';
  if (schema.cardBody) {
    bodyHtml = schema.cardBody.map(f => {
      const field = schema.fields.find(x => x.key === f);
      if (!field) return '';
      const v = item[f];
      if (!v) return '';
      const label = esc(field.label);
      const val = esc(truncate(v, 120));
      return '<div class="field-row"><span class="field-label">' + label + '</span>' +
        '<span class="field-value">' + val + '</span></div>';
    }).join('');
  }

  // 原文链接
  if (schema.cardLink && item[schema.cardLink]) {
    bodyHtml += '<div class="field-row"><span class="field-label">原文链接</span>' +
      '<a class="hotspot-source-link" href="' + esc(item[schema.cardLink]) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">🔗 点击查看原文</a></div>';
  }

  return '<div class="' + cls + '" data-action="detail" data-module="' + mid + '" data-id="' + item.id + '">' +
    '<div class="data-card-header">' +
      '<div class="data-card-title">' + title + '</div>' +
      '<div class="data-card-actions">' +
        '<button class="btn-icon" data-action="edit" data-module="' + mid + '" data-id="' + item.id + '" title="编辑">' + ICON_EDIT + '</button>' +
        '<button class="btn-icon danger" data-action="delete" data-module="' + mid + '" data-id="' + item.id + '" title="删除">' + ICON_DEL + '</button>' +
      '</div>' +
    '</div>' +
    (tagsHtml ? '<div class="data-card-meta">' + tagsHtml + '</div>' : '') +
    (bodyHtml ? '<div class="data-card-body">' + bodyHtml + '</div>' : '') +
    '<div class="data-card-footer"><span>' + esc(item.createdAt || '') + '</span></div>' +
  '</div>';
}

// ===== 详情视图 =====
function renderDetail(mid, id) {
  const schema = SCHEMAS[mid];
  const item = Storage.getById(mid, id);
  if (!item) {
    state.detailId = null;
    renderModuleList(mid);
    return;
  }
  updateTopbar(schema.name, schema.desc, false, false);
  const content = document.getElementById('content');
  content.className = '';
  if (schema.modClass) content.classList.add(schema.modClass);

  // 标签
  let tagsHtml = '';
  if (schema.cardTags) {
    tagsHtml = schema.cardTags.map(f => {
      const v = item[f];
      if (!v) return '';
      return '<span class="tag">' + esc(v) + '</span>';
    }).join('');
  }
  if (item.tags && Array.isArray(item.tags) && item.tags.length > 0) {
    tagsHtml += item.tags.map(t => '<span class="tag tag-gray">' + esc(t) + '</span>').join('');
  }

  // 所有字段
  let fieldsHtml = schema.fields.map(f => {
    let v = item[f.key];
    if (v == null || v === '') return '';
    if (Array.isArray(v)) v = v.join('、');
    // 链接字段渲染为可点击链接
    if (f.key === 'sourceLink' && v) {
      return '<div class="detail-field">' +
        '<div class="detail-field-label">' + esc(f.label) + '</div>' +
        '<div class="detail-field-value"><a href="' + esc(v) + '" target="_blank" rel="noopener">🔗 ' + esc(v) + '</a></div></div>';
    }
    return '<div class="detail-field">' +
      '<div class="detail-field-label">' + esc(f.label) + '</div>' +
      '<div class="detail-field-value">' + esc(v) + '</div></div>';
  }).join('');

  content.innerHTML =
    '<button class="btn-secondary btn-sm" data-action="back" style="margin-bottom:16px;">' + ICON_BACK + ' 返回列表</button>' +
    '<div class="detail-view">' +
      '<div class="detail-header">' +
        '<div>' +
          '<h2>' + esc(item[schema.cardTitle] || '(未命名)') + '</h2>' +
          (tagsHtml ? '<div class="detail-meta">' + tagsHtml + '</div>' : '') +
        '</div>' +
        '<div class="flex gap-2">' +
          '<button class="btn-icon" data-action="edit" data-module="' + mid + '" data-id="' + item.id + '" title="编辑">' + ICON_EDIT + '</button>' +
          '<button class="btn-icon danger" data-action="delete" data-module="' + mid + '" data-id="' + item.id + '" title="删除">' + ICON_DEL + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="detail-body">' + fieldsHtml + '</div>' +
    '</div>';
}

// ===== 表单（新建/编辑） =====
function openForm(mid, editId) {
  const schema = SCHEMAS[mid];
  const isEdit = !!editId;
  const item = isEdit ? Storage.getById(mid, editId) : {};

  // 初始化标签
  formTags = (item.tags && Array.isArray(item.tags)) ? [...item.tags] : [];

  document.getElementById('modal-title').textContent = isEdit ? '编辑 · ' + schema.name : '新建 · ' + schema.name;

  // 渲染表单字段
  let formHtml = '';
  schema.fields.forEach(f => {
    const val = item[f.key] != null ? item[f.key] : '';
    const required = f.required ? ' <span class="required">*</span>' : '';
    const fullClass = f.full ? ' form-group-full' : '';

    if (f.full) {
      formHtml += '<div class="form-group' + fullClass + '">';
    } else {
      // 两个字段一行
      // 简化：每个字段单独一行更清晰
      formHtml += '<div class="form-group">';
    }

    formHtml += '<label class="form-label">' + esc(f.label) + required + '</label>';

    const ph = f.ph ? ' placeholder="' + esc(f.ph) + '"' : '';

    if (f.type === 'text') {
      formHtml += '<input type="text" class="form-input" data-field="' + f.key + '" value="' + esc(val) + '"' + ph + '>';
    } else if (f.type === 'number') {
      formHtml += '<input type="number" class="form-input" data-field="' + f.key + '" value="' + esc(val) + '"' + ph + '>';
    } else if (f.type === 'textarea') {
      formHtml += '<textarea class="form-textarea" data-field="' + f.key + '"' + ph + '>' + esc(val) + '</textarea>';
    } else if (f.type === 'select') {
      formHtml += '<select class="form-select" data-field="' + f.key + '">';
      formHtml += '<option value="">请选择</option>';
      f.options.forEach(opt => {
        const sel = val === opt ? ' selected' : '';
        formHtml += '<option value="' + esc(opt) + '"' + sel + '>' + esc(opt) + '</option>';
      });
      formHtml += '</select>';
    } else if (f.type === 'tags') {
      formHtml += '<div class="form-tags-input" id="tags-input-container" data-field="' + f.key + '"></div>';
    }

    if (f.hint) {
      formHtml += '<div class="form-hint">' + esc(f.hint) + '</div>';
    }

    formHtml += '</div>';
  });

  document.getElementById('modal-body').innerHTML = formHtml;
  document.getElementById('modal-overlay').style.display = 'flex';

  // 渲染标签输入
  renderTagsInput();

  // 聚焦第一个输入框
  setTimeout(() => {
    const first = document.querySelector('#modal-body .form-input, #modal-body .form-textarea, #modal-body .form-select');
    if (first) first.focus();
  }, 100);
}

function renderTagsInput() {
  const container = document.getElementById('tags-input-container');
  if (!container) return;
  let html = '';
  formTags.forEach((tag, i) => {
    html += '<span class="form-tag">' + esc(tag) + '<span class="form-tag-remove" data-idx="' + i + '">×</span></span>';
  });
  html += '<input type="text" id="tags-input-field" placeholder="输入后回车添加标签">';
  container.innerHTML = html;

  const input = document.getElementById('tags-input-field');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        e.preventDefault();
        formTags.push(input.value.trim());
        input.value = '';
        renderTagsInput();
        document.getElementById('tags-input-field').focus();
      }
    });
  }
  container.querySelectorAll('.form-tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      formTags.splice(parseInt(btn.dataset.idx), 1);
      renderTagsInput();
    });
  });
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  document.getElementById('modal-body').innerHTML = '';
}

function saveForm() {
  const mid = state.module;
  const schema = SCHEMAS[mid];
  const editId = state._editingId;

  // 收集表单数据
  const item = {};
  let hasRequired = true;
  let missingField = '';

  schema.fields.forEach(f => {
    if (f.type === 'tags') {
      item[f.key] = [...formTags];
    } else {
      const el = document.querySelector('[data-field="' + f.key + '"]');
      if (el) {
        item[f.key] = el.value.trim();
        if (f.required && !item[f.key]) {
          hasRequired = false;
          missingField = f.label;
        }
      }
    }
  });

  if (!hasRequired) {
    toast('请填写必填项：' + missingField, 'error');
    return;
  }

  if (editId) {
    Storage.update(mid, editId, item);
    toast('更新成功');
  } else {
    Storage.add(mid, item);
    toast('新建成功');
  }

  closeModal();
  buildSidebar();
  render();
}

// ===== 确认删除 =====
function confirmDelete(mid, id) {
  const item = Storage.getById(mid, id);
  const title = item ? (item[SCHEMAS[mid].cardTitle] || '此条目') : '此条目';
  document.getElementById('confirm-message').textContent = '确定要删除「' + title + '」吗？此操作不可撤销。';
  document.getElementById('confirm-overlay').style.display = 'flex';
  state._deleteModule = mid;
  state._deleteId = id;
}

function doDelete() {
  Storage.del(state._deleteModule, state._deleteId);
  document.getElementById('confirm-overlay').style.display = 'none';
  toast('已删除', 'warning');
  if (state.detailId === state._deleteId) {
    state.detailId = null;
  }
  buildSidebar();
  render();
}

// ===== 导出/导入 =====
function exportData() {
  const json = Storage.exportAll();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '创作工作台_' + fmtDate() + '.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('数据已导出');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      Storage.importAll(e.target.result);
      toast('数据导入成功');
      buildSidebar();
      render();
    } catch(err) {
      toast('导入失败：文件格式错误', 'error');
    }
  };
  reader.readAsText(file);
}

// ===== 拆文助手面板 =====
function renderAssistantPanel() {
  return '<div class="assistant-panel mod-analysis">' +
    '<div class="assistant-header">' +
      '<span class="assistant-header-icon">🔍</span>' +
      '<span class="assistant-header-title">拆文助手</span>' +
      '<span class="assistant-header-desc">粘贴短篇全文 → 自动拆文 → 一键归档</span>' +
    '</div>' +
    '<div class="assistant-body">' +
      '<div class="assistant-input-area">' +
        '<textarea class="assistant-textarea" id="assistant-input" placeholder="在此粘贴短篇小说全文（至少100字），点击下方按钮自动拆文分析..."></textarea>' +
      '</div>' +
      '<div class="assistant-btn-row">' +
        '<button class="assistant-btn assistant-btn-primary" id="btn-run-analysis">🔍 开始拆文</button>' +
        '<button class="assistant-btn assistant-btn-secondary" id="btn-clear-assistant">清空</button>' +
      '</div>' +
      '<div class="assistant-output" id="assistant-output"></div>' +
    '</div>' +
  '</div>';
}

// ===== 热点调取面板 =====
function renderHotspotFetchPanel() {
  const todayStr = fmtDate();
  return '<div class="hotspot-fetch-panel mod-hotspots">' +
    '<div class="hotspot-fetch-header">' +
      '<span class="assistant-header-icon">🔥</span>' +
      '<span class="assistant-header-title">调取今日热点素材</span>' +
    '</div>' +
    '<div class="hotspot-fetch-body">' +
      '<div class="hotspot-fetch-info">✅ <b>自动拉取已开启</b>：打开工作台或进入本页时自动检测 hotspots_export.json，新热点自动入库无需手动操作。下方按钮为手动导入备用入口。</div>' +
      '<button class="assistant-btn assistant-btn-primary" id="btn-fetch-hotspots">📥 导入热点素材JSON</button>' +
      '<label class="assistant-btn assistant-btn-secondary" style="cursor:pointer;">' +
        '📂 选择文件' +
        '<input type="file" id="hotspot-file-input" accept=".json" hidden>' +
      '</label>' +
    '</div>' +
  '</div>';
}

// ===== 执行拆文分析 =====
function runAnalysis() {
  const input = document.getElementById('assistant-input');
  if (!input || !input.value.trim()) {
    toast('请先粘贴短篇内容', 'error');
    return;
  }

  const text = input.value.trim();

  // 显示loading
  const output = document.getElementById('assistant-output');
  output.classList.add('active');
  output.innerHTML = '<div class="assistant-loading"><div class="spinner"></div>正在全维度精细化拆文中...</div>';

  // 模拟异步处理（让UI有时间渲染）
  setTimeout(() => {
    const result = analyzeText(text);

    if (result.error) {
      output.innerHTML = '<div class="assistant-report"><p style="color:var(--danger);">' + esc(result.error) + '</p></div>';
      return;
    }

    // 保存当前分析结果供后续使用
    state._lastAnalysis = result;
    state._lastAnalysisText = text;

    // 渲染报告
    let reportHtml = '<div class="assistant-report">';
    reportHtml += '<h4>📊 基础数据</h4>';
    reportHtml += '<div class="report-field"><div class="report-label">字数 / 分节 / 题材</div>';
    reportHtml += '<p>' + result.wordCount + '字 | ' + result.sectionCount + '节 | ' + esc(result.genre) + '</p></div>';

    if (result.characters.length > 0) {
      reportHtml += '<div class="report-field"><div class="report-label">检测到的主要角色</div>';
      reportHtml += '<p>' + result.characters.map(esc).join('、') + '</p></div>';
    }

    reportHtml += '<h4>🎭 情绪分析</h4>';
    if (result.emotions.length > 0) {
      reportHtml += '<div class="report-field"><div class="report-label">情绪分布（按频次）</div>';
      reportHtml += '<p>' + result.emotions.map(([e,c]) => esc(e) + '(' + c + '次)').join('  ') + '</p></div>';
      reportHtml += '<p>主导情绪：<strong>' + esc(result.emotions[0][0]) + '</strong></p>';
    }

    reportHtml += '<h4>⚔️ 冲突检测</h4>';
    reportHtml += '<div class="report-field"><div class="report-label">冲突关键词命中</div>';
    reportHtml += '<p>共' + result.conflictCount + '次' + (result.conflictMatches.length > 0 ? '（' + result.conflictMatches.map(esc).join('、') + '）' : '') + '</p></div>';

    reportHtml += '<h4>📝 拆文报告</h4>';
    reportHtml += '<div class="report-field"><pre style="white-space:pre-wrap;font-size:12px;line-height:1.8;color:var(--text);">' + esc(result.report) + '</pre></div>';

    reportHtml += '<h4>✨ 仿写公式</h4>';
    reportHtml += '<div class="report-field"><pre style="white-space:pre-wrap;font-size:12px;line-height:1.8;color:var(--text);">' + esc(result.formula) + '</pre></div>';

    reportHtml += '<h4>🔄 改写方案</h4>';
    reportHtml += '<div class="report-field"><pre style="white-space:pre-wrap;font-size:12px;line-height:1.8;color:var(--text);">' + esc(result.rewritePlan) + '</pre></div>';

    reportHtml += '<h4>🎯 自动入库预览</h4>';
    reportHtml += '<p style="font-size:12px;color:var(--text-muted);">以下数据将自动对应填入模块1-10，点击下方按钮执行一键入库：</p>';
    const md = result.moduleData;
    reportHtml += '<div class="report-field"><div class="report-label">模块1·作品入库</div><p>' + esc(md.archive.corePlot) + '</p></div>';
    reportHtml += '<div class="report-field"><div class="report-label">模块2·开篇钩子</div><p>' + esc(md.openings.hookTemplate.substring(0,60)) + '...</p></div>';
    if (md.topics) reportHtml += '<div class="report-field"><div class="report-label">模块3·赛道选题</div><p>' + esc(md.topics.formula.substring(0,60)) + '...</p></div>';
    if (md.characters) reportHtml += '<div class="report-field"><div class="report-label">模块4·人设</div><p>' + esc(md.characters.name) + '</p></div>';
    reportHtml += '<div class="report-field"><div class="report-label">模块5·剧情结构</div><p>' + esc(md.structure.title) + '</p></div>';
    reportHtml += '<div class="report-field"><div class="report-label">模块6·拆文复盘</div><p>' + esc(md.analysis.mainPlot) + '</p></div>';
    if (md.quotes) reportHtml += '<div class="report-field"><div class="report-label">模块7·金句</div><p>' + esc(md.quotes.content.substring(0,50)) + '...</p></div>';
    reportHtml += '<div class="report-field"><div class="report-label">模块8·结局模板</div><p>' + esc(md.endings.title) + '</p></div>';
    reportHtml += '<div class="report-field"><div class="report-label">模块9·合规自查</div><p>' + esc(md.compliance.title) + '</p></div>';
    reportHtml += '<div class="report-field"><div class="report-label">模块10·冲突素材</div><p>' + esc(md.conflicts.title) + '</p></div>';

    reportHtml += '</div>';

    // 操作按钮
    reportHtml += '<div class="assistant-result-actions">';
    reportHtml += '<button class="assistant-btn assistant-btn-primary" data-action="auto-archive-all">📦 全自动拆文入库（模块1-10）</button>';
    reportHtml += '<button class="assistant-btn assistant-btn-secondary" data-action="archive-analysis-only">📋 仅归档到拆文复盘库</button>';
    reportHtml += '</div>';

    output.innerHTML = reportHtml;
    output.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 300);
}

// ===== 全自动拆文入库（模块1-10） =====
function autoArchiveAll() {
  if (!state._lastAnalysis) {
    toast('请先执行拆文分析', 'error');
    return;
  }
  const md = state._lastAnalysis.moduleData;
  let count = 0;

  // 模块1：作品入库
  if (md.archive) { Storage.add('archive', { ...md.archive }); count++; }
  // 模块2：开篇钩子
  if (md.openings) { Storage.add('openings', { ...md.openings }); count++; }
  // 模块3：赛道选题
  if (md.topics) { Storage.add('topics', { ...md.topics }); count++; }
  // 模块4：人设
  if (md.characters) { Storage.add('characters', { ...md.characters }); count++; }
  // 模块5：剧情结构
  if (md.structure) { Storage.add('structure', { ...md.structure }); count++; }
  // 模块6：拆文复盘
  if (md.analysis) { Storage.add('analysis', { ...md.analysis }); count++; }
  // 模块7：金句
  if (md.quotes) { Storage.add('quotes', { ...md.quotes }); count++; }
  // 模块8：结局模板
  if (md.endings) { Storage.add('endings', { ...md.endings }); count++; }
  // 模块9：合规
  if (md.compliance) { Storage.add('compliance', { ...md.compliance }); count++; }
  // 模块10：冲突素材
  if (md.conflicts) { Storage.add('conflicts', { ...md.conflicts }); count++; }

  toast('全自动入库完成！共归档 ' + count + ' 条到模块1-10', 'success');
  buildSidebar();
  // 清空助手输出
  document.getElementById('assistant-output').classList.remove('active');
  document.getElementById('assistant-output').innerHTML = '';
  document.getElementById('assistant-input').value = '';
  render();
}

// ===== 仅归档到拆文复盘库 =====
function archiveAnalysisOnly() {
  if (!state._lastAnalysis) {
    toast('请先执行拆文分析', 'error');
    return;
  }
  const md = state._lastAnalysis.moduleData;
  if (md.analysis) {
    Storage.add('analysis', { ...md.analysis });
    toast('已归档到拆文复盘库', 'success');
    buildSidebar();
    document.getElementById('assistant-output').classList.remove('active');
    document.getElementById('assistant-output').innerHTML = '';
    document.getElementById('assistant-input').value = '';
    render();
  }
}

// ===== 导入热点素材 =====
function fetchHotspots(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      let hotspots = data.hotspots || data.hotspotsExport || data;
      if (!Array.isArray(hotspots)) {
        toast('文件格式不对：未找到热点数组', 'error');
        return;
      }
      let count = 0;
      const existing = new Set((DB['hotspots'] || []).map(x => x.id));
      hotspots.forEach(item => {
        if (!existing.has(item.id)) {
          // 确保有必要字段
          if (!item.id) item.id = uid();
          if (!item.createdAt) item.createdAt = fmtDate();
          if (!DB['hotspots']) DB['hotspots'] = [];
          DB['hotspots'].unshift(item);
          count++;
        }
      });
      saveData();
      buildSidebar();
      render();
      toast('成功导入 ' + count + ' 条热点素材' + (count < hotspots.length ? '（' + (hotspots.length - count) + '条已存在跳过）' : ''), 'success');
    } catch(err) {
      toast('导入失败：' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

// ===== 事件绑定 =====
function bindEvents() {
  // 侧边栏导航
  document.getElementById('sidebar-nav').addEventListener('click', (e) => {
    const nav = e.target.closest('[data-action="nav"]');
    if (nav) navigate(nav.dataset.target);
  });

  // 移动端菜单按钮
  document.getElementById('mobile-menu-btn').addEventListener('click', openSidebar);
  // 侧边栏关闭按钮
  document.getElementById('sidebar-close').addEventListener('click', closeSidebar);
  // 遮罩点击关闭
  document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

  // 仪表盘/内容区点击
  document.getElementById('content').addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (el) {
      const action = el.dataset.action;
      if (action === 'filter') { state.filter = el.dataset.value; render(); return; }
      if (action === 'nav') { navigate(el.dataset.target); return; }
      if (action === 'edit') { state._editingId = el.dataset.id; openForm(el.dataset.module, el.dataset.id); return; }
      if (action === 'delete') { confirmDelete(el.dataset.module, el.dataset.id); return; }
      if (action === 'detail') { state.detailId = el.dataset.id; render(); return; }
      if (action === 'back') { state.detailId = null; render(); return; }
      if (action === 'add') { state._editingId = null; openForm(el.dataset.module || state.module); return; }
      if (action === 'auto-archive-all') { autoArchiveAll(); return; }
      if (action === 'archive-analysis-only') { archiveAnalysisOnly(); return; }
    }

    // 拆文助手按钮
    if (e.target.closest('#btn-run-analysis')) { runAnalysis(); return; }
    if (e.target.closest('#btn-clear-assistant')) {
      document.getElementById('assistant-input').value = '';
      document.getElementById('assistant-output').classList.remove('active');
      document.getElementById('assistant-output').innerHTML = '';
      return;
    }

    // 热点导入按钮
    if (e.target.closest('#btn-fetch-hotspots')) {
      document.getElementById('hotspot-file-input').click();
      return;
    }
  });

  // 热点文件选择
  document.getElementById('hotspot-file-input').addEventListener('change', (e) => {
    if (e.target.files[0]) fetchHotspots(e.target.files[0]);
    e.target.value = '';
  });

  // 顶栏新建按钮
  document.getElementById('btn-add').addEventListener('click', () => {
    state._editingId = null;
    openForm(state.module);
  });

  // 搜索
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', (e) => {
    state.search = e.target.value;
    document.getElementById('search-clear').style.display = state.search ? 'block' : 'none';
    if (state.module !== 'dashboard') render();
  });

  document.getElementById('search-clear').addEventListener('click', () => {
    state.search = '';
    searchInput.value = '';
    document.getElementById('search-clear').style.display = 'none';
    if (state.module !== 'dashboard') render();
  });

  // 模态框
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', saveForm);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  // 确认对话框
  document.getElementById('confirm-cancel').addEventListener('click', () => {
    document.getElementById('confirm-overlay').style.display = 'none';
  });
  document.getElementById('confirm-ok').addEventListener('click', doDelete);
  document.getElementById('confirm-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('confirm-overlay')) {
      document.getElementById('confirm-overlay').style.display = 'none';
    }
  });

  // 导出/导入
  document.getElementById('btn-export').addEventListener('click', exportData);
  document.getElementById('btn-import').addEventListener('change', (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });

  // 键盘快捷键
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.getElementById('confirm-overlay').style.display = 'none';
      closeSidebar();
    }
    if (e.key === 'Enter' && document.getElementById('modal-overlay').style.display === 'flex') {
      if (e.target.tagName !== 'TEXTAREA' && e.target.id !== 'tags-input-field' && e.target.id !== 'assistant-input') {
        saveForm();
      }
    }
  });
}

// ===== 自动拉取热点素材 =====
async function autoFetchHotspots() {
  const AUTO_KEY = 'novel_workbench_auto_imported_ids';
  try {
    // 从 GitHub 拉取最新热点数据（云端自动任务生成，无需开机）
    const GITHUB_RAW = 'https://raw.githubusercontent.com/mkdlf82-source/novel-workbench/main/hotspots_export.json';
    const resp = await fetch(GITHUB_RAW + '?_t=' + Date.now());
    if (!resp.ok) return;
    const data = await resp.json();
    let hotspots = data.hotspots || data.hotspotsExport || data;
    if (!Array.isArray(hotspots) || hotspots.length === 0) return;

    let importedIds = {};
    try { importedIds = JSON.parse(localStorage.getItem(AUTO_KEY) || '{}'); } catch(e) {}

    const existingIds = new Set((DB['hotspots'] || []).map(x => x.id));

    let newCount = 0;
    hotspots.forEach(item => {
      if (importedIds[item.id]) return;
      if (existingIds.has(item.id)) return;
      if (!item.id) item.id = uid();
      if (!item.createdAt) item.createdAt = fmtDate();
      if (!DB['hotspots']) DB['hotspots'] = [];
      DB['hotspots'].unshift(item);
      importedIds[item.id] = true;
      newCount++;
    });

    if (newCount > 0) {
      saveData();
      localStorage.setItem(AUTO_KEY, JSON.stringify(importedIds));
      buildSidebar();
      if (state.module === 'hotspots') render();
      toast('自动导入 ' + newCount + ' 条今日热点素材', 'success');
    }
  } catch(err) {
    // 静默失败 - 文件不存在或网络问题，不打扰用户
  }
}

// ===== 初始化 =====
function init() {
  loadData();
  buildSidebar();
  bindEvents();
  render();
  // 页面加载后自动拉取热点
  autoFetchHotspots();
}

document.addEventListener('DOMContentLoaded', init);
