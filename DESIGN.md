# DESIGN.md — Mutman's portfolio

Read this file before every UI or copy task. It overrides your defaults.
If a request conflicts with it, say so instead of silently picking one.

## 0. What this site is

One reader, one question: *can this person build the thing I need?*
Owner: Mutman, foundation student, Kuala Lumpur. Native Arabic, working English.
He designs and directs full software builds (POS system, self-hosted infrastructure) with AI coding tools and owns architecture, decisions and debugging. **This honesty stays on the site.** It is specific and it is a strength. Never hide it and never inflate it.
Goal: remote/online work in web development, technical support, general tech.

## 1. Stack (do not substitute)

- **Astro** (current stable), static output, zero JS by default.
- **Plain CSS with custom properties** in one `tokens.css`. No Tailwind, no shadcn/ui, no component library, no CSS-in-JS. Tokens are the design system.
- **Content Collections** (Markdown/MDX + typed schema) for projects. Adding a project = adding one `.md` file. Nothing else should need editing.
- Fonts self-hosted (Fontsource packages). Images through Astro's image pipeline, with width/height set.
- JS only where a feature cannot work without it. Motion = CSS only, wrapped in `prefers-reduced-motion`.
- Deploy: Cloudflare Pages or GitHub Pages. Must build with `npm run build` and no env vars.
- Use logical CSS properties (`margin-inline`, `padding-block`, `inset-inline-start`) everywhere so an Arabic/RTL version can be added later without a rewrite.

## 2. Design language: "Spec sheet"

The site reads like an engineering datasheet or a well-made manual: calm, exact, a little dry, confident. Not a startup landing page, not a hacker terminal.

**Principles**
1. Hierarchy comes from scale, weight and whitespace, not from effects.
2. A visible grid. Hairline rules (1px) separate sections like a technical document.
3. Metadata in monospace (dates, stack, status, version), content in sans. Reads like labels on a spec.
4. Break symmetry deliberately once per page (e.g. one project given a wider block). Never a grid of equal cards.
5. Left-aligned text. Headings large, tight, short. Body max 65ch.
6. Show real things: real screenshots of the POS, the real homelab service list, real terminal output. A real interface cannot look generic.

**Tokens** (change values only after asking Mutman)
```css
:root {
  --paper:  #EFECE4;  /* warm off-white page */
  --ink:    #16150F;  /* text */
  --muted:  #5F5B50;  /* secondary text, min 4.5:1 on --paper */
  --rule:   #CBC6B8;  /* hairlines */
  --accent: #0F6B3E;  /* the ONLY accent; derived from the Sudanese flag green */
  --accent-ink: #FFFFFF;

  --font-sans: "IBM Plex Sans", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
  --font-ar:   "IBM Plex Sans Arabic", "IBM Plex Sans", sans-serif;

  --radius: 2px;        /* near-square. one value, used everywhere */
  --space: 8px;         /* 8pt scale: 8 16 24 32 48 64 96 128 */
  --measure: 65ch;
}
```
- Light by default. A dark scheme may be added later via `prefers-color-scheme`, as a designed palette, not an inversion.
- Type scale (clamp-based): display 56–96px / weight 600 / tracking −0.03em / line-height 1.0; h2 28–36; body 17–18 / 1.6; mono labels 13–14.
- Accent used for: links, one primary CTA, focus rings, status dot. Nothing else.
- Shadows: none. Borders: 1px `--rule` only.
- Focus states visible (2px accent outline, 3px offset). Never remove them.

## 3. Page structure

Single page plus one page per project.

1. **Header**: name left, 3 text links right. No logo, no hamburger on desktop.
2. **Hero**: name, one factual line (role + what he builds), email as plain visible text, link to the work. Nothing else. No badge above the headline, no scroll indicator.
3. **Work**: featured projects as rows, not cards. Each row: title, one-line outcome, stack in mono, status, link to detail page.
4. **Also built**: a short plain list for smaller projects.
5. **Team lead**: one short entry for the entrepreneurship project (10 people, pitch to live campus stall).
6. **Stack**: one short grouped list of tools he actually uses. No skill bars, no percentages, no logos wall.
7. **Contact**: email as text, then links. A form is optional and never replaces the address.
8. Footer: one line. Education (UGM Centre of Foundation Studies, in progress) lives here or in Contact, not as a section.

