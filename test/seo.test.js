const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const db = require('../server/database/db');
const authController = require('../server/auth/authController');

test('Setup SEO & Indexing Test Suite', async () => {
  await db.init();
});

test('Homepage HTML Metadata: Canonical, Title, Description, and Language', () => {
  const htmlPath = path.join(__dirname, '../public/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Verify lang attribute
  assert.match(html, /<html\s+lang=["']en["']>/i, 'HTML must have lang="en" attribute');

  // Verify Title
  assert.match(html, /<title>Vortex Arena – Free Multiplayer Browser Game<\/title>/, 'Page title must match requested SEO title');
  assert.match(html, /<meta\s+name=["']title["']\s+content=["']Vortex Arena – Free Multiplayer Browser Game["']>/, 'Meta title must match');

  // Verify Meta Description
  const expectedDesc = 'Enter Vortex Arena, a multiplayer browser game where you can battle opponents, explore the arena, and test your skills. Play online and join the action.';
  assert.ok(html.includes(expectedDesc), 'Meta description must match exact requested text');

  // Verify Canonical URL
  assert.match(html, /<link\s+rel=["']canonical["']\s+href=["']https:\/\/vortex-arena-1nmx\.onrender\.com\/["']>/, 'Canonical tag must point to https://vortex-arena-1nmx.onrender.com/');

  // Verify Robots Indexing Directives
  assert.match(html, /<meta\s+name=["']robots["']\s+content=["']index,\s*follow/i, 'Meta robots must permit index and follow');

  // Verify Open Graph & Twitter Card
  assert.ok(html.includes('property="og:title" content="Vortex Arena – Free Multiplayer Browser Game"'));
  assert.ok(html.includes('property="og:url" content="https://vortex-arena-1nmx.onrender.com/"'));
  assert.ok(html.includes('name="twitter:title" content="Vortex Arena – Free Multiplayer Browser Game"'));
});

test('Homepage Semantic Structure: H1, Intro Paragraph, H2s, Play Now CTA, and FAQs', () => {
  const htmlPath = path.join(__dirname, '../public/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Verify H1 Heading
  assert.match(html, /<h1[^>]*>Vortex Arena – Free Multiplayer Browser Game<\/h1>/i, 'Must have clear semantic H1 heading');

  // Verify Play Now button
  assert.match(html, /app\.playAsGuest\(['"]online['"]\)/, 'Must have Play Now / Instant Play CTA');

  // Verify H2 Headings
  assert.match(html, /<h2[^>]*>Battle Opponents and Explore 3D Arenas Directly in Your Browser<\/h2>/i, 'About H2 heading must exist');
  assert.match(html, /<h2[^>]*>Choose Your Preferred Combat Style<\/h2>/i, 'Modes H2 heading must exist');
  assert.match(html, /<h2[^>]*>Explore Six Diverse 3D Combat Maps<\/h2>/i, 'Maps H2 heading must exist');
  assert.match(html, /<h2[^>]*>Master Four Tactical Weapon Classes<\/h2>/i, 'Weapons H2 heading must exist');
  assert.match(html, /<h2[^>]*>How to Play Vortex Arena in Your Browser<\/h2>/i, 'How to play H2 heading must exist');
  assert.match(html, /<h2[^>]*>Frequently Asked Questions<\/h2>/i, 'FAQ H2 heading must exist');

  // Verify 6 Maps are documented
  assert.ok(html.includes('Sector-7 Compound'), 'Sector-7 map documented');
  assert.ok(html.includes('Residential House'), 'House map documented');
  assert.ok(html.includes('Countryside Farm'), 'Farm map documented');
  assert.ok(html.includes('Dense Forest'), 'Forest map documented');
  assert.ok(html.includes('BlockCraft Voxel Realm'), 'Minecraft map documented');
  assert.ok(html.includes('S.S. Oceanic Cruise Ship'), 'Cruise map documented');

  // Verify 4 Weapons are documented
  assert.ok(html.includes('V-44 Striker'), 'Assault rifle documented');
  assert.ok(html.includes('Hawk-50 Anti-Materiel'), 'Sniper rifle documented');
  assert.ok(html.includes('Breacher-12'), 'Shotgun documented');
  assert.ok(html.includes('Pulse-9'), 'Pistol documented');
});

test('Schema.org JSON-LD Structured Data: Valid VideoGame, WebApplication, and FAQPage', () => {
  const htmlPath = path.join(__dirname, '../public/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(jsonLdMatch, 'JSON-LD script tag must exist');

  const parsed = JSON.parse(jsonLdMatch[1].trim());
  assert.ok(Array.isArray(parsed), 'JSON-LD is array of schema objects');

  const videoGameSchema = parsed.find(s => s['@type'] === 'VideoGame');
  assert.ok(videoGameSchema, 'VideoGame schema exists');
  assert.strictEqual(videoGameSchema.name, 'Vortex Arena');
  assert.strictEqual(videoGameSchema.url, 'https://vortex-arena-1nmx.onrender.com/');
  assert.strictEqual(videoGameSchema.offers.price, '0');

  const webAppSchema = parsed.find(s => s['@type'] === 'WebApplication');
  assert.ok(webAppSchema, 'WebApplication schema exists');

  const faqSchema = parsed.find(s => s['@type'] === 'FAQPage');
  assert.ok(faqSchema, 'FAQPage schema exists');
  assert.ok(Array.isArray(faqSchema.mainEntity) && faqSchema.mainEntity.length >= 5, 'FAQPage has question entities');
});

test('Robots.txt: Unrestricted Crawling and Valid Sitemap Link', () => {
  const robotsPath = path.join(__dirname, '../public/robots.txt');
  const robots = fs.readFileSync(robotsPath, 'utf8');

  assert.match(robots, /User-agent:\s*\*/i, 'Allows all search crawlers');
  assert.match(robots, /Allow:\s*\//i, 'Allows homepage and assets');
  assert.match(robots, /Sitemap:\s*https:\/\/vortex-arena-1nmx\.onrender\.com\/sitemap\.xml/i, 'Points to production sitemap');
});

test('Sitemap.xml: Valid XML, Canonical HTTPS URL, and No Binary File Attachments', () => {
  const sitemapPath = path.join(__dirname, '../public/sitemap.xml');
  const sitemap = fs.readFileSync(sitemapPath, 'utf8');

  assert.match(sitemap, /^<\?xml/i, 'Sitemap must be valid XML declaration');
  assert.match(sitemap, /<urlset\s+xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/, 'Valid sitemap schema');
  assert.match(sitemap, /<loc>https:\/\/vortex-arena-1nmx\.onrender\.com\/<\/loc>/, 'Contains canonical homepage');

  // Must NOT contain binary APK attachment
  assert.strictEqual(sitemap.includes('/download'), false, 'Sitemap must not list binary download routes');
});

test('Backend Instant Guest Authentication: Frictionless Onboarding', () => {
  let guestRes = null;
  authController.guest({}, {
    status(code) {
      assert.strictEqual(code, 201);
      return this;
    },
    json(data) {
      guestRes = data;
      return this;
    }
  });

  assert.ok(guestRes && guestRes.token, 'Guest token issued');
  assert.ok(guestRes.user && guestRes.user.username.startsWith('Guest_'), 'Guest username assigned');
  assert.strictEqual(guestRes.user.isGuest, true, 'isGuest flag set');
  assert.ok(guestRes.user.tag, 'User tag created');

  // Cleanup guest user
  try {
    db.prepare('DELETE FROM users WHERE id = ?').run(guestRes.user.id);
    db.prepare('DELETE FROM stats WHERE user_id = ?').run(guestRes.user.id);
  } catch (e) {}
});

test('About Section & Creator Showcase: Avyan Arora and Play Your Way Features', () => {
  const htmlPath = path.join(__dirname, '../public/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Verify section tags & headings
  assert.ok(html.includes('About Vortex Arena'), 'Section tag About Vortex Arena exists');
  assert.match(html, /Meet the Creator\s*[–—-]\s*Avyan Arora/i, 'Meet the Creator – Avyan Arora heading exists');
  assert.match(html, /Play Your Way/i, 'Play Your Way heading exists');

  // Verify creator bio and inspiration
  assert.ok(html.includes('Avyan Arora'), 'Creator name Avyan Arora present');
  assert.ok(html.includes('Counter-Strike'), 'Inspiration from Counter-Strike mentioned');

  // Verify Play Your Way features
  assert.match(html, /Play in your browser/i, 'Play in your browser feature listed');
  assert.match(html, /Multiple maps/i, 'Multiple maps feature listed');
  assert.match(html, /Battle AI opponents/i, 'Battle AI opponents feature listed');
  assert.match(html, /Fast-paced multiplayer/i, 'Fast-paced multiplayer feature listed');

  // Verify Call-to-Action in Creator Showcase
  const creatorBoxIndex = html.indexOf('class="creator-showcase-box"');
  assert.ok(creatorBoxIndex !== -1, 'Creator showcase box exists');
  const creatorBoxSubstring = html.slice(creatorBoxIndex, creatorBoxIndex + 4500);
  assert.match(creatorBoxSubstring, /app\.playAsGuest\(['"]online['"]\)/, 'Play Now CTA present inside creator showcase');

  // Verify In-Game Modal & Dashboard Button
  assert.ok(html.includes('id="modal-about-creator"'), 'About Creator modal element exists');
  assert.ok(html.includes('app.openAboutCreatorModal()'), 'Dashboard button triggers openAboutCreatorModal');

  // Verify Schema.org Creator Structured Data
  const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  const parsed = JSON.parse(jsonLdMatch[1].trim());
  const videoGameSchema = parsed.find(s => s['@type'] === 'VideoGame');
  assert.strictEqual(videoGameSchema.creator.name, 'Avyan Arora', 'Schema.org creator is Avyan Arora');
  assert.strictEqual(videoGameSchema.author.name, 'Avyan Arora', 'Schema.org author is Avyan Arora');
});

