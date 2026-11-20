import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import '@/styles/tokens.css';
import '@/styles/global.css';
import '@/styles/app.css';
import '@/styles/materials.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Hand over from the boot splash once the first frame has rendered.
requestAnimationFrame(() => {
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.classList.add('boot--done');
  setTimeout(() => boot.remove(), 500);
});
