/**
 * Pyramid Builder Web Component
 * Creates an animated pyramid of dots that builds itself from bottom to top
 */
class PyramidBuilder extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        // Configuration variables with defaults
        this.dotSize = 1.5;
        this.dotColor = '#000000';
        this.backgroundColor = 'transparent';
        this.pyramidHeight = 300;
        this.pyramidWidth = 400;
        this.dotSpacing = 20;
        this.buildInterval = 1000; // milliseconds between dots
        this.dropDistance = 100; // pixels to drop from
        this.dropDuration = 800; // milliseconds for drop animation
        this.mouseInfluenceRadius = 80; // pixels radius for mouse influence
        this.mouseInfluenceStrength = 0.05; // strength of mouse pull effect (much weaker)

        // Canvas and animation properties
        this.canvas = null;
        this.ctx = null;
        this.animationId = null;
        this.buildTimer = null;
        this.isBuilding = false;
        this.isComplete = false;

        // Mouse interaction properties
        this.mouseX = 0;
        this.mouseY = 0;
        this.isMouseOver = false;

        // Pyramid structure
        this.pyramidLayers = [];
        this.totalDots = 0;
        this.builtDots = 0;
        this.nextDotIndex = 0;

        // Fade-in animation
        this.fadeInProgress = 0;
        this.fadeInStartTime = 0;
        this.isFadingIn = true;

        this.init();
    }

    /**
     * Initialize the component
     */
    init() {
        this.setupStyles();
        this.setupCanvas();
        this.bindEvents();
        this.createPyramidStructure();
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
        this.createPyramidStructure();
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        window.addEventListener('resize', this.handleResize.bind(this));

        this.observer = new IntersectionObserver(
            this.handleIntersection.bind(this),
            { threshold: 0.1 }
        );
        this.observer.observe(this);

        // Mouse interaction events
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseenter', this.handleMouseEnter.bind(this));
        this.canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
    }

    /**
     * Handle resize events
     */
    handleResize() {
        this.resizeCanvas();
    }

    /**
     * Handle intersection observer
     */
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
     * Handle mouse movement
     */
    handleMouseMove(event) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouseX = event.clientX - rect.left;
        this.mouseY = event.clientY - rect.top;
    }

    /**
     * Handle mouse enter
     */
    handleMouseEnter() {
        this.isMouseOver = true;
    }

    /**
     * Handle mouse leave
     */
    handleMouseLeave() {
        this.isMouseOver = false;
    }

    /**
     * Create the pyramid structure with hexagonal grid
     */
    createPyramidStructure() {
        const rect = this.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        // Calculate pyramid dimensions
        const maxWidth = Math.min(this.pyramidWidth, rect.width * 0.8);
        const maxHeight = Math.min(this.pyramidHeight, rect.height * 0.8);

        // For hexagonal pattern, use sqrt(3)/2 spacing vertically
        const verticalSpacing = this.dotSpacing * Math.sqrt(3) / 2;
        const maxRowsByHeight = Math.floor(maxHeight / verticalSpacing);
        const maxDotsInBottomRow = Math.floor(maxWidth / this.dotSpacing);
        const numLayers = Math.min(maxRowsByHeight, maxDotsInBottomRow); // always fits

        this.pyramidLayers = [];
        this.totalDots = 0;

        /*  Axial coords (q, r)
            Build rows r = 0 … numLayers-1
            For each r, q runs 0 … numLayers-1-r
        */
        for (let r = 0; r < numLayers; r++) {
            const layerDots = [];
            for (let q = 0; q < numLayers - r; q++) {
                // axial → pixel (pointy-topped)
                const x = centerX + this.dotSpacing * (q + r / 2)
                    - this.dotSpacing * (numLayers - 1) / 2;   // centre whole pyramid
                const y = centerY + maxHeight / 2 - verticalSpacing * r;

                layerDots.push({
                    x, y,
                    targetX: x,
                    targetY: y,
                    opacity: 0,
                    targetOpacity: 0,
                    isBuilt: false,
                    dropStartTime: 0,
                    isDropping: false,
                    layerIndex: r,
                    dotIndex: q,
                    globalIndex: this.totalDots + q
                });
            }
            this.pyramidLayers.push(layerDots);
            this.totalDots += layerDots.length;
        }

        // Reset building state - start with 90% pre-built
        const preBuiltPercentage = 0.9;
        this.nextDotIndex = Math.floor(this.totalDots * preBuiltPercentage);
        this.builtDots = this.nextDotIndex;
        this.isBuilding = false;
        this.isComplete = false;

        // Pre-build the bottom 90% of dots
        this.pyramidLayers.forEach((layer, layerIndex) => {
            layer.forEach((dot, dotIndex) => {
                if (dot.globalIndex < this.nextDotIndex) {
                    dot.isBuilt = true;
                    dot.opacity = 1;
                    dot.y = dot.targetY;
                } else {
                    dot.isBuilt = false;
                    dot.opacity = 0;
                    dot.y = dot.targetY - this.dropDistance;
                }
            });
        });
    }

    /**
     * Start the building animation
     */
    startBuilding() {
        if (!this.isBuilding && !this.isComplete) {
            this.isBuilding = true;
            this.addNextDot();
        }
    }

    /**
     * Add the next dot to the pyramid
     */
    addNextDot() {
        if (this.nextDotIndex >= this.totalDots) {
            this.isComplete = true;
            this.isBuilding = false;
            return;
        }

        // Find the next dot to add
        let dotFound = false;
        for (let layerIndex = 0; layerIndex < this.pyramidLayers.length && !dotFound; layerIndex++) {
            const layer = this.pyramidLayers[layerIndex];
            for (let dotIndex = 0; dotIndex < layer.length && !dotFound; dotIndex++) {
                const dot = layer[dotIndex];
                if (dot.globalIndex === this.nextDotIndex) {
                    // Start drop animation for this dot
                    dot.isDropping = true;
                    dot.dropStartTime = Date.now();
                    dot.y = dot.targetY - this.dropDistance; // Start from above
                    dot.opacity = 0;
                    dot.targetOpacity = 1;
                    dotFound = true;
                }
            }
        }

        this.nextDotIndex++;
        this.builtDots++;

        // Schedule next dot
        if (this.isBuilding) {
            this.buildTimer = setTimeout(() => {
                this.addNextDot();
            }, this.buildInterval);
        }
    }

    /**
 * Update dot animations
 */
    updateDotAnimations() {
        this.pyramidLayers.forEach(layer => {
            layer.forEach(dot => {
                if (dot.isDropping) {
                    const currentTime = Date.now();
                    const elapsed = currentTime - dot.dropStartTime;
                    const progress = Math.min(1, elapsed / this.dropDuration);

                    // Smooth easing function
                    const easeOut = 1 - Math.pow(1 - progress, 3);

                    // Update position
                    dot.y = dot.targetY - (this.dropDistance * (1 - easeOut));

                    // Update opacity
                    dot.opacity = easeOut;

                    // Check if drop is complete
                    if (progress >= 1) {
                        dot.isDropping = false;
                        dot.isBuilt = true;
                        dot.y = dot.targetY;
                        dot.opacity = 1;
                    }
                }

                // Apply mouse influence to built dots
                if (dot.isBuilt && this.isMouseOver) {
                    const distance = Math.sqrt(
                        Math.pow(dot.targetX - this.mouseX, 2) +
                        Math.pow(dot.targetY - this.mouseY, 2)
                    );

                    if (distance < this.mouseInfluenceRadius) {
                        const influence = 1 - (distance / this.mouseInfluenceRadius);
                        const pullStrength = influence * this.mouseInfluenceStrength;

                        // Calculate direction from dot to mouse
                        const dx = this.mouseX - dot.targetX;
                        const dy = this.mouseY - dot.targetY;
                        const length = Math.sqrt(dx * dx + dy * dy);

                        if (length > 0) {
                            // Apply pull effect
                            dot.x = dot.targetX + (dx / length) * pullStrength * this.mouseInfluenceRadius;
                            dot.y = dot.targetY + (dy / length) * pullStrength * this.mouseInfluenceRadius;
                        }
                    } else {
                        // Return to original position
                        dot.x += (dot.targetX - dot.x) * 0.1;
                        dot.y += (dot.targetY - dot.y) * 0.1;
                    }
                } else if (dot.isBuilt) {
                    // Return to original position when mouse is not over
                    dot.x += (dot.targetX - dot.x) * 0.1;
                    dot.y += (dot.targetY - dot.y) * 0.1;
                }
            });
        });
    }

    /**
     * Optimized rendering
     */
    render() {
        const rect = this.getBoundingClientRect();

        // Clear canvas
        this.ctx.fillStyle = this.backgroundColor;
        this.ctx.fillRect(0, 0, rect.width, rect.height);

        // Update fade-in animation
        if (this.isFadingIn) {
            const currentTime = Date.now();
            const elapsed = currentTime - this.fadeInStartTime;
            this.fadeInProgress = Math.min(1, elapsed / 1000);

            if (this.fadeInProgress >= 1) {
                this.isFadingIn = false;
                this.startBuilding();
            }
        }

        // Update dot animations
        this.updateDotAnimations();

        // Render dots
        this.pyramidLayers.forEach(layer => {
            layer.forEach(dot => {
                if (dot.opacity <= 0.01) return;

                const size = this.dotSize;
                if (size <= 0 || !isFinite(size)) return;

                // Apply fade-in effect
                const finalOpacity = dot.opacity * this.fadeInProgress;

                // Draw dot
                this.ctx.fillStyle = this.dotColor;
                this.ctx.globalAlpha = finalOpacity;
                this.ctx.beginPath();
                this.ctx.arc(dot.x, dot.y, size, 0, Math.PI * 2);
                this.ctx.fill();
            });
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

    /**
     * Start animation
     */
    startAnimation() {
        if (!this.animationId) {
            this.animate();
        }
    }

    /**
     * Stop animation
     */
    stopAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this.buildTimer) {
            clearTimeout(this.buildTimer);
            this.buildTimer = null;
        }
    }

    /**
     * Reset the pyramid to start building again
     */
    reset() {
        this.stopAnimation();
        this.isBuilding = false;
        this.isComplete = false;
        this.isFadingIn = true;
        this.fadeInStartTime = Date.now();

        // Recreate pyramid structure (this will reset to 90% pre-built)
        this.createPyramidStructure();

        this.startAnimation();
    }

    /**
     * Set component properties
     */
    setProperties(properties) {
        Object.assign(this, properties);
        this.createPyramidStructure();
    }

    /**
     * Get build progress as percentage
     */
    getBuildProgress() {
        return Math.round((this.builtDots / this.totalDots) * 100);
    }

    /**
     * Get completion status
     */
    isCompleted() {
        return this.isComplete;
    }

    /**
     * Get total dots count
     */
    getTotalDots() {
        return this.totalDots;
    }

    /**
     * Get built dots count
     */
    getBuiltDots() {
        return this.builtDots;
    }

    /**
     * Cleanup on disconnect
     */
    disconnectedCallback() {
        this.stopAnimation();
        this.observer?.disconnect();
        window.removeEventListener('resize', this.handleResize);
    }
}

// Register the web component
customElements.define('pyramid-builder', PyramidBuilder);

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PyramidBuilder;
} 