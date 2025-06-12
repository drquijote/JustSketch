// Add to your router.js
export function initFloatingNav() {
  const hamburger = document.createElement('button');
  hamburger.className = 'hamburger-float';
  hamburger.innerHTML = `
    <div class="hamburger-line"></div>
    <div class="hamburger-line"></div>
    <div class="hamburger-line"></div>
  `;
  hamburger.onclick = toggleMenu;
  document.body.appendChild(hamburger);
}

// Simple menu toggle
function toggleMenu() {
  const menu = document.getElementById('slideMenu');
  menu.classList.toggle('open');
}