/**
 * Dot Grid Background Web Component
 * Creates a responsive canvas grid of dots that react to mouse movement with 3D gravity effects
 */
class DotGridBackground extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        // Configuration variables with defaults
        this.dotSpacing = 20;
        this.dotSize = 1;
        this.dotColor = '#000000';
        this.backgroundColor = '#ffffff';
        this.gravityStrength = 2.0;
        this.gravityRadius = 140;
        this.animationSpeed = 0.20;
        this.waveEnabled = true;
        this.waveAmplitude = 10;
        this.waveFrequency = 0.005;
        this.waveSpeed = 1.0;
        this.eventsEnabled = true;
        this.eventFrequency = 0.200;
        this.eventDuration = 1200;
        this.eventRadius = 140;
        this.eventColor = '#000000';
        this.eventSizeMultiplier = 20;
        this.eventBrightness = 0.8;
        this.shockwaveStrength = 25;
        this.bounceStrength = 4;
        this.bounceHeight = 50;
        this.rippleCount = 3;
        this.rippleDecay = 1.5;
        this.rippleBounceStrength = 2;
        this.rippleOutwardStrength = 20;
        this.trailLength = 15;
        this.trailDecay = 0.85;

        // Canvas and animation properties
        this.canvas = null;
        this.ctx = null;
        this.animationId = null;
        this.mouseX = 0;
        this.mouseY = 0;
        this.isMouseInBounds = false;
        this.waveTime = 0;

        // Pre-calculated values for performance
        this.gravityRadiusSquared = this.gravityRadius * this.gravityRadius;
        this.eventRadiusSquared = this.eventRadius * this.eventRadius;
        this.animationSpeedInv = 1 - this.animationSpeed;

        // Optimized gravity trail system with object pooling
        this.gravityTrails = [];
        this.trailPool = [];
        this.maxTrails = this.trailLength || 5;

        // Grid data
        this.dots = [];
        this.sortedDots = []; // Pre-allocated array for sorting

        // Event system
        this.events = [];
        this.lastEventTime = 0;

        // Performance optimizations
        this.frameTime = 0;
        this.lastFrameTime = 0;

        // Fade-in animation
        this.fadeInProgress = 0;
        this.fadeInDuration = 2000; // 2 seconds
        this.fadeInStartTime = 0;
        this.isFadingIn = true;

        // Check for reduced motion preference
        this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        this.init();
    }

    /**
     * Initialize the component
     */
    init() {
        this.setupStyles();
        this.setupCanvas();
        this.bindEvents();
        this.createGrid();
        this.fadeInStartTime = Date.now();
        this.startAnimation();
    }

    /**
     * Setup component styles
     */
    setupStyles() {
        const style = document.createElement('style');
        style.textContent = `
      :host {
        display: block;
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }
      
      canvas {
        display: block;
        width: 100%;
        height: 100%;
      }
    `;
        this.shadowRoot.appendChild(style);
    }

    /**
     * Setup canvas element
     */
    setupCanvas() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.shadowRoot.appendChild(this.canvas);
        this.resizeCanvas();
    }

    /**
     * Resize canvas to match container dimensions
     */
    resizeCanvas() {
        const rect = this.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';

        this.ctx.scale(dpr, dpr);
        this.createGrid();
    }

    /**
 * Bind event listeners
 */
    bindEvents() {
        this.hasMouseSupport = window.matchMedia('(pointer: fine)').matches;

        if (this.hasMouseSupport) {
            // Bind mouse events to the parent hero section to ensure gravity works
            // even when mouse is over content elements on top of the dot grid
            const heroSection = this.closest('.hero-section');
            if (heroSection) {
                heroSection.addEventListener('mousemove', this.handleMouseMove.bind(this));
                heroSection.addEventListener('mouseenter', this.handleMouseEnter.bind(this));
                heroSection.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
            } else {
                // Fallback to binding to this element if no hero section found
                this.addEventListener('mousemove', this.handleMouseMove.bind(this));
                this.addEventListener('mouseenter', this.handleMouseEnter.bind(this));
                this.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
            }
        } else {
            console.log('Touch device detected - gravity effects disabled, wave and events remain active');
        }

        window.addEventListener('resize', this.handleResize.bind(this));

        // Listen for reduced motion preference changes
        this.reducedMotionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        this.reducedMotionMediaQuery.addEventListener('change', this.handleReducedMotionChange.bind(this));

        this.observer = new IntersectionObserver(
            this.handleIntersection.bind(this),
            { threshold: 0.1 }
        );
        this.observer.observe(this);
    }

    /**
     * Handle mouse movement with optimized trail management
     */
    handleMouseMove(event) {
        const rect = this.getBoundingClientRect();
        const newX = event.clientX - rect.left;
        const newY = event.clientY - rect.top;

        // Check if mouse is within the bounds of the dot grid background
        if (newX >= 0 && newX <= rect.width && newY >= 0 && newY <= rect.height) {
            this.isMouseInBounds = true;

            // Reuse trail object from pool or create new one
            let trail = this.trailPool.pop();
            if (!trail) {
                trail = { x: 0, y: 0, strength: 1.0, age: 0 };
            }

            trail.x = newX;
            trail.y = newY;
            trail.strength = 1.0;
            trail.age = 0;

            this.gravityTrails.push(trail);

            if (this.gravityTrails.length > this.maxTrails) {
                const oldTrail = this.gravityTrails.shift();
                this.trailPool.push(oldTrail);
            }

            this.mouseX = newX;
            this.mouseY = newY;
        } else {
            this.isMouseInBounds = false;
        }
    }

    handleMouseEnter() {
        // Mouse enter is now handled in handleMouseMove for more precise control
    }
    handleMouseLeave() {
        this.isMouseInBounds = false;
        this.gravityTrails = []; // Clear trails when mouse leaves
    }
    handleResize() { this.resizeCanvas(); }

    handleReducedMotionChange(event) {
        this.prefersReducedMotion = event.matches;
        // Recreate grid to reset any animated state
        this.createGrid();
    }

    handleIntersection(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                this.startAnimation();
            } else {
                this.stopAnimation();
            }
        });
    }

    /**
     * Create the dot grid with optimized structure
     */
    createGrid() {
        const rect = this.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;

        this.dots = [];
        this.sortedDots = [];

        const cols = Math.ceil(width / this.dotSpacing) + 2;
        const rows = Math.ceil(height / this.dotSpacing) + 2;

        // Calculate center for fade-in effect
        const startX = width / 2;
        const startY = height / 2;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const x = col * this.dotSpacing;
                const y = row * this.dotSpacing;
                const randomOffset = (Math.random() - 0.5) * 2;

                // Calculate distance from center for staggered fade-in
                const distanceFromStart = Math.sqrt(
                    Math.pow(x - startX, 2) + Math.pow(y - startY, 2)
                );
                const maxDistance = Math.sqrt(Math.pow(width / 2, 2) + Math.pow(height / 2, 2));
                const fadeInDelay = (distanceFromStart / maxDistance) * 0.8; // 0 to 0.8 seconds

                const dot = {
                    x: x + randomOffset,
                    y: y + randomOffset,
                    baseX: x + randomOffset,
                    baseY: y + randomOffset,
                    z: 0,
                    targetX: x + randomOffset,
                    targetY: y + randomOffset,
                    targetZ: 0,
                    eventPulse: 0,
                    eventColor: null,
                    eventDelay: undefined,
                    eventMaxStrength: undefined,
                    fadeInDelay: fadeInDelay,
                    fadeInOpacity: 0
                };

                this.dots.push(dot);
                this.sortedDots.push(dot);
            }
        }
    }

    /**
     * Optimized gravity calculation with pre-calculated values
     */
    calculateGravity() {
        if (!this.hasMouseSupport || !this.isMouseInBounds) return;

        // Update and filter trails in one pass
        let validTrails = 0;
        for (let i = 0; i < this.gravityTrails.length; i++) {
            const trail = this.gravityTrails[i];
            trail.age++;
            trail.strength *= this.trailDecay;

            if (trail.strength > 0.1) {
                this.gravityTrails[validTrails++] = trail;
            } else {
                this.trailPool.push(trail);
            }
        }
        this.gravityTrails.length = validTrails;

        // Pre-calculate mouse position for reuse
        const mouseX = this.mouseX;
        const mouseY = this.mouseY;
        const gravityRadiusSquared = this.gravityRadiusSquared;

        this.dots.forEach(dot => {
            let totalGravityX = 0;
            let totalGravityY = 0;
            let totalGravityZ = 0;

            // Optimized distance calculation using squared distance
            const dx = mouseX - dot.baseX;
            const dy = mouseY - dot.baseY;
            const distanceSquared = dx * dx + dy * dy;

            if (distanceSquared < gravityRadiusSquared) {
                const distance = Math.sqrt(distanceSquared);
                const normalizedDistance = distance / this.gravityRadius;
                const strength = (1 - normalizedDistance) * (1 - normalizedDistance) * this.gravityStrength;
                const moveStrength = strength * 10;

                totalGravityX += (dx / distance) * moveStrength;
                totalGravityY += (dy / distance) * moveStrength;
                totalGravityZ -= strength * 50;
            }

            // Optimized trail gravity calculation
            for (let i = 0; i < this.gravityTrails.length; i++) {
                const trail = this.gravityTrails[i];
                const trailDx = trail.x - dot.baseX;
                const trailDy = trail.y - dot.baseY;
                const trailDistanceSquared = trailDx * trailDx + trailDy * trailDy;

                if (trailDistanceSquared < gravityRadiusSquared) {
                    const trailDistance = Math.sqrt(trailDistanceSquared);
                    const trailNormalizedDistance = trailDistance / this.gravityRadius;
                    const trailStrength = (1 - trailNormalizedDistance) * (1 - trailNormalizedDistance) *
                        this.gravityStrength * trail.strength * 0.3;
                    const trailMoveStrength = trailStrength * 8;

                    totalGravityX += (trailDx / trailDistance) * trailMoveStrength;
                    totalGravityY += (trailDy / trailDistance) * trailMoveStrength;
                    totalGravityZ -= trailStrength * 30;
                }
            }

            if (totalGravityX !== 0 || totalGravityY !== 0 || totalGravityZ !== 0) {
                dot.targetX = dot.baseX + totalGravityX;
                dot.targetY = dot.baseY + totalGravityY;
                dot.targetZ = totalGravityZ;
            }
        });
    }

    /**
     * Optimized wave calculation
     */
    calculateWave() {
        this.waveTime += this.waveSpeed * 0.016;

        if (this.waveEnabled) {
            const waveOffset = this.waveAmplitude * 0.7;
            const waveZ = this.waveAmplitude * 0.3;
            const waveFreq = this.waveFrequency;
            const waveTime = this.waveTime;

            this.dots.forEach(dot => {
                const diagonalPos = dot.baseX + dot.baseY;
                const wave = Math.sin(diagonalPos * waveFreq + waveTime);

                dot.targetX = dot.baseX + wave * waveOffset;
                dot.targetY = dot.baseY + wave * waveOffset;
                dot.targetZ = Math.sin(diagonalPos * waveFreq * 0.5 + waveTime) * waveZ;
            });
        } else {
            this.dots.forEach(dot => {
                dot.targetX = dot.baseX;
                dot.targetY = dot.baseY;
                dot.targetZ = 0;
            });
        }
    }

    /**
     * Optimized event generation
     */
    generateEvents() {
        if (!this.eventsEnabled) return;

        const currentTime = Date.now();
        const timeSinceLastEvent = currentTime - this.lastEventTime;
        const baseInterval = 1000 / this.eventFrequency;
        const randomMultiplier = 0.5 + Math.random();
        const eventInterval = baseInterval * randomMultiplier;

        if (timeSinceLastEvent > eventInterval) {
            const randomDotIndex = Math.floor(Math.random() * this.dots.length);
            const randomDot = this.dots[randomDotIndex];

            this.events.push({
                x: randomDot.baseX,
                y: randomDot.baseY,
                startTime: currentTime,
                duration: this.eventDuration,
                radius: this.eventRadius,
                radiusSquared: this.eventRadius * this.eventRadius,
                color: this.eventColor,
                sourceDotIndex: randomDotIndex
            });

            this.lastEventTime = currentTime;
            this.affectDotsWithEvent(this.events[this.events.length - 1]);
        }
    }

    /**
     * Optimized event effect application
     */
    affectDotsWithEvent(event) {
        const eventRadiusSquared = event.radiusSquared;
        const maxDelay = 300;

        this.dots.forEach((dot, index) => {
            const dx = event.x - dot.baseX;
            const dy = event.y - dot.baseY;
            const distanceSquared = dx * dx + dy * dy;

            if (distanceSquared < eventRadiusSquared) {
                const distance = Math.sqrt(distanceSquared);
                const normalizedDistance = distance / event.radius;
                let effectStrength = (1 - normalizedDistance) * (1 - normalizedDistance) * (1 - normalizedDistance);

                const delayFactor = normalizedDistance;
                const dotDelay = delayFactor * maxDelay;

                if (index === event.sourceDotIndex) {
                    effectStrength = 1.0;
                    dot.eventPulse = effectStrength;
                    dot.eventColor = event.color;
                    dot.eventDelay = 0;
                } else {
                    dot.eventPulse = 0;
                    dot.eventColor = event.color;
                    dot.eventDelay = dotDelay;
                    dot.eventMaxStrength = effectStrength;
                }

                const angle = Math.atan2(dy, dx);
                const outwardStrength = effectStrength * this.shockwaveStrength;
                dot.targetX = dot.baseX + Math.cos(angle) * outwardStrength;
                dot.targetY = dot.baseY + Math.sin(angle) * outwardStrength;
                dot.targetZ = effectStrength * this.bounceStrength * this.bounceHeight;
            }
        });
    }

    /**
     * Optimized event updates
     */
    updateEvents() {
        const currentTime = Date.now();
        let validEvents = 0;

        for (let i = 0; i < this.events.length; i++) {
            const event = this.events[i];
            const eventAge = currentTime - event.startTime;
            const progress = eventAge / event.duration;

            if (progress >= 1) {
                this.resetDotsFromEvent(event);
            } else {
                this.updateEventEffects(event, progress);
                this.events[validEvents++] = event;
            }
        }
        this.events.length = validEvents;
    }

    /**
     * Optimized event effect updates
     */
    updateEventEffects(event, progress) {
        const ripple = Math.sin(progress * Math.PI * this.rippleCount) * Math.pow(1 - progress, this.rippleDecay);
        const eventRadiusSquared = event.radiusSquared;
        const currentTime = Date.now();

        this.dots.forEach((dot, index) => {
            const dx = event.x - dot.baseX;
            const dy = event.y - dot.baseY;
            const distanceSquared = dx * dx + dy * dy;

            if (distanceSquared < eventRadiusSquared) {
                const distance = Math.sqrt(distanceSquared);
                const normalizedDistance = distance / event.radius;
                let effectStrength = (1 - normalizedDistance) * (1 - normalizedDistance) * (1 - normalizedDistance) * (1 - progress);

                if (index !== event.sourceDotIndex && dot.eventDelay !== undefined) {
                    const eventAge = currentTime - event.startTime;
                    const delayProgress = Math.max(0, Math.min(1, (eventAge - dot.eventDelay) / 200));

                    if (delayProgress > 0) {
                        effectStrength = dot.eventMaxStrength * delayProgress * (1 - progress);
                        dot.eventPulse = effectStrength * ripple;
                    } else {
                        dot.eventPulse = 0;
                        effectStrength = 0;
                    }
                } else if (index === event.sourceDotIndex) {
                    effectStrength = 1 - progress;
                    dot.eventPulse = effectStrength * ripple;
                }

                const bounceHeight = effectStrength * ripple * this.rippleBounceStrength;
                dot.targetZ = bounceHeight * this.bounceHeight;

                const angle = Math.atan2(dy, dx);
                const rippleOutward = effectStrength * ripple * this.rippleOutwardStrength;
                dot.targetX = dot.baseX + Math.cos(angle) * rippleOutward;
                dot.targetY = dot.baseY + Math.sin(angle) * rippleOutward;
            }
        });
    }

    /**
     * Optimized event reset
     */
    resetDotsFromEvent(event) {
        const eventRadiusSquared = event.radiusSquared;

        this.dots.forEach(dot => {
            const dx = event.x - dot.baseX;
            const dy = event.y - dot.baseY;
            const distanceSquared = dx * dx + dy * dy;

            if (distanceSquared < eventRadiusSquared) {
                dot.eventPulse *= 0.9;
                if (dot.eventPulse < 0.1) {
                    dot.eventPulse = 0;
                    dot.eventColor = null;
                    dot.eventDelay = undefined;
                    dot.eventMaxStrength = undefined;
                }
            }
        });
    }

    /**
     * Optimized dot position updates
     */
    updateDots() {
        const speed = this.animationSpeed;
        const speedInv = this.animationSpeedInv;

        this.dots.forEach(dot => {
            dot.x = dot.x * speedInv + dot.targetX * speed;
            dot.y = dot.y * speedInv + dot.targetY * speed;
            dot.z = dot.z * speedInv + dot.targetZ * speed;
        });
    }

    /**
     * Optimized rendering with pre-sorting
     */
    render() {
        const rect = this.getBoundingClientRect();

        // Clear canvas
        this.ctx.fillStyle = this.backgroundColor;
        this.ctx.fillRect(0, 0, rect.width, rect.height);

        // Skip animations if user prefers reduced motion
        if (this.prefersReducedMotion) {
            // Just render static dots without any animations
            this.renderStaticDots();
            return;
        }

        // Update fade-in animation
        if (this.isFadingIn) {
            const currentTime = Date.now();
            const elapsed = currentTime - this.fadeInStartTime;
            this.fadeInProgress = Math.min(1, elapsed / this.fadeInDuration);

            if (this.fadeInProgress >= 1) {
                this.isFadingIn = false;
            }
        }

        // Update systems
        this.generateEvents();
        this.updateEvents();
        this.calculateWave();
        this.calculateGravity();
        this.updateDots();

        // Sort dots by Z using pre-allocated array
        this.sortedDots.length = this.dots.length;
        for (let i = 0; i < this.dots.length; i++) {
            this.sortedDots[i] = this.dots[i];
        }
        this.sortedDots.sort((a, b) => a.z - b.z);

        // Render dots with optimized calculations
        this.sortedDots.forEach(dot => {
            // Calculate fade-in opacity
            let fadeInOpacity = 1;
            if (this.isFadingIn) {
                const dotFadeInTime = this.fadeInProgress - dot.fadeInDelay;
                fadeInOpacity = Math.max(0, Math.min(1, dotFadeInTime * 2)); // 0.5 second fade per dot
            }

            const sizeMultiplier = 1 + (dot.z / 100);
            const eventSizeBonus = dot.eventPulse * this.eventSizeMultiplier;
            const size = Math.max(0.1, this.dotSize * sizeMultiplier + eventSizeBonus);

            if (size <= 0 || !isFinite(size)) return;

            const baseOpacity = Math.max(0.3, 1 + (dot.z / 100));
            const opacity = dot.z > 0 ? Math.min(1.0, baseOpacity + dot.z / 50) : baseOpacity;

            if (dot.eventColor && dot.eventPulse > 0) {
                this.ctx.fillStyle = dot.eventColor;
                this.ctx.globalAlpha = (opacity + dot.eventPulse * this.eventBrightness) * fadeInOpacity;
            } else {
                this.ctx.fillStyle = this.dotColor;
                this.ctx.globalAlpha = opacity * fadeInOpacity;
            }

            this.ctx.beginPath();
            this.ctx.arc(dot.x, dot.y, size, 0, Math.PI * 2);
            this.ctx.fill();
        });

        this.ctx.globalAlpha = 1;
    }

    /**
     * Render static dots without animations (for reduced motion preference)
     */
    renderStaticDots() {
        // Create static grid if not already created
        if (this.dots.length === 0) {
            this.createGrid();
        }

        // Render dots in their original positions without any animations
        this.dots.forEach(dot => {
            const size = this.dotSize;

            if (size <= 0 || !isFinite(size)) return;

            this.ctx.fillStyle = this.dotColor;
            this.ctx.globalAlpha = 0.8; // Static opacity

            this.ctx.beginPath();
            this.ctx.arc(dot.x, dot.y, size, 0, Math.PI * 2);
            this.ctx.fill();
        });

        this.ctx.globalAlpha = 1;
    }

    /**
     * Animation loop
     */
    animate() {
        this.render();
        this.animationId = requestAnimationFrame(this.animate.bind(this));
    }

    startAnimation() {
        if (!this.animationId) {
            this.animate();
        }
    }

    stopAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    /**
     * Set component properties with pre-calculation updates
     */
    setProperties(properties) {
        Object.assign(this, properties);

        // Update pre-calculated values
        this.gravityRadiusSquared = this.gravityRadius * this.gravityRadius;
        this.eventRadiusSquared = this.eventRadius * this.eventRadius;
        this.animationSpeedInv = 1 - this.animationSpeed;
        this.maxTrails = this.trailLength || 5;

        // Update reduced motion preference
        this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        this.createGrid();
    }

    /**
     * Cleanup on disconnect
     */
    disconnectedCallback() {
        this.stopAnimation();
        this.observer?.disconnect();
        this.reducedMotionMediaQuery?.removeEventListener('change', this.handleReducedMotionChange);
        window.removeEventListener('resize', this.handleResize);
    }
}

// Register the web component
customElements.define('dot-grid-background', DotGridBackground);

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DotGridBackground;
} 