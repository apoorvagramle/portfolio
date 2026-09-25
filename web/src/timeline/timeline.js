// timeline.js — the art star's full-screen "paint tube" timeline.
//
// Built from the standalone prototype (the "Paint Trail" artifact) once
// Apoorva confirmed the mechanism and the real tube cutout — see
// claude/art-timeline-spec.md for the design rationale, the milestone
// copy's source, and the real-tube-photo cutout technique.
//
// Self-contained: builds its own veil + panel and injects its own <style>
// and Google Fonts <link> the first time it's opened. No index.html changes
// needed. story.js owns the trigger and the block/freeze contract — this
// module only knows how to open, animate and close itself; see
// `reveal()`/`close()`/`blocking` in story.js for how the two connect.
//
// z-index 200/201: comfortably above every existing layer in the house
// (navbar 40, popovers 50, toast 60, map dialog 70, the normal story
// popup 80/81), since the two never show at the same time but should never
// race if something changes later.

const STOPS = [
  {
    id: 'age4',
    chip: 'Age 4',
    color: '#e4572e',
    dark: false,
    icon: 'ic-trophy',
    title: 'First competition. First place.',
    body:
      'I started drawing when I was four — and somehow, I kept winning.\n' +
      'Drawing just became one of those things people knew me for.'
  },

  {
    id: 'growing',
    chip: 'Growing up',
    color: '#f2a93b',
    dark: false,
    icon: 'ic-supplies',
    title: 'If I could make it, I wanted to try it.',
    body:
      'Drawing, painting, fabric painting, crafts, DIY — if I could make it, I wanted to try it.\n' +
      'And honestly, I’ve ended up trying things I never even imagined I would.'
  },

  {
    id: 'after10th',
    chip: 'After 10th',
    color: '#3fa796',
    dark: false,
    icon: 'ic-play',
    title: 'Then I started taking art somewhere.',
    body:
      'After 10th, I started a YouTube channel and began sharing what I made.\n' +
      'Then came freelancing — mug designs, T-shirts, digital art… and suddenly, something I’d always loved was becoming something I could earn from too.'
  },

  {
    id: 'now',
    chip: 'Now',
    color: '#ede6d6',
    dark: true,
    icon: 'ic-pastel',
    title: 'And I never really stopped.',
    body:
      'That money eventually bought me my first iPad.\n' +
      'And now I’m still making — digital art, animation, oil pastels… whatever I feel like trying next.'
  }
];

// Real photo of a paint tube, background + spilled paint removed, rotated
// nozzle-down (see art-timeline-spec.md's "Real tube asset" section).
const TUBE_W = 267;
const TUBE_H = 571;
const TUBE_NOZZLE = { x: 185, y: 549 };
const TUBE_SRC = 'src/assets/tube.png';

