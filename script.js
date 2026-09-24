// 1. IMPORT FIREBASE (Including arrayUnion for nested replies)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc, 
  increment,
  arrayUnion 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 2. YOUR EXACT PROJECT KEYS
const firebaseConfig = {
  apiKey: "AIzaSyAmW2SyWApb2Wk9yvTLi9EE8IIeTqwVTic",
  authDomain: "ghostnote-app.firebaseapp.com",
  projectId: "ghostnote-app",
  storageBucket: "ghostnote-app.firebasestorage.app",
  messagingSenderId: "563426492631",
  appId: "1:563426492631:web:93ca529be4391c9585b092"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const notesRef = collection(db, "anonymous_notes");

// 3. STATE
let allNotes = [];
let sentNoteIds = JSON.parse(localStorage.getItem('ghostnote_my_sent_ids')) || [];
let userLikedIds = new Set(JSON.parse(localStorage.getItem('ghostnote_likes')) || []);
let openThreads = new Set(); // Tracks which reply drawers are currently toggled open
let activeTab = 'wall';
let currentCategory = 'Appreciation';
let noteToDeleteId = null;

const PROMPTS = [
  "What is one piece of feedback you've been hesitant to share?",
  "Who did something great recently that went unnoticed?",
  "What process in your team could be improved?",
  "A friendly reminder or encouraging word for the week:"
];

// 4. DOM ELEMENTS
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
const deleteModal = document.getElementById('deleteModal');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

// 5. INITIALIZE & LISTEN REAL-TIME
updateSentCounter();
bindEvents();
listenToLiveNotes();

function listenToLiveNotes() {
  onSnapshot(notesRef, (snapshot) => {
    allNotes = [];
    snapshot.forEach((docItem) => {
      allNotes.push({ id: docItem.id, ...docItem.data() });
    });
    // Newest first
    allNotes.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderNotes();
  }, (err) => {
    console.error("Firestore Listen Error:", err);
  });
}

function bindEvents() {
  messageInput.addEventListener('input', () => {
    charCount.textContent = `${messageInput.value.length} / 300`;
  });

  categoryGroup.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      categoryGroup.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.getAttribute('data-cat');
    });
  });

  randomPromptBtn.addEventListener('click', () => {
    const random = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
    messageInput.value = random + " ";
    messageInput.focus();
    charCount.textContent = `${messageInput.value.length} / 300`;
  });

  tabWallBtn.addEventListener('click', () => switchTab('wall'));
  tabSentBtn.addEventListener('click', () => switchTab('sent'));
  searchInput.addEventListener('input', renderNotes);
  tagFilter.addEventListener('change', renderNotes);
  noteForm.addEventListener('submit', handleFormSubmit);

  cancelDeleteBtn.addEventListener('click', closeDeleteModal);
  confirmDeleteBtn.addEventListener('click', executeDelete);
}