Cut anything that does not help a stranger decide to hire him.

## 4. Project entries (content schema)

Each project file must have: `title`, `summary` (one sentence, an outcome), `stack[]`, `status` (shipped / in progress), `role` (what Mutman decided/did), `ai_note` (what AI wrote vs what he owned), `links[]`, `media[]` (real screenshots), `order`.
Body sections: **Problem → What I built → Constraints → What I'd change.**
Name the constraint (solo, student, offline-first, budget). Numbers only if Mutman provides them. **Never invent metrics, clients, testimonials, dates or logos.** If a fact is missing, leave a visible `TODO(mutman)` and list it in your reply.

## 5. Copy rules

- First person, plain, specific. Short sentences. Contractions fine.
- The cover-the-name test: if a sentence still works on someone else's portfolio, rewrite it.
- Banned words and moves: passionate, cutting-edge, seamless, robust, leverage, empower, elevate, unlock, journey, "crafting", "in today's fast-paced", "not just X, but Y", rule-of-three lists, em-dash chains, rhetorical questions as headlines, emoji, exclamation marks.
- Say what he did and what happened. "Built offline mode and hardware-based licensing for a restaurant POS" beats "Delivered a robust solution."
- Keep the AI-use statement direct: he architects and debugs, AI writes much of the implementation.

## 6. Banned (known AI tells — treat each as a build failure)

**Fonts:** Inter, Roboto, Arial, system-default-as-design, Space Grotesk, Geist, Instrument Serif, and "one italic serif accent word in a sans headline".
**Color:** purple/indigo/violet anywhere, any gradient, gradient text, glows, colored shadows, permanent dark mode with grey body text, barely-passing contrast.
**Layout:** centered hero on a generic sans, pill badge above the H1, three identical feature cards, icon-in-a-circle cards, colored left/top card borders, numbered 1-2-3 steps, stat-banner rows, bento grids of equal cells, emoji icons, all-caps section labels everywhere.
**CSS:** glassmorphism/`backdrop-filter` blur panels, gradient borders, one large radius (16–24px) on everything, `scale(0)` entrances, bounce/spring hovers, hover lift-and-shadow on every card, `shadcn/ui` look.
**Content:** stock photos, fake logos, fake testimonials, lorem ipsum, "Hi, I'm …👋".

## 7. Quality bar (the portfolio is itself a work sample)

- Lighthouse 95+ on all four, LCP under 2s on throttled mobile.
- Page weight small: no video autoplay, no full-screen hero media.
- Per-page `<title>`, meta description, Open Graph image (a real designed one, not a screenshot of the page), canonical URL, favicon.
- Keyboard navigable, visible focus, contrast AA, semantic HTML, alt text that describes, `lang` attribute set.
- Works at 360px wide first, then scales up. Test at 360, 768, 1280.

## 8. Workflow for the agent

1. Read this file. Restate in 5 lines the choices you will make (fonts, accent, layout move). Wait for a go.
2. Build one section at a time. Tokens first, then components, then pages.
3. After each section, **audit against §6 and §5**: list every violation found, fix them, then show the result.
4. Run checks: `grep -rEn "border-left|backdrop-filter|linear-gradient|Inter|Space Grotesk|Geist|Instrument" src/` and explain every hit.
5. Never add a dependency without asking and stating why plain CSS/Astro can't do it.
6. When Mutman corrects the same visual thing twice, add it to this file instead of repeating it in chat.
7. If drift appears late in a session, Mutman will say: "Stop. Re-read DESIGN.md. Audit the last screen against §2 and §6, list violations, fix them."

## 9. Adding to the site later

- New project: add `src/content/projects/<slug>.md` with the §4 fields. No code changes.
- New section: must justify itself against the one-reader-one-question rule in §0.
- Arabic version: add `/ar/` using the logical-property CSS and `--font-ar`, `dir="rtl"`. Do not mirror by hand.
- Reference-driven restyle: Mutman may supply 2–3 screenshots of sites he likes. Extract tokens (hex, type scale, spacing, radius), propose edits to §2, never copy logos, imagery, copy, or layouts wholesale.

## 10. Agent corrections log

- Asymmetry on Sudan POS: scale + column width only. No left border/rule on that project row.
- Status dot: static, no animation.
