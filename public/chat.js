// ============================================================================
// CHATBOT — trợ lý viết prompt kiêm hỏi đáp chung
//
// Lịch sử hội thoại lưu trong localStorage (chỉ là text, rất nhẹ) nên F5 không mất.
// Khi AI trả lời có khối code ```...```, khối đó được hiển thị riêng kèm nút
// đưa thẳng vào ô tạo ảnh.
// ============================================================================

const STORAGE_KEY = 'gpt-image-studio-chat';
const MAX_SAVED_MESSAGES = 40;

let messages = [];      // { role: 'user'|'assistant', content: string }
let isSending = false;

// Các hàm do app.js truyền vào để nối chat với phần tạo ảnh
let hooks = {
  onUsePrompt: () => {},
  onToast: () => {},
};

// ---- Elements ----
let fab, panel, fabIcon, messagesEl, inputEl, sendBtn, clearBtn, closeBtn;

const SUGGESTIONS = [
  'Viết prompt: cô gái mặc áo dài trắng bên hồ Gươm lúc bình minh',
  'Giúp tôi 3 biến thể prompt chụp sản phẩm nước hoa trên nền đá cẩm thạch',
  'Prompt của tôi ra ảnh bị mờ mặt, sửa thế nào?',
];

export function initChat(userHooks = {}) {
  hooks = { ...hooks, ...userHooks };

  fab = document.getElementById('chatFab');
  fabIcon = document.getElementById('chatFabIcon');
  panel = document.getElementById('chatPanel');
  messagesEl = document.getElementById('chatMessages');
  inputEl = document.getElementById('chatInput');
  sendBtn = document.getElementById('chatSendBtn');
  clearBtn = document.getElementById('chatClearBtn');
  closeBtn = document.getElementById('chatCloseBtn');

  loadHistory();
  renderMessages();

  fab.addEventListener('click', togglePanel);
  closeBtn.addEventListener('click', closePanel);
  sendBtn.addEventListener('click', sendMessage);

  clearBtn.addEventListener('click', () => {
    if (messages.length === 0) return;
    if (!confirm('Xoá toàn bộ hội thoại?')) return;
    messages = [];
    saveHistory();
    renderMessages();
  });

  // Enter để gửi, Shift+Enter để xuống dòng
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Ô nhập tự giãn theo nội dung
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  });

  // Esc để đóng panel
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.classList.contains('hidden')) closePanel();
  });
}

function togglePanel() {
  panel.classList.contains('hidden') ? openPanel() : closePanel();
}
function openPanel() {
  panel.classList.remove('hidden');
  fab.classList.add('is-open');
  fabIcon.textContent = '✕';
  inputEl.focus();
  scrollToBottom();
}
function closePanel() {
  panel.classList.add('hidden');
  fab.classList.remove('is-open');
  fabIcon.textContent = '✦';
}

// ---- Lưu / đọc lịch sử ----
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) messages = JSON.parse(raw) || [];
  } catch (e) {
    messages = [];
  }
}
function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_SAVED_MESSAGES)));
  } catch (e) {
    // localStorage đầy hoặc bị chặn — bỏ qua, chat vẫn chạy trong phiên này
  }
}

// ---- Hiển thị ----
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/** Tách nội dung thành đoạn text thường và khối code ```...``` */
function parseContent(content) {
  const parts = [];
  const regex = /```(?:[a-zA-Z]*\n)?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, match.index).trim() });
    }
    parts.push({ type: 'code', value: match[1].trim() });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.slice(lastIndex).trim() });
  }
  return parts.filter((p) => p.value.length > 0);
}

function renderMessages() {
  messagesEl.innerHTML = '';

  if (messages.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'chat-empty';
    empty.innerHTML = `
      <span class="chat-empty-mark">✦</span>
      Mô tả ý tưởng, tôi viết prompt cho bạn.<br>Hoặc hỏi bất cứ điều gì.
      <div class="chat-suggestions"></div>
    `;
    const box = empty.querySelector('.chat-suggestions');
    SUGGESTIONS.forEach((s) => {
      const btn = document.createElement('button');
      btn.className = 'chat-suggestion';
      btn.textContent = s;
      btn.addEventListener('click', () => {
        inputEl.value = s;
        sendMessage();
      });
      box.appendChild(btn);
    });
    messagesEl.appendChild(empty);
    return;
  }

  messages.forEach((msg) => messagesEl.appendChild(buildMessageEl(msg)));
  scrollToBottom();
}

function buildMessageEl(msg) {
  const wrap = document.createElement('div');
  wrap.className = `chat-msg ${msg.role}${msg.isError ? ' error' : ''}`;

  if (msg.role === 'user' || msg.isError) {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = msg.content;
    wrap.appendChild(bubble);
    return wrap;
  }

  // Tin nhắn của AI: tách text và khối prompt
  parseContent(msg.content).forEach((part) => {
    if (part.type === 'text') {
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble';
      bubble.textContent = part.value;
      wrap.appendChild(bubble);
    } else {
      wrap.appendChild(buildPromptBlock(part.value));
    }
  });

  return wrap;
}

function buildPromptBlock(promptText) {
  const block = document.createElement('div');
  block.className = 'prompt-block';
  block.innerHTML = `
    <div class="prompt-block-code">${escapeHtml(promptText)}</div>
    <div class="prompt-block-actions">
      <button data-act="use">→ Dùng prompt này</button>
      <button data-act="copy">⧉ Sao chép</button>
    </div>
  `;

  block.querySelector('[data-act="use"]').addEventListener('click', () => {
    hooks.onUsePrompt(promptText);
  });

  block.querySelector('[data-act="copy"]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      hooks.onToast('Đã sao chép prompt');
    } catch (e) {
      hooks.onToast('Trình duyệt chặn sao chép — hãy bôi đen và copy tay');
    }
  });

  return block;
}

function showTyping() {
  const el = document.createElement('div');
  el.className = 'chat-typing';
  el.id = 'chatTyping';
  el.innerHTML = '<span></span><span></span><span></span>';
  messagesEl.appendChild(el);
  scrollToBottom();
}
function hideTyping() {
  document.getElementById('chatTyping')?.remove();
}
function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ---- Gửi tin nhắn ----
async function sendMessage() {
  if (isSending) return;
  const text = inputEl.value.trim();
  if (!text) return;

  messages.push({ role: 'user', content: text });
  inputEl.value = '';
  inputEl.style.height = 'auto';
  saveHistory();
  renderMessages();

  isSending = true;
  sendBtn.disabled = true;
  showTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Chỉ gửi role và content, bỏ các cờ nội bộ như isError
      body: JSON.stringify({
        messages: messages
          .filter((m) => !m.isError)
          .map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    const data = await res.json();
    hideTyping();

    if (!res.ok) {
      messages.push({ role: 'assistant', content: data.error || 'Có lỗi xảy ra', isError: true });
    } else {
      messages.push({ role: 'assistant', content: data.reply });
    }
  } catch (err) {
    hideTyping();
    messages.push({ role: 'assistant', content: 'Không kết nối được tới server', isError: true });
  } finally {
    isSending = false;
    sendBtn.disabled = false;
    saveHistory();
    renderMessages();
    inputEl.focus();
  }
}

/** Mở chat kèm sẵn một câu hỏi (dùng cho nút gợi ý từ ngoài). */
export function openChatWith(text) {
  openPanel();
  inputEl.value = text;
  inputEl.focus();
}
