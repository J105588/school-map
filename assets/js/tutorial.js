class Tutorial {
    constructor() {
        this.steps = [
            {
                target: null,
                title: 'I-Compass へようこそ！',
                text: '当システムは、学園内の教室や展示場所、目的地までのルートを検索できる校内専用ナビゲーションマップです。',
                placement: 'center'
            },
            {
                target: '.search-panel',
                title: '出発地・目的地の設定',
                text: '出発地と目的地を選択すると、最適なルートが自動的に計算され、地図上に表示されます。<br>※スマートフォンでは画面下部にある「目的地を検索...」バーから設定できます。',
                placement: 'right'
            },
            {
                target: '#scan-btn',
                title: '現在地をセット（QRスキャン）',
                text: '校内の各所に設置されているQRコードをカメラでスキャンすることで、「現在地」がマップ上に自動設定されます。',
                placement: 'top'
            },
            {
                target: '.map-controls',
                title: 'マップの操作',
                text: '地図の拡大・縮小、全体表示が可能です。<br>※スマートフォンではピンチイン・アウトでの拡大縮小も行えます。',
                placement: 'left'
            },
            {
                target: '#settings-btn',
                title: '設定モーダル',
                text: '進行方向を常に上にする「地図の自動回転」や、階段を避けてエレベーターを優先する「バリアフリーモード」を切り替えられます。',
                placement: 'left'
            }
        ];

        this.currentStep = 0;
        this.initDOM();
        this.bindEvents();
    }

    initDOM() {
        // Create elements if they do not exist
        if (document.getElementById('tutorial-overlay')) return;

        this.overlay = document.createElement('div');
        this.overlay.id = 'tutorial-overlay';
        this.overlay.className = 'hidden';

        this.spotlight = document.createElement('div');
        this.spotlight.className = 'tutorial-spotlight';
        this.overlay.appendChild(this.spotlight);

        this.bubble = document.createElement('div');
        this.bubble.id = 'tutorial-bubble';
        this.bubble.innerHTML = `
            <button id="tutorial-close-btn" class="tutorial-close-btn" aria-label="閉じる">&times;</button>
            <div class="tutorial-arrow"></div>
            <div class="tutorial-body">
                <h3 class="tutorial-title"></h3>
                <p class="tutorial-text"></p>
            </div>
            <div class="tutorial-footer">
                <button id="tutorial-prev-btn" class="tutorial-btn secondary">戻る</button>
                <div class="tutorial-progress"></div>
                <button id="tutorial-next-btn" class="tutorial-btn primary">次へ</button>
            </div>
        `;
        this.overlay.appendChild(this.bubble);
        document.body.appendChild(this.overlay);

        this.titleEl = this.bubble.querySelector('.tutorial-title');
        this.textEl = this.bubble.querySelector('.tutorial-text');
        this.progressEl = this.bubble.querySelector('.tutorial-progress');
        this.prevBtn = this.bubble.querySelector('#tutorial-prev-btn');
        this.nextBtn = this.bubble.querySelector('#tutorial-next-btn');
        this.closeBtn = this.bubble.querySelector('#tutorial-close-btn');
    }

    bindEvents() {
        this.closeBtn.addEventListener('click', () => this.stop());
        this.prevBtn.addEventListener('click', () => this.prev());
        this.nextBtn.addEventListener('click', () => this.next());

        // Update spotlight & position on window resize
        window.addEventListener('resize', () => {
            if (this.overlay && !this.overlay.classList.contains('hidden')) {
                this.showStep(this.currentStep);
            }
        });
    }

    start() {
        this.currentStep = 0;
        this.overlay.classList.remove('hidden');
        this.showStep(0);
        // Save to localStorage so it doesn't auto-start next time
        localStorage.setItem('tutorial_shown', 'true');
    }

    stop() {
        this.overlay.classList.add('hidden');
        
        // Show terms modal after tutorial stops if terms have not been accepted yet
        const termsAccepted = localStorage.getItem('terms_accepted') === 'true';
        if (!termsAccepted) {
            showTermsModal();
        }
    }

    next() {
        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            this.showStep(this.currentStep);
        } else {
            this.stop();
        }
    }

    prev() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this.showStep(this.currentStep);
        }
    }

    showStep(index) {
        const step = this.steps[index];
        this.titleEl.innerHTML = step.title;
        this.textEl.innerHTML = step.text;
        this.progressEl.innerText = `${index + 1} / ${this.steps.length}`;

        // Visibility control for Back button (visibility hidden maintains center progress position)
        if (index === 0) {
            this.prevBtn.style.visibility = 'hidden';
        } else {
            this.prevBtn.style.visibility = 'visible';
        }

        if (index === this.steps.length - 1) {
            this.nextBtn.innerText = '完了';
        } else {
            this.nextBtn.innerText = '次へ';
        }

        // Close sidebar if mobile and explaining map controls or settings
        if (window.innerWidth <= 768) {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar && sidebar.classList.contains('active')) {
                // Keep sidebar open only for step 0 and 1
                if (index > 1) {
                    sidebar.classList.remove('active');
                }
            }
        }

        // Target Positioning
        let selector = step.target;
        if (window.innerWidth <= 768) {
            if (index === 1) selector = '#mobile-search-bar';
            else if (index === 2) selector = '#mobile-qr-btn';
            else if (index === 4) selector = '#mobile-settings-btn';
        } else {
            if (index === 4) selector = '#settings-btn';
        }

        let targetEl = selector ? document.querySelector(selector) : null;

        // If element is not visible or doesn't exist, center
        if (!targetEl || targetEl.offsetWidth === 0 || targetEl.offsetHeight === 0) {
            // Fallback: Center bubble but keep background dark (offscreen spotlight mask)
            this.spotlight.style.opacity = '1';
            this.spotlight.style.top = '-100px';
            this.spotlight.style.left = '-100px';
            this.spotlight.style.width = '0px';
            this.spotlight.style.height = '0px';
            this.spotlight.style.borderRadius = '0px';

            this.bubble.className = 'tutorial-centered';
            this.bubble.style.top = '50%';
            this.bubble.style.left = '50%';
            this.bubble.style.transform = 'translate(-50%, -50%)';
            return;
        }

        this.spotlight.style.opacity = '1';
        this.bubble.className = ''; // Reset classes

        let rect = targetEl.getBoundingClientRect();
        let borderRadius = window.getComputedStyle(targetEl).borderRadius;

        // Special handling for .map-controls step to exclude #settings-btn
        if (step.target === '.map-controls') {
            const elements = Array.from(targetEl.children).filter(el => {
                return el.id !== 'settings-btn' &&
                    el.style.display !== 'none' &&
                    window.getComputedStyle(el).display !== 'none';
            });

            if (elements.length > 0) {
                let minTop = Infinity, minLeft = Infinity, maxBottom = -Infinity, maxRight = -Infinity;
                elements.forEach(el => {
                    const r = el.getBoundingClientRect();
                    if (r.top < minTop) minTop = r.top;
                    if (r.left < minLeft) minLeft = r.left;
                    if (r.bottom > maxBottom) maxBottom = r.bottom;
                    if (r.right > maxRight) maxRight = r.right;
                });

                rect = {
                    top: minTop,
                    left: minLeft,
                    width: maxRight - minLeft,
                    height: maxBottom - minTop,
                    bottom: maxBottom,
                    right: maxRight
                };
                borderRadius = '12px'; // Standard border radius for grouped controls
            }
        }

        // Spotlight size and position
        this.spotlight.style.top = `${rect.top}px`;
        this.spotlight.style.left = `${rect.left}px`;
        this.spotlight.style.width = `${rect.width}px`;
        this.spotlight.style.height = `${rect.height}px`;

        // Match round corners for circle buttons (like FAB or control btns)
        const computedStyle = window.getComputedStyle(targetEl);
        this.spotlight.style.borderRadius = computedStyle.borderRadius;

        // Position bubble
        const bubbleWidth = 290; // Fixed width defined in CSS
        const gap = 15;

        let placement = step.placement;
        // On mobile, force top/bottom placement to prevent clipping
        if (window.innerWidth <= 768) {
            if (placement === 'left' || placement === 'right') {
                // If the target element is in the upper half of the screen, place the bubble at the bottom.
                // Otherwise place it at the top.
                if (rect.top < window.innerHeight / 2) {
                    placement = 'bottom';
                } else {
                    placement = 'top';
                }
            } else if (placement === 'top' && rect.top < 220) {
                // If it was configured as 'top', but it's too close to the top boundary, switch to 'bottom'
                placement = 'bottom';
            }
        }

        let top = 0;
        let left = 0;
        let arrowClass = '';

        // Calculate positions
        if (placement === 'bottom') {
            top = rect.bottom + gap;
            left = rect.left + rect.width / 2 - bubbleWidth / 2;
            arrowClass = 'arrow-top';
        } else if (placement === 'top') {
            top = rect.top - 180 - gap; // Approx height fallback before draw
            left = rect.left + rect.width / 2 - bubbleWidth / 2;
            arrowClass = 'arrow-bottom';
        } else if (placement === 'right') {
            top = rect.top + rect.height / 2 - 90;
            left = rect.right + gap;
            arrowClass = 'arrow-left';
        } else if (placement === 'left') {
            top = rect.top + rect.height / 2 - 90;
            left = rect.left - bubbleWidth - gap;
            arrowClass = 'arrow-right';
        }

        // Screen boundary safety adjustments
        if (left < 10) left = 10;
        if (left + bubbleWidth > window.innerWidth - 10) {
            left = window.innerWidth - bubbleWidth - 10;
        }
        if (top < 10) top = 10;

        this.bubble.style.top = `${top}px`;
        this.bubble.style.left = `${left}px`;
        this.bubble.style.transform = 'none';

        // Adjust top position precisely after elements render (offsetHeight is now known)
        setTimeout(() => {
            const bubbleHeight = this.bubble.offsetHeight;
            if (placement === 'top') {
                this.bubble.style.top = `${rect.top - bubbleHeight - gap}px`;
            } else if (placement === 'left' || placement === 'right') {
                this.bubble.style.top = `${rect.top + rect.height / 2 - bubbleHeight / 2}px`;
            }

            // Boundary re-check for top/bottom
            let finalTop = parseFloat(this.bubble.style.top);
            if (finalTop < 10) finalTop = 10;
            if (finalTop + bubbleHeight > window.innerHeight - 10) {
                finalTop = window.innerHeight - bubbleHeight - 10;
            }
            this.bubble.style.top = `${finalTop}px`;

            // Adjust arrow position dynamically
            const arrow = this.bubble.querySelector('.tutorial-arrow');
            arrow.className = `tutorial-arrow ${arrowClass}`;

            const finalLeft = parseFloat(this.bubble.style.left);
            if (placement === 'top' || placement === 'bottom') {
                const targetCenterX = rect.left + rect.width / 2;
                const arrowLeft = targetCenterX - finalLeft;
                arrow.style.left = `${arrowLeft}px`;
                arrow.style.top = '';
            } else {
                const targetCenterY = rect.top + rect.height / 2;
                const arrowTop = targetCenterY - finalTop;
                arrow.style.top = `${arrowTop}px`;
                arrow.style.left = '';
            }
        }, 0);
    }
}

