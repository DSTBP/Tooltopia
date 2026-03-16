const DEFAULT_COLORS = ["#f8fafc", "#f1f5f9", "#cbd5e1"];
const DEFAULT_GAP = 5;
const DEFAULT_SPEED = 35;
const MAX_GAP = 50;
const MIN_GAP = 4;
const MAX_SPEED = 100;
const MIN_SPEED = 0;
const SPEED_THROTTLE = 0.001;
const FRAME_INTERVAL = 1000 / 60;

class Pixel {
  constructor(context, x, y, color, speed, delay, counterBase) {
    this.ctx = context;
    this.x = x;
    this.y = y;
    this.color = color;
    this.speed = Math.random() * 0.8 * speed + 0.1 * speed;
    this.size = 0;
    this.sizeStep = Math.random() * 0.4;
    this.minSize = 0.5;
    this.maxSizeInteger = 2;
    this.maxSize = Math.random() * (this.maxSizeInteger - this.minSize) + this.minSize;
    this.delay = delay;
    this.counter = 0;
    this.counterStep = Math.random() * 4 + counterBase;
    this.isIdle = false;
    this.isReverse = false;
    this.isShimmer = false;
  }

  draw() {
    const centerOffset = this.maxSizeInteger * 0.5 - this.size * 0.5;
    this.ctx.fillStyle = this.color;
    this.ctx.fillRect(
      this.x + centerOffset,
      this.y + centerOffset,
      this.size,
      this.size
    );
  }

  appear() {
    this.isIdle = false;

    if (this.counter <= this.delay) {
      this.counter += this.counterStep;
      return;
    }

    if (this.size >= this.maxSize) {
      this.isShimmer = true;
    }

    if (this.isShimmer) {
      this.shimmer();
    } else {
      this.size += this.sizeStep;
    }

    this.draw();
  }

  disappear() {
    this.isShimmer = false;
    this.counter = 0;

    if (this.size <= 0) {
      this.isIdle = true;
      return;
    }

    this.size = Math.max(0, this.size - 0.1);
    this.draw();
  }

  shimmer() {
    if (this.size >= this.maxSize) {
      this.isReverse = true;
    } else if (this.size <= this.minSize) {
      this.isReverse = false;
    }

    this.size += this.isReverse ? -this.speed : this.speed;
  }
}

class PixelCanvas extends HTMLElement {
  static sheet = null;

  static register(tag = "pixel-canvas") {
    if ("customElements" in window && !customElements.get(tag)) {
      customElements.define(tag, this);
    }
  }

  static css = `
    :host {
      display: grid;
      inline-size: 100%;
      block-size: 100%;
      overflow: hidden;
    }
  `;

  connectedCallback() {
    this._parent = this.parentElement;
    this.motionQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    this.reducedMotion = this.motionQuery ? this.motionQuery.matches : false;
    this.animation = null;
    this.currentAnimationType = null;
    this.timePrevious = performance.now();

    this.mountShadowCanvas();
    this.ctx = this.canvas.getContext("2d");
    if (!this.ctx) {
      return;
    }

    this.init();
    this.observeResize();
    this.observeMotionPreference();
    this.bindParentEvents();
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.animation);
    this.animation = null;

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    if (this._handleWindowResize) {
      window.removeEventListener("resize", this._handleWindowResize);
    }

    if (this.motionQuery) {
      if (typeof this.motionQuery.removeEventListener === "function") {
        this.motionQuery.removeEventListener("change", this._handleMotionChange);
      } else if (typeof this.motionQuery.removeListener === "function") {
        this.motionQuery.removeListener(this._handleMotionChange);
      }
    }

    if (this._parent) {
      this._parent.removeEventListener("mouseenter", this);
      this._parent.removeEventListener("mouseleave", this);
      this._parent.removeEventListener("focusin", this);
      this._parent.removeEventListener("focusout", this);
    }