const SVG_DEFS = `
  <defs>
    <filter id="tlEdgeWobble" x="-10%" y="-30%" width="120%" height="160%">
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.05 0.006"
        numOctaves="2"
        seed="7"
        result="noise"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="noise"
        scale="6"
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>

    <filter
      id="tlSoftBlurSmall"
      x="-60%"
      y="-60%"
      width="220%"
      height="220%"
    >
      <feGaussianBlur stdDeviation="5"/>
    </filter>

    <filter
      id="tlBallGlow"
      x="-250%"
      y="-250%"
      width="600%"
      height="600%"
    >
      <feGaussianBlur stdDeviation="10" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <filter
      id="tlDropShadow"
      x="-40%"
      y="-40%"
      width="180%"
      height="220%"
    >
      <feDropShadow
        dx="0"
        dy="8"
        stdDeviation="10"
        flood-color="#000"
        flood-opacity="0.5"
      />
    </filter>

    <radialGradient
      id="tlBallGrad"
      cx="35%"
      cy="28%"
      r="72%"
    >
      <stop offset="0%" stop-color="#fffdf3"/>
      <stop offset="55%" stop-color="#ffe9a8"/>
      <stop offset="100%" stop-color="#ffb648"/>
    </radialGradient>

    <linearGradient
      id="tlRibbonGrad"
      gradientUnits="userSpaceOnUse"
      x1="0"
      y1="0"
      x2="0"
      y2="1"
    ></linearGradient>

    <clipPath id="tlRevealClip">
      <rect
        id="tlRevealRect"
        x="0"
        y="0"
        width="10"
        height="0"
      />
    </clipPath>

    <path
      id="tlHiddenRef"
      fill="none"
      stroke="none"
    />

    <symbol id="tl-ic-trophy" viewBox="0 0 48 48">
      <path
        d="M14 8h20v6a10 10 0 0 1-20 0z"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linejoin="round"
      />
      <path
        d="M14 10H7v3a7 7 0 0 0 7 7M34 10h7v3a7 7 0 0 1-7 7"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
      />
      <path
        d="M24 24v7"
        stroke="currentColor"
        stroke-width="3"
      />
      <path
        d="M16 40h16l-2-6H18z"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linejoin="round"
      />
    </symbol>

    <symbol id="tl-ic-supplies" viewBox="0 0 48 48">
      <path
        d="M10 40V16l6-8h16l6 8v24z"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linejoin="round"
      />
      <path
        d="M10 24h28M18 24v16M26 24v16M34 24v16"
        stroke="currentColor"
        stroke-width="2.4"
      />
    </symbol>

    <symbol id="tl-ic-play" viewBox="0 0 48 48">
      <circle
        cx="24"
        cy="24"
        r="17"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
      />
      <path
        d="M20 16.5l13 7.5-13 7.5z"
        fill="currentColor"
      />
    </symbol>

    <symbol id="tl-ic-branch" viewBox="0 0 48 48">
      <circle cx="10" cy="24" r="4.2" fill="currentColor"/>
      <circle cx="38" cy="10" r="4.2" fill="currentColor"/>
      <circle cx="38" cy="24" r="4.2" fill="currentColor"/>
      <circle cx="38" cy="38" r="4.2" fill="currentColor"/>
      <path
        d="M13.5 22.5L34 11M14 24h20M13.5 25.5L34 37"
        fill="none"
        stroke="currentColor"
        stroke-width="2.6"
      />
    </symbol>

    <symbol id="tl-ic-mug" viewBox="0 0 48 48">
      <path
        d="M9 14h22v18a8 8 0 0 1-8 8h-6a8 8 0 0 1-8-8z"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linejoin="round"
      />
      <path
        d="M31 18h4a5 5 0 0 1 0 10h-4"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
      />
      <path
        d="M14 9.5c1.5 2 1.5 3-0.3 5M21 9.5c1.5 2 1.5 3-0.3 5"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
      />
    </symbol>

    <symbol id="tl-ic-tablet" viewBox="0 0 48 48">
      <rect
        x="10"
        y="6"
        width="28"
        height="36"
        rx="4"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
      />
      <path
        d="M20 36h8"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
      />
      <path
        d="M16 14l7 7-7 7"
        fill="none"
        stroke="currentColor"
        stroke-width="2.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </symbol>

    <symbol id="tl-ic-film" viewBox="0 0 48 48">
      <rect
        x="6"
        y="10"
        width="36"
        height="28"
        rx="3"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
      />
      <path
        d="M6 17h36M6 31h36"
        stroke="currentColor"
        stroke-width="2.4"
      />
      <path
        d="M13 10v7M13 31v7M35 10v7M35 31v7"
        stroke="currentColor"
        stroke-width="2.4"
      />
      <path
        d="M20 21l8 4.5-8 4.5z"
        fill="currentColor"
      />
    </symbol>

    <symbol id="tl-ic-pastel" viewBox="0 0 48 48">
      <path
        d="M8 34l20-20 6 6-20 20-7 1z"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linejoin="round"
      />
      <path
        d="M28 14l6-6 6 6-6 6z"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linejoin="round"
      />
      <path
        d="M20 40h20"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
      />
    </symbol>
  </defs>
`;

const MARKUP = `
  <div
    class="tl-popup"
    role="dialog"
    aria-modal="true"
    aria-label="My art journey"
  >
    <div class="tl-header">
      <div class="tl-titles">
        <p class="tl-eyebrow">
          <span class="tl-dot"></span>
          Art star
        </p>

        <h1>The studio becomes a trail of paint.</h1>
      </div>

      <div class="tl-controls">
        <span
          class="tl-progress-chip"
          data-el="progressChip"
        >
          1 / 4
        </span>

        <button
          class="tl-ctl"
          data-el="btnPlay"
          aria-label="Play"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
          <span data-el="btnPlayLabel">Play</span>
        </button>

        <button
          class="tl-ctl"
          data-el="btnRestart"
          aria-label="Restart"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <path d="M3 12a9 9 0 1 0 3-6.7"/>
            <path d="M3 4v5h5"/>
          </svg>
        </button>

        <button
          class="tl-ctl tl-btn-close"
          data-el="btnClose"
          aria-label="Close"
        >
          &times;
        </button>
      </div>
    </div>

    <div class="tl-body" data-el="body">
      <div class="tl-stage" data-el="stage">

        <svg
          xmlns="http://www.w3.org/2000/svg"
          data-el="svg"
        >
          ${SVG_DEFS}

          <path
            data-el="guidePath"
            fill="none"
            stroke="#ffffff"
            stroke-opacity="0.09"
            stroke-width="2"
            stroke-dasharray="1 9"
            stroke-linecap="round"
          />

          <g
            data-el="revealGroup"
            clip-path="url(#tlRevealClip)"
          >
            <path
              data-el="ribbonShadow"
              fill="#000"
              opacity="0.35"
              filter="url(#tlSoftBlurSmall)"
            />

            <path
              data-el="ribbonBase"
              fill="url(#tlRibbonGrad)"
              filter="url(#tlEdgeWobble)"
            />

            <path
              data-el="ribbonDeep"
              fill="#000"
              opacity="0.16"
            />

            <path
              data-el="ribbonHighlight"
              fill="#fff"
              opacity="0.4"
              filter="url(#tlSoftBlurSmall)"
            />

            <path
              data-el="ribbonSpecular"
              fill="#fff"
              opacity="0.55"
              filter="url(#tlSoftBlurSmall)"
            />
          </g>

          <path
            data-el="nozzleBead"
            filter="url(#tlDropShadow)"
          />

          <g data-el="blobsLayer"></g>

          <circle
            data-el="ball"
            r="15"
            fill="url(#tlBallGrad)"
            filter="url(#tlBallGlow)"
          />
        </svg>

        <div data-el="cardsLayer"></div>

        <div
          class="tl-caption"
          data-el="caption"
          hidden
        ></div>

        <img
          data-el="tubeImg"
          src="${TUBE_SRC}"
          alt=""
          style="
            position:absolute;
            z-index:3;
            pointer-events:none;
            filter:drop-shadow(0 14px 18px rgba(0,0,0,.55));
          "
        />
      </div>
    </div>
  </div>
`;

