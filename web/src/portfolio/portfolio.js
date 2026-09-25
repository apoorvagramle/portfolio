// ---------------------------------------------------------------------------
//  Everything that appears ON the bedroom monitor.
//
//  This file is only words — no drawing, no layout. Replace the [bracketed]
//  bits with your own and the desktop picks them up; nothing else needs
//  touching. Empty strings are fine: a row with no value is simply left out.
//
//  `url` fields are optional. Where one is set the entry becomes clickable
//  and opens in a new tab (the résumé's Download button, the contact rows,
//  the little icons in the taskbar tray). Where it isn't, the entry still
//  reads normally, it just doesn't do anything when clicked.
//
//  Session 77/78: filled from what Apoorva said and from her résumé PDF
//  (Apoorva's_Resume.pdf). STILL OPEN — see the list at the bottom.
// ---------------------------------------------------------------------------

export const PORTFOLIO = {

  // ---- the card on the wallpaper -----------------------------------------
  machine:  'APOORVA-PC',
  first:    'Apoorva',
  last:     'Gramle',
  role:     'Associate Software Engineer',
  facts: [
    { label: 'CURRENTLY',  value: "ASE @ Lowe's India" },
    { label: 'EDUCATION',  value: 'B.E. in ECE, RVCE' },
    { label: 'EXPERIENCE', value: '2+ years as an ASE' },
  ],
  tagline: 'Passionate full stack engineer with 2 yrs experience.',

  // The pixel face from the finale card (transparent PNG; desktop.js paints
  // the passport-blue backdrop behind it).
  photo: './src/assets/finale/face.png',

  // ---- Resume -------------------------------------------------------------
  resume: {
    // The PDF sits in Desktop\home, one level above web/ (serve.py serves
    // that folder). The apostrophe in the name is %27.
    url: '../Apoorva%27s_Resume.pdf',
    pages: 1,
    size: '177 KB',
    // The one-page summary drawn in the window itself — condensed from the PDF.
    summary: [
      { head: 'PROFILE',    lines: ['Passionate full-stack developer with 2+ years of experience building scalable, efficient, and user-friendly applications. Always eager to learn and solve complex problems.'] },
      { head: 'EXPERIENCE', lines: ["Associate Software Engineer · Lowe's India · Jul 2024 – Present"] },
      { head: 'EDUCATION',  lines: ['B.E. Electronics & Communication, R.V. College of Engineering · 2020 – 2024'] },
      { head: 'SKILLS',     lines: ['JavaScript, Python, C++, React, Three.js, Java (Spring Boot), MySQL, AWS, Cloudflare, Blender, Git, Figma'] },
    ],
  },

  // ---- Projects -----------------------------------------------------------
  // SidePup and Appy's Slam Book use the résumé's own wording. The other two
  // one-liners are stopgaps from Apoorva's earlier notes — hers to reword.
  projects: {
    intro: "Things I built because I wanted to see whether they'd work. " +
           'Some shipped, some are still on the bench.',
    items: [
      { name: 'SidePup', tint: 'gold',
        blurb: 'Desktop pet productivity app with a to-do list.',
        tags: ['Chrome extension', 'Manifest V3', 'Shadow DOM'], url: '' },
      { name: 'Appy the Explorer', tint: 'blue',
        blurb: 'A travel app with a 3D globe.',
        tags: ['React Three Fiber'], url: '' },
      { name: 'Movie Picker', tint: 'green',
        blurb: 'Log what you have watched, then let a popcorn bucket pick what is next.',
        tags: ['Three.js'], url: '' },
      { name: 'Appy’s Slam Book', tint: 'gold',
        blurb: 'Link-invite digital slam book — no accounts, the invite link is the credential.',
        tags: ['React', 'Vite', 'Cloudflare Workers', 'D1', 'R2'], url: 'https://appyslambook.com/' },
    ],
  },

  // ---- Skills -------------------------------------------------------------
  // The groups are the résumé's own.
  skills: [
    { head: 'LANGUAGES',          items: ['JavaScript', 'Python', 'C++'] },
    { head: 'FRONTEND',           items: ['React', 'Three.js', 'HTML', 'CSS'] },
    { head: 'BACKEND',            items: ['Java (Spring Boot)', 'REST API design', 'MySQL'] },
    { head: 'CLOUD',              items: ['AWS (EC2, Lambda, IAM, CloudWatch)', 'Cloudflare (Workers, D1, R2)'] },
    { head: 'TOOLS & PLATFORMS',  items: ['Chrome Extension APIs (Manifest V3)', 'Blender', 'Git'] },
    { head: 'DESIGN',             items: ['UI/UX', 'Figma', 'Adobe XD'] },
    { head: 'TESTING',            items: ['JUnit'] },
    { head: 'CREATIVE',           items: ['Explore'] },
  ],

  // ---- Experience ---------------------------------------------------------
  experience: {
    sub: '2+ years',
    items: [
      { when: 'Jul 2024 — Present', what: "Associate Software Engineer · Lowe's India", current: true,
        blurb: 'Full-stack on an internal competitive pricing analysis platform — the React front-end and the Java (Spring Boot) REST APIs behind it. JUnit tests keep backend changes reliable across frequent releases.' },
    ],
  },

  // ---- Education ----------------------------------------------------------
  education: {
    degree: 'B.E. in Electronics & Communication Engineering',
    where:  'R.V. College of Engineering, Bengaluru · 2020 – 2024',
    columns: [
      { head: 'ALSO', items: ['Design Head, IEEE RVCE', 'Cloud Computing with AWS — CloudPlus AI Tech'] },
    ],
  },

  // ---- Contact ------------------------------------------------------------
  // Links come from the résumé PDF. (Her phone number is on the résumé; it is
  // deliberately not put on the public site.)
  contact: [
    { label: 'EMAIL',     value: 'gramleapoorva@gmail.com', url: 'mailto:gramleapoorva@gmail.com' },
    { label: 'INSTAGRAM', value: '@artistic_brains_', url: 'https://www.instagram.com/artistic_brains_/' },
    { label: 'LINKEDIN',  value: 'linkedin.com/in/apoorva-gramle-882a32209', url: 'https://www.linkedin.com/in/apoorva-gramle-882a32209/' },
    { label: 'GITHUB',    value: 'github.com/apoorvagramle', url: 'https://github.com/apoorvagramle' },
    { label: 'LOCATION',  value: 'Bengaluru · open to relocate' },
  ],

  // The buttons at the right-hand end of the taskbar.
  tray: [
    { kind: 'mail',      title: 'Email',     url: 'mailto:gramleapoorva@gmail.com' },
    { kind: 'instagram', title: 'Instagram', url: 'https://www.instagram.com/artistic_brains_/' },
    { kind: 'linkedin',  title: 'LinkedIn',  url: 'https://www.linkedin.com/in/apoorva-gramle-882a32209/' },
    { kind: 'github',    title: 'GitHub',    url: 'https://github.com/apoorvagramle' },
  ],

  // ---- Recycle Bin — the joke drawer --------------------------------------
  bin: {
    items: [
      { name: 'portfolio_final_FINAL_v7.psd', size: '12.4 MB' },
      { name: 'ideas_at_2am.txt',             size: '88 KB' },
      { name: 'missing_semicolon.log',        size: '2.1 MB' },
      { name: 'that_one_regex.js',            size: '1 KB' },
    ],
    note: 'Nothing important in here. Probably.',
  },
};

// ---------------------------------------------------------------------------
//  STILL OPEN
//   - project links (projects.items[].url): SidePup, Appy the Explorer,
//     Movie Picker (Appy's Slam Book is done: appyslambook.com)
//   - Appy the Explorer + Movie Picker blurbs/tags in her own words
// ---------------------------------------------------------------------------
