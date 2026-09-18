// ============================================
// Letigo — Frontend Interactions
// ============================================

// Smooth scroll for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  });
});

// Navbar background on scroll
const nav = document.querySelector('nav');
window.addEventListener('scroll', () => {
  if (window.scrollY > 50) {
    nav.classList.add('bg-[#0a0a0a]/95');
    nav.classList.remove('bg-[#0a0a0a]/80');
  } else {
    nav.classList.remove('bg-[#0a0a0a]/95');
    nav.classList.add('bg-[#0a0a0a]/80');
  }
});

// Reveal on scroll animation
const revealElements = document.querySelectorAll('.step-card, .feature-card, .arch-node');

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, index) => {
    if (entry.isIntersecting) {
      setTimeout(() => {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }, index * 100);
      revealObserver.unobserve(entry.target);
    }
  });
}, {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
});

revealElements.forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(30px)';
  el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
  revealObserver.observe(el);
});

// Robot screen interactive flicker on hover
const robotScreens = document.querySelectorAll('.robot-screen, .robot-screen-big');
robotScreens.forEach(screen => {
  screen.parentElement.addEventListener('mouseenter', () => {
    screen.style.animation = 'none';
    screen.style.opacity = '0.7';
    setTimeout(() => {
      screen.style.opacity = '1';
      setTimeout(() => {
        screen.style.opacity = '0.85';
        setTimeout(() => {
          screen.style.opacity = '1';
          screen.style.animation = 'screenFlicker 4s infinite';
        }, 80);
      }, 60);
    }, 50);
  });
});

// Simulated compliance score counter animation
function animateScore(element, targetScore, duration = 1500) {
  const start = 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(start + (targetScore - start) * easeOut);
    element.textContent = current + '%';

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

// Observe compliance score elements
const scoreObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting && !entry.target.dataset.animated) {
      entry.target.dataset.animated = 'true';
      const score = parseInt(entry.target.dataset.score || '94');
      animateScore(entry.target, score);
    }
  });
}, { threshold: 0.5 });

// Add data attributes to score elements and observe
document.querySelectorAll('.text-\\[\\#00ff88\\].font-bold.text-sm').forEach(el => {
  if (el.textContent.includes('%')) {
    el.dataset.score = el.textContent.replace('%', '');
    scoreObserver.observe(el);
  }
});

// Button click feedback
document.querySelectorAll('a[href="#"]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    if (btn.textContent.includes('Chrome') || btn.textContent.includes('Demo') || btn.textContent.includes('GitHub')) {
      e.preventDefault();
      // Visual feedback
      btn.style.transform = 'scale(0.95)';
      setTimeout(() => {
        btn.style.transform = '';
      }, 150);
    }
  });
});

// Parallax effect for hero robot (subtle)
window.addEventListener('scroll', () => {
  const scrolled = window.scrollY;
  const hero = document.querySelector('.hero-robot');
  if (hero && scrolled < window.innerHeight) {
    hero.style.transform = `translateY(${scrolled * 0.1}px)`;
  }
});

// Console easter egg
console.log('%c🤖 Letigo', 'font-size: 24px; font-weight: bold; color: #00ff88;');
console.log('%cUniversal AI Rule Enforcer', 'font-size: 14px; color: #ffd93d;');
console.log('%cYour rules. Enforced everywhere. Locally.', 'font-size: 12px; color: #888;');
console.log('');
console.log('%cPowered by Moss · Sub-10ms semantic search', 'color: #666;');