function catmull(pts) {
  let d = 'M' + pts[0].x + ',' + pts[0].y + ' ';

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;

    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;

    d +=
      'C' +
      c1x +
      ',' +
      c1y +
      ' ' +
      c2x +
      ',' +
      c2y +
      ' ' +
      p2.x +
      ',' +
      p2.y +
      ' ';
  }

  return d;
}

const BLOB_PATH =
  'M50 3C71 1 97 21 97 47C97 72 78 97 50 97C23 97 3 74 3 48C3 21 28 5 50 3Z';

const NS = 'http://www.w3.org/2000/svg';

export class Timeline {
  constructor(opts = {}) {
    this.onRequestClose = opts.onRequestClose || null;

    this.isOpen = false;
    this._built = false;

    this.reduceMotion = window
      .matchMedia('(prefers-reduced-motion: reduce)')
      .matches;

    this.stops = STOPS;

    this.stopT = [];

    this.playing = false;
    this.raf = null;

    this.litUpTo = -1;
    this.current = -1;

    this.segIndex = 0;
    this.curSegStart = null;
    this.timelineSegs = null;

    this._playTimer = null;

    this.segDur = [1800, 1600, 1500, 1800];
    this.dwell = 2000;
  }

  _ensureBuilt() {
    if (this._built) return;

    this._built = true;

    if (!document.getElementById('tlFonts')) {
      const link = document.createElement('link');

      link.id = 'tlFonts';
      link.rel = 'stylesheet';

      link.href =
        'https://fonts.googleapis.com/css2?family=Coda:wght@400;800&family=Bitcount+Grid+Single:wght@100..900&family=Space+Mono:wght@400;700&display=swap';

      document.head.appendChild(link);
    }

    const root = document.createElement('div');

    root.id = 'tlVeil';
    root.innerHTML = MARKUP;

    document.body.appendChild(root);

    this.root = root;

    const el = {};

    root.querySelectorAll('[data-el]').forEach((n) => {
      el[n.getAttribute('data-el')] = n;
    });

    this.el = el;

    this.hiddenRef = root.querySelector('#tlHiddenRef');

    el.btnPlay.addEventListener(
      'click',
      () => (this.playing ? this._pause() : this._play())
    );

    el.btnRestart.addEventListener('click', () => {
      this._restart();

      if (!this.reduceMotion) {
        this._play();
      }
    });

    el.btnClose.addEventListener(
      'click',
      () => this.onRequestClose?.()
    );

    // Card heights depend on the web fonts; once they land, lay out again.
    document.fonts?.ready?.then(() => {
      if (this.isOpen) {
        this._relayout();
      }
    });

    let resizeT = null;

    window.addEventListener('resize', () => {
      if (!this.isOpen) return;

      clearTimeout(resizeT);

      resizeT = setTimeout(
        () => this._relayout(),
        180
      );
    });
  }

  open() {
    this._ensureBuilt();

    this.isOpen = true;

    this.root.classList.add('show');

    this._layout();
    this._restart();

    if (this.reduceMotion) {
      this._lightUpTo(this.stops.length - 1);
      this._setBallAt(1);
    } else {
      this._playTimer = setTimeout(
        () => this._play(),
        650
      );
    }
  }

  close() {
    if (!this.isOpen) return;

    this.isOpen = false;

    clearTimeout(this._playTimer);

    this._pause();

    this.root.classList.remove('show');
  }

  /** Re-fit after a resize / font load, keeping how far the ball had got. */
  _relayout() {
    const wasPlaying = this.playing;

    const lit = this.litUpTo;
    const cur = this.current;

    this._pause();
    this._layout();
    this._restart();

    if (lit >= 0) {
      this._lightUpTo(lit);

      this._setCurrent(cur);

      this._setBallAt(
        this.stopT[Math.max(0, cur)]
      );

      this.segIndex =
        Math.max(0, cur) * 2 + 2;
    }

    if (wasPlaying) {
      this._play();
    }
  }

  // ---- layout / geometry --------------------------------------------------
  //
  // Session 25: horizontal. The tube lies on its side at the left, nozzle
  // pointing right; the paint runs left → right, weaving up and down; the
  // stops alternate above / below it, each with its card on its own outer
  // side (above the top stops, below the bottom ones). The stage is laid out
  // at its natural size, measured, then scaled to fit the popup body — no
  // scrolling, ever. Narrow screens swap the cards for one caption under
  // the ribbon.

