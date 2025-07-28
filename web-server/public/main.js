const form = document.getElementById('run-form');
const result = document.getElementById('result');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  result.textContent = 'Running...';
  const repoUrl = document.getElementById('repoUrl').value;
  const prompt = document.getElementById('prompt').value;
  const token = document.getElementById('token').value;
  const res = await fetch('/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoUrl, prompt, token }),
  });
  if (res.ok) {
    const data = await res.json();
    result.textContent = data.prUrl ? `PR: ${data.prUrl}` : 'Done';
  } else {
    result.textContent = await res.text();
  }
});
