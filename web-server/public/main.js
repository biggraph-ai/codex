const setupDiv = document.getElementById('setup');
const conversationDiv = document.getElementById('conversation');
const setupForm = document.getElementById('setup-form');
const promptForm = document.getElementById('prompt-form');
const repoInput = document.getElementById('repoUrl');
const branchInput = document.getElementById('branch');
const tokenInput = document.getElementById('token');
const promptInput = document.getElementById('prompt');
const result = document.getElementById('result');
const messages = document.getElementById('messages');

function loadSettings() {
  const repoUrl = localStorage.getItem('repoUrl');
  const token = localStorage.getItem('token');
  const branch = localStorage.getItem('branch') || 'main';
  if (repoUrl && token) {
    repoInput.value = repoUrl;
    tokenInput.value = token;
    branchInput.value = branch;
    setupDiv.style.display = 'none';
    conversationDiv.style.display = 'block';
  }
}

setupForm.addEventListener('submit', (e) => {
  e.preventDefault();
  localStorage.setItem('repoUrl', repoInput.value);
  localStorage.setItem('token', tokenInput.value);
  localStorage.setItem('branch', branchInput.value);
  setupDiv.style.display = 'none';
  conversationDiv.style.display = 'block';
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
  const res = await fetch('/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoUrl, prompt, token, branch }),
  });
  if (res.ok) {
    const data = await res.json();
    if (data.prUrl) {
      messages.textContent += `\nPR: ${data.prUrl}`;
    }
    result.textContent = 'Done';
  } else {
    result.textContent = await res.text();
  }
});

loadSettings();