  _layout() {
    const el = this.el;

    const bw = Math.max(
      280,
      el.body.clientWidth
    );

    const bh = Math.max(
      240,
      el.body.clientHeight
    );

    this.compact = false;

    let fit = this._layoutFull(
      bw,
      bh
    );

    if (fit < 0.62) {
      this.compact = true;
      fit = this._layoutCompact(
        bw,
        bh
      );
    }

    const stage = el.stage;

    stage.style.width =
      this.DW + 'px';

    stage.style.height =
      this.H + 'px';

    stage.style.transform =
      `scale(${fit})`;

    stage.style.left =
      Math.max(
        0,
        (bw - this.DW * fit) / 2
      ) + 'px';

    stage.style.top =
      Math.max(
        0,
        (bh - this.H * fit) / 2
      ) + 'px';
  }

  /** Common geometry once DW, H, cy, amplitude, blobR and the tube size are known. */
  _geometry({
    tubeThick,
    x0Gap,
    xEndMargin
  }) {
    const nozzle =
      this._positionTube(tubeThick);

    const x0 =
      nozzle.x + x0Gap;

    const x1 =
      this.DW - xEndMargin;

    const spacing =
      (x1 - x0) /
      (this.stops.length - 1);

    this.spacing = spacing;

    const pts = [
      nozzle,
      {
        x:
          nozzle.x +
          Math.min(
            46,
            x0Gap * 0.5
          ),
        y: this.cy
      }
    ];

    this.stops.forEach((st, i) => {
      st.x =
        x0 +
        i * spacing;

      st.y =
        this.cy +
        (i % 2 === 0
          ? -this.amplitude
          : this.amplitude);

      pts.push({
        x: st.x,
        y: st.y
      });
    });

    const last =
      this.stops[
        this.stops.length - 1
      ];

    const tailX =
      Math.min(
        this.DW - 8,
        last.x +
          Math.max(
            40,
            xEndMargin * 0.8
          )
      );

    pts.push(
      {
        x:
          (last.x + tailX) / 2 + 6,
        y: this.cy
      },
      {
        x: tailX,
        y: this.cy
      }
    );

    this.pathD = catmull(pts);

    this.hiddenRef.setAttribute(
      'd',
      this.pathD
    );

    this.pathLen =
      this.hiddenRef.getTotalLength();

    this.stopT =
      this.stops.map((st) =>
        this._findTAt(
          st.x,
          st.y
        )
      );
  }

  _layoutFull(bw, bh) {
    this.DW = Math.max(
      bw,
      1060
    );

    this.amplitude = 58;
    this.blobR = 34;

    const gapC = 24;
    const pad = 16;

    const tubeThick = 70;

    const n =
      this.stops.length;

    const x0 =
      8 +
      TUBE_NOZZLE.y *
        (tubeThick / TUBE_W) +
      70;

    let spacing =
      (this.DW - 8 + 11 - x0) /
      n;

    this.cardW = Math.min(
      250,
      Math.floor(
        spacing * 2 - 22
      )
    );

    const x1 =
      this.DW -
      this.cardW / 2 -
      8;

    spacing =
      (x1 - x0) /
      (n - 1);

    const xEndMargin =
      this.DW - x1;

    this._buildCards();

    const hs =
      this.stops.map(
        (st) =>
          st.cardEl.offsetHeight
      );

    const maxTop =
      Math.max(
        ...hs.filter(
          (_, i) =>
            i % 2 === 0
        )
      );

    const maxBot =
      Math.max(
        ...hs.filter(
          (_, i) =>
            i % 2 === 1
        )
      );

    this.cy =
      pad +
      maxTop +
      gapC +
      this.blobR +
      this.amplitude;

    this.H =
      Math.ceil(
        this.cy +
          this.amplitude +
          this.blobR +
          gapC +
          maxBot +
          pad
      );

    this._geometry({
      tubeThick,
      x0Gap: 70,
      xEndMargin
    });

    this._finishSvg();

    this.stops.forEach(
      (st, i) => {
        const top =
          i % 2 === 0;

        const left =
          Math.min(
            Math.max(
              6,
              st.x -
                this.cardW / 2
            ),
            this.DW -
              this.cardW -
              6
          );

        const y = top
          ? st.y -
            this.blobR -
            gapC -
            hs[i]
          : st.y +
            this.blobR +
            gapC;

        st.cardEl.style.left =
          left + 'px';

        st.cardEl.style.top =
          y + 'px';

        st.cardEdgeY = top
          ? st.y -
            this.blobR -
            gapC
          : st.y +
            this.blobR +
            gapC;
      }
    );

    this._buildBlobs(true);

    return Math.min(
      1,
      bw / this.DW,
      bh / this.H
    );
  }

