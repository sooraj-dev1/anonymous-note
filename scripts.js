// --- Seed Sample Data ---
const DEFAULT_NOTES = [
  {
    id: "n-1",
    to: "David (Frontend Dev)",
    body: "Thanks for always stepping up during code reviews. Your suggestions genuinely make all of us write cleaner code!",
    category: "Appreciation",
    timestamp: Date.now() - 1000 * 60 * 25,
    likes: 4
  },
  {
    id: "n-2",
    to: "Project Leads",
    body: "Can we please have fewer 30-minute status meetings that could easily be handled with an asynchronous Slack post?",
    category: "Feedback",
    timestamp: Date.now() - 1000 * 60 * 85,
    likes: 19
  },
  {
    id: "n-3",
    to: "New Interns",
    body: "Never hesitate to ask basic questions. Everyone in this office was just as confused on their first week.",
    category: "Advice",
    timestamp: Date.now() - 1000 * 60 * 180,
    likes: 8
  }
];

const PROMPTS = [
  "What is one piece of feedback you've been hesitant to share?",
  "Who did something great recently that went unnoticed?",
  "What process in your team could be improved?",
  "A friendly reminder or encouraging word for the week:"
];

// App State
let notes = JSON.parse(localStorage.getItem('ghostnote_feed')) || DEFAULT_NOTES;
let sentNotes = JSON.parse(localStorage.getItem('ghostnote_sent')) || [];
let activeTab = 'wall'; // 'wall' or 'sent'
let currentCategory = 'Appreciation';
let userLikedIds = new Set(JSON.parse(localStorage.getItem('ghostnote_likes')) || []);
let noteToDeleteId = null;

// DOM Elements
const noteForm = document.getElementById('noteForm');
const toInput = document.getElementById('toInput');
const messageInput = document.getElementById('messageInput');
const charCount = document.getElementById('charCount');
const categoryGroup = document.getElementById('categoryGroup');
const randomPromptBtn = document.getElementById('randomPromptBtn');
const notesContainer = document.getElementById('notesContainer');
const searchInput = document.getElementById('searchInput');
const tagFilter = document.getElementById('tagFilter');
const tabWallBtn = document.getElementById('tabWallBtn');
const tabSentBtn = document.getElementById('tabSentBtn');
const sentCount = document.getElementById('sentCount');
const noteCountBadge = document.getElementById('noteCountBadge');
const feedHeading = document.getElementById('feedHeading');
const toast = document.getElementById('toast');
const toastIcon = document.getElementById('toastIcon');
const toastMessage = document.getElementById('toastMessage');

// Modal Elements
const deleteModal = document.getElementById('deleteModal');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

// Initial Setup
document.addEventListener('DOMContentLoaded', () => {
  updateSentCounter();
  renderNotes();
  bindEvents();
});

function bindEvents() {
  // Character counter
  messageInput.addEventListener('input', () => {
    charCount.textContent = `${messageInput.value.length} / 300`;
  });

  // Category tags selection
  categoryGroup.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      categoryGroup.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.getAttribute('data-cat');
    });
  });

  // Prompt helper
  randomPromptBtn.addEventListener('click', () => {
    const random = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
    messageInput.value = random + " ";
    messageInput.focus();
    charCount.textContent = `${messageInput.value.length} / 300`;
  });

  // Tabs
  tabWallBtn.addEventListener('click', () => switchTab('wall'));
  tabSentBtn.addEventListener('click', () => switchTab('sent'));

  // Search & Filter
  searchInput.addEventListener('input', renderNotes);
  tagFilter.addEventListener('change', renderNotes);

  // Form Submission
  noteForm.addEventListener('submit', handleFormSubmit);

  // Delete Modal Actions
  cancelDeleteBtn.addEventListener('click', closeDeleteModal);
  confirmDeleteBtn.addEventListener('click', executeDelete);
}

// Form Submit Handler
function handleFormSubmit(e) {
  e.preventDefault();

  const to = toInput.value.trim();
  const body = messageInput.value.trim();

  if (!to || !body) return;

  const newNote = {
    id: 'n-' + Date.now(),
    to: to,
    body: body,
    category: currentCategory,
    timestamp: Date.now(),
    likes: 0
  };

  notes.unshift(newNote);
  sentNotes.unshift(newNote);

  localStorage.setItem('ghostnote_feed', JSON.stringify(notes));
  localStorage.setItem('ghostnote_sent', JSON.stringify(sentNotes));

  noteForm.reset();
  charCount.textContent = '0 / 300';
  updateSentCounter();
  renderNotes();

  showToast('Note posted anonymously', 'fa-check text-emerald-400');
}

// Switch Feed View
function switchTab(tab) {
  activeTab = tab;
  if (tab === 'wall') {
    tabWallBtn.className = 'px-3.5 py-1.5 rounded-md bg-white text-slate-900 shadow-sm transition-all flex items-center gap-1.5';
    tabSentBtn.className = 'px-3.5 py-1.5 rounded-md text-slate-600 hover:text-slate-900 transition-all flex items-center gap-1.5';
    feedHeading.textContent = 'Public Notes Wall';
  } else {
    tabSentBtn.className = 'px-3.5 py-1.5 rounded-md bg-white text-slate-900 shadow-sm transition-all flex items-center gap-1.5';
    tabWallBtn.className = 'px-3.5 py-1.5 rounded-md text-slate-600 hover:text-slate-900 transition-all flex items-center gap-1.5';
    feedHeading.textContent = 'Notes Sent by You';
  }
  renderNotes();
}