    delete this._parent;
  }

  handleEvent(event) {
    const handler = this[`on${event.type}`];
    if (typeof handler === "function") {
      handler.call(this, event);
    }
  }

  onmouseenter() {
    this.handleAnimation("appear");
  }

  onmouseleave() {
    this.handleAnimation("disappear");
  }

  onfocusin(event) {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }

    this.handleAnimation("appear");
  }

  onfocusout(event) {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }

    this.handleAnimation("disappear");
  }

  handleAnimation(name) {
    if (!this.pixels || this.pixels.length === 0) {
      return;
    }

    if (this.currentAnimationType === name && this.animation !== null) {
      return;
    }

    this.currentAnimationType = name;
    cancelAnimationFrame(this.animation);

    for (let i = 0; i < this.pixels.length; i += 1) {
      const pixel = this.pixels[i];
      pixel.isIdle = false;

      if (name === "appear") {
        pixel.counter = 0;
      } else {
        pixel.isShimmer = false;
      }
    }

    this.animate(name);
  }

  init() {
    if (!this.canvas || !this.ctx) {
      return;
    }

    const rect = this.getBoundingClientRect();
    const width = Math.max(0, Math.floor(rect.width));
    const height = Math.max(0, Math.floor(rect.height));

    cancelAnimationFrame(this.animation);
    this.animation = null;
    this.currentAnimationType = null;
    this.refreshConfig();
    this.timePrevious = performance.now();
    this.pixels = [];
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.clearRect(0, 0, width, height);

    if (width === 0 || height === 0) {
      return;
    }

    this.createPixels(width, height);
  }

  animate(fnName) {
    if (fnName !== this.currentAnimationType) {
      return;
    }

    this.animation = requestAnimationFrame(() => this.animate(fnName));

    const timeNow = performance.now();
    const timePassed = timeNow - this.timePrevious;

    if (timePassed < FRAME_INTERVAL) {
      return;
    }

    this.timePrevious = timeNow - (timePassed % FRAME_INTERVAL);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    let hasActivePixels = false;

    for (let i = 0; i < this.pixels.length; i += 1) {
      const pixel = this.pixels[i];
      pixel[fnName]();

      if (fnName === "disappear" && !pixel.isIdle) {
        hasActivePixels = true;
      }
    }

    if (fnName === "disappear" && !hasActivePixels) {
      cancelAnimationFrame(this.animation);
      this.animation = null;
    }
  }

  refreshConfig() {
    const colors = this.dataset.colors
      ?.split(",")
      .map((color) => color.trim())
      .filter(Boolean);
    const speed = this.getClampedInteger(this.dataset.speed, DEFAULT_SPEED, MIN_SPEED, MAX_SPEED);

    this.colors = colors && colors.length > 0 ? colors : DEFAULT_COLORS;
    this.gap = this.getClampedInteger(this.dataset.gap, DEFAULT_GAP, MIN_GAP, MAX_GAP);
    this.speed = this.reducedMotion ? 0 : speed * SPEED_THROTTLE;
  }

  createPixels(width, height) {
    const centerX = width / 2;
    const centerY = height / 2;
    const counterBase = (width + height) * 0.01;
    const gap = this.gap;
    const colors = this.colors;
    const speed = this.speed;

    for (let x = 0; x < width; x += gap) {
      for (let y = 0; y < height; y += gap) {
        const color = colors[Math.floor(Math.random() * colors.length)];
        const delay = this.reducedMotion ? 0 : Math.hypot(x - centerX, y - centerY);

        this.pixels.push(
          new Pixel(this.ctx, x, y, color, speed, delay, counterBase)
        );
      }
    }
  }

  observeResize() {
    if ("ResizeObserver" in window) {
      this.resizeObserver = new ResizeObserver(() => this.init());
      this.resizeObserver.observe(this);
      return;
    }

    this._handleWindowResize = () => this.init();
    window.addEventListener("resize", this._handleWindowResize);
  }

  observeMotionPreference() {
    if (!this.motionQuery) {
      return;
    }

    this._handleMotionChange = (event) => {
      this.reducedMotion = event.matches;
      this.init();
    };

    if (typeof this.motionQuery.addEventListener === "function") {
      this.motionQuery.addEventListener("change", this._handleMotionChange);
    } else if (typeof this.motionQuery.addListener === "function") {
      this.motionQuery.addListener(this._handleMotionChange);
    }
  }

  bindParentEvents() {
    if (!this._parent) {
      return;
    }

    this._parent.addEventListener("mouseenter", this);
    this._parent.addEventListener("mouseleave", this);
    this._parent.addEventListener("focusin", this);
    this._parent.addEventListener("focusout", this);
  }

  getClampedInteger(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, Math.floor(parsed)));
  }

  mountShadowCanvas() {
    const canvas = document.createElement("canvas");
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });

    if ("adoptedStyleSheets" in root && typeof CSSStyleSheet === "function") {
      if (!PixelCanvas.sheet) {
        PixelCanvas.sheet = new CSSStyleSheet();
        PixelCanvas.sheet.replaceSync(PixelCanvas.css);
      }

      root.adoptedStyleSheets = [PixelCanvas.sheet];
      root.replaceChildren(canvas);
    } else {
      const style = document.createElement("style");
      style.textContent = PixelCanvas.css;
      root.replaceChildren(style, canvas);
    }

    this.canvas = canvas;
  }
}

PixelCanvas.register();