  _layoutCompact(bw, bh) {
    this.DW =
      Math.max(
        bw,
        300
      );

    const narrow =
      this.DW < 520;

    this.amplitude =
      narrow
        ? 40
        : 30;

    this.blobR = 21;

    const pad = 12;

    this.el.cardsLayer.innerHTML =
      '';

    this.stops.forEach(
      (st) => {
        st.cardEl = null;
      }
    );

    const cap =
      this.el.caption;

    cap.hidden = false;

    const capW =
      Math.min(
        520,
        this.DW - 32
      );

    cap.style.width =
      capW + 'px';

    let capH = 0;

    this.stops.forEach(
      (_, i) => {
        this._fillCaption(i);

        capH =
          Math.max(
            capH,
            cap.offsetHeight
          );
      }
    );

    this.cy =
      pad +
      this.blobR +
      this.amplitude +
      6;

    const tubeThick =
      narrow
        ? 30
        : 40;

    this._geometry({
      tubeThick,
      x0Gap:
        narrow
          ? 24
          : 34,
      xEndMargin:
        narrow
          ? 32
          : 38
    });

    this.blobR =
      Math.min(
        21,
        Math.max(
          13,
          this.spacing * 0.5
        )
      );

    const capTop =
      this.cy +
      this.amplitude +
      this.blobR +
      22;

    cap.style.left =
      (this.DW - capW) / 2 +
      'px';

    cap.style.top =
      capTop + 'px';

    this.H =
      Math.ceil(
        capTop +
          capH +
          pad
      );

    this._finishSvg();

    this._buildBlobs(false);

    this._fillCaption(0);

    return Math.min(
      1,
      bw / this.DW,
      bh / this.H
    );
  }

  _fillCaption(i) {
    const st =
      this.stops[i];

    this.el.caption.innerHTML =
      '<p class="tl-card-chip" style="color:' +
      st.color +
      '">' +
      st.chip +
      '</p>' +

      '<p class="tl-card-title">' +
      st.title +
      '</p>' +

      '<p class="tl-card-body">' +
      st.body +
      '</p>';
  }

  _positionTube(thick) {
    // The cutout is portrait, nozzle-down. Rotated -90° about its top-left
    // (then shifted down by its own width) it lies on its side with the
    // nozzle pointing right: an image point (x, y) lands at (y, W − x).

    const sc =
      thick / TUBE_W;

    const img =
      this.el.tubeImg;

    const left = 8;

    const nzLocalY =
      (TUBE_W -
        TUBE_NOZZLE.x) *
      sc;

    const top =
      this.cy -
      nzLocalY;

    img.style.width =
      TUBE_W * sc +
      'px';

    img.style.height =
      TUBE_H * sc +
      'px';

    img.style.left =
      left + 'px';

    img.style.top =
      top + 'px';

    img.style.transformOrigin =
      '0 0';

    img.style.transform =
      `translateY(${TUBE_W * sc}px) rotate(-90deg)`;

    img.style.filter =
      'drop-shadow(0 0 12px rgba(0,0,0,.6))';

    const nz = {
      x:
        left +
        TUBE_NOZZLE.y * sc,
      y: this.cy
    };

    const bead =
      this.el.nozzleBead;

    const r =
      this.compact
        ? 8
        : 12;

    const cx =
      nz.x +
      r * 0.6;

    const rx =
      r * 1.25;

    bead.setAttribute(
      'd',
      `M${cx},${nz.y - r} A${rx} ${r} 0 1 1 ${cx},${nz.y + r} A${rx} ${r} 0 1 1 ${cx},${nz.y - r} Z`
    );

    bead.setAttribute(
      'fill',
      this.stops[0].color
    );

    return nz;
  }

  _finishSvg() {
    const el =
      this.el;

    el.svg.setAttribute(
      'width',
      this.DW
    );

    el.svg.setAttribute(
      'height',
      this.H
    );

    el.svg.setAttribute(
      'viewBox',
      '0 0 ' +
        this.DW +
        ' ' +
        this.H
    );

    el.guidePath.setAttribute(
      'd',
      this.pathD
    );

    const grad =
      this.root.querySelector(
        '#tlRibbonGrad'
      );

    grad.setAttribute(
      'x1',
      0
    );

    grad.setAttribute(
      'y1',
      0
    );

    grad.setAttribute(
      'x2',
      this.DW
    );

    grad.setAttribute(
      'y2',
      0
    );

    grad.innerHTML = '';

    const gstops = [
      {
        off: 0,
        c: this.stops[0].color
      }
    ];

    this.stops.forEach(
      (st) => {
        gstops.push({
          off:
            st.x /
            this.DW,
          c: st.color
        });
      }
    );

    gstops.push({
      off: 1,
      c:
        this.stops[
          this.stops.length - 1
        ].color
    });

    gstops.forEach(
      (g) => {
        const n =
          document.createElementNS(
            NS,
            'stop'
          );

        n.setAttribute(
          'offset',
          (g.off * 100).toFixed(2) +
            '%'
        );

        n.setAttribute(
          'stop-color',
          g.c
        );

        grad.appendChild(n);
      }
    );

    this._buildRibbonShapes();

    const rect =
      this.root.querySelector(
        '#tlRevealRect'
      );

    rect.setAttribute(
      'height',
      this.H
    );

    rect.setAttribute(
      'width',
      0
    );
  }

  _findTAt(x, y) {
    let best = 0;
    let bestD = Infinity;

    const steps = 500;

    for (
      let k = 0;
      k <= steps;
      k++
    ) {
      const t =
        k / steps;

      const p =
        this.hiddenRef.getPointAtLength(
          t * this.pathLen
        );

      const dx =
        p.x - x;

      const dy =
        p.y - y;

      const d =
        dx * dx +
        dy * dy;

      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }

    return best;
  }