// Render Notes (Includes Delete / Trash icon on every card)
function renderNotes() {
  const currentList = activeTab === 'wall' ? notes : sentNotes;
  const search = searchInput.value.toLowerCase();
  const filter = tagFilter.value;

  const filtered = currentList.filter(item => {
    const matchSearch = item.to.toLowerCase().includes(search) || item.body.toLowerCase().includes(search);
    const matchFilter = (filter === 'All') || (item.category === filter);
    return matchSearch && matchFilter;
  });

  noteCountBadge.textContent = `${filtered.length} note${filtered.length === 1 ? '' : 's'}`;

  if (filtered.length === 0) {
    notesContainer.innerHTML = `
      <div class="text-center py-16 bg-white border border-slate-200 rounded-xl">
        <i class="fa-regular fa-comment-dots text-3xl text-slate-300 mb-2"></i>
        <p class="text-sm font-semibold text-slate-700">No notes found</p>
        <p class="text-xs text-slate-400 mt-0.5">Try changing your search term or tag filter.</p>
      </div>
    `;
    return;
  }

  notesContainer.innerHTML = filtered.map(item => {
    const isLiked = userLikedIds.has(item.id);
    const timeFormatted = formatTimeAgo(item.timestamp);
    const badgeStyle = getCategoryBadgeStyle(item.category);

    return `
      <article class="note-card flex flex-col gap-3" id="card-${item.id}">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-semibold text-slate-400 uppercase">To:</span>
            <span class="text-xs font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
              ${escapeHtml(item.to)}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-medium px-2 py-0.5 rounded-full border ${badgeStyle}">
              ${item.category}
            </span>
            <span class="text-[11px] text-slate-400">${timeFormatted}</span>
          </div>
        </div>

        <p class="text-sm text-slate-700 leading-normal break-words">
          ${escapeHtml(item.body)}
        </p>

        <div class="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
          <span class="flex items-center gap-1 text-[11px] text-slate-400">
            <i class="fa-solid fa-lock text-[10px]"></i> Sent anonymously
          </span>

          <div class="flex items-center gap-3">
            <!-- Copy Action -->
            <button onclick="copyNote('${item.id}')" title="Copy text" class="hover:text-slate-800 transition-colors">
              <i class="fa-regular fa-copy"></i>
            </button>

            <!-- Like Action -->
            <button onclick="toggleLike('${item.id}')" class="flex items-center gap-1 transition-colors ${isLiked ? 'text-red-500 font-semibold' : 'hover:text-slate-800'}">
              <i class="${isLiked ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
              <span>${item.likes || 0}</span>
            </button>

            <!-- Trash / Delete Action on Every Card -->
            <button onclick="promptDelete('${item.id}')" title="Delete note" class="text-slate-400 hover:text-red-500 transition-colors">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

// --- Delete Handlers ---
function promptDelete(id) {
  noteToDeleteId = id;
  deleteModal.classList.remove('hidden');
}

function closeDeleteModal() {
  noteToDeleteId = null;
  deleteModal.classList.add('hidden');
}

function executeDelete() {
  if (!noteToDeleteId) return;

  // Remove from both lists
  notes = notes.filter(n => n.id !== noteToDeleteId);
  sentNotes = sentNotes.filter(n => n.id !== noteToDeleteId);

  // Sync with LocalStorage
  localStorage.setItem('ghostnote_feed', JSON.stringify(notes));
  localStorage.setItem('ghostnote_sent', JSON.stringify(sentNotes));

  closeDeleteModal();
  updateSentCounter();
  renderNotes();

  showToast('Note permanently deleted', 'fa-trash-can text-red-400');
}

// Like Handler
function toggleLike(id) {
  const target = notes.find(n => n.id === id);
  if (!target) return;

  if (userLikedIds.has(id)) {
    userLikedIds.delete(id);
    target.likes = Math.max(0, (target.likes || 1) - 1);
  } else {
    userLikedIds.add(id);
    target.likes = (target.likes || 0) + 1;
  }

  localStorage.setItem('ghostnote_likes', JSON.stringify(Array.from(userLikedIds)));
  localStorage.setItem('ghostnote_feed', JSON.stringify(notes));
  renderNotes();
}

// Copy Note Content
function copyNote(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;

  navigator.clipboard.writeText(`"${note.body}" — To: ${note.to}`).then(() => {
    showToast('Copied to clipboard', 'fa-check text-emerald-400');
  });
}

// UI Helpers
function updateSentCounter() {
  sentCount.textContent = sentNotes.length;
}

function getCategoryBadgeStyle(cat) {
  switch (cat) {
    case 'Appreciation': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'Feedback': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'Advice': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'Question': return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'Secret': return 'bg-rose-50 text-rose-700 border-rose-200';
    default: return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

function formatTimeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / (1000 * 60));
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}m ago`;
  const hrs = Math.floor(diff / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function showToast(msg, iconClass = 'fa-check text-emerald-400') {
  toastMessage.textContent = msg;
  toastIcon.className = `fa-solid ${iconClass}`;
  toast.classList.remove('translate-y-20', 'opacity-0');
  setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0');
  }, 2400);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}