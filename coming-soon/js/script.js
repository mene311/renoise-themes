/* ══════════════════════════════════════════════
   COMING SOON — JavaScript Enhancements
   ══════════════════════════════════════════════ */

// Simple countdown timer that matches Renoise style
class ComingSoon {
    constructor() {
        this.launchDate = new Date('2026-06-01T00:00:00').getTime();
        this.init();
    }

    init() {
        this.startCountdown();
        this.animateElements();
    }

    startCountdown() {
        const updateCountdown = () => {
            const now = new Date().getTime();
            const distance = this.launchDate - now;

            if (distance < 0) {
                this.handleLaunch();
                return;
            }

            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            this.updateDisplay(days, hours, minutes, seconds);
        };

        updateCountdown();
        setInterval(updateCountdown, 1000);
    }

    updateDisplay(days, hours, minutes, seconds) {
        const elements = {
            days: document.getElementById('days'),
            hours: document.getElementById('hours'),
            minutes: document.getElementById('minutes'),
            seconds: document.getElementById('seconds')
        };

        if (elements.days) elements.days.textContent = days.toString().padStart(2, '0');
        if (elements.hours) elements.hours.textContent = hours.toString().padStart(2, '0');
        if (elements.minutes) elements.minutes.textContent = minutes.toString().padStart(2, '0');
        if (elements.seconds) elements.seconds.textContent = seconds.toString().padStart(2, '0');
    }

    handleLaunch() {
        const countdownEl = document.getElementById('countdown');
        if (countdownEl) {
            countdownEl.innerHTML = '<div style="font-size:16px; color:var(--chrome-accent); font-weight:600; padding:20px;">We\'re Live! 🎉</div>';
        }
    }

    animateElements() {
        // Add subtle fade-in animations to features
        const features = document.querySelectorAll('.feature');
        features.forEach((feature, index) => {
            setTimeout(() => {
                feature.style.opacity = '1';
                feature.style.transform = 'translateY(0)';
            }, index * 200);
        });
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ComingSoon();
    
    // Add Renoise-style focus management
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            document.body.classList.add('keyboard-nav');
        }
    });
    
    document.addEventListener('mousedown', () => {
        document.body.classList.remove('keyboard-nav');
    });
});

// Add keyboard navigation styles
const keyboardNavStyles = `
    .keyboard-nav .coming-soon-content:focus {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
    }
    
    .keyboard-nav .feature:focus {
        border-color: var(--accent);
        box-shadow: inset 0 0 0 1px var(--accent);
    }
`;

const styleSheet = document.createElement('style');
styleSheet.textContent = keyboardNavStyles;
document.head.appendChild(styleSheet);