  _buildRibbonShapes() {
    const N =
      Math.max(
        160,
        Math.round(
          this.pathLen / 10
        )
      );

    const baseHalf =
      this.compact
        ? 11
        : 19;

    const bumpAmt =
      this.compact
        ? 3
        : 5;

    const left = [];
    const right = [];

    const deepLeft = [];
    const deepRight = [];

    const hiLeft = [];
    const hiRight = [];

    const specLeft = [];
    const specRight = [];

    for (
      let i = 0;
      i <= N;
      i++
    ) {
      const sLen =
        (i / N) *
        this.pathLen;

      const p =
        this.hiddenRef.getPointAtLength(
          sLen
        );

      const p2 =
        this.hiddenRef.getPointAtLength(
          Math.min(
            this.pathLen,
            sLen + 1
          )
        );

      let tx =
        p2.x - p.x;

      let ty =
        p2.y - p.y;

      const tl =
        Math.hypot(
          tx,
          ty
        ) || 1;

      tx /= tl;
      ty /= tl;

      // normal pointing "up" relative to the direction of travel, so the lit
      // edge (highlight) is the top one — light from above
      const nx = ty;
      const ny = -tx;

      let bump = 0;

      for (
        let j = 0;
        j < this.stopT.length;
        j++
      ) {
        const ds =
          i / N -
          this.stopT[j];

        bump =
          Math.max(
            bump,
            bumpAmt *
              Math.exp(
                -Math.pow(
                  ds *
                    this.pathLen /
                    140,
                  2
                )
              )
          );
      }

      const wobble =
        1.2 *
          Math.sin(
            sLen * 0.045
          ) +
        0.9 *
          Math.sin(
            sLen * 0.017 + 1.3
          );

      const tail =
        Math.min(
          1,
          (1 - i / N) * 14
        );

      const w =
        (baseHalf +
          bump +
          wobble) *
        (0.35 +
          0.65 * tail);

      left.push({
        x: p.x - nx * w,
        y: p.y - ny * w
      });

      right.push({
        x: p.x + nx * w,
        y: p.y + ny * w
      });

      deepLeft.push({
        x:
          p.x -
          nx *
            (w * 0.72 + 3),
        y:
          p.y -
          ny *
            (w * 0.72 + 3)
      });

      deepRight.push({
        x:
          p.x +
          nx *
            w *
            0.5 *
            -1,
        y:
          p.y +
          ny *
            w *
            0.5 *
            -1
      });

      hiLeft.push({
        x:
          p.x +
          nx *
            (w * 0.18),
        y:
          p.y +
          ny *
            (w * 0.18)
      });

      hiRight.push({
        x:
          p.x +
          nx *
            (w * 0.62),
        y:
          p.y +
          ny *
            (w * 0.62)
      });

      specLeft.push({
        x:
          p.x +
          nx *
            (w * 0.3),
        y:
          p.y +
          ny *
            (w * 0.3)
      });

      specRight.push({
        x:
          p.x +
          nx *
            (w * 0.5),
        y:
          p.y +
          ny *
            (w * 0.5)
      });
    }

    function poly(a, b) {
      let d =
        'M' +
        a[0].x.toFixed(1) +
        ',' +
        a[0].y.toFixed(1) +
        ' ';

      for (
        let i = 1;
        i < a.length;
        i++
      ) {
        d +=
          'L' +
          a[i].x.toFixed(1) +
          ',' +
          a[i].y.toFixed(1) +
          ' ';
      }

      for (
        let i = b.length - 1;
        i >= 0;
        i--
      ) {
        d +=
          'L' +
          b[i].x.toFixed(1) +
          ',' +
          b[i].y.toFixed(1) +
          ' ';
      }

      return d + 'Z';
    }

    this.el.ribbonBase.setAttribute(
      'd',
      poly(left, right)
    );

    this.el.ribbonShadow.setAttribute(
      'd',
      poly(
        left.map((p) => ({
          x: p.x + 4,
          y: p.y + 8
        })),
        right.map((p) => ({
          x: p.x + 4,
          y: p.y + 8
        }))
      )
    );

    this.el.ribbonDeep.setAttribute(
      'd',
      poly(
        left,
        deepRight
      )
    );

    this.el.ribbonHighlight.setAttribute(
      'd',
      poly(
        hiLeft,
        hiRight
      )
    );

    this.el.ribbonSpecular.setAttribute(
      'd',
      poly(
        specLeft,
        specRight
      )
    );
  }

  _buildCards() {
    const cardsLayer =
      this.el.cardsLayer;

    cardsLayer.innerHTML = '';

    this.el.caption.hidden =
      true;

    this.stops.forEach(
      (st, i) => {
        const card =
          document.createElement(
            'div'
          );

        card.className =
          'tl-card';

        card.style.setProperty(
          '--card-w',
          this.cardW + 'px'
        );

        card.style.width =
          this.cardW + 'px';

        card.style.left =
          '0px';

        card.style.top =
          '0px';

        card.innerHTML =
          '<p class="tl-card-chip" style="color:' +
          st.color +
          '">' +
          st.chip +
          '</p>' +

          '<p class="tl-card-title">' +
          st.title +
          '</p>' +

          '<p class="tl-card-body">' +
          st.body +
          '</p>';

        card.addEventListener(
          'click',
          () => this._jumpTo(i)
        );

        cardsLayer.appendChild(
          card
        );

        st.cardEl = card;
      }
    );
  }