// 6. SUBMIT ORIGINAL NOTE
async function handleFormSubmit(e) {
  e.preventDefault();
  const to = toInput.value.trim();
  const body = messageInput.value.trim();
  if (!to || !body) return;

  const submitButton = noteForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.innerText = "Posting...";

  try {
    const docAdded = await addDoc(notesRef, {
      to: to,
      body: body,
      category: currentCategory,
      timestamp: Date.now(),
      likes: 0,
      replies: [] // Initial empty thread
    });

    sentNoteIds.unshift(docAdded.id);
    localStorage.setItem('ghostnote_my_sent_ids', JSON.stringify(sentNoteIds));

    noteForm.reset();
    charCount.textContent = '0 / 300';
    updateSentCounter();
    showToast('Note posted anonymously!', 'fa-check text-emerald-400');
  } catch (error) {
    console.error("Save error:", error);
    alert("Error: " + error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = '<i class="fa-solid fa-paper-plane text-xs mr-2"></i>Post Note';
  }
}

// 7. REPLY ACTIONS (Global)
window.toggleReplies = function(id) {
  if (openThreads.has(id)) {
    openThreads.delete(id);
  } else {
    openThreads.add(id);
  }
  renderNotes();
};

window.submitReply = async function(noteId) {
  const inputEl = document.getElementById(`reply-input-${noteId}`);
  const replyText = inputEl.value.trim();
  if (!replyText) return;

  const replyBtn = document.getElementById(`reply-btn-${noteId}`);
  replyBtn.disabled = true;
  replyBtn.innerText = "...";

  try {
    const noteDoc = doc(db, "anonymous_notes", noteId);
    // Add anonymous reply without any user identifiers
    await updateDoc(noteDoc, {
      replies: arrayUnion({
        id: 'rep_' + Date.now(),
        text: replyText,
        timestamp: Date.now()
      })
    });

    // Make sure thread stays expanded
    openThreads.add(noteId);
    showToast('Anonymous reply posted!', 'fa-reply text-blue-400');
  } catch (err) {
    console.error("Reply error:", err);
    alert("Could not post reply: " + err.message);
  }
};

window.toggleLike = async function(id) {
  const isLiked = userLikedIds.has(id);
  const noteDoc = doc(db, "anonymous_notes", id);

  try {
    if (isLiked) {
      userLikedIds.delete(id);
      await updateDoc(noteDoc, { likes: increment(-1) });
    } else {
      userLikedIds.add(id);
      await updateDoc(noteDoc, { likes: increment(1) });
    }
    localStorage.setItem('ghostnote_likes', JSON.stringify(Array.from(userLikedIds)));
  } catch (err) {
    console.error("Like error:", err);
  }
};

window.promptDelete = function(id) {
  noteToDeleteId = id;
  deleteModal.classList.remove('hidden');
};

function closeDeleteModal() {
  noteToDeleteId = null;
  deleteModal.classList.add('hidden');
}

async function executeDelete() {
  if (!noteToDeleteId) return;
  try {
    await deleteDoc(doc(db, "anonymous_notes", noteToDeleteId));
    sentNoteIds = sentNoteIds.filter(id => id !== noteToDeleteId);
    localStorage.setItem('ghostnote_my_sent_ids', JSON.stringify(sentNoteIds));
    closeDeleteModal();
    updateSentCounter();
    showToast('Note permanently deleted', 'fa-trash-can text-red-400');
  } catch (err) {
    alert("Delete failed: " + err.message);
  }
}

window.copyNote = function(id) {
  const note = allNotes.find(n => n.id === id);
  if (!note) return;
  navigator.clipboard.writeText(`"${note.body}" — To: ${note.to}`).then(() => {
    showToast('Copied to clipboard', 'fa-check text-emerald-400');
  });
};

// 8. RENDER NOTES & INLINE THREADS
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

function renderNotes() {
  const currentList = activeTab === 'wall' 
    ? allNotes 
    : allNotes.filter(n => sentNoteIds.includes(n.id));

  const search = searchInput.value.toLowerCase();
  const filter = tagFilter.value;

  const filtered = currentList.filter(item => {
    const matchSearch = item.to?.toLowerCase().includes(search) || item.body?.toLowerCase().includes(search);
    const matchFilter = (filter === 'All') || (item.category === filter);
    return matchSearch && matchFilter;
  });

  noteCountBadge.textContent = `${filtered.length} note${filtered.length === 1 ? '' : 's'}`;

  if (filtered.length === 0) {
    notesContainer.innerHTML = `
      <div class="text-center py-16 bg-white border border-slate-200 rounded-xl">
        <i class="fa-regular fa-comment-dots text-3xl text-slate-300 mb-2"></i>
        <p class="text-sm font-semibold text-slate-700">No notes found</p>
        <p class="text-xs text-slate-400 mt-0.5">Be the first to share an anonymous note!</p>
      </div>
    `;
    return;
  }

  notesContainer.innerHTML = filtered.map(item => {
    const isLiked = userLikedIds.has(item.id);
    const timeFormatted = formatTimeAgo(item.timestamp);
    const badgeStyle = getCategoryBadgeStyle(item.category);
    const replies = item.replies || [];
    const isThreadOpen = openThreads.has(item.id);

    // Build the list of replies for this card
    const repliesListHtml = replies.map(r => `
      <div class="flex items-start gap-2.5 bg-slate-50 p-2.5 rounded-lg border border-slate-200/70 text-xs">
        <i class="fa-solid fa-user-secret text-slate-400 text-sm mt-0.5"></i>
        <div class="flex-1">
          <div class="flex items-center justify-between mb-1">
            <span class="font-semibold text-slate-700 text-[11px]">Anonymous</span>
            <span class="text-[10px] text-slate-400">${formatTimeAgo(r.timestamp)}</span>
          </div>
          <p class="text-slate-600 leading-relaxed">${escapeHtml(r.text)}</p>
        </div>
      </div>
    `).join('');

    return `
      <article class="note-card flex flex-col gap-3">
        <!-- Card Header -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-semibold text-slate-400 uppercase">To:</span>
            <span class="text-xs font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
              ${escapeHtml(item.to || '')}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-medium px-2 py-0.5 rounded-full border ${badgeStyle}">
              ${item.category || 'Note'}
            </span>
            <span class="text-[11px] text-slate-400">${timeFormatted}</span>
          </div>
        </div>

        <!-- Note Text -->
        <p class="text-sm text-slate-700 leading-normal break-words">
          ${escapeHtml(item.body || '')}
        </p>

        <!-- Action Bar -->
        <div class="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
          <!-- Reply Drawer Toggle Button -->
          <button onclick="toggleReplies('${item.id}')" class="flex items-center gap-1.5 hover:text-slate-900 transition-colors font-medium">
            <i class="fa-regular fa-comment-dots"></i>
            <span>${replies.length > 0 ? `${replies.length}${replies.length === 1 ? 'Reply' : 'Replies'}` : 'Reply'}</span>
          </button>

          <div class="flex items-center gap-3">
            <button onclick="copyNote('${item.id}')" title="Copy text" class="hover:text-slate-800 transition-colors">
              <i class="fa-regular fa-copy"></i>
            </button>
            <button onclick="toggleLike('${item.id}')" class="flex items-center gap-1 transition-colors ${isLiked ? 'text-red-500 font-semibold' : 'hover:text-slate-800'}">
              <i class="${isLiked ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
              <span>${item.likes || 0}</span>
            </button>
            <button onclick="promptDelete('${item.id}')" title="Delete note" class="text-slate-400 hover:text-red-500 transition-colors">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </div>

        <!-- Inline Anonymous Reply Section (Collapsible) -->
        <div class="${isThreadOpen ? 'block' : 'hidden'} mt-1 pt-3 border-t border-slate-100 flex flex-col gap-2.5">
          ${replies.length > 0 ? `<div class="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">${repliesListHtml}</div>` : `<p class="text-[11px] text-slate-400 italic">No replies yet. Be the first to answer anonymously!</p>`}
          
          <!-- Reply Input Bar -->
          <div class="flex items-center gap-2 mt-1">
            <input 
              type="text" 
              id="reply-input-${item.id}"
              maxlength="180"
              placeholder="Reply anonymously..." 
              onkeydown="if(event.key === 'Enter') submitReply('${item.id}')"
              class="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-900 focus:bg-white transition-all"
            />
            <button 
              id="reply-btn-${item.id}"
              onclick="submitReply('${item.id}')"
              class="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors active:scale-95"
            >
              <i class="fa-solid fa-paper-plane text-[10px]"></i>
              <span>Send</span>
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function updateSentCounter() {
  sentCount.textContent = sentNoteIds.length;
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
  if (!ts) return 'recently';
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