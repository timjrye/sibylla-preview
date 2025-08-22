/**
 * Data Mesh Visualization Web Component
 * A slowly rotating mesh of points and lines representing changing data connections.
 *
 * Inspired by `dot-grid-background.js` structure and lifecycle.
 */
class DataMeshGraph extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        // Visual configuration (designed for white backgrounds)
        this.backgroundColor = '#ffffff';
        this.nodeColor = '#000000';
        this.linkColor = '#000000';
        this.nodeSize = 1.8;
        this.linkWidth = 1.0;

        // Geometry
        this.nodeCount = 120; // reasonable default
        this.connectionsPerNode = 3; // k-nearest neighbors
        this.depth = 800; // perspective depth to keep object at a distance

        // Animation
        this.rotationSpeedX = 0.0025;
        this.rotationSpeedY = 0.0015;
        this.autoRewire = false; // drift-based morphology supersedes rewiring
        this.rewireIntervalMs = 2000;
        this.rewireAmount = 0.03;

        // Neighbor graph constraints (avoid long chords through center)
        this.maxNeighborAngle = 1.1; // radians (~63°)
        this.edgeUpdateIntervalMs = 800;

        // State
        this.canvas = null;
        this.ctx = null;
        this.animationId = null;
        this.nodes = [];
        this.edges = [];
        this.angleX = 0;
        this.angleY = 0;
        this.angularVelX = 0;
        this.angularVelY = 0;
        this.lastRewireTime = 0;
        this.lastEdgeUpdateTime = 0;
        this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // Pointer/mouse support and interaction state
        this.hasMouseSupport = window.matchMedia('(pointer: fine)').matches;
        this.isDragging = false;
        this.lastPointerX = 0;
        this.lastPointerY = 0;
        this.mouseX = 0;
        this.mouseY = 0;
        this.userNodeActive = false;
        this.userNodeEdges = [];

        // Per-node drift on the sphere to morph shape over time
        this.driftSpeedBase = 0.14; // radians/sec base (more pronounced morphing)
        this.lastUpdateTime = Date.now();
        this.lastHullLength = 0;

        this.init();
    }

    // Initialize component
    init() {
        this.setupStyles();
        this.setupCanvas();
        this.bindEvents();
        this.generateGraph();
        this.startAnimation();
    }

    // Shadow DOM styles
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

    // Create canvas
    setupCanvas() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.shadowRoot.appendChild(this.canvas);
        this.resizeCanvas();
    }

    resizeCanvas() {
        const rect = this.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';

        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);

        // Regenerate to fit new bounds
        this.generateGraph();
    }

    // Bind listeners
    bindEvents() {
        this.handleResize = this.resizeCanvas.bind(this);
        window.addEventListener('resize', this.handleResize);

        // Reduced motion preference
        this.reducedMotionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        this.handleReducedMotionChange = (e) => {
            this.prefersReducedMotion = e.matches;
        };
        this.reducedMotionMediaQuery.addEventListener('change', this.handleReducedMotionChange);

        // Pause when not visible
        this.observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        this.startAnimation();
                    } else {
                        this.stopAnimation();
                    }
                });
            },
            { threshold: 0.1 }
        );
        this.observer.observe(this);

        // Pointer interactions (spin + hover node)
        this.onPointerDown = (e) => {
            this.isDragging = true;
            this.lastPointerX = e.clientX;
            this.lastPointerY = e.clientY;
            if (this.setPointerCapture && e.pointerId != null) {
                try { this.setPointerCapture(e.pointerId); } catch (_) { }
            }
        };
        this.onPointerMove = (e) => {
            const rect = this.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;

            if (this.isDragging) {
                const dx = e.clientX - this.lastPointerX;
                const dy = e.clientY - this.lastPointerY;
                this.lastPointerX = e.clientX;
                this.lastPointerY = e.clientY;
                // Update angular velocity (front-surface feel)
                this.angularVelY += -dx * 0.0009; // invert for intuitive yaw
                this.angularVelX += -dy * 0.0009; // invert for intuitive pitch
            }

            if (this.hasMouseSupport) {
                this.userNodeActive = (this.mouseX >= 0 && this.mouseX <= rect.width && this.mouseY >= 0 && this.mouseY <= rect.height);
            } else {
                this.userNodeActive = false;
            }
        };
        this.onPointerUp = (e) => {
            this.isDragging = false;
            if (this.releasePointerCapture && e.pointerId != null) {
                try { this.releasePointerCapture(e.pointerId); } catch (_) { }
            }
        };
        this.onPointerLeave = () => {
            this.isDragging = false;
            this.userNodeActive = false;
        };

        this.addEventListener('pointerdown', this.onPointerDown);
        this.addEventListener('pointermove', this.onPointerMove);
        this.addEventListener('pointerup', this.onPointerUp);
        this.addEventListener('pointerleave', this.onPointerLeave);
    }

    // Generate nodes on a sphere and initialize per-node drift
    generateGraph() {
        this.nodes = [];
        this.edges = [];

        const rect = this.getBoundingClientRect();
        const radius = Math.min(rect.width, rect.height) * 0.4; // ensure entire object is visible
        this.graphRadius = radius;
        this.centerX = rect.width / 2;
        this.centerY = rect.height / 2;

        // Fibonacci sphere for even distribution, store spherical angles and drift
        const N = Math.max(8, Math.floor(this.nodeCount));
        const goldenAngle = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < N; i++) {
            const t = (i + 0.5) / N;
            const cosPhi = 1 - 2 * t; // from 1 to -1
            const phi = Math.acos(cosPhi); // [0, PI]
            const theta = i * goldenAngle; // [0, inf)

            // small random drift per node
            const driftTheta = (Math.random() - 0.5) * 0.006;
            const driftPhi = (Math.random() - 0.5) * 0.004;

            // cartesian position now; also store angles
            const sinPhi = Math.sin(phi);
            const x = Math.cos(theta) * sinPhi * radius;
            const y = cosPhi * radius;
            const z = Math.sin(theta) * sinPhi * radius;

            this.nodes.push({
                x, y, z,
                phi, theta,
                driftTheta, driftPhi,
                radius
            });
        }
    }

    // Randomly rewire a fraction of edges to create subtle changes over time
    rewireEdges() {
        if (!this.autoRewire) return;
        const now = Date.now();
        if (now - this.lastRewireTime < this.rewireIntervalMs) return;
        this.lastRewireTime = now;

        const numToRewire = Math.max(1, Math.floor(this.edges.length * this.rewireAmount));
        for (let r = 0; r < numToRewire; r++) {
            const idx = Math.floor(Math.random() * this.edges.length);
            const a = Math.floor(Math.random() * this.nodes.length);
            let b = Math.floor(Math.random() * this.nodes.length);
            if (b === a) b = (b + 1) % this.nodes.length;
            this.edges[idx] = { a, b };
        }
    }

    // Project a 3D point with perspective
    project(point, ax, ay) {
        // rotate around X then Y
        const cosX = Math.cos(ax), sinX = Math.sin(ax);
        const cosY = Math.cos(ay), sinY = Math.sin(ay);

        let y = point.y * cosX - point.z * sinX;
        let z = point.y * sinX + point.z * cosX;
        let x = point.x * cosY + z * sinY;
        z = -point.x * sinY + z * cosY;

        // perspective
        const f = this.depth / (this.depth + z);
        return {
            x: this.centerX + x * f,
            y: this.centerY + y * f,
            scale: f,
            z
        };
    }

    // Inverse rotation (camera-space to object-space)
    inverseRotate(x, y, z, ax, ay) {
        const cosY = Math.cos(-ay), sinY = Math.sin(-ay);
        let xi = x * cosY + z * sinY;
        let zi = -x * sinY + z * cosY;
        const cosX = Math.cos(-ax), sinX = Math.sin(-ax);
        const yi = y * cosX - zi * sinX;
        const zi2 = y * sinX + zi * cosX;
        return { x: xi, y: yi, z: zi2 };
    }

    // Map mouse position to object-space point on the sphere surface (near side)
    mouseToSphereObjectSpace() {
        const dx = (this.mouseX - this.centerX) / this.graphRadius;
        const dy = (this.mouseY - this.centerY) / this.graphRadius;
        if (!isFinite(dx) || !isFinite(dy)) return null;
        let ux = dx, uy = dy;
        const r2 = ux * ux + uy * uy;
        if (r2 > 1) {
            const invR = 1 / Math.sqrt(r2);
            ux *= invR; uy *= invR;
        }
        // Near hemisphere in camera space corresponds to negative Z in this projection
        const uz = -Math.sqrt(Math.max(0, 1 - (ux * ux + uy * uy)));
        // Convert to object space via inverse rotation using current angles
        const v = this.inverseRotate(ux, uy, uz, this.angleX, this.angleY);
        return { x: v.x * this.graphRadius, y: v.y * this.graphRadius, z: v.z * this.graphRadius };
    }

    // Render loop
    render() {
        const rect = this.getBoundingClientRect();
        const ctx = this.ctx;

        // clear
        ctx.clearRect(0, 0, rect.width, rect.height);

        // white background only
        ctx.fillStyle = this.backgroundColor;
        ctx.fillRect(0, 0, rect.width, rect.height);

        // Advance rotation + inertia unless reduced motion is set
        if (!this.prefersReducedMotion) {
            // base auto-rotation applied directly to angles
            this.angleX += this.rotationSpeedX;
            this.angleY += this.rotationSpeedY;
        }

        // Integrate angular velocities from user drag and apply damping
        this.angleX += this.angularVelX;
        this.angleY += this.angularVelY;
        // Damping to create inertia decay
        this.angularVelX *= 0.96;
        this.angularVelY *= 0.96;

        // Update per-node drift on the sphere
        const now = Date.now();
        const dt = Math.min(0.05, (now - this.lastUpdateTime) / 1000); // clamp for tab switches
        this.lastUpdateTime = now;
        if (!this.prefersReducedMotion) {
            for (let i = 0; i < this.nodes.length; i++) {
                const n = this.nodes[i];
                n.theta += n.driftTheta * this.driftSpeedBase * (1 + i % 3);
                n.phi += n.driftPhi * this.driftSpeedBase * (1 + (i % 5) * 0.1);
                // keep phi within [0, PI] using reflection
                if (n.phi < 0) { n.phi = -n.phi; n.driftPhi *= -1; }
                if (n.phi > Math.PI) { n.phi = Math.PI - (n.phi - Math.PI); n.driftPhi *= -1; }
                const sinPhi = Math.sin(n.phi);
                n.x = Math.cos(n.theta) * sinPhi * n.radius;
                n.y = Math.cos(n.phi) * n.radius;
                n.z = Math.sin(n.theta) * sinPhi * n.radius;
            }
        }

        // Project all nodes once
        const projected = new Array(this.nodes.length);
        for (let i = 0; i < this.nodes.length; i++) {
            projected[i] = this.project(this.nodes[i], this.angleX, this.angleY);
        }

        // Update neighbor edges based on current spherical positions
        this.computeEdgesIfDue();

        // Prepare dynamic user node from mouse (only for precise pointers)
        let projectedUser = null;
        const userEdges = [];
        if (this.userNodeActive && this.hasMouseSupport) {
            const user = this.mouseToSphereObjectSpace();
            if (user) {
                projectedUser = this.project(user, this.angleX, this.angleY);
                const k = Math.max(1, Math.floor(this.connectionsPerNode));
                const maxAngle = this.maxNeighborAngle;
                const invR = 1 / this.graphRadius;
                const ux = user.x * invR, uy = user.y * invR, uz = user.z * invR;
                const candidates = [];
                for (let i = 0; i < this.nodes.length; i++) {
                    const n = this.nodes[i];
                    const nr = 1 / n.radius;
                    const nx = n.x * nr, ny = n.y * nr, nz = n.z * nr;
                    const dot = ux * nx + uy * ny + uz * nz;
                    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
                    if (angle <= maxAngle) candidates.push({ i, angle });
                }
                candidates.sort((a, b) => a.angle - b.angle);
                const limit = Math.min(k, candidates.length);
                for (let n = 0; n < limit; n++) userEdges.push({ b: candidates[n].i, user });
            }
        }

        // Draw neighbor links for all nodes (sorted by depth for simple painter's order)
        const ctxLineWidth = Math.max(0.5, this.linkWidth);
        ctx.lineWidth = ctxLineWidth;
        ctx.strokeStyle = this.linkColor;
        this.edges
            .map((e) => ({ e, z: (projected[e.a].z + projected[e.b].z) * 0.5 }))
            .sort((a, b) => a.z - b.z)
            .forEach(({ e }) => {
                const pa = projected[e.a];
                const pb = projected[e.b];
                const alpha = Math.max(0.15, 0.6 * (pa.scale + pb.scale) * 0.5);
                ctx.globalAlpha = Math.min(0.9, alpha);
                ctx.beginPath();
                ctx.moveTo(pa.x, pa.y);
                ctx.lineTo(pb.x, pb.y);
                ctx.stroke();
            });

        // Draw user edges on top
        if (projectedUser) {
            for (let i = 0; i < userEdges.length; i++) {
                const pb = projected[userEdges[i].b];
                const pa = projectedUser;
                const alpha = Math.max(0.25, 0.6 * (pa.scale + pb.scale) * 0.5);
                ctx.globalAlpha = Math.min(0.95, alpha);
                ctx.beginPath();
                ctx.moveTo(pa.x, pa.y);
                ctx.lineTo(pb.x, pb.y);
                ctx.stroke();
            }
        }

        // Draw nodes last
        for (let i = 0; i < projected.length; i++) {
            const p = projected[i];
            const size = Math.max(0.5, this.nodeSize * p.scale);
            ctx.globalAlpha = Math.min(1, 0.7 + 0.4 * p.scale);
            ctx.fillStyle = this.nodeColor;
            ctx.beginPath();
            ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1;

        // Draw user node last
        if (projectedUser) {
            const p = projectedUser;
            const size = Math.max(0.6, this.nodeSize * 1.2 * p.scale);
            ctx.fillStyle = this.nodeColor;
            ctx.beginPath();
            ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Update edges using 3D nearest neighbors filtered by maximum angular separation
    computeEdgesIfDue() {
        const now = Date.now();
        if (now - this.lastEdgeUpdateTime < this.edgeUpdateIntervalMs && this.edges.length) return;
        this.lastEdgeUpdateTime = now;

        const N = this.nodes.length;
        const k = Math.max(1, Math.floor(this.connectionsPerNode));
        const maxAngle = this.maxNeighborAngle; // radians
        const edgeSet = new Set();
        const edges = [];

        // Precompute normalized vectors
        const vx = new Array(N), vy = new Array(N), vz = new Array(N);
        for (let i = 0; i < N; i++) {
            const n = this.nodes[i];
            const invR = 1 / n.radius;
            vx[i] = n.x * invR; vy[i] = n.y * invR; vz[i] = n.z * invR;
        }

        for (let i = 0; i < N; i++) {
            const candidates = [];
            for (let j = 0; j < N; j++) {
                if (i === j) continue;
                const dot = vx[i] * vx[j] + vy[i] * vy[j] + vz[i] * vz[j];
                const clamped = Math.max(-1, Math.min(1, dot));
                const angle = Math.acos(clamped); // 0..PI
                if (angle <= maxAngle) {
                    candidates.push({ j, angle });
                }
            }
            candidates.sort((a, b) => a.angle - b.angle);
            const limit = Math.min(k, candidates.length);
            for (let n = 0; n < limit; n++) {
                const j = candidates[n].j;
                const a = i < j ? i : j;
                const b = i < j ? j : i;
                const key = a + '-' + b;
                if (!edgeSet.has(key)) {
                    edgeSet.add(key);
                    edges.push({ a, b });
                }
            }
        }
        this.edges = edges;
    }

    // Animation
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

    // Public API to update properties
    setProperties(properties) {
        Object.assign(this, properties);
        // Recreate geometry if structural params changed
        this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.generateGraph();
    }

    // Public helpers for demos/UI
    getNodeCount() {
        return this.nodes ? this.nodes.length : 0;
    }

    getEdgeCount() {
        return this.edges ? this.edges.length : 0;
    }

    reset() {
        this.angleX = 0;
        this.angleY = 0;
        this.lastRewireTime = 0;
        this.generateGraph();
    }

    // Cleanup
    disconnectedCallback() {
        this.stopAnimation();
        this.observer?.disconnect();
        this.reducedMotionMediaQuery?.removeEventListener('change', this.handleReducedMotionChange);
        window.removeEventListener('resize', this.handleResize);
    }
}

// Register element
customElements.define('data-mesh-graph', DataMeshGraph);

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataMeshGraph;
}