  _buildBlobs(withConnectors) {
    const layer =
      this.el.blobsLayer;

    layer.innerHTML = '';

    const blobR =
      this.blobR;

    this.stops.forEach(
      (st, i) => {
        if (withConnectors) {
          const connector =
            document.createElementNS(
              NS,
              'path'
            );

          const top =
            i % 2 === 0;

          const sy =
            st.y +
            (top
              ? -blobR
              : blobR);

          const cardCx =
            parseFloat(
              st.cardEl.style.left
            ) +
            this.cardW / 2;

          const ex =
            st.x +
            Math.max(
              -30,
              Math.min(
                30,
                (cardCx - st.x) *
                  0.5
              )
            );

          const ey =
            st.cardEdgeY +
            (top
              ? -4
              : 4);

          connector.setAttribute(
            'd',
            'M' +
              st.x +
              ',' +
              sy +
              ' Q' +
              st.x +
              ',' +
              ((sy + ey) / 2) +
              ' ' +
              ex +
              ',' +
              ey
          );

          connector.setAttribute(
            'fill',
            'none'
          );

          connector.setAttribute(
            'stroke',
            st.color
          );

          connector.setAttribute(
            'stroke-width',
            '2'
          );

          connector.setAttribute(
            'stroke-opacity',
            '0.55'
          );

          layer.appendChild(
            connector
          );

          const connLen =
            connector.getTotalLength();

          connector.style.strokeDasharray =
            connLen;

          connector.style.strokeDashoffset =
            connLen;

          connector.style.transition =
            'stroke-dashoffset .6s ease';

          st.connectorEl =
            connector;
        } else {
          st.connectorEl = null;
        }

        const g =
          document.createElementNS(
            NS,
            'g'
          );

        g.setAttribute(
          'class',
          'tl-blob-hit'
        );

        g.setAttribute(
          'tabindex',
          '0'
        );

        g.setAttribute(
          'role',
          'button'
        );

        g.setAttribute(
          'aria-label',
          st.chip +
            ': ' +
            st.title
        );

        const bg =
          document.createElementNS(
            NS,
            'path'
          );

        bg.setAttribute(
          'd',
          BLOB_PATH
        );

        bg.setAttribute(
          'fill',
          st.color
        );

        bg.setAttribute(
          'opacity',
          '0.30'
        );

        bg.setAttribute(
          'filter',
          'url(#tlEdgeWobble)'
        );

        bg.setAttribute(
          'transform',
          'translate(' +
            st.x +
            ',' +
            st.y +
            ') scale(' +
            (blobR / 50 * 1.35) +
            ') translate(-50,-50)'
        );

        const ring =
          document.createElementNS(
            NS,
            'circle'
          );

        ring.setAttribute(
          'class',
          'tl-focus-ring'
        );

        ring.setAttribute(
          'cx',
          st.x
        );

        ring.setAttribute(
          'cy',
          st.y
        );

        ring.setAttribute(
          'r',
          blobR + 8
        );

        ring.setAttribute(
          'fill',
          'none'
        );

        ring.setAttribute(
          'stroke',
          '#ffd166'
        );

        ring.setAttribute(
          'stroke-width',
          '3'
        );

        const core =
          document.createElementNS(
            NS,
            'circle'
          );

        core.setAttribute(
          'cx',
          st.x
        );

        core.setAttribute(
          'cy',
          st.y
        );

        core.setAttribute(
          'r',
          blobR
        );

        core.setAttribute(
          'fill',
          st.color
        );

        core.setAttribute(
          'opacity',
          '0.45'
        );

        core.setAttribute(
          'filter',
          'url(#tlDropShadow)'
        );

        const use =
          document.createElementNS(
            NS,
            'use'
          );

        use.setAttribute(
          'href',
          '#tl-' +
            st.icon
        );

        const ic =
          blobR * 1.05;

        use.setAttribute(
          'x',
          st.x -
            ic / 2
        );

        use.setAttribute(
          'y',
          st.y -
            ic / 2
        );

        use.setAttribute(
          'width',
          ic
        );

        use.setAttribute(
          'height',
          ic
        );

        use.style.color =
          st.dark
            ? '#241d13'
            : '#fffaf0';

        g.appendChild(bg);
        g.appendChild(core);
        g.appendChild(use);
        g.appendChild(ring);

        layer.appendChild(g);

        st.el = g;
        st.coreEl = core;

        g.addEventListener(
          'click',
          () => this._jumpTo(i)
        );

        g.addEventListener(
          'mouseenter',
          () => {
            if (!this.compact) return;

            this._fillCaption(i);
          }
        );

        g.addEventListener(
          'mouseleave',
          () => {
            if (
              !this.compact ||
              this.current < 0
            ) {
              return;
            }

            this._fillCaption(
              this.current
            );
          }
        );

        g.addEventListener(
          'keydown',
          (e) => {
            if (
              e.key === 'Enter' ||
              e.key === ' '
            ) {
              e.preventDefault();
              this._jumpTo(i);
            }
          }
        );
      }
    );
  }

  // ---- playback ------------------------------------------------------------