function showTermsModal() {
    const modal = document.getElementById('terms-modal');
    if (modal) {
        modal.classList.remove('hidden');
        // Reset checkbox and button state when opening
        const checkbox = document.getElementById('terms-checkbox');
        const agreeBtn = document.getElementById('terms-agree-btn');
        if (checkbox) checkbox.checked = false;
        if (agreeBtn) agreeBtn.disabled = true;
    }
}

function hideTermsModal() {
    const modal = document.getElementById('terms-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function showBlockedOverlay() {
    const overlay = document.getElementById('terms-blocked-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
    }
}

function hideBlockedOverlay() {
    const overlay = document.getElementById('terms-blocked-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

function initTermsConsent() {
    const checkbox = document.getElementById('terms-checkbox');
    const agreeBtn = document.getElementById('terms-agree-btn');
    const declineBtn = document.getElementById('terms-decline-btn');
    const recheckBtn = document.getElementById('terms-recheck-btn');

    if (checkbox && agreeBtn) {
        checkbox.addEventListener('change', () => {
            agreeBtn.disabled = !checkbox.checked;
        });
    }

    if (agreeBtn) {
        agreeBtn.addEventListener('click', () => {
            localStorage.setItem('terms_accepted', 'true');
            hideTermsModal();
            hideBlockedOverlay();
            
            // Show safety warning modal immediately on mobile after terms acceptance
            if (window.innerWidth <= 768) {
                const safetyModal = document.getElementById('safety-warning-modal');
                if (safetyModal) {
                    safetyModal.classList.remove('hidden');
                    localStorage.setItem('last_safety_warning_time', Date.now().toString());
                }
            }
        });
    }

    if (declineBtn) {
        declineBtn.addEventListener('click', () => {
            hideTermsModal();
            showBlockedOverlay();
        });
    }

    if (recheckBtn) {
        recheckBtn.addEventListener('click', () => {
            hideBlockedOverlay();
            showTermsModal();
        });
    }
}

// Auto start on page load if first time
function initTutorial() {
    // Do not run if map is private or private overlay is present
    if (document.title.includes("非公開") || document.getElementById('supabase-private-overlay')) {
        return;
    }

    // Initialize terms consent events
    initTermsConsent();

    window.tutorial = new Tutorial();
    
    const termsAccepted = localStorage.getItem('terms_accepted') === 'true';
    const tutorialShown = localStorage.getItem('tutorial_shown') === 'true';

    // If terms have not been accepted, control flow:
    if (!termsAccepted) {
        if (!tutorialShown) {
            // Delay slightly for initial map animation to start/finish
            setTimeout(() => {
                if (document.title.includes("非公開") || document.getElementById('supabase-private-overlay')) {
                    return;
                }
                window.tutorial.start();
            }, 3500);
        } else {
            // Already saw tutorial but hasn't accepted terms (e.g. declined or storage cleared), show terms immediately
            setTimeout(() => {
                if (document.title.includes("非公開") || document.getElementById('supabase-private-overlay')) {
                    return;
                }
                showTermsModal();
            }, 1000);
        }
    } else if (!tutorialShown) {
        // If terms accepted but tutorial not shown
        setTimeout(() => {
            if (document.title.includes("非公開") || document.getElementById('supabase-private-overlay')) {
                return;
            }
            window.tutorial.start();
        }, 3500);
    }

    // Bind event for settings tutorial trigger
    const startTutorialBtn = document.getElementById('start-tutorial-btn');
    if (startTutorialBtn) {
        startTutorialBtn.addEventListener('click', () => {
            if (document.title.includes("非公開") || document.getElementById('supabase-private-overlay')) {
                return;
            }
            // Close settings modal
            const settingsModal = document.getElementById('settings-modal');
            if (settingsModal) {
                settingsModal.classList.add('hidden');
            }
            // Start Tour
            window.tutorial.start();
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTutorial);
} else {
    initTutorial();
}
