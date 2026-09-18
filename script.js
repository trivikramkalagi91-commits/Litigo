// ============================================
// Litigo — AI-Generated Style Frontend
// Merged design elements from:
// supahero.io, bestfreefonts.com, logosystem.co
// cosmos.so, pafolios.com, jitter.video, recent.design
// ============================================

// Smooth scroll for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// Category pills toggle (recent.design + bestfreefonts style)
document.querySelectorAll('.pill').forEach(pill => {
  pill.addEventListener('click', function() {
    document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    this.classList.add('active');
  });
});

// Animate compliance score bars on scroll
const scoreObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const width = entry.target.style.width;
      entry.target.style.width = '0%';
      setTimeout(() => {
        entry.target.style.transition = 'width 1.5s cubic-bezier(0.4, 0, 0.2, 1)';
        entry.target.style.width = width;
      }, 100);
      scoreObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('.score-fill').forEach(bar => scoreObserver.observe(bar));

// Subtle parallax on cosmos.so-style floating cards
document.addEventListener('mousemove', (e) => {
  const cards = document.querySelectorAll('.float-card');
  const x = (e.clientX / window.innerWidth - 0.5) * 2;
  const y = (e.clientY / window.innerHeight - 0.5) * 2;
  
  cards.forEach((card, i) => {
    const speed = (i + 1) * 15;
    card.style.transform = `translate(${x * speed}px, ${y * speed}px)`;
  });
});

// Bento card hover tilt effect
document.querySelectorAll('.bento-card').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = (y - centerY) / 20;
    const rotateY = (centerX - x) / 20;
    card.style.transform = `translateY(-4px) perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  });
  
  card.addEventListener('mouseleave', () => {
    card.style.transform = '';
  });
});

// Console easter egg
console.log('%c🤖 Litigo', 'font-size: 28px; font-weight: bold; color: #00FF41;');
console.log('%c╔══════════════════════════════════╗', 'color: #A855F7;');
console.log('%c║  Universal AI Rule Enforcer      ║', 'color: #A855F7;');
console.log('%c║  Powered by Moss · Sub-10ms      ║', 'color: #A855F7;');
console.log('%c╚══════════════════════════════════╝', 'color: #A855F7;');
console.log('%cMerged design references from 7 platforms:', 'color: #666; font-size: 11px;');
console.log('%c  supahero.io · bestfreefonts · logosystem', 'color: #555; font-size: 11px;');
console.log('%c  cosmos.so · pafolios · jitter · recent.design', 'color: #555; font-size: 11px;');