  _setBallAt(tt) {
    const p =
      this.hiddenRef.getPointAtLength(
        tt * this.pathLen
      );

    this.el.ball.setAttribute(
      'cx',
      p.x
    );

    this.el.ball.setAttribute(
      'cy',
      p.y
    );

    this.root
      .querySelector(
        '#tlRevealRect'
      )
      .setAttribute(
        'width',
        Math.max(
          0,
          p.x + 26
        )
      );

    return p;
  }

  _setCurrent(i) {
    this.current = i;

    this.stops.forEach(
      (st, k) => {
        st.cardEl?.classList.toggle(
          'tl-current',
          k === i
        );
      }
    );

    if (
      this.compact &&
      i >= 0
    ) {
      this._fillCaption(i);
    }

    this.el.progressChip.textContent =
      (Math.max(0, i) + 1) +
      ' / ' +
      this.stops.length;
  }

  _lightUpTo(i) {
    for (
      let k = 0;
      k <= i;
      k++
    ) {
      if (
        k >
        this.litUpTo
      ) {
        this.stops[
          k
        ].cardEl?.classList.add(
          'tl-lit'
        );

        this.stops[
          k
        ].coreEl.setAttribute(
          'opacity',
          '0.9'
        );

        if (
          this.stops[
            k
          ].connectorEl
        ) {
          this.stops[
            k
          ].connectorEl.style.strokeDashoffset =
            '0';
        }
      }
    }

    this.litUpTo =
      Math.max(
        this.litUpTo,
        i
      );

    this._setCurrent(i);
  }

  _jumpTo(i) {
    this._pause();

    this._setBallAt(
      this.stopT[i]
    );

    this._lightUpTo(i);

    this._setCurrent(i);

    // Play from here continues on to the next stop.
    this.segIndex =
      i * 2 + 2;

    this.curSegStart = null;

    this.stops[
      i
    ].el.focus({
      preventScroll: true
    });
  }

  _buildTimeline() {
    const segs = [];
    let prevT = 0;

    for (
      let i = 0;
      i < this.stops.length;
      i++
    ) {
      segs.push({
        type: 'move',
        from: prevT,
        to: this.stopT[i],
        dur: this.segDur[i]
      });

      segs.push({
        type: 'dwell',
        index: i,
        dur: this.dwell
      });

      prevT =
        this.stopT[i];
    }

    return segs;
  }

  _updatePlayBtn() {
    this.el.btnPlayLabel.textContent =
      this.playing
        ? 'Pause'
        : 'Play';

    this.el.btnPlay
      .querySelector('svg')
      .innerHTML =
      this.playing
        ? '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>'
        : '<path d="M8 5v14l11-7z"/>';
  }

  _play() {
    this.timelineSegs =
      this._buildTimeline();

    if (
      this.segIndex >=
      this.timelineSegs.length
    ) {
      this._restart();
    }

    this.playing = true;

    this._updatePlayBtn();

    this.curSegStart = null;

    this.raf =
      requestAnimationFrame(
        (now) =>
          this._step(now)
      );
  }

  _pause() {
    this.playing = false;

    this._updatePlayBtn();

    if (this.raf) {
      cancelAnimationFrame(
        this.raf
      );
    }

    this.raf = null;
  }

  _restart() {
    this._pause();

    this.segIndex = 0;
    this.curSegStart = null;
    this.litUpTo = -1;
    this.current = -1;

    this.stops.forEach(
      (st) => {
        st.cardEl?.classList.remove(
          'tl-lit',
          'tl-current'
        );

        st.coreEl.setAttribute(
          'opacity',
          '0.45'
        );

        if (st.connectorEl) {
          st.connectorEl.style.strokeDashoffset =
            String(
              st.connectorEl.getTotalLength()
            );
        }
      }
    );

    if (this.compact) {
      this._fillCaption(0);
    }

    this._setBallAt(0);

    this.el.progressChip.textContent =
      '1 / ' +
      this.stops.length;
  }

  _step(now) {
    if (!this.playing) {
      return;
    }

    if (
      !this.timelineSegs ||
      this.segIndex >=
        this.timelineSegs.length
    ) {
      this.playing = false;
      this._updatePlayBtn();
      return;
    }

    const seg =
      this.timelineSegs[
        this.segIndex
      ];

    if (
      this.curSegStart === null
    ) {
      this.curSegStart = now;
    }

    const elapsed =
      now -
      this.curSegStart;

    const frac =
      Math.min(
        1,
        elapsed /
          seg.dur
      );

    const eased =
      1 -
      Math.pow(
        1 - frac,
        2
      );

    if (
      seg.type === 'move'
    ) {
      this._setBallAt(
        seg.from +
          (seg.to -
            seg.from) *
            eased
      );
    } else {
      this._setBallAt(
        this.stopT[
          seg.index
        ]
      );

      if (
        this.litUpTo <
          seg.index ||
        this.current !==
          seg.index
      ) {
        this._lightUpTo(
          seg.index
        );
      }
    }

    if (frac >= 1) {
      this.segIndex++;
      this.curSegStart = null;

      if (
        this.segIndex >=
        this.timelineSegs.length
      ) {
        this.playing = false;
        this._updatePlayBtn();
        return;
      }
    }

    this.raf =
      requestAnimationFrame(
        (n) =>
          this._step(n)
      );
  }
}