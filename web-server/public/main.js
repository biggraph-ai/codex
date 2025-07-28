import { GOOGLE_CLIENT_ID } from './config.js';

const setupDiv = document.getElementById('setup');
const conversationDiv = document.getElementById('conversation');
const setupForm = document.getElementById('setup-form');
const promptForm = document.getElementById('prompt-form');
const repoInput = document.getElementById('repoUrl');
const branchInput = document.getElementById('branch');
const tokenInput = document.getElementById('token');
const loginDiv = document.getElementById('login');
const promptInput = document.getElementById('prompt');
const result = document.getElementById('result');
const messages = document.getElementById('messages');

function loadHistory(userId, repoUrl) {
  if (!userId || !repoUrl) return;
  fetch(`/history?userId=${encodeURIComponent(userId)}&repoUrl=${encodeURIComponent(repoUrl)}`)
    .then((r) => r.ok ? r.json() : [])
    .then((items) => {
      messages.textContent = items.map((i) => `> ${i.prompt}${i.prUrl ? `\nPR: ${i.prUrl}` : ''}`).join('\n');
    });
}

function loadSettings() {
  const repoUrl = localStorage.getItem('repoUrl');
  const token = localStorage.getItem('token');
  const branch = localStorage.getItem('branch') || 'main';
  const userId = localStorage.getItem('userId');
  if (!userId) {
    loginDiv.style.display = 'block';
    setupDiv.style.display = 'none';
    conversationDiv.style.display = 'none';
    return;
  }
  loginDiv.style.display = 'none';
  if (repoUrl && token) {
    repoInput.value = repoUrl;
    tokenInput.value = token;
    branchInput.value = branch;
    setupDiv.style.display = 'none';
    conversationDiv.style.display = 'block';
    loadHistory(userId, repoUrl);
  } else {
    setupDiv.style.display = 'block';
    conversationDiv.style.display = 'none';
  }
}

setupForm.addEventListener('submit', (e) => {
  e.preventDefault();
  localStorage.setItem('repoUrl', repoInput.value);
  localStorage.setItem('token', tokenInput.value);
  localStorage.setItem('branch', branchInput.value);
  setupDiv.style.display = 'none';
  conversationDiv.style.display = 'block';
  const userId = localStorage.getItem('userId');
  loadHistory(userId, repoInput.value);
});

promptForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const prompt = promptInput.value.trim();
  if (!prompt) return;
  messages.textContent += `\n> ${prompt}`;
  result.textContent = 'Running...';
  promptInput.value = '';
  const repoUrl = localStorage.getItem('repoUrl');
  const token = localStorage.getItem('token');
  const branch = localStorage.getItem('branch');
  const userId = localStorage.getItem('userId');
  const res = await fetch('/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoUrl, prompt, token, branch, userId }),
  });
  if (res.ok) {
    const data = await res.json();
    if (data.prUrl) {
      messages.textContent += `\nPR: ${data.prUrl}`;
    }
    result.textContent = 'Done';
    loadHistory(userId, repoUrl);
  } else {
    result.textContent = await res.text();
  }
});

loadSettings();

google.accounts.id.initialize({
  client_id: GOOGLE_CLIENT_ID,
  callback: async (response) => {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: response.credential }),
    });
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('userId', data.userId);
      loadSettings();
    } else {
      alert('Login failed');
    }
  },
});

google.accounts.id.renderButton(document.getElementById('google-signin'), { theme: 'outline', size: 'large' });
